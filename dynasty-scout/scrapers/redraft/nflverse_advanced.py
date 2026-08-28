"""
Load advanced / efficiency NFL stats (2021-2025) into nfl_advanced_season.

nfl_season_stats holds the box score. This holds the part of the box score
that actually predicts next season: opportunity share, efficiency per
opportunity, and the charted detail (pressure, contact, separation-ish
proxies) that separates a volume finish from a real one.

Sources (all plain CSV over HTTPS — no API key)
  stats_player_reg_{YYYY}.csv   EPA, CPOE, PACR/RACR, target + air-yard share,
                                WOPR, explosive-play counts, kicking splits.
  pfr_advstats season pass/rush/rec
                                Pro-Football-Reference charting: pressure and
                                bad-throw rates for QBs, yards before/after
                                contact and broken tackles for RBs, ADOT,
                                drop rate and passer rating when targeted for
                                pass catchers.
  snap_counts_{YYYY}.csv        offensive snap share — the usage denominator
                                that makes per-snap rates comparable.
  players.csv                   the gsis_id <-> pfr_id crosswalk that lets the
                                two families of source join at all.

Team defenses reuse nflverse_stats.build_dst_season so the D/ST numbers here
can never disagree with the ones on the season table.

Every metric is stored in the unit the UI shows: percentages as 0-100, rates
per game or per opportunity, never a raw fraction.

Usage:  py -m scrapers.redraft.nflverse_advanced [--seasons 2024,2025]
"""
import argparse
import sys
from collections import defaultdict
from datetime import datetime

from scrapers import config
from scrapers.redraft import nflverse_stats as base
from scrapers.redraft.names import norm_team

PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
ADV_URL = "https://github.com/nflverse/nflverse-data/releases/download/pfr_advstats/advstats_season_{kind}.csv"
SNAPS_URL = "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.csv"

DEFAULT_SEASONS = base.DEFAULT_SEASONS
OFFENSE_POSITIONS = {"QB", "RB", "WR", "TE"}

# Column order is also the insert order — one list keeps the DDL, the UPSERT
# and the row dicts from drifting apart.
COLUMNS = [
    "team", "position", "games",
    "offense_snaps", "snap_share", "touches_per_game", "yards_per_touch", "total_epa",
    "pass_epa", "epa_per_dropback", "cpoe", "pacr", "yards_per_attempt",
    "air_yards_per_attempt", "completed_air_yards_per_cmp", "pass_yac_per_cmp",
    "bad_throw_pct", "on_target_pct", "pressure_pct", "blitz_pct", "pocket_time",
    "sack_rate", "scramble_rate", "pass_td_rate", "int_rate", "deep_pass_rate",
    "rush_epa", "epa_per_rush", "yards_per_carry", "yards_before_contact_att",
    "yards_after_contact_att", "broken_tackles", "att_per_broken_tackle",
    "explosive_rush_rate", "breakaway_rush_rate", "rush_first_down_rate",
    "carries_per_game", "rush_mtf_rate",
    "rec_epa", "epa_per_target", "target_share", "air_yards_share", "wopr", "racr",
    "targets_per_game", "adot", "yards_per_target", "yards_per_reception",
    "yards_per_snap", "catch_rate", "drop_rate", "rec_broken_tackles",
    "yards_before_catch_rec", "yards_after_catch_rec", "passer_rating_targeted",
    "rec_mtf_rate",
    "rec_first_down_rate", "explosive_rec_rate", "rec_td_per_target",
    "fg_att_per_game", "fg_pct", "fg_pct_40plus", "avg_fg_distance",
    "fg_50plus_att", "xp_pct",
    "dst_sacks_per_game", "dst_takeaways_per_game", "dst_points_allowed_per_game",
    "dst_td_count",
]

