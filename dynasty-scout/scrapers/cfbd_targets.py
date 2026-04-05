"""
Populate estimated targets for 2026 draft class WRs/TEs/RBs using CFBD player usage data.

Formula: estimated_targets = round(usage.pass × team_total_offensive_plays)
  - usage.pass = fraction of team offensive plays targeted at this player (from CFBD)
  - Only writes to college_stats.targets when the field is NULL

Run: py scrapers/cfbd_targets.py [--dry-run]
"""
import os, re, sqlite3, sys, time
import requests
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

DRY_RUN = '--dry-run' in sys.argv
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')
BASE_URL = "https://api.collegefootballdata.com"
CFBD_KEY = os.environ.get("CFBD_API_KEY", "")
YEARS    = [2021, 2022, 2023, 2024, 2025]


def cfbd_get(endpoint, params):
    r = requests.get(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": f"Bearer {CFBD_KEY}", "Accept": "application/json"},
        params=params,
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def normalize_name(name: str) -> str:
    n = name.lower()
    n = re.sub(r"[''`.\-]", '', n)
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', n)
    return re.sub(r'\s+', ' ', n).strip()


def fetch_team_plays(year: int) -> dict[str, int]:
    """Returns {team_name: total_offensive_plays} for the given year."""
    data = cfbd_get("/stats/season", {"year": year, "seasonType": "regular"})
    time.sleep(0.2)
    team_plays: dict[str, int] = {}
    for entry in data:
        team = entry["team"]
        stat = entry.get("statName", "")
        val  = int(float(entry.get("statValue", 0) or 0))
        if stat == "totalYards":
            # We want pass attempts not total yards — accumulate pass attempts separately
            pass
        elif stat == "passAttempts":
            if team not in team_plays:
                team_plays[team] = 0
            # We'll store passAttempts as team_plays for this team
    # Re-fetch to get passAttempts specifically
    pass_attempts: dict[str, int] = {}
    for entry in data:
        if entry.get("statName") == "passAttempts":
            pass_attempts[entry["team"]] = int(float(entry.get("statValue", 0) or 0))
    return pass_attempts


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Build normalized name -> (player_id, school, season) map from college_stats
    rows = cur.execute("""
        SELECT cs.id, cs.player_id, cs.season, cs.school,
               p.full_name, p.position
        FROM college_stats cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.draft_year = 2026
          AND p.position IN ('WR', 'TE', 'RB')
          AND cs.targets IS NULL
    """).fetchall()

    # Index: (norm_name, school_norm, season) -> cs_id
    cs_index: dict[tuple, int] = {}
    for row in rows:
        key = (normalize_name(row['full_name']), normalize_name(row['school'] or ''), row['season'])
        cs_index[key] = row['id']

    total_updated = 0

    for year in YEARS:
        print(f"\nYear {year}...")

        # Team pass attempts
        pass_att = fetch_team_plays(year)
        time.sleep(0.2)

        # Player usage
        usage_data = cfbd_get("/player/usage", {"year": year})
        time.sleep(0.3)

        for pu in usage_data:
            pos = pu.get("position", "")
            if pos not in ("WR", "TE", "RB"):
                continue
            usage = pu.get("usage", {})
            pass_pct = usage.get("pass")  # fraction of team pass plays targeted at this player
            if not pass_pct:
                continue

            team = pu.get("team", "")
            team_pass = pass_att.get(team)
            if not team_pass:
                continue

            estimated_targets = round(pass_pct * team_pass)
            if estimated_targets < 1:
                continue

            # Try to match to our DB
            norm_name = normalize_name(pu.get("name", ""))
            norm_team = normalize_name(team)

            key = (norm_name, norm_team, year)
            cs_id = cs_index.get(key)

            if not cs_id:
                # Try without team (some schools differ slightly in name)
                for (n, s, yr), cid in cs_index.items():
                    if n == norm_name and yr == year:
                        cs_id = cid
                        break

            if not cs_id:
                continue

            if DRY_RUN:
                print(f"  DRY {pu['name']} ({team} {year}) -> ~{estimated_targets} targets ({pass_pct:.3f} × {team_pass})")
                total_updated += 1
                continue

            cur.execute("UPDATE college_stats SET targets = ? WHERE id = ?", (estimated_targets, cs_id))
            total_updated += 1
            print(f"  {pu['name']} ({team} {year}) -> ~{estimated_targets} targets")

    if not DRY_RUN:
        conn.commit()
    print(f"\n{'DRY RUN — ' if DRY_RUN else ''}Updated {total_updated} player-season rows with estimated targets.")
    conn.close()


if __name__ == "__main__":
    if not CFBD_KEY:
        print("Error: CFBD_API_KEY not set in .env")
        sys.exit(1)
    main()
