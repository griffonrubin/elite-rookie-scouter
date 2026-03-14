"""
reset_and_reseed.py - Wipes the 2026 draft class and reseeds from live sources only.
Step 1: Delete all 2026 players (and their related data)
Step 2: Scrape KTC's dynasty rankings, use rookie=True players as the 2026 class
Step 3: Cross-populate from MDDB for school/position data
No hardcoded player data anywhere.
"""
import sqlite3
import logging
import sys
import time
import re

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("ResetReseed")

DB_FILE = "dynasty_scout.db"

# Positions relevant to dynasty fantasy football
FANTASY_POSITIONS = {'QB', 'RB', 'WR', 'TE'}


def reset_2026_data(conn):
    """Delete all 2026-class player data from every table."""
    cur = conn.cursor()

    logger.info("Fetching 2026 player IDs to delete...")
    cur.execute("SELECT id FROM players WHERE draft_year = 2026")
    ids = [row[0] for row in cur.fetchall()]
    logger.info(f"Found {len(ids)} players to remove.")

    if not ids:
        logger.info("Nothing to delete.")
        return

    placeholders = ",".join("?" * len(ids))

    for table in ["news", "social_posts", "rankings", "consensus_rankings",
                  "measurables", "college_stats", "college_career", "tier_players"]:
        try:
            cur.execute(f"DELETE FROM {table} WHERE player_id IN ({placeholders})", ids)
            logger.info(f"  Cleared {cur.rowcount} rows from {table}")
        except Exception as e:
            logger.warning(f"  Could not clear {table}: {e}")

    cur.execute(f"DELETE FROM players WHERE id IN ({placeholders})", ids)
    logger.info(f"  Deleted {cur.rowcount} players from players table.")
    conn.commit()
    logger.info("Reset complete.")


def normalize_name(name):
    """Returns a slug-friendly lowercase key for fuzzy matching."""
    n = name.lower()
    n = n.replace(".", "").replace("'", "").replace("-", " ")
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', n)
    return re.sub(r'\s+', ' ', n).strip()


