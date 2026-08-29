"""
Idempotent DDL for the redraft advanced-stat and Vegas layers.

Three tables, all additive — nothing here touches the rookie board or the
existing redraft tables:

  nfl_advanced_season  one row per player-season of efficiency metrics.
                       Wide and sparse on purpose: every position writes into
                       the same row shape and the UI only reads the columns
                       that mean something for that position, exactly like
                       college_stats does on the rookie side.

  vegas_game_lines     one row per team per scheduled game — spread, total,
                       moneyline and the implied team total derived from them.

  vegas_team_season    the roll-up of the above over whatever slate is
                       priced so far: expected win rate and average implied
                       team total, which is the number that actually moves a
                       fantasy projection.

Safe to re-run: every CREATE is IF NOT EXISTS and every ALTER is guarded.

Usage:  py -m scrapers.redraft.schema_advanced
"""
import sys

from scrapers import config

NFL_ADVANCED_SEASON = """
CREATE TABLE IF NOT EXISTS nfl_advanced_season (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    season INTEGER NOT NULL,
    team TEXT,
    position TEXT,
    games INTEGER,

    -- usage (every position)
    offense_snaps INTEGER,
    snap_share REAL,           -- mean offensive snap % across games played
    touches_per_game REAL,
    yards_per_touch REAL,
    total_epa REAL,

    -- passing
    pass_epa REAL,
    epa_per_dropback REAL,
    cpoe REAL,                 -- completion % over expected
    pacr REAL,                 -- pass air conversion ratio
    yards_per_attempt REAL,
    air_yards_per_attempt REAL,
    completed_air_yards_per_cmp REAL,
    pass_yac_per_cmp REAL,
    bad_throw_pct REAL,
    on_target_pct REAL,
    pressure_pct REAL,
    blitz_pct REAL,
    pocket_time REAL,
    sack_rate REAL,
    scramble_rate REAL,
    pass_td_rate REAL,
    int_rate REAL,
    deep_pass_rate REAL,       -- completions of 20+ air-and-YAC yards per attempt

    -- rushing
    rush_epa REAL,
    epa_per_rush REAL,
    yards_per_carry REAL,
    yards_before_contact_att REAL,
    yards_after_contact_att REAL,
    broken_tackles INTEGER,
    att_per_broken_tackle REAL,
    explosive_rush_rate REAL,  -- 10+ yard runs / carries
    breakaway_rush_rate REAL,  -- 20+ yard runs / carries
    rush_first_down_rate REAL,
    carries_per_game REAL,
    rush_mtf_rate REAL,       -- broken tackles per 100 carries

    -- receiving
    rec_epa REAL,
    epa_per_target REAL,
    target_share REAL,
    air_yards_share REAL,
    wopr REAL,                 -- weighted opportunity rating
    racr REAL,                 -- receiver air conversion ratio
    targets_per_game REAL,
    adot REAL,
    yards_per_target REAL,
    yards_per_reception REAL,
    yards_per_snap REAL,       -- the closest thing to YPRR without route data
    catch_rate REAL,
    drop_rate REAL,
    rec_broken_tackles INTEGER,
    rec_mtf_rate REAL,         -- broken tackles per 100 receptions
    yards_before_catch_rec REAL,
    yards_after_catch_rec REAL,
    passer_rating_targeted REAL,
    rec_first_down_rate REAL,
    explosive_rec_rate REAL,   -- 20+ yard receptions / receptions
    rec_td_per_target REAL,

    -- kicking
    fg_att_per_game REAL,
    fg_pct REAL,
    fg_pct_40plus REAL,
    avg_fg_distance REAL,
    fg_50plus_att INTEGER,
    xp_pct REAL,

    -- team defense
    dst_sacks_per_game REAL,
    dst_takeaways_per_game REAL,
    dst_points_allowed_per_game REAL,
    dst_td_count INTEGER,

    data_source TEXT DEFAULT 'nflverse',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season)
);
"""

VEGAS_GAME_LINES = """
CREATE TABLE IF NOT EXISTS vegas_game_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    game_id TEXT NOT NULL,
    team TEXT NOT NULL,
    opponent TEXT NOT NULL,
    is_home INTEGER NOT NULL,
    gameday TEXT,
    -- negative = this team is favoured, matching how a spread is quoted
    spread REAL,
    total_line REAL,
    implied_team_total REAL,
    implied_opp_total REAL,
    moneyline INTEGER,
    win_prob REAL,             -- de-vigged, from both moneylines
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(season, game_id, team)
);
"""

VEGAS_TEAM_SEASON = """
CREATE TABLE IF NOT EXISTS vegas_team_season (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season INTEGER NOT NULL,
    team TEXT NOT NULL,
    games_lined INTEGER,
    games_scheduled INTEGER,
    -- Books post lines a few weeks out, so this is expected wins over the
    -- games that are actually priced, not a season win total. win_pct makes
    -- the two comparable across teams with different amounts of the slate up.
    exp_wins_lined REAL,
    win_pct REAL,
    avg_total REAL,
    avg_spread REAL,
    avg_implied_total REAL,
    avg_implied_opp_total REAL,
    implied_total_rank INTEGER,
    total_rank INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(season, team)
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_nadv_player_season ON nfl_advanced_season(player_id, season)",
    "CREATE INDEX IF NOT EXISTS idx_nadv_season_pos ON nfl_advanced_season(season, position)",
    "CREATE INDEX IF NOT EXISTS idx_vgl_season_team ON vegas_game_lines(season, team)",
    "CREATE INDEX IF NOT EXISTS idx_vgl_season_week ON vegas_game_lines(season, week)",
    "CREATE INDEX IF NOT EXISTS idx_vts_season ON vegas_team_season(season)",
]

TABLES = {
    "nfl_advanced_season": NFL_ADVANCED_SEASON,
    "vegas_game_lines": VEGAS_GAME_LINES,
    "vegas_team_season": VEGAS_TEAM_SEASON,
}


def existing_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def migrate():
    conn = config.get_db_connection()
    if conn is None:
        print("ERROR: could not open the database")
        return 1
    cursor = conn.cursor()

    for name, ddl in TABLES.items():
        cursor.execute(ddl)

    # A re-run against an older copy of the table should pick up any column
    # added since — cheaper than asking the user to drop and reload.
    for name, ddl in TABLES.items():
        have = existing_columns(cursor, name)
        for line in ddl.splitlines():
            line = line.split("--")[0].strip().rstrip(",").strip()
            if not line or line.startswith(("CREATE", "UNIQUE", ")", "id ")):
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
