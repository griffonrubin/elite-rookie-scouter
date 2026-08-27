"""
Sync every redraft table from local SQLite to Supabase PostgreSQL.

Deliberately standalone rather than bolted onto sync_to_supabase.py: that
script grew to ~950 lines and already has a silent gap (rb_advanced_career
has no sync function, so it never reaches production). This one owns
*everything redraft*, enumerates its own tables, and finishes by printing a
SQLite-vs-Postgres row-count diff so a missing table is impossible to miss.

Syncs, in dependency order:
  1. schema      — players columns, nfl_season_stats, projections
  2. players     — the redraft pool, inserted with explicit ids
  3. nfl_season_stats
  4. projections
  5. rankings    — redraft sources only
  6. consensus_rankings — format = 'REDRAFT'

Player ids are copied verbatim because every other table references them.
After inserting, the players id sequence is advanced past MAX(id), otherwise
the next Postgres-side insert would collide. A slug-mismatch guard aborts if
a local id points at a different player upstream.

Run from dynasty-scout/:  py -m scrapers.redraft.sync_redraft_to_supabase
"""
import os
import sqlite3
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")
load_dotenv(dotenv_path=".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
SQLITE_PATH = "dynasty_scout.db"

REDRAFT_SOURCES = (
    "FantasyPros PPR", "ESPN Redraft", "KeepTradeCut Redraft", "CBS Redraft",
    "Yahoo Redraft", "Sleeper Redraft", "FantasyCalc Redraft", "Flock Redraft",
    "Underdog Redraft", "FFPC Redraft",
)

PLAYER_COLUMNS = [
    ("redraft_pool", "INTEGER DEFAULT 0"),
    ("sleeper_id", "TEXT"),
    ("gsis_id", "TEXT"),
    ("espn_nfl_id", "TEXT"),
    ("yahoo_id", "TEXT"),
    ("fantasypros_id", "TEXT"),
    ("nfl_headshot_url", "TEXT"),
    ("nfl_draft_year", "INTEGER"),
    ("years_exp", "INTEGER"),
]

NFL_SEASON_STATS_DDL = """
CREATE TABLE IF NOT EXISTS nfl_season_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    team TEXT, position TEXT, games INTEGER,
    fantasy_points_ppr REAL, ppg_ppr REAL,
    finish_overall INTEGER, finish_positional INTEGER,
    pass_attempts INTEGER, completions INTEGER, pass_yards INTEGER,
    pass_tds INTEGER, interceptions INTEGER, sacks_taken INTEGER,
    carries INTEGER, rush_yards INTEGER, rush_tds INTEGER,
    targets INTEGER, receptions INTEGER, rec_yards INTEGER, rec_tds INTEGER,
    fumbles_lost INTEGER,
    fg_made INTEGER, fg_att INTEGER, fg_pct REAL, fg_long INTEGER,
    fg_made_50plus INTEGER, xp_made INTEGER, xp_att INTEGER,
    dst_sacks REAL, dst_ints INTEGER, dst_fum_rec INTEGER, dst_tds INTEGER,
    dst_safeties INTEGER, dst_points_allowed INTEGER,
    data_source TEXT DEFAULT 'nflverse',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season)
);
"""

PROJECTIONS_DDL = """
CREATE TABLE IF NOT EXISTS projections (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    source TEXT NOT NULL,
    season INTEGER NOT NULL DEFAULT 2026,
    proj_points REAL, proj_ppg REAL,
    proj_rank_overall INTEGER, proj_rank_positional INTEGER,
    proj_pass_yards REAL, proj_pass_tds REAL, proj_ints REAL,
    proj_rush_yards REAL, proj_rush_tds REAL,
    proj_receptions REAL, proj_rec_yards REAL, proj_rec_tds REAL,
    scraped_at TEXT NOT NULL,
    UNIQUE(player_id, source, season, scraped_at)
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_nss_player_season ON nfl_season_stats(player_id, season)",
    "CREATE INDEX IF NOT EXISTS idx_nss_season ON nfl_season_stats(season)",
    "CREATE INDEX IF NOT EXISTS idx_proj_player_source ON projections(player_id, source)",
    "CREATE INDEX IF NOT EXISTS idx_rankings_source_scraped ON rankings(source, scraped_at)",
    "CREATE INDEX IF NOT EXISTS idx_players_redraft_pool ON players(redraft_pool)",
]

PLAYER_SYNC_COLS = [
    "id", "slug", "full_name", "first_name", "last_name", "position", "dob",
    "height_inches", "weight_lbs", "draft_year", "nfl_team", "nfl_headshot_url",
    "headshot_url", "redraft_pool", "sleeper_id", "gsis_id", "espn_nfl_id",
    "yahoo_id", "fantasypros_id", "nfl_draft_year", "years_exp",
]

STAT_COLS = [
    "player_id", "season", "team", "position", "games", "fantasy_points_ppr",
    "ppg_ppr", "finish_overall", "finish_positional", "pass_attempts",
    "completions", "pass_yards", "pass_tds", "interceptions", "sacks_taken",
    "carries", "rush_yards", "rush_tds", "targets", "receptions", "rec_yards",
    "rec_tds", "fumbles_lost", "fg_made", "fg_att", "fg_pct", "fg_long",
    "fg_made_50plus", "xp_made", "xp_att", "dst_sacks", "dst_ints",
    "dst_fum_rec", "dst_tds", "dst_safeties", "dst_points_allowed", "data_source",
]

PROJ_COLS = [
    "player_id", "source", "season", "proj_points", "proj_ppg",
    "proj_rank_overall", "proj_rank_positional", "proj_pass_yards",
    "proj_pass_tds", "proj_ints", "proj_rush_yards", "proj_rush_tds",
    "proj_receptions", "proj_rec_yards", "proj_rec_tds", "scraped_at",
]

RANK_COLS = [
    "player_id", "source", "rank_overall", "rank_positional", "tier",
    "source_url", "value", "scraped_at",
]

CONSENSUS_COLS = [
    "player_id", "format", "rank_overall", "rank_positional", "avg_rank",
    "best_rank", "worst_rank", "std_deviation", "num_sources", "calculated_at",
]


def upsert(pg, table, cols, rows, conflict, batch=500):
    """Bulk upsert with every non-key column refreshed."""
    if not rows:
        return 0
    updates = [c for c in cols if c not in conflict]
    set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in updates) or f"{cols[0]} = EXCLUDED.{cols[0]}"
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES %s "
        f"ON CONFLICT ({', '.join(conflict)}) DO UPDATE SET {set_clause}"
    )
    cur = pg.cursor()
    payload = [tuple(r[c] if c in r.keys() else None for c in cols) for r in rows]
    psycopg2.extras.execute_values(cur, sql, payload, page_size=batch)
    pg.commit()
    return len(payload)


def ensure_schema(pg):
    cur = pg.cursor()
    for name, coltype in PLAYER_COLUMNS:
        cur.execute(f"ALTER TABLE players ADD COLUMN IF NOT EXISTS {name} {coltype}")
    cur.execute(NFL_SEASON_STATS_DDL)
    cur.execute(PROJECTIONS_DDL)
    # Several columns exist in the live SQLite file but predate the checked-in
    # Postgres schema, so bring the upstream tables up to date before writing.
    for stmt in (
        "ALTER TABLE rankings ADD COLUMN IF NOT EXISTS rank_positional INTEGER",
        "ALTER TABLE rankings ADD COLUMN IF NOT EXISTS value REAL",
        "ALTER TABLE rankings ADD COLUMN IF NOT EXISTS sentiment_score REAL",
        "ALTER TABLE consensus_rankings ADD COLUMN IF NOT EXISTS rank_positional INTEGER",
        "ALTER TABLE consensus_rankings ADD COLUMN IF NOT EXISTS value REAL",
        "ALTER TABLE consensus_rankings ADD COLUMN IF NOT EXISTS sentiment_score REAL",
        # Tier builder tables are shared by both modes; tiers need a discriminator.
        "ALTER TABLE user_tiers ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'rookie'",
    ):
        cur.execute(stmt)
    for stmt in INDEXES:
        cur.execute(stmt)
    pg.commit()
    print("schema: players columns + nfl_season_stats + projections ensured")


def guard_id_collisions(pg, rows):
    """Abort if a local player id already belongs to a different slug upstream."""
    cur = pg.cursor()
    ids = [r["id"] for r in rows]
    cur.execute("SELECT id, slug FROM players WHERE id = ANY(%s)", (ids,))
    upstream = dict(cur.fetchall())
    clashes = [
        (r["id"], r["slug"], upstream[r["id"]])
        for r in rows
        if r["id"] in upstream and upstream[r["id"]] != r["slug"]
    ]
    if clashes:
        print("\nABORT — local player ids collide with different players upstream:")
        for pid, local, remote in clashes[:10]:
            print(f"  id {pid}: local '{local}' vs remote '{remote}'")
        print(f"  ({len(clashes)} total). Resolve before syncing; nothing was written.")
        raise SystemExit(1)


def sync_players(pg, lite):
    rows = lite.execute(
        f"SELECT {', '.join(PLAYER_SYNC_COLS)} FROM players WHERE redraft_pool = 1"
    ).fetchall()
    guard_id_collisions(pg, rows)
    n = upsert(pg, "players", PLAYER_SYNC_COLS, rows, ["id"])

    # Explicit ids bypass the sequence, so push it past the highest id.
    cur = pg.cursor()
    cur.execute(
        "SELECT setval(pg_get_serial_sequence('players','id'), "
        "COALESCE((SELECT MAX(id) FROM players), 1), true)"
    )
    pg.commit()
    print(f"players: {n} redraft rows upserted (id sequence advanced)")
    return n


def sync_table(pg, lite, label, table, cols, conflict, where=""):
    rows = lite.execute(f"SELECT {', '.join(cols)} FROM {table} {where}").fetchall()
    n = upsert(pg, table, cols, rows, conflict)
    print(f"{label}: {n} rows upserted")
    return n


def report(pg, lite):
    print("\nRow-count check (SQLite -> Postgres):")
    checks = [
        ("players (redraft_pool=1)",
         "SELECT COUNT(*) FROM players WHERE redraft_pool = 1",
         "SELECT COUNT(*) FROM players WHERE redraft_pool = 1"),
        ("nfl_season_stats",
         "SELECT COUNT(*) FROM nfl_season_stats",
         "SELECT COUNT(*) FROM nfl_season_stats"),
        ("projections",
         "SELECT COUNT(*) FROM projections",
         "SELECT COUNT(*) FROM projections"),
        ("rankings (redraft)",
         f"SELECT COUNT(*) FROM rankings WHERE source IN ({','.join('?' * len(REDRAFT_SOURCES))})",
         "SELECT COUNT(*) FROM rankings WHERE source = ANY(%s)"),
        ("consensus (REDRAFT)",
         "SELECT COUNT(*) FROM consensus_rankings WHERE format = 'REDRAFT'",
         "SELECT COUNT(*) FROM consensus_rankings WHERE format = 'REDRAFT'"),
    ]
    cur = pg.cursor()
    ok = True
    for label, lite_sql, pg_sql in checks:
        local = (lite.execute(lite_sql, REDRAFT_SOURCES).fetchone()[0]
                 if "?" in lite_sql else lite.execute(lite_sql).fetchone()[0])
        if "%s" in pg_sql:
            cur.execute(pg_sql, (list(REDRAFT_SOURCES),))
        else:
            cur.execute(pg_sql)
        remote = cur.fetchone()[0]
        match = "OK" if local == remote else "MISMATCH"
        if local != remote:
            ok = False
        print(f"  {label:<26} {local:>6} -> {remote:>6}  {match}")
    return ok


def run():
    if not DATABASE_URL:
        print("DATABASE_URL not set in .env.local — nothing to sync.")
        return 1

    lite = sqlite3.connect(SQLITE_PATH)
    lite.row_factory = sqlite3.Row
    pg = psycopg2.connect(DATABASE_URL, sslmode="require")

    try:
        ensure_schema(pg)
        sync_players(pg, lite)
        sync_table(pg, lite, "nfl_season_stats", "nfl_season_stats",
                   STAT_COLS, ["player_id", "season"])
        sync_table(pg, lite, "projections", "projections",
                   PROJ_COLS, ["player_id", "source", "season", "scraped_at"])
        placeholders = ",".join("'" + s.replace("'", "''") + "'" for s in REDRAFT_SOURCES)
        sync_table(pg, lite, "rankings (redraft)", "rankings",
                   RANK_COLS, ["player_id", "source", "scraped_at"],
                   where=f"WHERE source IN ({placeholders})")
        sync_table(pg, lite, "consensus_rankings (REDRAFT)", "consensus_rankings",
                   CONSENSUS_COLS, ["player_id", "format", "calculated_at"],
                   where="WHERE format = 'REDRAFT'")
        ok = report(pg, lite)
    finally:
        lite.close()
        pg.close()

    print("\nSync complete." if ok else "\nSync finished WITH MISMATCHES — investigate above.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(run())