def scrape_ktc_rookies():
    """
    Pull the playersArray from KTC and return only the is_rookie=True,
    fantasy-relevant players — these are the confirmed 2026 NFL Draft class
    as tracked by KTC's real-time data.
    """
    from playwright.sync_api import sync_playwright
    from scrapers import config

    url = "https://keeptradecut.com/dynasty-rankings"
    logger.info(f"Scraping KTC for 2026 rookies: {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=config.USER_AGENT)

        try:
            page.goto(url, timeout=90000)
            time.sleep(4)

            try:
                players_data = page.evaluate("typeof playersArray !== 'undefined' ? playersArray : []")
            except Exception as e:
                logger.error(f"Could not evaluate playersArray: {e}")
                players_data = []

            logger.info(f"KTC returned {len(players_data)} total players")

            rookies = []
            for item in players_data:
                try:
                    if not item.get('rookie', False):
                        continue

                    pos = item.get('position', '')
                    if pos not in FANTASY_POSITIONS:
                        continue

                    name = item.get('playerName', '').strip()
                    if not name:
                        continue

                    sf = item.get('superflexValues', {})
                    rank = sf.get('rank')
                    value = sf.get('value')

                    # Build slug
                    slug = normalize_name(name).replace(' ', '-')

                    rookies.append({
                        'full_name': name,
                        'slug': slug,
                        'position': pos,
                        'ktc_rank': rank,
                        'ktc_value': int(value) if value else None,
                        'ktc_id': item.get('playerID'),
                        'school': item.get('college', '') or '',
                    })

                except Exception:
                    continue

            logger.info(f"Filtered to {len(rookies)} 2026 dynasty-relevant rookies")
            return rookies

        except Exception as e:
            logger.error(f"KTC scrape error: {e}")
            return []
        finally:
            browser.close()


def seed_players_from_ktc(conn, rookies):
    """Insert KTC rookies into the players table and save their rankings."""
    cur = conn.cursor()
    from datetime import date
    today = date.today().isoformat()

    inserted = 0
    for p in rookies:
        try:
            parts = p['full_name'].split()
            first = parts[0] if parts else ''
            last = ' '.join(parts[1:]) if len(parts) > 1 else ''

            cur.execute("""
                INSERT INTO players (
                    slug, full_name, first_name, last_name,
                    position, nfl_team, draft_year
                ) VALUES (?, ?, ?, ?, ?, ?, 2026)
                ON CONFLICT(slug) DO UPDATE SET
                    full_name=excluded.full_name,
                    position=excluded.position,
                    nfl_team=COALESCE(excluded.nfl_team, players.nfl_team)
            """, (
                p['slug'], p['full_name'], first, last,
                p['position'],
                p['school'] or None
            ))

            # Get player ID
            cur.execute("SELECT id FROM players WHERE slug=?", (p['slug'],))
            row = cur.fetchone()
            if not row:
                continue
            player_id = row[0]

            # Save college career record if we have a school
            if p.get('school'):
                cur.execute("""
                    INSERT INTO college_career (player_id, school, seasons, is_transfer)
                    VALUES (?, ?, '2024-2025', 0)
                    ON CONFLICT(player_id, school) DO NOTHING
                """, (player_id, p['school']))

            # Save KTC ranking
            if p['ktc_rank'] is not None:
                cur.execute("""
                    INSERT INTO rankings (player_id, rank_overall, source, source_url, scraped_at)
                    VALUES (?, ?, 'KeepTradeCut', 'https://keeptradecut.com/dynasty-rankings', ?)
                    ON CONFLICT(player_id, source, scraped_at) DO UPDATE SET
                        rank_overall=excluded.rank_overall
                """, (player_id, p['ktc_rank'], today))

            inserted += 1

        except Exception as e:
            logger.error(f"Error inserting {p['full_name']}: {e}")

    conn.commit()
    logger.info(f"Inserted/updated {inserted} players from KTC")


def scrape_mddb_supplement(conn):
    """
    Run the MDDB scraper to supplement missing players that KTC may not list
    (e.g. late rounders). Only adds players NOT already in our 2026 DB.
    """
    logger.info("Supplementing with MDDB big board...")
    try:
        sys.path.insert(0, '.')
        from scrapers.player_seed_mddb import MDDBSeeder
        seeder = MDDBSeeder()
        players = seeder.scrape()

        if not players:
            logger.warning("MDDB returned no players.")
            return

        cur = conn.cursor()
        # Build existing slug set
        cur.execute("SELECT slug FROM players WHERE draft_year=2026")
        existing = {row[0] for row in cur.fetchall()}

        new_count = 0
        for p in players:
            if p['slug'] in existing:
                continue  # Already have this player from KTC
            if p.get('position') not in FANTASY_POSITIONS:
                continue

            try:
                parts = p['full_name'].split()
                first = parts[0] if parts else ''
                last = ' '.join(parts[1:]) if len(parts) > 1 else ''

                cur.execute("""
                    INSERT INTO players (
                        slug, full_name, first_name, last_name,
                        position, nfl_team, draft_year
                    ) VALUES (?, ?, ?, ?, ?, ?, 2026)
                    ON CONFLICT(slug) DO NOTHING
                """, (p['slug'], p['full_name'], first, last,
                      p['position'], p.get('school')))

                # Also seed college_career
                if p.get('school'):
                    cur.execute("SELECT id FROM players WHERE slug=?", (p['slug'],))
                    row = cur.fetchone()
                    if row:
                        cur.execute("""
                            INSERT INTO college_career (player_id, school, seasons, is_transfer)
                            VALUES (?, ?, '2024-2025', 0)
                            ON CONFLICT(player_id, school) DO NOTHING
                        """, (row[0], p['school']))

                new_count += 1

            except Exception as e:
                logger.error(f"MDDB insert error {p['slug']}: {e}")

        conn.commit()
        logger.info(f"MDDB added {new_count} new players not in KTC list")

    except Exception as e:
        logger.error(f"MDDB supplement failed: {e}")


def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row

    logger.info("=== STEP 1: RESET 2026 DATA ===")
    reset_2026_data(conn)

    logger.info("\n=== STEP 2: SEED FROM KTC 2026 ROOKIES ===")
    rookies = scrape_ktc_rookies()
    if rookies:
        seed_players_from_ktc(conn, rookies)
    else:
        logger.error("KTC returned no rookies — aborting reseed!")
        conn.close()
        return

    logger.info("\n=== STEP 3: SUPPLEMENT FROM MDDB ===")
    scrape_mddb_supplement(conn)

    # Final count
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM rankings WHERE scraped_at >= date('now', '-1 day')")
    rankings_today = cur.fetchone()[0]
    logger.info(f"\nReseed complete: {total} 2026 players, {rankings_today} ranking rows today")

    conn.close()


if __name__ == "__main__":
    run()
