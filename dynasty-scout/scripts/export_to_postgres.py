"""
export_to_postgres.py
Exports all data from dynasty_scout.db (SQLite) into a postgres_seed.sql file
of INSERT statements compatible with Supabase PostgreSQL.

Usage:
    python scripts/export_to_postgres.py

Output:
    dynasty-scout/postgres_seed.sql   <-- paste into Supabase SQL editor after running postgres_schema.sql
"""

import sqlite3
import os
import re
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'postgres_seed.sql')

TABLES_ORDERED = [
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


def escape_value(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    # Escape single quotes for PostgreSQL
    s = str(v).replace("'", "''")
    return f"'{s}'"


def export_table(conn, table_name, out_f):
    cursor = conn.execute(f'SELECT * FROM {table_name}')
    cols = [d[0] for d in cursor.description]
    rows = cursor.fetchall()
    if not rows:
        out_f.write(f'-- {table_name}: (empty)\n\n')
        return

    out_f.write(f'-- {table_name}: {len(rows)} rows\n')

    # Build INSERT with ON CONFLICT DO NOTHING so re-running is idempotent
    col_list = ', '.join(cols)
    for row in rows:
        val_list = ', '.join(escape_value(v) for v in row)
        stmt = f'INSERT INTO {table_name} ({col_list}) VALUES ({val_list}) ON CONFLICT DO NOTHING;\n'
        out_f.write(stmt)

    out_f.write('\n')


def main():
    if not os.path.exists(DB_PATH):
        print(f'ERROR: DB not found at {DB_PATH}')
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write(f'-- Dynasty Scout PostgreSQL seed data\n')
        f.write(f'-- Generated: {datetime.utcnow().isoformat()}Z\n')
        f.write(f'-- Run AFTER postgres_schema.sql\n\n')

        # Reset sequences after bulk insert so new rows get correct IDs
        f.write('-- Disable triggers during bulk insert for performance\n')
        f.write('SET session_replication_role = replica;\n\n')

        for table in TABLES_ORDERED:
            try:
                export_table(conn, table, f)
            except Exception as e:
                f.write(f'-- SKIPPED {table}: {e}\n\n')

        f.write('-- Re-enable triggers\n')
        f.write('SET session_replication_role = DEFAULT;\n\n')

        # Reset all SERIAL sequences to max(id) + 1
        f.write('-- Reset sequences so new rows auto-increment correctly\n')
        for table in TABLES_ORDERED:
            f.write(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false);\n")

    conn.close()
    print(f'Export complete: {OUT_PATH}')
    print(f'1. Run postgres_schema.sql in Supabase SQL editor first.')
    print(f'2. Then run postgres_seed.sql in the same SQL editor.')


if __name__ == '__main__':
    main()
