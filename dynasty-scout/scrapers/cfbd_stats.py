"""
scrapers/cfbd_stats.py
Fills college stats and bio (height/weight) using College Football Data API.
Targets players who have no ESPN college ID and no college stats in the DB.

Register for a free API key at: https://collegefootballdata.com/key

Run: py scrapers/cfbd_stats.py <YOUR_API_KEY>
     py scrapers/cfbd_stats.py <YOUR_API_KEY> --all    # rescrape all, not just missing
"""

import sqlite3
import requests
import time
import os
import sys
import re
from datetime import date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')

CFBD_BASE = "https://api.collegefootballdata.com"
YEARS = [2020, 2021, 2022, 2023, 2024, 2025]


def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[''`\-\.\,]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def cfbd_get(endpoint, params, headers):
    url = f"{CFBD_BASE}/{endpoint}"
    r = requests.get(url, params=params, headers=headers, timeout=15)
    if r.status_code == 401:
        print("ERROR: Invalid or missing CFBD API key.")
        sys.exit(1)
    if r.status_code != 200:
        return None
    return r.json()


def fetch_player_search(name, headers):
    """Search CFBD for a player, return list of matches."""
    return cfbd_get("player/search", {"searchTerm": name, "limit": 5}, headers) or []


def fetch_season_stats(year, headers):
    """Fetch all player stats for a given season."""
    return cfbd_get("stats/player/season", {"year": year}, headers) or []


def fetch_roster(team, year, headers):
    """Fetch roster for a team/year — includes height/weight."""
    return cfbd_get("roster", {"team": team, "year": year}, headers) or []


def run(api_key: str, rescrape_all: bool = False):
    headers = {"Authorization": f"Bearer {api_key}"}

    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    # Get target players
    if rescrape_all:
        cur.execute("SELECT id, full_name, position, slug FROM players WHERE draft_year=2026 ORDER BY full_name")
    else:
        # Only players missing college stats
        cur.execute("""
            SELECT p.id, p.full_name, p.position, p.slug
            FROM players p
            WHERE p.draft_year=2026
              AND NOT EXISTS (SELECT 1 FROM college_stats cs WHERE cs.player_id=p.id)
            ORDER BY p.full_name
        """)
    players = cur.fetchall()
    print(f"Target players: {len(players)}")

    # Pre-fetch all season stats (one request per year — much more efficient than per-player)
    print("Fetching CFBD season stats...")
    all_stats_by_year = {}
    for yr in YEARS:
        print(f"  Year {yr}...")
        stats = fetch_season_stats(yr, headers)
        # Group by normalized player name
        by_name = {}
        for s in stats:
            key = normalize(s.get("player", ""))
            if key not in by_name:
                by_name[key] = []
            by_name[key].append(s)
        all_stats_by_year[yr] = by_name
        time.sleep(0.3)

    stats_upserted = 0
    bio_updated = 0

    for p_id, p_name, p_pos, p_slug in players:
        name_key = normalize(p_name)
        print(f"\n[{p_name}]")

        # Collect all seasons from CFBD
        seasons = {}  # {(year, team): {school, stats...}}

        for yr in YEARS:
            by_name = all_stats_by_year[yr]
            matches = by_name.get(name_key, [])

            for stat in matches:
                team = stat.get("team", "Unknown")
                category = stat.get("statType", "").lower()
                stat_name = stat.get("stat", "")
                stat_val = stat.get("statValue", 0)

                key = (yr, team)
                if key not in seasons:
                    seasons[key] = {
                        "season": yr,
                        "school": team,
                        "games_played": None,
                        "pass_attempts": 0, "completions": 0, "pass_yards": 0,
                        "pass_tds": 0, "interceptions": 0,
                        "rush_attempts": 0, "rush_yards": 0, "rush_tds": 0,
                        "receptions": 0, "rec_yards": 0, "rec_tds": 0,
                        "targets": 0,
                    }

                s = seasons[key]
                # Map CFBD stat names to our schema
                mapping = {
                    "passing": {
                        "YDS": "pass_yards", "TD": "pass_tds", "INT": "interceptions",
                        "ATT": "pass_attempts", "COMPLETIONS": "completions",
                    },
                    "rushing": {
                        "YDS": "rush_yards", "TD": "rush_tds", "CAR": "rush_attempts",
                    },
                    "receiving": {
                        "YDS": "rec_yards", "TD": "rec_tds", "REC": "receptions",
                        "LONG": None,
                    },
                }
                cat_map = mapping.get(category, {})
                db_field = cat_map.get(stat_name.upper())
                if db_field:
                    try:
                        s[db_field] = int(float(stat_val))
                    except (ValueError, TypeError):
                        pass

        if not seasons:
            print(f"  No CFBD stats found")
            continue

        print(f"  Found {len(seasons)} season/team combos: {sorted(set(k[0] for k in seasons.keys()))}")

        # Upsert college_stats
        for (yr, team), sdata in seasons.items():
            # Skip empty rows
            total = sum([
                sdata["pass_yards"], sdata["rush_yards"], sdata["rec_yards"],
                sdata["pass_attempts"], sdata["rush_attempts"], sdata["receptions"],
            ])
            if total == 0:
                continue

            cur.execute("""
                INSERT INTO college_stats
                  (player_id, season, school, games_played,
                   pass_attempts, completions, pass_yards, pass_tds, interceptions,
                   rush_attempts, rush_yards, rush_tds,
                   receptions, rec_yards, rec_tds)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(player_id, season, school) DO UPDATE SET
                  pass_attempts = CASE WHEN excluded.pass_attempts > 0 THEN excluded.pass_attempts ELSE college_stats.pass_attempts END,
                  completions   = CASE WHEN excluded.completions > 0 THEN excluded.completions ELSE college_stats.completions END,
                  pass_yards    = CASE WHEN excluded.pass_yards > 0 THEN excluded.pass_yards ELSE college_stats.pass_yards END,
                  pass_tds      = CASE WHEN excluded.pass_tds > 0 THEN excluded.pass_tds ELSE college_stats.pass_tds END,
                  interceptions = CASE WHEN excluded.interceptions > 0 THEN excluded.interceptions ELSE college_stats.interceptions END,
                  rush_attempts = CASE WHEN excluded.rush_attempts > 0 THEN excluded.rush_attempts ELSE college_stats.rush_attempts END,
                  rush_yards    = CASE WHEN excluded.rush_yards > 0 THEN excluded.rush_yards ELSE college_stats.rush_yards END,
                  rush_tds      = CASE WHEN excluded.rush_tds > 0 THEN excluded.rush_tds ELSE college_stats.rush_tds END,
                  receptions    = CASE WHEN excluded.receptions > 0 THEN excluded.receptions ELSE college_stats.receptions END,
                  rec_yards     = CASE WHEN excluded.rec_yards > 0 THEN excluded.rec_yards ELSE college_stats.rec_yards END,
                  rec_tds       = CASE WHEN excluded.rec_tds > 0 THEN excluded.rec_tds ELSE college_stats.rec_tds END
            """, (
                p_id, yr, team, sdata["games_played"],
                sdata["pass_attempts"], sdata["completions"], sdata["pass_yards"],
                sdata["pass_tds"], sdata["interceptions"],
                sdata["rush_attempts"], sdata["rush_yards"], sdata["rush_tds"],
                sdata["receptions"], sdata["rec_yards"], sdata["rec_tds"],
            ))
            stats_upserted += 1

        conn.commit()

    # Now try to fill height/weight via CFBD player search for still-missing players
    print("\n=== Filling bio via CFBD player search ===")
    cur.execute("SELECT id, full_name FROM players WHERE draft_year=2026 AND (height_inches IS NULL OR weight_lbs IS NULL)")
    bio_missing = cur.fetchall()
    print(f"Players still missing bio: {len(bio_missing)}")

    for p_id, p_name in bio_missing:
        time.sleep(0.3)
        results = fetch_player_search(p_name, headers)
        if not results:
            continue
        # Take first match
        r = results[0]
        h_ft = r.get("height")  # CFBD returns height as feet (e.g. 6.1) or inches string
        w = r.get("weight")
        # CFBD height is in "X-Y" string format (feet-inches) or numeric
        h_inches = None
        if h_ft:
            try:
                if isinstance(h_ft, str) and "-" in h_ft:
                    parts = h_ft.split("-")
                    h_inches = int(parts[0]) * 12 + int(parts[1])
                elif isinstance(h_ft, (int, float)):
                    # Could be in inches already if > 12
                    h_inches = int(h_ft) if h_ft > 12 else None
            except Exception:
                pass

        if h_inches or w:
            cur.execute("""
                UPDATE players SET
                  height_inches = CASE WHEN height_inches IS NULL AND ? IS NOT NULL THEN ? ELSE height_inches END,
                  weight_lbs    = CASE WHEN weight_lbs IS NULL AND ? IS NOT NULL THEN ? ELSE weight_lbs END
                WHERE id=?
            """, (h_inches, h_inches, w, w, p_id))
            if cur.rowcount:
                bio_updated += 1
                print(f"  [{p_name}] h={h_inches} w={w}")

    conn.commit()
    conn.close()

    print(f"\nCFBD scrape complete.")
    print(f"  Stats rows upserted: {stats_upserted}")
    print(f"  Bio rows updated: {bio_updated}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1].startswith("--"):
        print("Usage: py scrapers/cfbd_stats.py <API_KEY> [--all]")
        print("Get a free key at: https://collegefootballdata.com/key")
        sys.exit(1)
    key = sys.argv[1]
    rescrape = "--all" in sys.argv
    run(key, rescrape_all=rescrape)
