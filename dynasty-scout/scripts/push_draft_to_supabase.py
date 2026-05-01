"""
push_draft_to_supabase.py
Syncs ALL 2026 post-draft data from local SQLite to Supabase PostgreSQL:
  1. Creates nfl_teams table if missing, seeds 32 teams
  2. Ensures draft_round / draft_pick / draft_overall columns exist on players
  3. Clears stale nfl_team + draft fields for 2026 players, then re-populates
  4. Inserts Anthony Smith if missing
  5. Deletes old fake rankings, inserts real rankings from local SQLite
  6. Recomputes consensus_rankings for SF and 1QB

Usage:
    pip install psycopg2-binary
    py scripts/push_draft_to_supabase.py "postgresql://..."
   -or-
    py scripts/push_draft_to_supabase.py  (reads DATABASE_URL from .env.local)
"""

import sqlite3
import sys
import os
import re
import math

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR    = os.path.join(SCRIPT_DIR, '..')
DB_PATH    = os.path.join(APP_DIR, 'dynasty_scout.db')
ENV_PATH   = os.path.join(APP_DIR, '.env.local')


def load_database_url():
    """Read DATABASE_URL from .env.local if not in sys.argv."""
    if len(sys.argv) >= 2:
        return sys.argv[1]
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH) as f:
            for line in f:
                m = re.match(r'^DATABASE_URL=(.+)$', line.strip())
                if m:
                    return m.group(1).strip('"\'')
    print("ERROR: No DATABASE_URL found. Pass it as argument or set in .env.local")
    sys.exit(1)


