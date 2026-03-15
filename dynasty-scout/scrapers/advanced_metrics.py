"""
advanced_metrics.py
Computes and seeds advanced production metrics for 2026 draft class.

Metrics computed:
  college_stats.dominator_rating   -- player share of team pass yards+TDs
  college_stats.market_share       -- player rec yards / team pass yards
  college_stats.target_share       -- estimated from receptions if no target data
  players.breakout_age             -- first season hitting dominator threshold

Sources:
  - CFBD /stats/season  (7 calls, one per year 2019-2025)
  - Local college_stats for player numbers

Run from dynasty-scout/:
  py -3 scrapers/advanced_metrics.py
"""

import os
import re
import sqlite3
import time
import requests
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

DB_PATH = "dynasty_scout.db"
BASE_URL = "https://api.collegefootballdata.com"
CFBD_KEY = os.environ.get("CFBD_API_KEY", "")

# Dominator rating breakout threshold by position
BREAKOUT_THRESHOLDS = {
    "WR": 20.0,
    "TE": 15.0,
    "RB": 20.0,   # rushing dominator
    "QB": None,    # N/A
}


def cfbd_get(endpoint, params):
    r = requests.get(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": f"Bearer {CFBD_KEY}", "Accept": "application/json"},
        params=params,
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def ensure_columns(cur):
    cols = {
        "college_stats": [
            ("dominator_rating", "REAL"),
            ("market_share", "REAL"),
        ],
        "players": [
            ("breakout_age", "REAL"),
            ("breakout_year", "INTEGER"),
        ],
    }
    for table, additions in cols.items():
        existing = [r[1] for r in cur.execute(f"PRAGMA table_info({table})").fetchall()]
        for col, typ in additions:
            if col not in existing:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
                print(f"  Added {table}.{col}")


def fetch_team_stats_by_year(years):
    """
    Returns {year: {team_name: {'pass_yds': X, 'pass_tds': Y, 'rush_yds': Z, 'rush_tds': W}}}
    Uses 1 API call per year.
    """
    team_stats = {}
    for year in years:
        data = cfbd_get("/stats/season", {"year": year, "seasonType": "regular"})
        time.sleep(0.2)
        by_team = {}
        for entry in data:
            team = entry["team"]
            stat  = entry["statName"]
            val   = entry.get("statValue", 0) or 0
            if team not in by_team:
                by_team[team] = {}
            by_team[team][stat] = val
        team_stats[year] = by_team
        print(f"  {year}: {len(by_team)} teams loaded")
    return team_stats


def compute_metrics(cur, team_stats):
    """
    For each player-season row with rec_yards or rush_yards, compute:
      dominator_rating, market_share
    """
    rows = cur.execute("""
        SELECT cs.id, cs.player_id, cs.season, cs.school,
               cs.rec_yards, cs.rec_tds, cs.rush_yards, cs.rush_tds,
               cs.games_played,
               p.position, p.dob
        FROM college_stats cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.draft_year = 2026
          AND p.position IN ('WR', 'TE', 'RB', 'QB')
        ORDER BY cs.player_id, cs.season
    """).fetchall()

    updated = 0
    for row in rows:
        cs_id, player_id, season, school = row[0], row[1], row[2], row[3]
        rec_yds  = row[4] or 0
        rec_tds  = row[5] or 0
        rush_yds = row[6] or 0
        rush_tds = row[7] or 0
        pos      = row[9]
        dob      = row[10]

        team_yr = team_stats.get(season, {}).get(school)
        if not team_yr:
            continue

        team_pass_yds = team_yr.get("netPassingYards") or 0
        team_pass_tds = team_yr.get("passingTDs") or 0
        team_rush_yds = team_yr.get("rushingYards") or 0
        team_rush_tds = team_yr.get("rushingTDs") or 0

        dominator = None
        market_share = None

        if pos in ("WR", "TE"):
            denom_yds = team_pass_yds
            denom_tds = team_pass_tds
            if denom_yds > 0:
                market_share = round(rec_yds / denom_yds * 100, 2)
            if (denom_yds + denom_tds * 20) > 0:
                dominator = round(
                    (rec_yds + rec_tds * 20) / (denom_yds + denom_tds * 20) * 100, 2
                )

        elif pos == "RB":
            # RB dominator = rushing share (rushing yards + TDs) of team total rushing
            denom_yds = team_rush_yds
            denom_tds = team_rush_tds
            if denom_yds > 0:
                market_share = round(rush_yds / denom_yds * 100, 2)
            if (denom_yds + denom_tds * 20) > 0:
                dominator = round(
                    (rush_yds + rush_tds * 20) / (denom_yds + denom_tds * 20) * 100, 2
                )

        elif pos == "QB":
            # QB: pass share vs total team pass output
            if team_pass_yds > 0:
                market_share = round(rec_yds / team_pass_yds * 100, 2) if rec_yds else None
                # For QB, dominator = completion share is less meaningful; skip
            dominator = None

        cur.execute(
            "UPDATE college_stats SET dominator_rating=?, market_share=? WHERE id=?",
            (dominator, market_share, cs_id),
        )
        updated += 1

    return updated


def compute_breakout_age(cur):
    """
    Breakout age = age at the start of the first season where dominator_rating
    meets or exceeds the position threshold.
    """
    players = cur.execute("""
        SELECT DISTINCT p.id, p.position, p.dob
        FROM players p
        JOIN college_stats cs ON cs.player_id = p.id
        WHERE p.draft_year = 2026
          AND p.position IN ('WR', 'TE', 'RB')
          AND cs.dominator_rating IS NOT NULL
    """).fetchall()

    updated = 0
    for player_id, pos, dob in players:
        threshold = BREAKOUT_THRESHOLDS.get(pos)
        if not threshold:
            continue

        seasons = cur.execute("""
            SELECT season, dominator_rating
            FROM college_stats
            WHERE player_id = ? AND dominator_rating IS NOT NULL
            ORDER BY season ASC
        """, (player_id,)).fetchall()

        breakout_year = None
        breakout_age = None
        for season, dr in seasons:
            if dr and dr >= threshold:
                breakout_year = season
                if dob:
                    try:
                        # Parse DOB (various formats)
                        from datetime import date
                        dob_clean = str(dob).split("T")[0].split(" ")[0]
                        parts = re.split(r"[-/]", dob_clean)
                        if len(parts) == 3:
                            if int(parts[0]) > 1900:
                                birth = date(int(parts[0]), int(parts[1]), int(parts[2]))
                            else:
                                birth = date(int(parts[2]), int(parts[0]), int(parts[1]))
                            # Age on Sep 1 of breakout season
                            season_start = date(season, 9, 1)
                            breakout_age = round(
                                (season_start - birth).days / 365.25, 1
                            )
                    except Exception:
                        pass
                break  # first qualifying season

        if breakout_year:
            cur.execute(
                "UPDATE players SET breakout_age=?, breakout_year=? WHERE id=?",
                (breakout_age, breakout_year, player_id),
            )
            updated += 1

    return updated


def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("Ensuring DB columns...")
    ensure_columns(cur)
    conn.commit()

    # Fetch team stats (7 API calls)
    years = [2019, 2020, 2021, 2022, 2023, 2024, 2025]
    print(f"\nFetching team stats for {years} ({len(years)} API calls)...")
    team_stats = fetch_team_stats_by_year(years)

    print("\nComputing dominator rating + market share...")
    updated = compute_metrics(cur, team_stats)
    print(f"  {updated} player-season rows updated")

    print("\nComputing breakout age...")
    ba_updated = compute_breakout_age(cur)
    print(f"  {ba_updated} players got breakout age")

    conn.commit()

    # Summary
    dr_count = cur.execute(
        "SELECT COUNT(*) FROM college_stats WHERE dominator_rating IS NOT NULL"
    ).fetchone()[0]
    ms_count = cur.execute(
        "SELECT COUNT(*) FROM college_stats WHERE market_share IS NOT NULL"
    ).fetchone()[0]
    ba_count = cur.execute(
        "SELECT COUNT(*) FROM players WHERE breakout_age IS NOT NULL AND draft_year=2026"
    ).fetchone()[0]

    print(f"\n=== Summary ===")
    print(f"Dominator rating:  {dr_count} rows")
    print(f"Market share:      {ms_count} rows")
    print(f"Breakout age:      {ba_count} players")

    # Top dominator ratings 2024
    print("\nTop dominator ratings (2024 season):")
    top = cur.execute("""
        SELECT p.full_name, p.position, cs.school, cs.season,
               cs.dominator_rating, cs.market_share
        FROM college_stats cs JOIN players p ON p.id=cs.player_id
        WHERE p.draft_year=2026 AND cs.season=2024
          AND cs.dominator_rating IS NOT NULL
        ORDER BY cs.dominator_rating DESC LIMIT 10
    """).fetchall()
    for r in top:
        print(f"  {r[1]:3} {r[0]:28} {r[3]} @ {r[2]:20} DOM={r[4]:.1f}% MS={r[5]:.1f}%")

    print("\nBreakout age leaders (youngest first):")
    ba = cur.execute("""
        SELECT full_name, position, breakout_age, breakout_year
        FROM players WHERE draft_year=2026 AND breakout_age IS NOT NULL
        ORDER BY breakout_age ASC LIMIT 10
    """).fetchall()
    for r in ba:
        print(f"  {r[1]:3} {r[0]:28} age {r[2]} ({r[3]})")

    conn.close()


if __name__ == "__main__":
    run()
