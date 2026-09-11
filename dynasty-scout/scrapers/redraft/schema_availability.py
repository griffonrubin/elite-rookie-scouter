"""
Idempotent DDL for availability: who is hurt, and who is actually on the field.

The distribution model was complete about a player's ceiling and silent about
whether they would take a snap. Those are not the same question, and the
second one dominates: a 20-point projection is worth nothing if the player is
inactive, and no amount of usage history says so.

Two shapes, because they answer differently.

nfl_player_injury is a weekly report — one row per player per week, carrying
both the game-status designation and the practice participation behind it.
Practice is kept because it is often the sharper of the two: a Friday "Did Not
Participate" says more about Sunday than a Questionable tag does.

Snap share belongs on nfl_player_week instead of in its own table, because it
is measured at exactly that grain — one game, one player — and the whole point
is to read it beside the targets and carries it produced.

Safe to re-run: CREATE is IF NOT EXISTS and the ALTERs are guarded.

Usage:  py -m scrapers.redraft.schema_availability
"""
import sys

from scrapers import config

NFL_PLAYER_INJURY = """
CREATE TABLE IF NOT EXISTS nfl_player_injury (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    season_type TEXT NOT NULL DEFAULT 'REG',
    team TEXT,
    position TEXT,

    -- The official game-status designation: Out, Doubtful, Questionable, or
    -- empty for a player who is on the report but carries no game status.
    report_status TEXT,
    report_primary_injury TEXT,

    -- Practice participation, which is reported even when game status is not.
    practice_status TEXT,
    practice_primary_injury TEXT,

    data_source TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season, week, season_type)
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_npi_player ON nfl_player_injury(player_id, season, week)",
    "CREATE INDEX IF NOT EXISTS idx_npi_week ON nfl_player_injury(season, week)",
]

# Snap share rides along on the weekly row it describes.
WEEK_COLUMNS = [
    ("offense_snaps", "INTEGER"),
    ("offense_pct", "REAL"),
]


def migrate():
    conn = config.get_db_connection()
    cur = conn.cursor()
    cur.execute(NFL_PLAYER_INJURY)
    for sql in INDEXES:
        cur.execute(sql)

    existing = {r[1] for r in cur.execute("PRAGMA table_info(nfl_player_week)")}
    for name, decl in WEEK_COLUMNS:
        if name not in existing:
            cur.execute(f"ALTER TABLE nfl_player_week ADD COLUMN {name} {decl}")
            print(f"  + nfl_player_week.{name}")

    conn.commit()
    n = cur.execute("SELECT COUNT(*) FROM nfl_player_injury").fetchone()[0]
    print(f"nfl_player_injury ready ({n} rows)")
    conn.close()


if __name__ == "__main__":
    migrate()
    sys.exit(0)
