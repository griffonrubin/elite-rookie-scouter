"""
Load per-game player logs into nfl_player_week.

The season tables answer "how good was this player". A weekly log answers
"what does a week from this player look like", which is a different question
and the one a start/sit decision turns on. Twelve points a week and
4-4-28 average the same and are opposite calls: one is a floor play you
start when you are favoured, the other a ceiling play you need when you are
not.

Source
  nflverse-data stats_player_week_{season}.csv — the weekly twin of the
  file nflverse_stats already reads, same ids, same conventions.

Joins on gsis_id like nflverse_stats, falling back to an unambiguous
name+position match. Team defenses are not in this file; a D/ST week is a
different shape and the season table already carries what the board needs.

Usage:
  py -m scrapers.redraft.nflverse_weekly                  # 2024 2025 2026
  py -m scrapers.redraft.nflverse_weekly --seasons 2025
"""
import argparse
import sys
from datetime import datetime

from scrapers import config
from scrapers.redraft import nflverse_stats as base

WEEK_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
            "stats_player/stats_player_week_{season}.csv")

DEFAULT_SEASONS = [2024, 2025, 2026]

# Only the positions a lineup is set from. The file carries every defender
# in the league, which is 60% of its rows and none of its value here.
KEEP_POSITIONS = {"QB", "RB", "WR", "TE", "K", "FB"}

UPSERT = """
INSERT INTO nfl_player_week (
    player_id, season, week, season_type, game_id, team, opponent, position,
    fantasy_points_ppr, fantasy_points_std,
    carries, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds,
    target_share, air_yards_share, wopr,
    pass_attempts, pass_yards, pass_tds, interceptions,
    rush_epa, rec_epa, pass_epa, data_source, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(player_id, season, week, season_type) DO UPDATE SET
    game_id=excluded.game_id, team=excluded.team, opponent=excluded.opponent,
    position=excluded.position,
    fantasy_points_ppr=excluded.fantasy_points_ppr,
    fantasy_points_std=excluded.fantasy_points_std,
    carries=excluded.carries, rush_yards=excluded.rush_yards,
    rush_tds=excluded.rush_tds, targets=excluded.targets,
    receptions=excluded.receptions, rec_yards=excluded.rec_yards,
    rec_tds=excluded.rec_tds, target_share=excluded.target_share,
    air_yards_share=excluded.air_yards_share, wopr=excluded.wopr,
    pass_attempts=excluded.pass_attempts, pass_yards=excluded.pass_yards,
    pass_tds=excluded.pass_tds, interceptions=excluded.interceptions,
    rush_epa=excluded.rush_epa, rec_epa=excluded.rec_epa,
    pass_epa=excluded.pass_epa, updated_at=excluded.updated_at
"""


def build_rows(season, csv_rows, by_gsis, by_name_pos, unmatched):
    num = base.num
    out = []
    for r in csv_rows:
        pos = (r.get("position") or "").upper()
        if pos not in KEEP_POSITIONS:
            continue
        gsis = (r.get("player_id") or "").strip()
        pid = by_gsis.get(gsis)
        if not pid:
            key = (base.normalize_name(r.get("player_display_name") or ""), pos)
            pid = by_name_pos.get(key)
            if pid:
                by_gsis[gsis] = pid          # repair for the rest of this run
            else:
                unmatched.append(f"{r.get('player_display_name')} ({pos})")
                continue

        out.append((
            pid, season, int(num(r.get("week"), int)),
            (r.get("season_type") or "REG").upper(),
            r.get("game_id") or None, r.get("team") or None,
            r.get("opponent_team") or None, pos,
            num(r.get("fantasy_points_ppr")), num(r.get("fantasy_points")),
            num(r.get("carries"), int), num(r.get("rushing_yards")),
            num(r.get("rushing_tds"), int), num(r.get("targets"), int),
            num(r.get("receptions"), int), num(r.get("receiving_yards")),
            num(r.get("receiving_tds"), int),
            num(r.get("target_share"), float, None),
            num(r.get("air_yards_share"), float, None),
            num(r.get("wopr"), float, None),
            num(r.get("attempts"), int), num(r.get("passing_yards")),
            num(r.get("passing_tds"), int),
            num(r.get("passing_interceptions"), int),
            num(r.get("rushing_epa"), float, None),
            num(r.get("receiving_epa"), float, None),
            num(r.get("passing_epa"), float, None),
            "nflverse", datetime.now().isoformat(timespec="seconds"),
        ))
    return out


def run(seasons):
    conn = config.get_db_connection()
    cursor = conn.cursor()
    by_gsis, _dst, by_name_pos = base.load_player_keys(cursor)
    print(f"Join keys: {len(by_gsis)} players by gsis_id")

    total = 0
    for season in seasons:
        try:
            csv_rows = base.fetch_csv(WEEK_URL.format(season=season))
        except Exception as e:                                   # noqa: BLE001
            print(f"{season}: no weekly file yet ({e})")
            continue
        unmatched = []
        rows = build_rows(season, csv_rows, by_gsis, by_name_pos, unmatched)
        cursor.executemany(UPSERT, rows)
        conn.commit()
        weeks = sorted({r[2] for r in rows})
        print(f"{season}: {len(rows)} player-weeks over weeks "
              f"{weeks[0] if weeks else '-'}..{weeks[-1] if weeks else '-'}"
              f" | {len(set(unmatched))} unmatched")
        for u in sorted(set(unmatched))[:5]:
            print(f"    unmatched: {u}")
        total += len(rows)

    n = cursor.execute("SELECT COUNT(*) FROM nfl_player_week").fetchone()[0]
    print(f"\nnfl_player_week: {n} rows ({total} written this run)")
    conn.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*", type=int, default=DEFAULT_SEASONS)
    args = ap.parse_args()
    sys.exit(run(args.seasons))
