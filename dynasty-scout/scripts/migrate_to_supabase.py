"""
migrate_to_supabase.py
Reads the local SQLite DB and inserts all data directly into Supabase PostgreSQL.

Usage:
    pip install psycopg2-binary
    py scripts/migrate_to_supabase.py "postgresql://postgres:PASSWORD@db.XXXX.supabase.co:5432/postgres"
"""

import sqlite3
import sys
import os

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed.")
    print("Run this first:  pip install psycopg2-binary")
    sys.exit(1)

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')

TABLES = [
    'players',
    'college_career',
    'college_stats',
    'measurables',
    'nfl_teams',
    'rankings',
    'consensus_rankings',
    'news',
    'social_posts',
    'user_tiers',
    'tier_players',
]


def get_sqlite_columns(sqlite_cur, table):
    sqlite_cur.execute(f'PRAGMA table_info({table})')
    return [row[1] for row in sqlite_cur.fetchall()]


def get_pg_columns(pg_cur, table):
    pg_cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """, (table,))
    return [row[0] for row in pg_cur.fetchall()]


def migrate_table(sqlite_cur, pg_cur, table):
    sqlite_cols = get_sqlite_columns(sqlite_cur, table)
    if not sqlite_cols:
        print(f'  {table}: skipped (not found in SQLite)')
        return 0

    pg_cols = get_pg_columns(pg_cur, table)
    if not pg_cols:
        print(f'  {table}: skipped (not found in PostgreSQL)')
        return 0

    # Only insert columns that exist in both databases
    shared_cols = [c for c in sqlite_cols if c in pg_cols]
    col_indices = [sqlite_cols.index(c) for c in shared_cols]

    skipped = set(sqlite_cols) - set(pg_cols)
    if skipped:
        print(f'  {table}: skipping extra SQLite columns: {", ".join(skipped)}')

    sqlite_cur.execute(f'SELECT * FROM {table}')
    all_rows = sqlite_cur.fetchall()
    if not all_rows:
        print(f'  {table}: 0 rows (empty)')
        return 0

    # Extract only the shared columns from each row
    rows = [tuple(row[i] for i in col_indices) for row in all_rows]

    col_list = ', '.join(shared_cols)
    placeholders = ', '.join(['%s'] * len(shared_cols))
    sql = (
        f'INSERT INTO {table} ({col_list}) VALUES ({placeholders}) '
        f'ON CONFLICT DO NOTHING'
    )

    pg_cur.executemany(sql, rows)
    print(f'  {table}: {len(rows)} rows inserted')
    return len(rows)


def reset_sequences(pg_cur):
    for table in TABLES:
        pg_cur.execute(f"""
            SELECT setval(
                pg_get_serial_sequence('{table}', 'id'),
                COALESCE((SELECT MAX(id) FROM {table}), 0) + 1,
                false
            )
        """)


def main():
    if len(sys.argv) < 2:
        print('Usage: py scripts/migrate_to_supabase.py "postgresql://..."')
        print()
        print('Get your connection URL from:')
        print('  Supabase → Project Settings → Database → Connection string → Direct connection')
        sys.exit(1)

    pg_url = sys.argv[1]

    if not os.path.exists(DB_PATH):
        print(f'ERROR: SQLite DB not found at {DB_PATH}')
        sys.exit(1)

    print(f'Connecting to Supabase...')
    try:
        pg_conn = psycopg2.connect(pg_url, sslmode='require')
        pg_conn.autocommit = False
    except Exception as e:
        print(f'ERROR connecting to Supabase: {e}')
        sys.exit(1)

    print('Connected. Reading local SQLite DB...')
    sqlite_conn = sqlite3.connect(DB_PATH)
    sqlite_cur = sqlite_conn.cursor()
    pg_cur = pg_conn.cursor()

    total = 0
    try:
        # Disable FK constraints so orphaned child rows don't block the import
        pg_cur.execute("SET session_replication_role = replica")

        print('Migrating tables:')
        for table in TABLES:
            try:
                total += migrate_table(sqlite_cur, pg_cur, table)
            except Exception as e:
                print(f'  {table}: ERROR — {e}')
                pg_conn.rollback()
                raise

        print('Resetting ID sequences...')
        reset_sequences(pg_cur)

        pg_cur.execute("SET session_replication_role = DEFAULT")
        pg_conn.commit()
        print(f'\nDone! {total} total rows migrated to Supabase.')

    except Exception as e:
        pg_conn.rollback()
        print(f'\nMigration failed: {e}')
        sys.exit(1)
    finally:
        sqlite_conn.close()
        pg_cur.close()
        pg_conn.close()


if __name__ == '__main__':
    main()