UPSERT = f"""
INSERT INTO nfl_advanced_season (
    player_id, season, {', '.join(COLUMNS)}, data_source, updated_at
) VALUES ({', '.join(['?'] * (len(COLUMNS) + 2))}, 'nflverse', ?)
ON CONFLICT(player_id, season) DO UPDATE SET
    {', '.join(f'{c}=excluded.{c}' for c in COLUMNS)},
    updated_at=excluded.updated_at
"""


def num(v, cast=float, default=0):
    return base.num(v, cast, default)


def rate(numerator, denominator, scale=100.0, digits=1, floor=1):
    """A percentage, or None when the denominator is too small to mean anything."""
    if not denominator or denominator < floor:
        return None
    return round(numerator / denominator * scale, digits)


def per(numerator, denominator, digits=2, floor=1):
    return rate(numerator, denominator, scale=1.0, digits=digits, floor=floor)


def opt(v, digits=2):
    """Keep a source value only when it is actually populated."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.upper() in ("NA", "NAN", "NULL"):
        return None
    try:
        return round(float(s), digits)
    except ValueError:
        return None


# ── Source loading ───────────────────────────────────────────────────────────

def load_pfr_crosswalk():
    """pfr_id -> gsis_id. PFR charting data carries no gsis_id of its own."""
    rows = base.fetch_csv(PLAYERS_URL)
    out = {}
    for r in rows:
        pfr, gsis = (r.get("pfr_id") or "").strip(), (r.get("gsis_id") or "").strip()
        if pfr and gsis:
            out[pfr] = gsis
    return out


def load_advstats(kind, pfr_to_gsis):
    """One PFR charting file, keyed {season: {gsis_id: row}}."""
    try:
        rows = base.fetch_csv(ADV_URL.format(kind=kind))
    except Exception as e:
        print(f"  advstats/{kind}: FAILED to fetch ({e}) — those metrics stay null")
        return {}
    out = defaultdict(dict)
    # PFR occasionally lists a player twice in a season after a mid-year trade;
    # the row with the most volume is the season line we want.
    volume_key = {"pass": "pass_attempts", "rush": "att", "rec": "tgt"}[kind]
    for r in rows:
        gsis = pfr_to_gsis.get((r.get("pfr_id") or "").strip())
        if not gsis:
            continue
        season = int(num(r.get("season"), int))
        prev = out[season].get(gsis)
        if prev is None or num(r.get(volume_key)) > num(prev.get(volume_key)):
            out[season][gsis] = r
    return out


def load_snaps(season, pfr_to_gsis):
    """Season offensive snaps + mean snap share, keyed by gsis_id."""
    try:
        rows = base.fetch_csv(SNAPS_URL.format(season=season))
    except Exception as e:
        print(f"  snap_counts {season}: FAILED to fetch ({e}) — snap share stays null")
        return {}
    totals = defaultdict(lambda: {"snaps": 0, "pct_sum": 0.0, "games": 0})
    for r in rows:
        if r.get("game_type") != "REG":
            continue
        gsis = pfr_to_gsis.get((r.get("pfr_player_id") or "").strip())
        if not gsis:
            continue
        snaps = num(r.get("offense_snaps"), int)
        if snaps <= 0:
            continue
        t = totals[gsis]
        t["snaps"] += snaps
        # offense_pct arrives as a 0-1 fraction.
        t["pct_sum"] += num(r.get("offense_pct")) * 100
        t["games"] += 1
    return {
        g: {"snaps": t["snaps"], "share": round(t["pct_sum"] / t["games"], 1)}
        for g, t in totals.items() if t["games"]
    }


# ── Metric assembly ──────────────────────────────────────────────────────────

def blank_row():
    return {c: None for c in COLUMNS}


def passing_metrics(row, p, adv):
    attempts = num(p.get("attempts"), int)
    if attempts < 20:
        return
    completions = num(p.get("completions"), int)
    sacks = num(p.get("sacks_suffered"), int)
    dropbacks = attempts + sacks

    row["pass_epa"] = opt(p.get("passing_epa"), 1)
    row["epa_per_dropback"] = per(num(p.get("passing_epa")), dropbacks, 3)
    # Already in percentage points, unlike the share columns below.
    row["cpoe"] = opt(p.get("passing_cpoe"), 1)
    row["pacr"] = opt(p.get("pacr"), 2)
    row["yards_per_attempt"] = per(num(p.get("passing_yards")), attempts, 2)
    row["pass_yac_per_cmp"] = per(num(p.get("passing_yards_after_catch")), completions, 2)
    row["sack_rate"] = rate(sacks, dropbacks)
    row["pass_td_rate"] = rate(num(p.get("passing_tds"), int), attempts)
    row["int_rate"] = rate(num(p.get("passing_interceptions"), int), attempts)
    row["deep_pass_rate"] = rate(num(p.get("passing_20"), int), attempts)
    row["air_yards_per_attempt"] = per(num(p.get("passing_air_yards")), attempts, 2)

    if not adv:
        return
    adv_att = num(adv.get("pass_attempts"), int)
    row["air_yards_per_attempt"] = (opt(adv.get("intended_air_yards_per_pass_attempt"))
                                    or row["air_yards_per_attempt"])
    row["completed_air_yards_per_cmp"] = opt(adv.get("completed_air_yards_per_completion"))
    row["bad_throw_pct"] = opt(adv.get("bad_throw_pct"), 1)
    row["on_target_pct"] = opt(adv.get("on_tgt_pct"), 1)
    row["pressure_pct"] = opt(adv.get("pressure_pct"), 1)
    row["blitz_pct"] = rate(num(adv.get("times_blitzed"), int), adv_att)
    row["pocket_time"] = opt(adv.get("pocket_time"))
    row["scramble_rate"] = rate(num(adv.get("scrambles"), int), dropbacks)


def rushing_metrics(row, p, adv, games):
    carries = num(p.get("carries"), int)
    if carries < 10:
        return
    row["rush_epa"] = opt(p.get("rushing_epa"), 1)
    row["epa_per_rush"] = per(num(p.get("rushing_epa")), carries, 3)
    row["yards_per_carry"] = per(num(p.get("rushing_yards")), carries, 2)
    row["explosive_rush_rate"] = rate(num(p.get("rushing_10"), int), carries)
    row["breakaway_rush_rate"] = rate(num(p.get("rushing_20"), int), carries)
    row["rush_first_down_rate"] = rate(num(p.get("rushing_first_downs"), int), carries)
    row["carries_per_game"] = per(carries, games, 1)

    if not adv:
        return
    row["yards_before_contact_att"] = opt(adv.get("ybc_att"))
    row["yards_after_contact_att"] = opt(adv.get("yac_att"))
    brk = num(adv.get("brk_tkl"), int)
    row["broken_tackles"] = brk or None
    row["att_per_broken_tackle"] = opt(adv.get("att_br"), 1)
    row["rush_mtf_rate"] = rate(brk, carries)


def receiving_metrics(row, p, adv, games, snaps):
    targets = num(p.get("targets"), int)
    if targets < 10:
        return
    receptions = num(p.get("receptions"), int)
    rec_yards = num(p.get("receiving_yards"))

    row["rec_epa"] = opt(p.get("receiving_epa"), 1)
    row["epa_per_target"] = per(num(p.get("receiving_epa")), targets, 3)
    tgt_share = opt(p.get("target_share"), 4)
    row["target_share"] = round(tgt_share * 100, 1) if tgt_share is not None else None
    ay_share = opt(p.get("air_yards_share"), 4)
    row["air_yards_share"] = round(ay_share * 100, 1) if ay_share is not None else None
    row["wopr"] = opt(p.get("wopr"), 3)
    row["racr"] = opt(p.get("racr"), 2)
    row["targets_per_game"] = per(targets, games, 1)
    row["yards_per_target"] = per(rec_yards, targets, 2)
    row["yards_per_reception"] = per(rec_yards, receptions, 2)
    row["catch_rate"] = rate(receptions, targets)
    row["rec_first_down_rate"] = rate(num(p.get("receiving_first_downs"), int), targets)
    row["explosive_rec_rate"] = rate(num(p.get("receiving_20"), int), receptions, floor=5)
    row["rec_td_per_target"] = rate(num(p.get("receiving_tds"), int), targets)
    if snaps:
        # Without route data this is the closest available stand-in for YPRR.
        row["yards_per_snap"] = per(rec_yards, snaps["snaps"], 2, floor=50)

    if not adv:
        return
    row["adot"] = opt(adv.get("adot"), 1)
    row["yards_before_catch_rec"] = opt(adv.get("ybc_r"))
    row["yards_after_catch_rec"] = opt(adv.get("yac_r"))
    # PFR quotes the receiving drop rate as a fraction and the passing one
    # as a percentage — the only place the two charting files disagree.
    drop = opt(adv.get("drop_percent"), 4)
    row["drop_rate"] = round(drop * 100, 1) if drop is not None else None
    brk = num(adv.get("brk_tkl"), int)
    row["rec_broken_tackles"] = brk or None
    row["rec_mtf_rate"] = rate(brk, receptions, floor=5)
    row["passer_rating_targeted"] = opt(adv.get("rat"), 1)


def kicking_metrics(row, p, games):
    fg_att = num(p.get("fg_att"), int)
    if fg_att < 5:
        return
    made_40plus = sum(num(p.get(c), int) for c in ("fg_made_40_49", "fg_made_50_59", "fg_made_60_"))
    miss_40plus = sum(num(p.get(c), int) for c in ("fg_missed_40_49", "fg_missed_50_59", "fg_missed_60_"))
    att_50plus = sum(num(p.get(c), int) for c in
                     ("fg_made_50_59", "fg_made_60_", "fg_missed_50_59", "fg_missed_60_"))
    total_distance = num(p.get("fg_made_distance")) + num(p.get("fg_missed_distance"))

    row["fg_att_per_game"] = per(fg_att, games, 2)
    row["fg_pct"] = round(num(p.get("fg_pct")) * 100, 1) or None
    row["fg_pct_40plus"] = rate(made_40plus, made_40plus + miss_40plus, floor=3)
    row["avg_fg_distance"] = per(total_distance, fg_att, 1, floor=5)
    row["fg_50plus_att"] = att_50plus or None
    row["xp_pct"] = rate(num(p.get("pat_made"), int), num(p.get("pat_att"), int), floor=5)


def summary_metrics(row, p, games):
    touches = num(p.get("carries"), int) + num(p.get("receptions"), int)
    yards = num(p.get("rushing_yards")) + num(p.get("receiving_yards"))
    row["touches_per_game"] = per(touches, games, 1) if touches >= 10 else None
    row["yards_per_touch"] = per(yards, touches, 2, floor=10)
    epa = sum(num(p.get(k)) for k in ("passing_epa", "rushing_epa", "receiving_epa"))
    row["total_epa"] = round(epa, 1) if epa else None


def build_player_rows(season, player_rows, by_gsis, adv, snaps_by_gsis):
    rows = []
    for p in player_rows:
        pos = (p.get("position") or "").upper()
        if pos not in OFFENSE_POSITIONS and pos != "K":
            continue
        pid = by_gsis.get((p.get("player_id") or "").strip())
        if not pid:
            continue
        games = num(p.get("games"), int)
        if games < 1:
            continue

        gsis = (p.get("player_id") or "").strip()
        snaps = snaps_by_gsis.get(gsis)
        row = blank_row()
        row.update({
            "team": norm_team(p.get("recent_team")),
            "position": pos,
            "games": games,
            "offense_snaps": snaps["snaps"] if snaps else None,
            "snap_share": snaps["share"] if snaps else None,
        })

        summary_metrics(row, p, games)
        if pos == "K":
            kicking_metrics(row, p, games)
        else:
            passing_metrics(row, p, adv["pass"].get(season, {}).get(gsis))
            rushing_metrics(row, p, adv["rush"].get(season, {}).get(gsis), games)
            receiving_metrics(row, p, adv["rec"].get(season, {}).get(gsis), games, snaps)

        if any(row[c] is not None for c in COLUMNS if c not in ("team", "position", "games")):
            rows.append((pid, season, row))
    return rows


def build_dst_rows(season, dst_by_team, by_dst_team):
    rows = []
    for team, d in dst_by_team.items():
        pid = by_dst_team.get(team)
        games = d["games"]
        if not pid or not games:
            continue
        row = blank_row()
        row.update({
            "team": team, "position": "DST", "games": games,
            "dst_sacks_per_game": per(d["sacks"], games, 2),
            "dst_takeaways_per_game": per(d["ints"] + d["fum_rec"], games, 2),
            "dst_points_allowed_per_game": per(d["points_allowed"], games, 1),
            "dst_td_count": d["tds"] or None,
        })
        rows.append((pid, season, row))
    return rows


def persist(cursor, rows, now):
    for pid, season, row in rows:
        cursor.execute(UPSERT, (pid, season, *[row[c] for c in COLUMNS], now))


def run(seasons=None):
    seasons = seasons or DEFAULT_SEASONS
    conn = config.get_db_connection()
    if conn is None:
        print("ERROR: could not open the database")
        return 1
    cursor = conn.cursor()

    from scrapers.redraft import schema_advanced
    cursor.execute(schema_advanced.NFL_ADVANCED_SEASON)
    conn.commit()

    by_gsis, by_dst_team, _ = base.load_player_keys(cursor)
    print(f"Join keys: {len(by_gsis)} players by gsis_id, {len(by_dst_team)} D/ST by team")

    print("Fetching the pfr_id crosswalk ...")
    pfr_to_gsis = load_pfr_crosswalk()
    print(f"  {len(pfr_to_gsis)} pfr_id -> gsis_id pairs")

    print("Fetching PFR charting data ...")
    adv = {kind: load_advstats(kind, pfr_to_gsis) for kind in ("pass", "rush", "rec")}
    for kind, byseason in adv.items():
        got = sum(len(v) for v in byseason.values())
        print(f"  advstats/{kind}: {got} player-seasons")

    games = base.fetch_csv(base.GAMES_URL)
    now = datetime.now().isoformat(timespec="seconds")
    total = 0

    for season in seasons:
        try:
            player_rows = base.fetch_csv(base.PLAYER_URL.format(season=season))
            team_rows = base.fetch_csv(base.TEAM_URL.format(season=season))
        except Exception as e:
            print(f"  {season}: FAILED to fetch ({e})")
            continue

        snaps_by_gsis = load_snaps(season, pfr_to_gsis)
        rows = build_player_rows(season, player_rows, by_gsis, adv, snaps_by_gsis)
        dst = base.build_dst_season(season, team_rows, games)
        rows += build_dst_rows(season, dst, by_dst_team)
        persist(cursor, rows, now)
        conn.commit()
        total += len(rows)
        print(f"  {season}: {len(rows):4d} advanced player-seasons "
              f"({len(snaps_by_gsis)} with snap data)")

    print(f"\nTotal rows written: {total}")
    n = cursor.execute("SELECT COUNT(*) FROM nfl_advanced_season").fetchone()[0]
    print(f"nfl_advanced_season now holds {n} rows")
    conn.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", help="comma-separated, e.g. 2024,2025")
    args = ap.parse_args()
    chosen = ([int(s) for s in args.seasons.split(",")]
              if args.seasons else DEFAULT_SEASONS)
    sys.exit(run(chosen))
