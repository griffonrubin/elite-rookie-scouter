"""
Load the betting market into vegas_game_lines / vegas_team_season.

Rankings tell you what analysts think. The market tells you what people are
willing to lose money on, and it is the input every good projection starts
from: a team's implied total is half the game total shifted by half the
spread, and a receiver on a 27-point offence is playing a different game
from the same receiver on a 17-point one.

Source
  nfldata/data/games.csv — the same file nflverse_stats already pulls for
  D/ST points allowed. It carries the closing (or current, for unplayed
  games) spread, total and moneyline for every scheduled game, so no odds
  API key is needed and no scraping is involved.

Derived per team per game
  implied_team_total   total / 2 -/+ spread / 2
  win_prob             both moneylines converted to probability and
                       renormalised, which removes the book's vig. Games
                       priced without a moneyline fall back to a normal
                       model on the spread (NFL margin sd ~= 13.5).

Rolled up per team
  Books only post lines a few weeks ahead, so the season row reports
  expected wins over the *priced* slate plus the win rate that makes teams
  with different amounts of the schedule up comparable.

Usage:  py -m scrapers.redraft.vegas_lines [--season 2026]
"""
import argparse
import math
import sys
from collections import defaultdict
from datetime import datetime

from scrapers import config
from scrapers.redraft import nflverse_stats as base
from scrapers.redraft.names import norm_team

DEFAULT_SEASON = 2026
# Standard deviation of an NFL game's final margin — the constant that turns
# a point spread into a win probability when no moneyline was posted.
MARGIN_SD = 13.5

GAME_UPSERT = """
INSERT INTO vegas_game_lines (
    season, week, game_id, team, opponent, is_home, gameday,
    spread, total_line, implied_team_total, implied_opp_total,
    moneyline, win_prob, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(season, game_id, team) DO UPDATE SET
    week=excluded.week, opponent=excluded.opponent, is_home=excluded.is_home,
    gameday=excluded.gameday, spread=excluded.spread,
    total_line=excluded.total_line,
    implied_team_total=excluded.implied_team_total,
    implied_opp_total=excluded.implied_opp_total,
    moneyline=excluded.moneyline, win_prob=excluded.win_prob,
    updated_at=excluded.updated_at
"""

TEAM_UPSERT = """
INSERT INTO vegas_team_season (
    season, team, games_lined, games_scheduled, exp_wins_lined, win_pct,
    avg_total, avg_spread, avg_implied_total, avg_implied_opp_total,
    implied_total_rank, total_rank, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(season, team) DO UPDATE SET
    games_lined=excluded.games_lined, games_scheduled=excluded.games_scheduled,
    exp_wins_lined=excluded.exp_wins_lined, win_pct=excluded.win_pct,
    avg_total=excluded.avg_total, avg_spread=excluded.avg_spread,
    avg_implied_total=excluded.avg_implied_total,
    avg_implied_opp_total=excluded.avg_implied_opp_total,
    implied_total_rank=excluded.implied_total_rank,
    total_rank=excluded.total_rank, updated_at=excluded.updated_at
"""


