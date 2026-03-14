"""
push_updates_to_supabase.py
Syncs bio data (height, weight, dob, age_at_draft) and QB college stats
(completions, pass_attempts) from local SQLite to Supabase PostgreSQL.

Usage:
    pip install psycopg2-binary
    py scripts/push_updates_to_supabase.py "postgresql://postgres:PASSWORD@db.XXXX.supabase.co:5432/postgres"
"""

import sqlite3
import sys
import os

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')


def main():
    if len(sys.argv) < 2:
        print("Usage: py scripts/push_updates_to_supabase.py <DATABASE_URL>")
        sys.exit(1)

    pg_url = sys.argv[1]
    sqlite_conn = sqlite3.connect(DB_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    sc = sqlite_conn.cursor()

    pg_conn = psycopg2.connect(pg_url, sslmode='require')
    pg_conn.autocommit = False
    pc = pg_conn.cursor()

    # ── 1. Push player bio (height, weight, dob, age_at_draft) ──────────────
    print("Syncing player bio data...")
    sc.execute("""
        SELECT slug, height_inches, weight_lbs, dob, age_at_draft
        FROM players
        WHERE draft_year = 2026
          AND (height_inches IS NOT NULL OR weight_lbs IS NOT NULL
               OR dob IS NOT NULL OR age_at_draft IS NOT NULL)
    """)
    rows = sc.fetchall()
    bio_updated = 0
    for row in rows:
        pc.execute("""
            UPDATE players
            SET height_inches = %s,
                weight_lbs    = %s,
                dob           = %s,
                age_at_draft  = %s
            WHERE slug = %s
        """, (row['height_inches'], row['weight_lbs'],
              row['dob'], row['age_at_draft'], row['slug']))
        bio_updated += pc.rowcount
    pg_conn.commit()
    print(f"  Bio rows updated: {bio_updated}")

    # ── 2. Push QB college_stats (completions + pass_attempts) ──────────────
    print("Syncing QB college stats (completions/pass_attempts)...")
    sc.execute("""
        SELECT p.slug, cs.season, cs.school,
               cs.completions, cs.pass_attempts, cs.pass_yards,
               cs.pass_tds, cs.interceptions,
               cs.rush_attempts, cs.rush_yards, cs.rush_tds,
               cs.receptions, cs.rec_yards, cs.rec_tds,
               cs.games_played, cs.targets
        FROM college_stats cs
        JOIN players p ON cs.player_id = p.id
        WHERE p.position = 'QB' AND p.draft_year = 2026
    """)
    qb_rows = sc.fetchall()

    # Get player id map from Supabase
    pc.execute("SELECT id, slug FROM players WHERE draft_year = 2026")
    slug_to_id = {r[1]: r[0] for r in pc.fetchall()}

    qb_upserted = 0
    for row in qb_rows:
        p_id = slug_to_id.get(row['slug'])
        if not p_id:
            print(f"  WARNING: slug {row['slug']} not found in Supabase")
            continue
        pc.execute("""
            INSERT INTO college_stats
              (player_id, season, school, games_played,
               pass_attempts, completions, pass_yards, pass_tds, interceptions,
               rush_attempts, rush_yards, rush_tds,
               receptions, rec_yards, rec_tds, targets)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (player_id, season, school) DO UPDATE SET
              completions   = EXCLUDED.completions,
              pass_attempts = EXCLUDED.pass_attempts,
              pass_yards    = CASE WHEN EXCLUDED.pass_yards > 0 THEN EXCLUDED.pass_yards ELSE college_stats.pass_yards END,
              pass_tds      = CASE WHEN EXCLUDED.pass_tds > 0 THEN EXCLUDED.pass_tds ELSE college_stats.pass_tds END,
              interceptions = CASE WHEN EXCLUDED.interceptions > 0 THEN EXCLUDED.interceptions ELSE college_stats.interceptions END,
              games_played  = CASE WHEN EXCLUDED.games_played IS NOT NULL AND EXCLUDED.games_played > 0 THEN EXCLUDED.games_played ELSE college_stats.games_played END
        """, (
            p_id, row['season'], row['school'], row['games_played'],
            row['pass_attempts'], row['completions'], row['pass_yards'],
            row['pass_tds'], row['interceptions'],
            row['rush_attempts'], row['rush_yards'], row['rush_tds'],
            row['receptions'], row['rec_yards'], row['rec_tds'],
            row['targets']
        ))
        qb_upserted += 1

    pg_conn.commit()
    print(f"  QB stat rows upserted: {qb_upserted}")

    # ── 3. Also fix NULL bio fields (null out bad placeholder data) ──────────
    print("Nulling placeholder bio data in Supabase...")
    # NULL out height=72/weight=200 defaults (these are wrong placeholder values)
    pc.execute("""
        UPDATE players
        SET height_inches = NULL, weight_lbs = NULL
        WHERE draft_year = 2026 AND height_inches = 72 AND weight_lbs = 200
    """)
    nulled = pc.rowcount
    pg_conn.commit()
    print(f"  Placeholder bio rows nulled: {nulled}")

    sqlite_conn.close()
    pg_conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
