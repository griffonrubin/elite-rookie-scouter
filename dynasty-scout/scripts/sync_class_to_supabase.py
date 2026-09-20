"""
scripts/sync_class_to_supabase.py

Push one draft class from the local SQLite file up to Supabase.

Most of this app's data reaches production through a cron route, because
the source is an HTTP API that Vercel can call for itself. A draft class
cannot: the board it comes from refuses non-browser requests, so the seeder
drives Playwright, which does not run on Vercel. The class therefore exists
only on the machine that scraped it, and the deployed board for it is
empty — which is what shipping the 2027 class actually did.

So the class is carried up by hand, and this is the hand.

Everything is matched on `slug`, which is unique in both databases. Local
row ids mean nothing in Supabase, so a player's remote id is looked up or
created and every dependent row is written against that.

Nothing is deleted and nothing is overwritten with null: a column already
set in production keeps its value unless this has something better. Dry run
unless --apply is given, because this writes to the live database.

Run:
  py scripts/sync_class_to_supabase.py --class 2027            # dry run
  py scripts/sync_class_to_supabase.py --class 2027 --apply
"""

import argparse
import os
import sqlite3
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, '.env.local'))
load_dotenv(os.path.join(ROOT, '.env'))
SQLITE = os.path.join(ROOT, 'dynasty_scout.db')

# Columns worth carrying on the player row itself. Deliberately not every
# column: ids that belong to the local file, and anything the production
# side computes for itself, stay where they are.
PLAYER_COLS = [
    'slug', 'full_name', 'first_name', 'last_name', 'position', 'draft_year',
    'dob', 'age_at_draft', 'height_inches', 'weight_lbs', 'hometown',
    'high_school', 'headshot_url', 'espn_college_id',
    'recruiting_composite', 'recruiting_stars', 'recruiting_year',
]


def shared_columns(lite, pg, table):
    """Columns the table has in both databases, so neither is guessed at."""
    a = {r[1] for r in lite.execute(f"PRAGMA table_info({table})")}
    cur = pg.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns "
                "WHERE table_name = %s", (table,))
    b = {r[0] for r in cur.fetchall()}
    return a & b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--class', dest='year', type=int, required=True)
    ap.add_argument('--apply', action='store_true',
                    help='actually write; without it this only reports')
    args = ap.parse_args()

    url = os.environ.get('DATABASE_URL')
    if not url:
        sys.exit("no DATABASE_URL — put it in .env.local")

    lite = sqlite3.connect(SQLITE)
    lite.row_factory = sqlite3.Row
    pg = psycopg2.connect(url)
    pgc = pg.cursor()

    players = lite.execute(
        "SELECT * FROM players WHERE draft_year = ? ORDER BY slug",
        (args.year,)).fetchall()
    print(f"{len(players)} players in the local {args.year} class")
    if not players:
        sys.exit("nothing to sync")

    cols = [c for c in PLAYER_COLS if c in shared_columns(lite, pg, 'players')]
    inserted = updated = 0
    id_map = {}

    for p in players:
        pgc.execute("SELECT id FROM players WHERE slug = %s", (p['slug'],))
        hit = pgc.fetchone()
        values = [p[c] for c in cols]
        if hit:
            id_map[p['id']] = hit[0]
            # COALESCE the other way round: production keeps what it has
            # unless it has nothing, so a value curated up there survives.
            sets = ", ".join(f"{c} = COALESCE({c}, %s)" for c in cols
                             if c != 'slug')
            if args.apply:
                pgc.execute(f"UPDATE players SET {sets} WHERE id = %s",
                            [p[c] for c in cols if c != 'slug'] + [hit[0]])
            updated += 1
        else:
            if args.apply:
                pgc.execute(
                    f"INSERT INTO players ({', '.join(cols)}) "
                    f"VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id",
                    values)
                id_map[p['id']] = pgc.fetchone()[0]
            else:
                id_map[p['id']] = None
            inserted += 1

    print(f"  players: {inserted} to insert, {updated} already there")

    # Dependent rows, each keyed on the remote player id.
    # The conflict keys are production's actual unique indexes, read off
    # pg_indexes rather than assumed. college_stats is keyed on school as
    # well as season, which is what lets a player who transferred mid-career
    # keep a row per school — the rule the rest of the app is built on.
    for table, key in (('college_career', ('player_id', 'school')),
                       ('college_stats', ('player_id', 'season', 'school')),
                       ('rankings', ('player_id', 'source', 'scraped_at'))):
        tcols = sorted(shared_columns(lite, pg, table) - {'id'})
        local_ids = ",".join(str(p['id']) for p in players)
        where = f"player_id IN ({local_ids})"
        if table == 'rankings':
            where += f" AND source = 'MDDB Consensus {args.year}'"
        rows = lite.execute(
            f"SELECT {', '.join(tcols)} FROM {table} WHERE {where}").fetchall()
        print(f"  {table}: {len(rows)} rows")
        if not args.apply:
            continue
        for r in rows:
            remote = id_map.get(r['player_id'])
            if not remote:
                continue
            vals = [remote if c == 'player_id' else r[c] for c in tcols]
            conflict = (f"ON CONFLICT ({', '.join(key)}) DO NOTHING"
                        if key else "")
            pgc.execute(
                f"INSERT INTO {table} ({', '.join(tcols)}) "
                f"VALUES ({', '.join(['%s'] * len(tcols))}) {conflict}", vals)

    if args.apply:
        pg.commit()
        pgc.execute("SELECT COUNT(*) FROM players WHERE draft_year = %s",
                    (args.year,))
        print(f"\napplied — production now has {pgc.fetchone()[0]} "
              f"players in the {args.year} class")
    else:
        pg.rollback()
        print("\ndry run — nothing written. Re-run with --apply.")
    pg.close()
    lite.close()


if __name__ == "__main__":
    main()
