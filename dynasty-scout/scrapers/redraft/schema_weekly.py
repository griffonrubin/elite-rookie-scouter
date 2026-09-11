"""
Idempotent DDL for the weekly game-log layer.

One row per player per game. Everything else in this database is aggregated
to a season, which is enough to rank players but not to decide a start/sit:
a 12-point average hides whether that is 12 every week or 4-4-28, and those
are opposite calls depending on whether you are favoured or need a ceiling.

Deliberately narrower than nfl_advanced_season. A weekly row only carries
what a start/sit decision actually reads — the outcome, the usage that
produced it, and the game it happened in — because the value here is having
seventeen of them per player, not having ninety columns in each.

Safe to re-run: the CREATE is IF NOT EXISTS and the ALTERs are guarded.

Usage:  py -m scrapers.redraft.schema_weekly
"""
import sys

from scrapers import config

NFL_PLAYER_WEEK = """
CREATE TABLE IF NOT EXISTS nfl_player_week (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    -- REG or POST. Kept rather than filtered on load so a postseason run
    -- can be excluded from a regular-season distribution deliberately.
    season_type TEXT NOT NULL DEFAULT 'REG',
    game_id TEXT,
    team TEXT,
    opponent TEXT,
    position TEXT,

    -- the outcome
    fantasy_points_ppr REAL,
    fantasy_points_std REAL,

    -- the usage that produced it: the half of a game log that carries
    -- forward, since volume is far more stable week to week than efficiency
    carries INTEGER,
    rush_yards REAL,
    rush_tds INTEGER,
    targets INTEGER,
    receptions INTEGER,
    rec_yards REAL,
    rec_tds INTEGER,
    target_share REAL,
    air_yards_share REAL,
    wopr REAL,
    pass_attempts INTEGER,
    pass_yards REAL,
    pass_tds INTEGER,
    interceptions INTEGER,

    -- efficiency, for the head-to-head decomposition
    rush_epa REAL,
    rec_epa REAL,
    pass_epa REAL,

    data_source TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season, week, season_type)
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_npw_player ON nfl_player_week(player_id, season, week)",
    "CREATE INDEX IF NOT EXISTS idx_npw_season_week ON nfl_player_week(season, week)",
    "CREATE INDEX IF NOT EXISTS idx_npw_team ON nfl_player_week(season, team)",
]

TABLES = {"nfl_player_week": NFL_PLAYER_WEEK}


def migrate():
    conn = config.get_db_connection()
    cursor = conn.cursor()

    for name, ddl in TABLES.items():
        cursor.execute(ddl)
        have = {r[1] for r in cursor.execute(f"PRAGMA table_info({name})")}
        for line in ddl.splitlines():
            line = line.strip()
            if not line or line.startswith(("CREATE", "UNIQUE", ")", "id ", "--")):
                continue
            parts = line.split()
            if len(parts) < 2 or parts[0] in have:
                continue
            coltype = parts[1].rstrip(",")
            if coltype not in ("INTEGER", "REAL", "TEXT", "TIMESTAMP"):
                continue
            cursor.execute(f"ALTER TABLE {name} ADD COLUMN {parts[0]} {coltype}")
            print(f"  {name}: added column {parts[0]}")

    for stmt in INDEXES:
        cursor.execute(stmt)
    conn.commit()

    for name in TABLES:
        n = cursor.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        print(f"{name}: ready ({n} rows)")
    print(f"indexes: {len(INDEXES)} ensured")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(migrate())
