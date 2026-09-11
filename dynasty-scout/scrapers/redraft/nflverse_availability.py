"""
Load who is hurt and who is actually playing.

The model already knew what a player does when they play. It had nothing at
all on whether they will, which is the question that decides more lineups than
any distribution does: a projection is worth zero if its owner is inactive,
and no amount of target share says so.

Sources, both nflverse release assets, so no key and no scraping:
  injuries/injuries_{season}.csv       the official weekly injury report
  snap_counts/snap_counts_{season}.csv per-game offensive snap share

Injuries carry two signals and both are kept. report_status is the game
designation (Out, Doubtful, Questionable). practice_status is participation,
which is reported for players who never get a game status at all and is often
the sharper read — a Friday "Did Not Participate" says more about Sunday than
a Questionable tag does.

Snap share is written onto nfl_player_week rather than a table of its own: it
is measured at that exact grain, and its value is being read beside the
targets and carries it produced.

Usage:  py -m scrapers.redraft.nflverse_availability [--season 2026]
"""
import argparse
import sys
from collections import defaultdict
from datetime import datetime

from scrapers import config
from scrapers.redraft import nflverse_stats as base
from scrapers.redraft.names import normalize_name
from scrapers.redraft.nflverse_weekly import canon_team

INJURY_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
              "injuries/injuries_{season}.csv")
SNAP_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
            "snap_counts/snap_counts_{season}.csv")

DEFAULT_SEASON = 2026

# Only the positions a fantasy lineup is set from. The injury report covers
# the whole roster, and a hurt left guard is not a start/sit decision.
KEEP_POSITIONS = {"QB", "RB", "WR", "TE", "K", "FB"}

INJURY_UPSERT = """
INSERT INTO nfl_player_injury (
    player_id, season, week, season_type, team, position,
    report_status, report_primary_injury,
    practice_status, practice_primary_injury, data_source, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(player_id, season, week, season_type) DO UPDATE SET
    team=excluded.team, position=excluded.position,
    report_status=excluded.report_status,
    report_primary_injury=excluded.report_primary_injury,
    practice_status=excluded.practice_status,
    practice_primary_injury=excluded.practice_primary_injury,
    updated_at=excluded.updated_at
"""


def resolve(row, by_gsis, by_name_pos):
    """A player id from a gsis id, falling back to name and position."""
    gsis = (row.get("gsis_id") or "").strip()
    if gsis and gsis in by_gsis:
        return by_gsis[gsis]
    name = row.get("full_name") or row.get("player") or ""
    pos = (row.get("position") or "").upper()
    return by_name_pos.get((normalize_name(name), pos))


def load_injuries(cursor, season, by_gsis, by_name_pos, now):
    rows = base.fetch_csv(INJURY_URL.format(season=season))
    out, unmatched = [], []
    for r in rows:
        pos = (r.get("position") or "").upper()
        if pos not in KEEP_POSITIONS:
            continue
        pid = resolve(r, by_gsis, by_name_pos)
        if not pid:
            unmatched.append(f"{r.get('full_name')} ({pos})")
            continue
        out.append((
            pid, int(r["season"]), int(r["week"]),
            (r.get("season_type") or "REG").upper(),
            canon_team(r.get("team")), pos,
            (r.get("report_status") or "").strip() or None,
            (r.get("report_primary_injury") or "").strip() or None,
            (r.get("practice_status") or "").strip() or None,
            (r.get("practice_primary_injury") or "").strip() or None,
            "nflverse", now,
        ))
    cursor.executemany(INJURY_UPSERT, out)
    return len(out), unmatched


def load_snaps(cursor, season, by_gsis, by_name_pos, now):
    """
    Snap share onto the weekly row it belongs to.

    The snap file identifies players by pfr id and name, not gsis, so this
    matches on name and position and updates rather than inserts — a snap
    count for a player with no weekly stat row is a row we do not want.
    """
    rows = base.fetch_csv(SNAP_URL.format(season=season))
    updated, missed = 0, 0
    for r in rows:
        pos = (r.get("position") or "").upper()
        if pos not in KEEP_POSITIONS:
            continue
        pid = resolve(r, by_gsis, by_name_pos)
        if not pid:
            missed += 1
            continue
        pct = r.get("offense_pct")
        cursor.execute(
            "UPDATE nfl_player_week SET offense_snaps = ?, offense_pct = ? "
            " WHERE player_id = ? AND season = ? AND week = ? AND season_type = ?",
            (base.num(r.get("offense_snaps"), int, None),
             base.num(pct, float, None) if pct not in (None, "") else None,
             pid, int(r["season"]), int(r["week"]),
             (r.get("game_type") or "REG").upper()))
        updated += cursor.rowcount
    return updated, missed


def run(season):
    conn = config.get_db_connection()
    cur = conn.cursor()
    by_gsis, _dst, by_name_pos = base.load_player_keys(cur)
    now = datetime.now().isoformat(timespec="seconds")

    n_inj, unmatched = load_injuries(cur, season, by_gsis, by_name_pos, now)
    print(f"injuries  : {n_inj} rows  ({len(unmatched)} unmatched)")
    for name in unmatched[:5]:
        print(f"            unmatched: {name}")

    n_snap, missed = load_snaps(cur, season, by_gsis, by_name_pos, now)
    print(f"snap share: {n_snap} weekly rows updated  ({missed} unmatched)")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--season", type=int, default=DEFAULT_SEASON)
    a = p.parse_args()
    run(a.season)
    sys.exit(0)
