"""
scrapers/rankings/dynasty_values.py

Dynasty trade values for every player, and for draft picks.

Why this exists alongside fantasycalc.py, which hits the same API: that one
asks for `rookiesOnly=true` and then drops everything whose position is
"PICK". It was written for a rookie scouting board, where both of those are
the right call. A dynasty trade calculator needs precisely the two things it
throws away — Ja'Marr Chase has to be priceable, and so does a 2027 1st.

It writes to its own sources rather than reusing "FantasyCalc". That source
is rookie ranks 1..N and run_consensus.py weights it at 0.30 of the rookie
consensus; overwriting it with overall dynasty ranks would quietly corrupt
the rookie board this app was built to be. The rookie sources are a snapshot
of how the 2026 class was seen before the draft, and they are meant to stay
that way — nothing here writes to them.

Players are matched on sleeperId, not on names. Every one of the 397 players
the API returns matches that way, so the fuzzy-name path the rookie scraper
needs is not needed here.

Run: py scrapers/rankings/dynasty_values.py
"""

import os
import re
import sqlite3
import time
from datetime import date

import requests

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'dynasty_scout.db')

BASE = "https://api.fantasycalc.com/values/current"
FEEDS = [
    # (source name, query, which value column the picks table gets)
    ("FantasyCalc Dynasty",
     "?isDynasty=true&numQbs=1&ppr=1&superflex=false", "value_1qb", "rank_1qb"),
    ("FantasyCalc Dynasty SF",
     "?isDynasty=true&numQbs=2&ppr=1&superflex=true", "value_sf", "rank_sf"),
]
SOURCE_URL = "https://fantasycalc.com/rankings"

# "2027 1st (Early)", "2028 2nd", ...
PICK_LABEL = re.compile(
    r"^(\d{4}) (\d+)(?:st|nd|rd|th)(?: \((Early|Mid|Late)\))?$")

PICKS_DDL = """
CREATE TABLE IF NOT EXISTS dynasty_picks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL UNIQUE,   -- '2027 1st (Early)'
  season     INTEGER NOT NULL,
  round      INTEGER NOT NULL,
  -- 'early' | 'mid' | 'late', or NULL for the unspecified pick, which is
  -- what you hold before the standings say where it lands.
  slot       TEXT,
  value_1qb  INTEGER,
  value_sf   INTEGER,
  rank_1qb   INTEGER,
  rank_sf    INTEGER,
  scraped_at TEXT NOT NULL
)
"""


def fetch(query: str):
    r = requests.get(BASE + query, timeout=30)
    r.raise_for_status()
    return r.json()


def save_players(cur, rows, source, player_by_sleeper, today):
    """Dynasty values for everybody the API knows and we also know."""
    matched, unmatched = 0, []
    for item in rows:
        pl = item["player"]
        if pl.get("position") == "PICK":
            continue
        pid = player_by_sleeper.get(str(pl.get("sleeperId") or ""))
        if not pid:
            unmatched.append(pl["name"])
            continue
        matched += 1
        # Appended by date, not replaced. The redraft sources already keep a
        # row per scrape — five dates each — and a dynasty value is worth the
        # same treatment: what a player was worth in September is how you
        # tell whether a trade you are being offered has moved. Re-running on
        # the same day overwrites that day and nothing else, which is what
        # the unique key is for.
        cur.execute(
            """INSERT INTO rankings
               (player_id, source, rank_overall, rank_positional, value,
                source_url, scraped_at)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(player_id, source, scraped_at) DO UPDATE SET
                 rank_overall=excluded.rank_overall,
                 rank_positional=excluded.rank_positional,
                 value=excluded.value,
                 source_url=excluded.source_url""",
            (pid, source, item.get("overallRank"), item.get("positionRank"),
             item.get("value"), SOURCE_URL, today))
    print(f"  {source}: {matched} players"
          + (f", {len(unmatched)} unmatched {unmatched[:5]}" if unmatched else ""))
    return matched


def save_picks(cur, rows, value_col, rank_col, today):
    """
    Draft picks, which are assets in a dynasty trade and not players.

    Upserted by label so a pick keeps its id across runs — the calculator
    refers to them by id, and a link somebody sent last week should still
    open the same pick this week.
    """
    seen = 0
    for item in rows:
        pl = item["player"]
        if pl.get("position") != "PICK":
            continue
        m = PICK_LABEL.match(pl["name"].strip())
        if not m:
            print(f"  ! unparsed pick label: {pl['name']!r}")
            continue
        season, rnd, slot = m.group(1), m.group(2), m.group(3)
        seen += 1
        cur.execute(
            f"""INSERT INTO dynasty_picks
                  (label, season, round, slot, {value_col}, {rank_col}, scraped_at)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(label) DO UPDATE SET
                  season=excluded.season,
                  round=excluded.round,
                  slot=excluded.slot,
                  {value_col}=excluded.{value_col},
                  {rank_col}=excluded.{rank_col},
                  scraped_at=excluded.scraped_at""",
            (pl["name"].strip(), int(season), int(rnd),
             slot.lower() if slot else None,
             item.get("value"), item.get("overallRank"), today))
    print(f"  picks: {seen} ({value_col})")
    return seen


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()
    cur.execute(PICKS_DDL)

    cur.execute("SELECT sleeper_id, id FROM players "
                "WHERE sleeper_id IS NOT NULL AND sleeper_id != ''")
    player_by_sleeper = {str(s): i for s, i in cur.fetchall()}
    today = date.today().isoformat()

    print("Fetching FantasyCalc dynasty values (all players + picks)...")
    for i, (source, query, value_col, rank_col) in enumerate(FEEDS):
        rows = fetch(query)
        save_players(cur, rows, source, player_by_sleeper, today)
        save_picks(cur, rows, value_col, rank_col, today)
        conn.commit()
        if i + 1 < len(FEEDS):
            time.sleep(1)

    n_players = cur.execute(
        "SELECT COUNT(DISTINCT player_id) FROM rankings "
        "WHERE source LIKE 'FantasyCalc Dynasty%'").fetchone()[0]
    n_picks = cur.execute("SELECT COUNT(*) FROM dynasty_picks").fetchone()[0]
    print(f"done: {n_players} players and {n_picks} picks carry a dynasty value")
    # Fold the write-ahead log back into the .db before closing. The app
    # opens SQLite in WAL mode; the -wal file is gitignored and the .db is
    # tracked, so without this a run can commit its work and still ship a
    # database file that does not contain it.
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception as e:
        print(f"  ! could not checkpoint the WAL: {e}")
    conn.close()


if __name__ == "__main__":
    run()