def ensure_columns(pc):
    """Add missing columns to players table in PostgreSQL if they don't exist."""
    for col, typedef in [
        ('draft_round',   'INTEGER'),
        ('draft_pick',    'INTEGER'),
        ('draft_overall', 'INTEGER'),
    ]:
        pc.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name='players' AND column_name=%s
        """, (col,))
        if not pc.fetchone():
            pc.execute(f'ALTER TABLE players ADD COLUMN {col} {typedef}')
            print(f"  Added column players.{col}")


def ensure_nfl_teams_table(pc):
    pc.execute("""
        CREATE TABLE IF NOT EXISTS nfl_teams (
            abbreviation   TEXT PRIMARY KEY,
            full_name      TEXT NOT NULL,
            conference     TEXT,
            division       TEXT,
            primary_color  TEXT,
            secondary_color TEXT,
            logo_url       TEXT
        )
    """)


def main():
    pg_url = load_database_url()

    sqlite_conn = sqlite3.connect(DB_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    sc = sqlite_conn.cursor()

    pg_conn = psycopg2.connect(pg_url, sslmode='require')
    pg_conn.autocommit = False
    pc = pg_conn.cursor()

    # ── 1. Ensure schema ──────────────────────────────────────────────────────
    print("Ensuring schema...")
    ensure_nfl_teams_table(pc)
    ensure_columns(pc)

    # Ensure consensus_rankings has a format column
    pc.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name='consensus_rankings' AND column_name='format'
    """)
    if not pc.fetchone():
        pc.execute("ALTER TABLE consensus_rankings ADD COLUMN format TEXT DEFAULT 'SF'")
        print("  Added column consensus_rankings.format")

    pg_conn.commit()

    # ── 2. Seed nfl_teams ─────────────────────────────────────────────────────
    print("Seeding nfl_teams...")
    sc.execute("SELECT * FROM nfl_teams")
    teams = sc.fetchall()
    inserted_teams = 0
    for t in teams:
        pc.execute("""
            INSERT INTO nfl_teams (abbreviation, full_name, conference, division,
                                   primary_color, secondary_color, logo_url)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (abbreviation) DO UPDATE SET
                full_name       = EXCLUDED.full_name,
                conference      = EXCLUDED.conference,
                division        = EXCLUDED.division,
                primary_color   = EXCLUDED.primary_color,
                secondary_color = EXCLUDED.secondary_color,
                logo_url        = EXCLUDED.logo_url
        """, (t['abbreviation'], t['full_name'], t['conference'], t['division'],
              t['primary_color'], t['secondary_color'], t['logo_url']))
        inserted_teams += 1
    pg_conn.commit()
    print(f"  {inserted_teams} teams upserted")

    # ── 3. Clear stale 2026 player NFL data ───────────────────────────────────
    print("Clearing stale draft data for 2026 players...")
    pc.execute("""
        UPDATE players
        SET nfl_team = NULL, draft_round = NULL, draft_pick = NULL, draft_overall = NULL
        WHERE draft_year = 2026
    """)
    cleared = pc.rowcount
    pg_conn.commit()
    print(f"  Cleared {cleared} rows")

    # ── 4. Read draft data from local SQLite and push to Supabase ─────────────
    print("Pushing draft data to Supabase...")

    # Get slug->id map from Supabase
    pc.execute("SELECT id, slug FROM players WHERE draft_year = 2026")
    pg_slug_to_id = {r[1]: r[0] for r in pc.fetchall()}

    # Read drafted players from SQLite
    sc.execute("""
        SELECT slug, nfl_team, draft_round, draft_pick, draft_overall
        FROM players
        WHERE draft_year = 2026 AND draft_overall IS NOT NULL
    """)
    drafted_rows = sc.fetchall()

    drafted_ok = 0
    for row in drafted_rows:
        pc.execute("""
            UPDATE players
            SET nfl_team = %s, draft_round = %s, draft_pick = %s, draft_overall = %s
            WHERE slug = %s AND draft_year = 2026
        """, (row['nfl_team'], row['draft_round'], row['draft_pick'],
              row['draft_overall'], row['slug']))
        if pc.rowcount > 0:
            drafted_ok += 1
        else:
            print(f"  ⚠ No match for drafted slug: {row['slug']}")

    # Read UDFA signings from SQLite (nfl_team set, draft_overall NULL)
    sc.execute("""
        SELECT slug, nfl_team
        FROM players
        WHERE draft_year = 2026 AND draft_overall IS NULL AND nfl_team IS NOT NULL
    """)
    udfa_rows = sc.fetchall()

    udfa_ok = 0
    for row in udfa_rows:
        pc.execute("""
            UPDATE players SET nfl_team = %s
            WHERE slug = %s AND draft_year = 2026
        """, (row['nfl_team'], row['slug']))
        if pc.rowcount > 0:
            udfa_ok += 1
        else:
            print(f"  ⚠ No match for UDFA slug: {row['slug']}")

    pg_conn.commit()
    print(f"  Drafted: {drafted_ok}, UDFA: {udfa_ok}")

    # ── 5. Insert Anthony Smith if missing ────────────────────────────────────
    print("Checking Anthony Smith...")
    pc.execute("SELECT id FROM players WHERE slug = 'anthony-smith-wr' AND draft_year = 2026")
    if not pc.fetchone():
        pc.execute("""
            INSERT INTO players (slug, full_name, first_name, last_name, position,
                                 draft_year, nfl_team, draft_round, draft_pick, draft_overall)
            VALUES ('anthony-smith-wr','Anthony Smith','Anthony','Smith','WR',
                    2026,'DAL',7,2,218)
        """)
        pc.execute("SELECT id FROM players WHERE slug='anthony-smith-wr' AND draft_year=2026")
        new_id = pc.fetchone()[0]
        pc.execute("""
            INSERT INTO college_career (player_id, school, conference)
            VALUES (%s, 'East Carolina', 'American Athletic')
            ON CONFLICT DO NOTHING
        """, (new_id,))
        pg_conn.commit()
        print("  ✓ Inserted Anthony Smith")
    else:
        # Make sure his draft data is set
        pc.execute("""
            UPDATE players SET nfl_team='DAL', draft_round=7, draft_pick=2, draft_overall=218
            WHERE slug='anthony-smith-wr' AND draft_year=2026
        """)
        pg_conn.commit()
        print("  ℹ Anthony Smith already exists, updated draft data")

    # ── 6. Sync rankings (delete fake, insert real) ───────────────────────────
    print("\nSyncing rankings...")

    REAL_SOURCES = [
        'KeepTradeCut', 'FantasyCalc SF', 'FantasyCalc',
        'DynastyNerds SF', 'DynastyNerds', 'TylerFFCreator SF'
    ]
    FAKE_SOURCES = [
        'FantasyPros SF', 'FantasyPros', 'CBS Sports SF',
        'FantasyCalc SF (fake)', 'DynastyNerds SF (fake)',
        'DynastyNerds (fake)',
    ]

    # Delete ALL old rankings for 2026 players and re-insert from SQLite
    pc.execute("SELECT id FROM players WHERE draft_year = 2026")
    pg_2026_ids = [r[0] for r in pc.fetchall()]

    if pg_2026_ids:
        pc.execute(
            f"DELETE FROM rankings WHERE player_id IN ({','.join(['%s']*len(pg_2026_ids))})",
            pg_2026_ids
        )
        deleted_ranks = pc.rowcount
        pg_conn.commit()
        print(f"  Deleted {deleted_ranks} old ranking rows")

    # Read all current rankings from SQLite
    sc.execute("""
        SELECT p.slug, r.source, r.rank_overall, r.scraped_at
        FROM rankings r
        JOIN players p ON r.player_id = p.id
        WHERE p.draft_year = 2026
    """)
    rank_rows = sc.fetchall()

    # Refresh slug->id map (Anthony Smith may be new)
    pc.execute("SELECT id, slug FROM players WHERE draft_year = 2026")
    pg_slug_to_id = {r[1]: r[0] for r in pc.fetchall()}

    inserted_ranks = 0
    missing_slugs = set()
    for row in rank_rows:
        pid = pg_slug_to_id.get(row['slug'])
        if not pid:
            missing_slugs.add(row['slug'])
            continue
        pc.execute("""
            INSERT INTO rankings (player_id, source, rank_overall, scraped_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (player_id, source, scraped_at) DO UPDATE SET
                rank_overall = EXCLUDED.rank_overall
        """, (pid, row['source'], row['rank_overall'], row['scraped_at']))
        inserted_ranks += 1

    pg_conn.commit()
    print(f"  Inserted {inserted_ranks} ranking rows")
    if missing_slugs:
        print(f"  ⚠ Missing in Supabase: {missing_slugs}")

    # ── 7. Recompute consensus rankings ───────────────────────────────────────
    print("\nRecomputing consensus rankings...")

    # Delete existing consensus for 2026 players
    if pg_2026_ids:
        pc.execute(
            f"DELETE FROM consensus_rankings WHERE player_id IN ({','.join(['%s']*len(pg_2026_ids))})",
            pg_2026_ids
        )
        pg_conn.commit()

    # SF and 1QB use slightly different calculated_at strings so they don't
    # collide under the old UNIQUE(player_id, calculated_at) constraint that
    # Supabase may have (local SQLite was migrated to UNIQUE(player_id, format, calculated_at)).
    TODAY_SF  = '2026-04-30'
    TODAY_1QB = '2026-04-30T01:00:00'

    # Try to migrate Supabase constraint to match local SQLite
    print("Attempting to upgrade consensus_rankings unique constraint...")
    try:
        pc.execute("""
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_name = 'consensus_rankings'
              AND constraint_type = 'UNIQUE'
        """)
        constraints = [r[0] for r in pc.fetchall()]
        print(f"  Existing unique constraints: {constraints}")

        # Check if (player_id, format, calculated_at) already exists
        pc.execute("""
            SELECT COUNT(*) FROM information_schema.constraint_column_usage
            WHERE table_name = 'consensus_rankings'
              AND column_name = 'format'
        """)
        has_format_constraint = pc.fetchone()[0] > 0

        if not has_format_constraint:
            # Drop the old constraint and add the new one
            for cname in constraints:
                try:
                    pc.execute(f'ALTER TABLE consensus_rankings DROP CONSTRAINT "{cname}"')
                    print(f"  Dropped constraint: {cname}")
                except Exception as e:
                    print(f"  Could not drop {cname}: {e}")
                    pg_conn.rollback()
            pc.execute("""
                ALTER TABLE consensus_rankings
                ADD CONSTRAINT consensus_rankings_player_id_format_calculated_at_key
                UNIQUE (player_id, format, calculated_at)
            """)
            pg_conn.commit()
            print("  ✓ Upgraded to UNIQUE(player_id, format, calculated_at)")
        else:
            pg_conn.commit()
            print("  ✓ Constraint already includes format column")
    except Exception as e:
        pg_conn.rollback()
        print(f"  ⚠ Constraint migration failed ({e}) — will use distinct calculated_at per format")

    def compute_consensus(format_name, sources, today_str):
        # Get all 2026 players with at least one ranking from these sources
        pc.execute("""
            SELECT DISTINCT p.id, p.slug
            FROM players p
            JOIN rankings r ON p.id = r.player_id
            WHERE p.draft_year = 2026
              AND r.source = ANY(%s)
            ORDER BY p.id
        """, (sources,))
        players_with_ranks = pc.fetchall()

        player_rank_data = []
        for pid, slug in players_with_ranks:
            pc.execute("""
                SELECT rank_overall FROM rankings
                WHERE player_id = %s AND source = ANY(%s)
                  AND rank_overall IS NOT NULL
                ORDER BY scraped_at DESC
            """, (pid, sources))
            ranks = [r[0] for r in pc.fetchall()]
            if not ranks:
                continue
            avg   = sum(ranks) / len(ranks)
            best  = min(ranks)
            worst = max(ranks)
            variance = sum((r - avg) ** 2 for r in ranks) / len(ranks) if len(ranks) > 1 else 0
            stddev = math.sqrt(variance)
            player_rank_data.append({
                'id': pid, 'slug': slug,
                'avg': avg, 'best': best, 'worst': worst,
                'stddev': stddev, 'num_sources': len(ranks)
            })

        # Sort by avg rank to determine rank_overall
        player_rank_data.sort(key=lambda x: x['avg'])

        for i, p in enumerate(player_rank_data):
            pc.execute("""
                INSERT INTO consensus_rankings
                  (player_id, format, rank_overall, rank_positional,
                   avg_rank, best_rank, worst_rank, std_deviation, num_sources, calculated_at)
                VALUES (%s, %s, %s, NULL, %s, %s, %s, %s, %s, %s)
            """, (p['id'], format_name, i + 1,
                  round(p['avg'], 2), p['best'], p['worst'],
                  round(p['stddev'], 2), p['num_sources'], today_str))

        pg_conn.commit()
        print(f"  {format_name} consensus: {len(player_rank_data)} players")
        return player_rank_data

    sf_sources  = ['FantasyCalc SF', 'DynastyNerds SF', 'TylerFFCreator SF']
    one_sources = ['FantasyCalc', 'DynastyNerds', 'KeepTradeCut']

    sf_data  = compute_consensus('SF',  sf_sources,  TODAY_SF)
    one_data = compute_consensus('1QB', one_sources, TODAY_1QB)

    # ── 8. Verify ─────────────────────────────────────────────────────────────
    print("\n── SF Top 10 ──")
    pc.execute("""
        SELECT p.full_name, p.position, p.nfl_team, p.draft_round, p.draft_pick,
               c.rank_overall, c.avg_rank
        FROM consensus_rankings c
        JOIN players p ON c.player_id = p.id
        WHERE c.format = 'SF' AND p.draft_year = 2026
        ORDER BY c.rank_overall LIMIT 10
    """)
    for row in pc.fetchall():
        name, pos, team, rnd, pick, rank, avg = row
        dest = f"{rnd}.{str(pick).zfill(2)} {team}" if rnd else (team or "Undrafted")
        print(f"  {rank}. {name} ({pos}) → {dest} [avg: {avg:.1f}]")

    print("\n── Draft status sample ──")
    pc.execute("""
        SELECT full_name, nfl_team, draft_round, draft_pick, draft_overall
        FROM players WHERE draft_year = 2026 AND draft_overall IS NOT NULL
        ORDER BY draft_overall LIMIT 5
    """)
    for row in pc.fetchall():
        print(f"  {row[3]}.{str(row[4]).zfill(2)} (#{row[5]}) {row[0]} → {row[1]}")

    pc.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026 AND draft_overall IS NOT NULL")
    drafted_cnt = pc.fetchone()[0]
    pc.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026 AND draft_overall IS NULL AND nfl_team IS NOT NULL")
    udfa_cnt = pc.fetchone()[0]
    pc.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026 AND draft_overall IS NULL AND nfl_team IS NULL")
    undrafted_cnt = pc.fetchone()[0]
    print(f"\n  Drafted: {drafted_cnt} | UDFA: {udfa_cnt} | Undrafted: {undrafted_cnt}")

    sqlite_conn.close()
    pg_conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