def maybe_float(v):
    if v is None:
        return None
    v = str(v).strip()
    if not v or v.upper() in ("NA", "NAN", "NULL"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def moneyline_prob(ml):
    """American odds -> raw implied probability (still carrying the vig)."""
    if ml is None or ml == 0:
        return None
    return -ml / (-ml + 100) if ml < 0 else 100 / (ml + 100)


def spread_win_prob(spread):
    """P(win) for a team getting `spread` points, negative = favoured."""
    if spread is None:
        return None
    return 0.5 * (1 + math.erf(-spread / (MARGIN_SD * math.sqrt(2))))


def win_probabilities(home_ml, away_ml, home_spread):
    """De-vigged (home, away) win probabilities, or the spread model."""
    ph, pa = moneyline_prob(home_ml), moneyline_prob(away_ml)
    if ph and pa:
        total = ph + pa
        return round(ph / total, 4), round(pa / total, 4)
    # home_spread here is quoted the betting way: negative = home favoured.
    ph = spread_win_prob(home_spread)
    if ph is None:
        return None, None
    return round(ph, 4), round(1 - ph, 4)


def team_sides(g):
    """Both halves of one game, each from that team's own point of view."""
    home, away = norm_team(g.get("home_team")), norm_team(g.get("away_team"))
    total = maybe_float(g.get("total_line"))
    # nfldata quotes spread_line as points the HOME team is favoured by;
    # a betting line is quoted the other way round, so flip the sign.
    line = maybe_float(g.get("spread_line"))
    home_spread = -line if line is not None else None
    away_spread = line if line is not None else None

    home_implied = away_implied = None
    if total is not None and line is not None:
        home_implied = round(total / 2 + line / 2, 2)
        away_implied = round(total / 2 - line / 2, 2)

    home_ml = maybe_float(g.get("home_moneyline"))
    away_ml = maybe_float(g.get("away_moneyline"))
    p_home, p_away = win_probabilities(home_ml, away_ml, home_spread)

    week = int(maybe_float(g.get("week")) or 0)
    gameday = (g.get("gameday") or "").strip() or None
    game_id = g.get("game_id")

    return [
        {"week": week, "game_id": game_id, "team": home, "opponent": away,
         "is_home": 1, "gameday": gameday, "spread": home_spread,
         "total_line": total, "implied_team_total": home_implied,
         "implied_opp_total": away_implied,
         "moneyline": int(home_ml) if home_ml is not None else None,
         "win_prob": p_home},
        {"week": week, "game_id": game_id, "team": away, "opponent": home,
         "is_home": 0, "gameday": gameday, "spread": away_spread,
         "total_line": total, "implied_team_total": away_implied,
         "implied_opp_total": home_implied,
         "moneyline": int(away_ml) if away_ml is not None else None,
         "win_prob": p_away},
    ]


def build_rows(season, games):
    rows = []
    for g in games:
        if str(g.get("season")) != str(season) or g.get("game_type") != "REG":
            continue
        if not norm_team(g.get("home_team")) or not norm_team(g.get("away_team")):
            continue
        rows.extend(team_sides(g))
    return rows


def roll_up(rows):
    """Season aggregates per team, plus the two league-wide ranks."""
    by_team = defaultdict(list)
    for r in rows:
        by_team[r["team"]].append(r)

    out = []
    for team, games in by_team.items():
        lined = [g for g in games if g["implied_team_total"] is not None]
        probs = [g["win_prob"] for g in games if g["win_prob"] is not None]
        n = len(lined)
        out.append({
            "team": team,
            "games_lined": n,
            "games_scheduled": len(games),
            "exp_wins_lined": round(sum(probs), 2) if probs else None,
            "win_pct": round(sum(probs) / len(probs), 4) if probs else None,
            "avg_total": round(sum(g["total_line"] for g in lined) / n, 2) if n else None,
            "avg_spread": round(sum(g["spread"] for g in lined) / n, 2) if n else None,
            "avg_implied_total": round(sum(g["implied_team_total"] for g in lined) / n, 2) if n else None,
            "avg_implied_opp_total": round(sum(g["implied_opp_total"] for g in lined) / n, 2) if n else None,
        })

    for key, rank_key in (("avg_implied_total", "implied_total_rank"),
                          ("avg_total", "total_rank")):
        ranked = sorted([t for t in out if t[key] is not None],
                        key=lambda t: t[key], reverse=True)
        for i, t in enumerate(ranked, 1):
            t[rank_key] = i
        for t in out:
            t.setdefault(rank_key, None)
    return sorted(out, key=lambda t: t["team"])


def run(season=DEFAULT_SEASON):
    conn = config.get_db_connection()
    if conn is None:
        print("ERROR: could not open the database")
        return 1
    cursor = conn.cursor()

    from scrapers.redraft import schema_advanced
    cursor.execute(schema_advanced.VEGAS_GAME_LINES)
    cursor.execute(schema_advanced.VEGAS_TEAM_SEASON)
    conn.commit()

    print(f"Fetching game lines for {season} ...")
    games = base.fetch_csv(base.GAMES_URL)
    rows = build_rows(season, games)
    if not rows:
        print(f"  no {season} regular-season games found — nothing written")
        conn.close()
        return 1

    now = datetime.now().isoformat(timespec="seconds")
    for r in rows:
        cursor.execute(GAME_UPSERT, (
            season, r["week"], r["game_id"], r["team"], r["opponent"],
            r["is_home"], r["gameday"], r["spread"], r["total_line"],
            r["implied_team_total"], r["implied_opp_total"],
            r["moneyline"], r["win_prob"], now,
        ))

    teams = roll_up(rows)
    for t in teams:
        cursor.execute(TEAM_UPSERT, (
            season, t["team"], t["games_lined"], t["games_scheduled"],
            t["exp_wins_lined"], t["win_pct"], t["avg_total"], t["avg_spread"],
            t["avg_implied_total"], t["avg_implied_opp_total"],
            t["implied_total_rank"], t["total_rank"], now,
        ))
    conn.commit()

    lined = sum(1 for r in rows if r["implied_team_total"] is not None) // 2
    print(f"  {len(rows) // 2} scheduled games, {lined} with a posted line")
    top = sorted([t for t in teams if t["avg_implied_total"] is not None],
                 key=lambda t: t["avg_implied_total"], reverse=True)[:5]
    if top:
        print("  highest implied totals: "
              + ", ".join(f"{t['team']} {t['avg_implied_total']}" for t in top))
    else:
        print("  no lines posted yet — the schedule is stored, totals stay null")
    print(f"vegas_game_lines: {len(rows)} team-game rows | "
          f"vegas_team_season: {len(teams)} teams")
    conn.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=DEFAULT_SEASON)
    args = ap.parse_args()
    sys.exit(run(args.season))
