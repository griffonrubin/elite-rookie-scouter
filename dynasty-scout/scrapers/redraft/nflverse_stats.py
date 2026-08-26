"""
Load NFL regular-season stats (2021-2025) from nflverse into nfl_season_stats.

Sources (all plain CSV over HTTPS — no Playwright, no API key)
  players : releases/download/stats_player/stats_player_reg_{YYYY}.csv
            gsis-keyed season totals with fantasy_points_ppr precomputed,
            plus full kicking splits.
  teams   : releases/download/stats_team/stats_team_reg_{YYYY}.csv
            team defense totals (sacks, INTs, fumbles, TDs, safeties).
  games   : nfldata/data/games.csv
            final scores, used to compute each defense's per-game points
            allowed — the bracket is scored per game, so season totals
            alone are not enough.

Players join on gsis_id. D/ST join on nfl_team.

Finish ranks (finish_overall / finish_positional) are computed within each
season across the whole pool, so a profile can say "WR7 in 2024".

Usage:  py -m scrapers.redraft.nflverse_stats [--seasons 2021,2022,...]
"""
import argparse
import csv
import io
import json
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime

from scrapers import config
from scrapers.redraft.names import norm_team, normalize_name

PLAYER_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_{season}.csv"
TEAM_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_reg_{season}.csv"
GAMES_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; DyCharts/1.0)"}

DEFAULT_SEASONS = [2021, 2022, 2023, 2024, 2025]
SCORING_POSITIONS = {"QB", "RB", "WR", "TE", "K"}

# Standard D/ST scoring — the near-universal default in PPR redraft leagues.
DST_POINTS_ALLOWED_BRACKETS = [
    (0, 0, 10), (1, 6, 7), (7, 13, 4), (14, 20, 1),
    (21, 27, 0), (28, 34, -1), (35, 999, -4),
]

# nflverse leaves fantasy_points_ppr at 0 for kickers — that column only covers
# offensive scoring — so kicker points are computed here from the distance
# splits using standard scoring (3 pts inside 40, 4 from 40-49, 5 from 50+,
# 1 per extra point, no penalty for misses).
FG_POINTS_BY_BUCKET = [
    ("fg_made_0_19", 3), ("fg_made_20_29", 3), ("fg_made_30_39", 3),
    ("fg_made_40_49", 4), ("fg_made_50_59", 5), ("fg_made_60_", 5),
]


def kicker_points(row):
    pts = sum(num(row.get(col), int) * val for col, val in FG_POINTS_BY_BUCKET)
    return round(pts + num(row.get("pat_made"), int), 2)

UPSERT = """
INSERT INTO nfl_season_stats (
    player_id, season, team, position, games,
    fantasy_points_ppr, ppg_ppr, finish_overall, finish_positional,
    pass_attempts, completions, pass_yards, pass_tds, interceptions, sacks_taken,
    carries, rush_yards, rush_tds,
    targets, receptions, rec_yards, rec_tds, fumbles_lost,
    fg_made, fg_att, fg_pct, fg_long, fg_made_50plus, xp_made, xp_att,
    dst_sacks, dst_ints, dst_fum_rec, dst_tds, dst_safeties, dst_points_allowed,
    data_source, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'nflverse',?)
ON CONFLICT(player_id, season) DO UPDATE SET
    team=excluded.team, position=excluded.position, games=excluded.games,
    fantasy_points_ppr=excluded.fantasy_points_ppr, ppg_ppr=excluded.ppg_ppr,
    finish_overall=excluded.finish_overall, finish_positional=excluded.finish_positional,
    pass_attempts=excluded.pass_attempts, completions=excluded.completions,
    pass_yards=excluded.pass_yards, pass_tds=excluded.pass_tds,
    interceptions=excluded.interceptions, sacks_taken=excluded.sacks_taken,
    carries=excluded.carries, rush_yards=excluded.rush_yards, rush_tds=excluded.rush_tds,
    targets=excluded.targets, receptions=excluded.receptions,
    rec_yards=excluded.rec_yards, rec_tds=excluded.rec_tds, fumbles_lost=excluded.fumbles_lost,
    fg_made=excluded.fg_made, fg_att=excluded.fg_att, fg_pct=excluded.fg_pct,
    fg_long=excluded.fg_long, fg_made_50plus=excluded.fg_made_50plus,
    xp_made=excluded.xp_made, xp_att=excluded.xp_att,
    dst_sacks=excluded.dst_sacks, dst_ints=excluded.dst_ints,
    dst_fum_rec=excluded.dst_fum_rec, dst_tds=excluded.dst_tds,
    dst_safeties=excluded.dst_safeties, dst_points_allowed=excluded.dst_points_allowed,
    updated_at=excluded.updated_at
"""


