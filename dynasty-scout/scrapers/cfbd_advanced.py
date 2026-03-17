"""
scrapers/cfbd_advanced.py
Fetches PPA (Predicted Points Added) and player usage % from CFBD API
and upserts into college_stats.

PPA is CFBD's EPA equivalent — measures value added per play.
Usage % measures how often a player was involved in plays.

Run:
  py scrapers/cfbd_advanced.py              # all positions, 2020-2025
  py scrapers/cfbd_advanced.py --years 2025
  py scrapers/cfbd_advanced.py --pos WR TE  # specific positions

API key loaded from .env (CFBD_API_KEY) or passed as first arg.
"""

import os
import re
import sys
import sqlite3
import time
import requests
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local"))

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dynasty_scout.db")
CFBD_BASE = "https://api.collegefootballdata.com"
CFBD_KEY = os.environ.get("CFBD_API_KEY", "")

DEFAULT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025]
DEFAULT_POSITIONS = ["QB", "RB", "WR", "TE"]


def normalize(name: str) -> str:
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r"[''`\-\.\,\"]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def cfbd_get(endpoint: str, params: dict, key: str) -> list | None:
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    try:
        r = requests.get(f"{CFBD_BASE}{endpoint}", params=params, headers=headers, timeout=20)
        if r.status_code == 401:
            print("ERROR: Invalid CFBD API key")
            sys.exit(1)
        if r.status_code == 429:
            print("  Rate limited — sleeping 10s")
            time.sleep(10)
            return cfbd_get(endpoint, params, key)
        if r.status_code != 200:
            return None
        return r.json()
    except requests.RequestException as e:
        print(f"  Request error: {e}")
        return None


def fetch_ppa_by_year_position(year: int, position: str, key: str) -> list:
    """
    GET /ppa/players/season?year=YEAR&position=POS
    Returns: [{player, team, position, averagePPA: {all, pass, rush, firstDown, secondDown, thirdDown}, totalPPA: {...}}]
    """
    data = cfbd_get("/ppa/players/season", {"year": year, "position": position, "threshold": 0}, key)
    return data or []


def fetch_usage_by_year_position(year: int, position: str, key: str) -> list:
    """
    GET /player/usage?year=YEAR&position=POS
    Returns: [{player, team, position, usage: {overall, pass, rush, firstDown, secondDown, thirdDown, redZone}}]
    """
    data = cfbd_get("/player/usage", {"year": year, "position": position}, key)
    return data or []


def run(years: list[int] = None, positions: list[str] = None, key: str = None):
    if years is None:
        years = DEFAULT_YEARS
    if positions is None:
        positions = DEFAULT_POSITIONS
    if key is None:
        key = CFBD_KEY
    if not key:
        print("ERROR: No CFBD API key. Set CFBD_API_KEY in .env or pass as argument.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Build lookup: normalize(name) -> [(player_id, full_name, position)]
    players = cur.execute(
        "SELECT id, full_name, position FROM players WHERE draft_year=2026"
    ).fetchall()
    name_lookup = defaultdict(list)
    for pid, name, pos in players:
        name_lookup[normalize(name)].append((pid, name, pos))
    print(f"Loaded {len(players)} tracked players\n")

    ppa_upserted = 0
    usage_upserted = 0

    for year in years:
        print(f"\n── {year} ──────────────────────────────")
        for pos in positions:
            print(f"  [{pos}] fetching PPA...")
            ppa_data = fetch_ppa_by_year_position(year, pos, key)
            time.sleep(0.4)

            for entry in ppa_data:
                player_name = entry.get("player", "")
                team = entry.get("team", "Unknown")
                norm = normalize(player_name)
                matches = name_lookup.get(norm, [])
                if not matches:
                    continue

                avg_ppa_all = entry.get("averagePPA", {}).get("all")
                total_ppa_all = entry.get("totalPPA", {}).get("all")

                for player_id, full_name, _ in matches:
                    # Prefer existing row for this player/season/team
                    existing = cur.execute(
                        "SELECT id FROM college_stats WHERE player_id=? AND season=? AND school=?",
                        (player_id, year, team)
                    ).fetchone()
                    if existing or len(matches) == 1:
                        cur.execute("""
                            INSERT INTO college_stats (player_id, season, school, ppa_avg, ppa_total)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(player_id, season, school) DO UPDATE SET
                              ppa_avg   = CASE WHEN excluded.ppa_avg IS NOT NULL THEN excluded.ppa_avg ELSE college_stats.ppa_avg END,
                              ppa_total = CASE WHEN excluded.ppa_total IS NOT NULL THEN excluded.ppa_total ELSE college_stats.ppa_total END
                        """, (player_id, year, team,
                              round(avg_ppa_all, 4) if avg_ppa_all is not None else None,
                              round(total_ppa_all, 2) if total_ppa_all is not None else None))
                        ppa_upserted += 1
                        break

            print(f"  [{pos}] fetching usage...")
            usage_data = fetch_usage_by_year_position(year, pos, key)
            time.sleep(0.4)

            for entry in usage_data:
                player_name = entry.get("player", "")
                team = entry.get("team", "Unknown")
                norm = normalize(player_name)
                matches = name_lookup.get(norm, [])
                if not matches:
                    continue

                overall_usage = entry.get("usage", {}).get("overall")

                for player_id, full_name, _ in matches:
                    existing = cur.execute(
                        "SELECT id FROM college_stats WHERE player_id=? AND season=? AND school=?",
                        (player_id, year, team)
                    ).fetchone()
                    if existing or len(matches) == 1:
                        cur.execute("""
                            INSERT INTO college_stats (player_id, season, school, usage_pct)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(player_id, season, school) DO UPDATE SET
                              usage_pct = CASE WHEN excluded.usage_pct IS NOT NULL THEN excluded.usage_pct ELSE college_stats.usage_pct END
                        """, (player_id, year, team,
                              round(overall_usage, 4) if overall_usage is not None else None))
                        usage_upserted += 1
                        break

        conn.commit()
        print(f"  Committed year {year}")

    conn.close()

    print(f"\n{'═'*50}")
    print(f"CFBD Advanced scrape complete")
    print(f"  PPA rows upserted:   {ppa_upserted}")
    print(f"  Usage rows upserted: {usage_upserted}")


if __name__ == "__main__":
    args = sys.argv[1:]
    key_arg = None
    years_arg = DEFAULT_YEARS
    pos_arg = DEFAULT_POSITIONS

    # First positional arg that isn't a flag = API key
    for a in args:
        if not a.startswith("--") and not a.isdigit() and a not in DEFAULT_POSITIONS:
            key_arg = a
            break

    if "--years" in args:
        idx = args.index("--years")
        years_arg = []
        for a in args[idx + 1:]:
            if a.startswith("--"):
                break
            try:
                years_arg.append(int(a))
            except ValueError:
                pass

    if "--pos" in args:
        idx = args.index("--pos")
        pos_arg = []
        for a in args[idx + 1:]:
            if a.startswith("--"):
                break
            if a.upper() in ("QB", "RB", "WR", "TE"):
                pos_arg.append(a.upper())

    run(years=years_arg, positions=pos_arg, key=key_arg)
