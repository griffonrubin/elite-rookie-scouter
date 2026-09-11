"""
Idempotent DDL for player prop lines and the projection they imply.

Every other projection in this database is somebody's opinion. A prop line is
a price: the number at which a book is willing to take money on both sides,
moved by everyone who disagrees with it. For a single player in a single week
that is the sharpest estimate available anywhere, and it reprices on news —
including injury news — hours before any ranking does.

Two tables, because a line and a projection are different things.

nfl_player_prop is the raw market: one row per player per week per market per
book, with both sides priced. Keeping both sides is what makes the vig
removable, and keeping the book is what makes disagreement between books
visible instead of averaged away.

nfl_player_market_projection is what the lines add up to — receptions, yards
and touchdown probability turned into PPR points under the league's scoring.
Stored rather than computed on read because it depends on which books were up
at the time, and a projection that silently changes when a book takes a market
down is not one you can check later.

Safe to re-run.

Usage:  py -m scrapers.redraft.schema_props
"""
import sys

from scrapers import config

NFL_PLAYER_PROP = """
CREATE TABLE IF NOT EXISTS nfl_player_prop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    -- 'receptions', 'rec_yds', 'rush_yds', 'pass_yds', 'pass_tds',
    -- 'rush_attempts', 'anytime_td'
    market TEXT NOT NULL,
    book TEXT NOT NULL,

    -- The line itself. NULL for a market priced as a straight yes/no.
    line REAL,
    -- American odds on each side, kept so the vig can be removed.
    over_price INTEGER,
    under_price INTEGER,
    -- Vig-free probability of the over (or of 'yes' on a yes/no market).
    over_prob REAL,

    event_id TEXT,
    commence_time TEXT,
    scraped_at TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season, week, market, book, scraped_at)
);
"""

NFL_PLAYER_MARKET_PROJECTION = """
CREATE TABLE IF NOT EXISTS nfl_player_market_projection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,

    -- The components, each a consensus across whichever books priced it.
    receptions REAL,
    rec_yards REAL,
    rush_yards REAL,
    pass_yards REAL,
    pass_tds REAL,
    rush_attempts REAL,
    anytime_td_prob REAL,

    -- What they add up to under PPR, and how much of the player's game the
    -- market actually priced — a receiver with only a yards line has a
    -- thinner projection than one with yards, catches and a touchdown price.
    ppr_points REAL,
    markets_priced INTEGER,
    books_priced INTEGER,

    scraped_at TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season, week, scraped_at)
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_prop_player ON nfl_player_prop(player_id, season, week)",
    "CREATE INDEX IF NOT EXISTS idx_prop_week ON nfl_player_prop(season, week, market)",
    "CREATE INDEX IF NOT EXISTS idx_mproj_player ON nfl_player_market_projection(player_id, season, week)",
    "CREATE INDEX IF NOT EXISTS idx_mproj_week ON nfl_player_market_projection(season, week)",
]

TABLES = {
    "nfl_player_prop": NFL_PLAYER_PROP,
    "nfl_player_market_projection": NFL_PLAYER_MARKET_PROJECTION,
}


def migrate():
    conn = config.get_db_connection()
    cur = conn.cursor()
    for name, ddl in TABLES.items():
        cur.execute(ddl)
    for sql in INDEXES:
        cur.execute(sql)
    conn.commit()
    for name in TABLES:
        n = cur.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        print(f"{name} ready ({n} rows)")
    conn.close()


if __name__ == "__main__":
    migrate()
    sys.exit(0)