def fetch_csv(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=300) as r:
        text = r.read().decode("utf-8", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def num(v, cast=float, default=0):
    """nflverse leaves blanks and 'NA' for absent stats."""
    if v is None:
        return default
    v = str(v).strip()
    if not v or v.upper() in ("NA", "NAN", "NULL"):
        return default
    try:
        return cast(float(v))
    except ValueError:
        return default


def dst_points_allowed_score(points):
    for low, high, pts in DST_POINTS_ALLOWED_BRACKETS:
        if low <= points <= high:
            return pts
    return 0


def load_player_keys(cursor):
    """Lookup tables: gsis_id, (name, position), and team -> D/ST."""
    cursor.execute(
        "SELECT id, full_name, gsis_id, nfl_team, position "
        "FROM players WHERE redraft_pool = 1"
    )
    by_gsis, by_dst_team = {}, {}
    name_pos = defaultdict(list)
    for r in cursor.fetchall():
        if r["position"] == "DST":
            if r["nfl_team"]:
                by_dst_team[norm_team(r["nfl_team"])] = r["id"]
            continue
        if r["gsis_id"]:
            by_gsis[r["gsis_id"]] = r["id"]
        name_pos[(normalize_name(r["full_name"]), (r["position"] or "").upper())].append(r["id"])
    # Only unambiguous names are safe to match on.
    by_name_pos = {k: v[0] for k, v in name_pos.items() if len(v) == 1}
    return by_gsis, by_dst_team, by_name_pos


def build_dst_season(season, team_rows, games):
    """Season D/ST fantasy totals, with points-allowed scored per game."""
    pa_points = defaultdict(float)
    pa_allowed = defaultdict(int)
    for g in games:
        if g.get("season") != str(season) or g.get("game_type") != "REG":
            continue
        home, away = norm_team(g.get("home_team")), norm_team(g.get("away_team"))
        hs, as_ = g.get("home_score"), g.get("away_score")
        if not hs or not as_ or not home or not away:
            continue  # unplayed / postponed
        hs, as_ = int(float(hs)), int(float(as_))
        # each defense is scored on what the *opponent* scored
        pa_points[home] += dst_points_allowed_score(as_)
        pa_allowed[home] += as_
        pa_points[away] += dst_points_allowed_score(hs)
        pa_allowed[away] += hs

    out = {}
    for t in team_rows:
        team = norm_team(t.get("team"))
        if not team:
            continue
        sacks = num(t.get("def_sacks"))
        ints = num(t.get("def_interceptions"), int)
        fum_rec = num(t.get("def_fumbles"), int)
        tds = num(t.get("def_tds"), int) + num(t.get("special_teams_tds"), int)
        safeties = num(t.get("def_safeties"), int)
        blocks = (num(t.get("def_punt_blocks"), int)
                  + num(t.get("def_pat_blocks"), int)
                  + num(t.get("def_fg_blocks"), int))
        pts = (sacks * 1 + ints * 2 + fum_rec * 2 + tds * 6
               + safeties * 2 + blocks * 2 + pa_points.get(team, 0))
        out[team] = {
            "games": num(t.get("games"), int),
            "points": round(pts, 2),
            "sacks": sacks, "ints": ints, "fum_rec": fum_rec,
            "tds": tds, "safeties": safeties,
            "points_allowed": pa_allowed.get(team, 0),
        }
    return out


def build_rows(season, player_rows, dst_by_team, by_gsis, by_dst_team,
               by_name_pos, unmatched, gsis_fixes):
    """Assemble one dict per player-season, before finish ranks are assigned."""
    rows = []

    for p in player_rows:
        pos = (p.get("position") or "").upper()
        if pos not in SCORING_POSITIONS:
            continue
        gsis = (p.get("player_id") or "").strip()
        pid = by_gsis.get(gsis)
        if not pid:
            # The ID crosswalk is occasionally wrong or stale. Fall back to an
            # unambiguous name+position match and record the correction so the
            # player's gsis_id gets repaired for every later run.
            pid = by_name_pos.get((normalize_name(p.get("player_display_name") or ""), pos))
            if pid and gsis:
                gsis_fixes[pid] = gsis
                by_gsis[gsis] = pid
        if not pid:
            ppr = num(p.get("fantasy_points_ppr"))
            if ppr > 0:  # only worth reporting if they actually scored
                unmatched.append({
                    "season": season, "gsis_id": gsis,
                    "name": p.get("player_display_name"), "position": pos,
                    "team": p.get("recent_team"), "ppr": ppr,
                })
            continue

        games = num(p.get("games"), int)
        ppr = kicker_points(p) if pos == "K" else round(num(p.get("fantasy_points_ppr")), 2)
        fumbles_lost = (num(p.get("rushing_fumbles_lost"), int)
                        + num(p.get("receiving_fumbles_lost"), int)
                        + num(p.get("sack_fumbles_lost"), int))
        fg50 = num(p.get("fg_made_50_59"), int) + num(p.get("fg_made_60_"), int)

        rows.append({
            "player_id": pid, "season": season, "team": norm_team(p.get("recent_team")),
            "position": pos, "games": games, "ppr": ppr,
            "ppg": round(ppr / games, 2) if games else None,
            "pass_attempts": num(p.get("attempts"), int),
            "completions": num(p.get("completions"), int),
            "pass_yards": num(p.get("passing_yards"), int),
            "pass_tds": num(p.get("passing_tds"), int),
            "interceptions": num(p.get("passing_interceptions"), int),
            "sacks_taken": num(p.get("sacks_suffered"), int),
            "carries": num(p.get("carries"), int),
            "rush_yards": num(p.get("rushing_yards"), int),
            "rush_tds": num(p.get("rushing_tds"), int),
            "targets": num(p.get("targets"), int),
            "receptions": num(p.get("receptions"), int),
            "rec_yards": num(p.get("receiving_yards"), int),
            "rec_tds": num(p.get("receiving_tds"), int),
            "fumbles_lost": fumbles_lost,
            "fg_made": num(p.get("fg_made"), int), "fg_att": num(p.get("fg_att"), int),
            # nflverse stores fg_pct as a 0-1 fraction; the UI wants a percentage.
            "fg_pct": round(num(p.get("fg_pct")) * 100, 1) or None,
            "fg_long": num(p.get("fg_long"), int) or None,
            "fg_made_50plus": fg50,
            "xp_made": num(p.get("pat_made"), int), "xp_att": num(p.get("pat_att"), int),
            "dst_sacks": None, "dst_ints": None, "dst_fum_rec": None,
            "dst_tds": None, "dst_safeties": None, "dst_points_allowed": None,
        })

    for team, d in dst_by_team.items():
        pid = by_dst_team.get(team)
        if not pid:
            unmatched.append({"season": season, "dst_team": team, "ppr": d["points"]})
            continue
        rows.append({
            "player_id": pid, "season": season, "team": team, "position": "DST",
            "games": d["games"], "ppr": d["points"],
            "ppg": round(d["points"] / d["games"], 2) if d["games"] else None,
            "pass_attempts": None, "completions": None, "pass_yards": None,
            "pass_tds": None, "interceptions": None, "sacks_taken": None,
            "carries": None, "rush_yards": None, "rush_tds": None,
            "targets": None, "receptions": None, "rec_yards": None,
            "rec_tds": None, "fumbles_lost": None,
            "fg_made": None, "fg_att": None, "fg_pct": None, "fg_long": None,
            "fg_made_50plus": None, "xp_made": None, "xp_att": None,
            "dst_sacks": d["sacks"], "dst_ints": d["ints"], "dst_fum_rec": d["fum_rec"],
            "dst_tds": d["tds"], "dst_safeties": d["safeties"],
            "dst_points_allowed": d["points_allowed"],
        })

    return rows


def assign_finishes(rows):
    """Rank within the season: overall across every position, then per position."""
    ranked = sorted(rows, key=lambda r: r["ppr"] or 0, reverse=True)
    for i, r in enumerate(ranked, 1):
        r["finish_overall"] = i
    per_pos = defaultdict(int)
    for r in ranked:
        per_pos[r["position"]] += 1
        r["finish_positional"] = per_pos[r["position"]]
    return ranked


def persist(cursor, rows, now):
    for r in rows:
        cursor.execute(UPSERT, (
            r["player_id"], r["season"], r["team"], r["position"], r["games"],
            r["ppr"], r["ppg"], r["finish_overall"], r["finish_positional"],
            r["pass_attempts"], r["completions"], r["pass_yards"], r["pass_tds"],
            r["interceptions"], r["sacks_taken"],
            r["carries"], r["rush_yards"], r["rush_tds"],
            r["targets"], r["receptions"], r["rec_yards"], r["rec_tds"], r["fumbles_lost"],
            r["fg_made"], r["fg_att"], r["fg_pct"], r["fg_long"], r["fg_made_50plus"],
            r["xp_made"], r["xp_att"],
            r["dst_sacks"], r["dst_ints"], r["dst_fum_rec"], r["dst_tds"],
            r["dst_safeties"], r["dst_points_allowed"], now,
        ))


def run(seasons):
    conn = config.get_db_connection()
    if conn is None:
        print("ERROR: could not open the database")
        return 1
    cursor = conn.cursor()

    by_gsis, by_dst_team, by_name_pos = load_player_keys(cursor)
    print(f"Join keys: {len(by_gsis)} players by gsis_id, {len(by_dst_team)} D/ST by team")

    print("Fetching game scores (for D/ST points allowed) ...")
    games = fetch_csv(GAMES_URL)
    print(f"  {len(games)} games")

    now = datetime.now().isoformat(timespec="seconds")
    unmatched = []
    gsis_fixes = {}
    total = 0

    for season in seasons:
        try:
            player_rows = fetch_csv(PLAYER_URL.format(season=season))
            team_rows = fetch_csv(TEAM_URL.format(season=season))
        except Exception as e:
            print(f"  {season}: FAILED to fetch ({e}) — "
                  f"check the asset name at github.com/nflverse/nflverse-data/releases")
            continue

        dst = build_dst_season(season, team_rows, games)
        rows = build_rows(season, player_rows, dst, by_gsis, by_dst_team,
                          by_name_pos, unmatched, gsis_fixes)
        rows = assign_finishes(rows)
        persist(cursor, rows, now)
        conn.commit()
        total += len(rows)

        top = rows[0]
        cursor.execute("SELECT full_name FROM players WHERE id = ?", (top["player_id"],))
        name = cursor.fetchone()["full_name"]
        print(f"  {season}: {len(rows):4d} player-seasons  |  PPR #1 {name} "
              f"({top['position']}, {top['ppr']})")

    if gsis_fixes:
        for pid, gsis in gsis_fixes.items():
            cursor.execute("UPDATE players SET gsis_id = ? WHERE id = ?", (gsis, pid))
        conn.commit()
        print(f"\nRepaired {len(gsis_fixes)} wrong/missing gsis_id(s) via name match")

    # Unmatched report — the pipeline's early-warning system for ID drift.
    if unmatched:
        path = "scrapers/redraft/unmatched_nflverse.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(unmatched, f, indent=2)
        scoring = [u for u in unmatched if u.get("ppr", 0) >= 50]
        print(f"\nUnmatched with any points: {len(unmatched)} "
              f"({len(scoring)} scored 50+ PPR) -> {path}")

    print(f"\nTotal rows written: {total}")
    n = cursor.execute("SELECT COUNT(*) FROM nfl_season_stats").fetchone()[0]
    print(f"nfl_season_stats now holds {n} rows")
    conn.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", help="comma-separated, e.g. 2021,2022")
    args = ap.parse_args()
    chosen = ([int(s) for s in args.seasons.split(",")]
              if args.seasons else DEFAULT_SEASONS)
    sys.exit(run(chosen))
