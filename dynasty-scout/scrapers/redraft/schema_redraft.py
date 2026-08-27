"""
Idempotent DDL for redraft mode.

Adds the redraft membership flag + external ID crosswalk columns to `players`,
and creates the two new tables (`nfl_season_stats`, `projections`).

Safe to re-run: every ALTER is guarded by a column check and every CREATE uses
IF NOT EXISTS. Rookie-mode columns and data are never touched.

Usage:  py -m scrapers.redraft.schema_redraft
"""
import sys
from scrapers import config

# (column, type) pairs added to the existing `players` table.
PLAYER_COLUMNS = [
    ("redraft_pool", "INTEGER DEFAULT 0"),   # 1 = appears on the redraft board
    ("sleeper_id", "TEXT"),
    ("gsis_id", "TEXT"),                      # nflverse join key
    ("espn_nfl_id", "TEXT"),                  # distinct from espn_college_id
    ("yahoo_id", "TEXT"),
    ("fantasypros_id", "TEXT"),
    ("nfl_headshot_url", "TEXT"),             # keeps college headshot_url intact
    # `draft_year` stays the rookie-class discriminator (2026 = rookie board).
    # Veterans record their real NFL draft year here so no redraft row ever
    # has to claim draft_year = 2026 and leak onto the rookie board.
    ("nfl_draft_year", "INTEGER"),
    ("years_exp", "INTEGER"),
]

NFL_SEASON_STATS = """
CREATE TABLE IF NOT EXISTS nfl_season_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    team TEXT,
    position TEXT,
    games INTEGER,
    fantasy_points_ppr REAL,
    ppg_ppr REAL,
    finish_overall INTEGER,
    finish_positional INTEGER,
    -- passing
    pass_attempts INTEGER, completions INTEGER, pass_yards INTEGER,
    pass_tds INTEGER, interceptions INTEGER, sacks_taken INTEGER,
    -- rushing
    carries INTEGER, rush_yards INTEGER, rush_tds INTEGER,
    -- receiving
    targets INTEGER, receptions INTEGER, rec_yards INTEGER, rec_tds INTEGER,
    fumbles_lost INTEGER,
    -- kicking
    fg_made INTEGER, fg_att INTEGER, fg_pct REAL, fg_long INTEGER,
    fg_made_50plus INTEGER, xp_made INTEGER, xp_att INTEGER,
    -- team defense / special teams
    dst_sacks REAL, dst_ints INTEGER, dst_fum_rec INTEGER, dst_tds INTEGER,
    dst_safeties INTEGER, dst_points_allowed INTEGER,
    data_source TEXT DEFAULT 'nflverse',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season)
);
"""

PROJECTIONS = """
CREATE TABLE IF NOT EXISTS projections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    source TEXT NOT NULL,
    season INTEGER NOT NULL DEFAULT 2026,
    proj_points REAL,
    proj_ppg REAL,
    proj_rank_overall INTEGER,
    proj_rank_positional INTEGER,
    proj_pass_yards REAL, proj_pass_tds REAL, proj_ints REAL,
    proj_rush_yards REAL, proj_rush_tds REAL,
    proj_receptions REAL, proj_rec_yards REAL, proj_rec_tds REAL,
    scraped_at TEXT NOT NULL,
    UNIQUE(player_id, source, season, scraped_at)
);
"""

# The tier builder's tables are shared between both modes, so tiers need a
# discriminator or a redraft tier would show up on the rookie board.
# Existing rows default to 'rookie', leaving the rookie tier builder untouched.
TIER_MODE_COLUMN = ("mode", "TEXT DEFAULT 'rookie'")

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_nss_player_season ON nfl_season_stats(player_id, season)",
    "CREATE INDEX IF NOT EXISTS idx_nss_season ON nfl_season_stats(season)",
    "CREATE INDEX IF NOT EXISTS idx_proj_player_source ON projections(player_id, source)",
    "CREATE INDEX IF NOT EXISTS idx_rankings_source_scraped ON rankings(source, scraped_at)",
    "CREATE INDEX IF NOT EXISTS idx_players_redraft_pool ON players(redraft_pool)",
]


def existing_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def migrate():
    conn = config.get_db_connection()
    if conn is None:
        print("ERROR: could not open the database")
        return 1
    cursor = conn.cursor()

    added = []
    have = existing_columns(cursor, "players")
    for name, coltype in PLAYER_COLUMNS:
        if name in have:
            continue
        cursor.execute(f"ALTER TABLE players ADD COLUMN {name} {coltype}")
        added.append(name)

    cursor.execute(NFL_SEASON_STATS)
    cursor.execute(PROJECTIONS)

    name, coltype = TIER_MODE_COLUMN
    if name not in existing_columns(cursor, "user_tiers"):
        cursor.execute(f"ALTER TABLE user_tiers ADD COLUMN {name} {coltype}")
        added.append(f"user_tiers.{name}")
    cursor.execute("UPDATE user_tiers SET mode = 'rookie' WHERE mode IS NULL")
    for stmt in INDEXES:
        cursor.execute(stmt)

    # Existing rookies default to out-of-pool; seed_player_pool opts them in.
    cursor.execute("UPDATE players SET redraft_pool = 0 WHERE redraft_pool IS NULL")
    conn.commit()

    print(f"players: added {len(added)} column(s){': ' + ', '.join(added) if added else ' (already current)'}")
    for table in ("nfl_season_stats", "projections"):
        n = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"{table}: ready ({n} rows)")
    print(f"indexes: {len(INDEXES)} ensured")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(migrate())
