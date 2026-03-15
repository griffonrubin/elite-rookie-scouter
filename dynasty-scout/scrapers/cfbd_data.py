"""
CFBD (College Football Data API) integration.
Fetches: EPA/PPA per player, SP+ team ratings, recruiting composite.

Setup: set CFBD_API_KEY in your environment or .env file.
Free key at: https://collegefootballdata.com/key

New DB columns added:
  college_stats.epa_per_play   REAL
  college_stats.sp_rating      REAL   (team SP+ for that season)
  players.recruiting_composite REAL   (0.0–1.0, higher = more decorated recruit)
  players.recruiting_stars     INT    (1-5, from CFBD)
  players.recruiting_year      INT
"""

import os
import re
import time
import sqlite3
import requests

DB_PATH = "dynasty_scout.db"
BASE_URL = "https://api.collegefootballdata.com"


def get_api_key():
    key = os.environ.get("CFBD_API_KEY", "")
    if not key:
        # Try reading from .env file
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                if line.startswith("CFBD_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
        if not key:
            raise RuntimeError(
                "CFBD_API_KEY not set. Get a free key at https://collegefootballdata.com/key "
                "and set it in dynasty-scout/.env as: CFBD_API_KEY=your_key_here"
            )
    return key


def cfbd_get(endpoint, params=None, key=None):
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    r = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"['''`\-,]", "", name)
    name = re.sub(r"\.", " ", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"\b([a-z]) ([a-z])\b", r"\1\2", name)
    return name


def ensure_columns(cur):
    """Add new columns if they don't exist."""
    cols_to_add = {
        "college_stats": [
            ("epa_per_play", "REAL"),
            ("sp_rating", "REAL"),
        ],
        "players": [
            ("recruiting_composite", "REAL"),
            ("recruiting_stars", "INTEGER"),
            ("recruiting_year", "INTEGER"),
        ],
    }
    for table, cols in cols_to_add.items():
        existing = [r[1] for r in cur.execute(f"PRAGMA table_info({table})").fetchall()]
        for col, typ in cols:
            if col not in existing:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
                print(f"  Added column {table}.{col}")


# ── SP+ ratings ────────────────────────────────────────────────────────────

def fetch_sp_ratings(key, years):
    """Returns {year: {team_name: sp_rating}}"""
    sp_map = {}
    for yr in years:
        data = cfbd_get("/ratings/sp", params={"year": yr}, key=key)
        sp_map[yr] = {d["team"]: d.get("rating") for d in data if d.get("rating")}
        time.sleep(0.2)
    print(f"  SP+ ratings loaded for {len(years)} years")
    return sp_map


# ── PPA (Predicted Points Added) per player ───────────────────────────────

def fetch_ppa_for_year(key, year):
    """Returns list of {playerName, team, position, averagePPA: {all, pass, rush, firstDown}}"""
    return cfbd_get("/ppa/players/season", params={"year": year, "excludeGarbageTime": True}, key=key)


# ── Recruiting ─────────────────────────────────────────────────────────────

def fetch_recruiting_class(key, year):
    """Returns recruiting prospects for given class year."""
    return cfbd_get("/recruiting/players", params={"year": year}, key=key)


# ── Main pipeline ──────────────────────────────────────────────────────────

def run():
    key = get_api_key()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    ensure_columns(cur)
    conn.commit()

    # Build player lookup maps
    cur.execute("SELECT id, full_name, position FROM players WHERE draft_year=2026")
    all_players = cur.fetchall()
    name_to_id = {normalize(r[1]): r[0] for r in all_players}

    # Get unique teams our players played for
    cur.execute("""
        SELECT DISTINCT cs.school, cs.season, p.id, p.full_name
        FROM college_stats cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.draft_year = 2026
        ORDER BY cs.season
    """)
    player_seasons = cur.fetchall()
    years = sorted(set(r[1] for r in player_seasons))
    print(f"Seasons to process: {years}")

    # ── 1. SP+ ratings ──────────────────────────────────────────────────
    print("\n[1/3] Fetching SP+ ratings...")
    sp_map = fetch_sp_ratings(key, years)

    # Update college_stats with SP+ rating for team/year
    sp_updated = 0
    for school, season, pid, pname in player_seasons:
        sp = sp_map.get(season, {}).get(school)
        if sp:
            cur.execute(
                "UPDATE college_stats SET sp_rating = ? WHERE player_id = ? AND season = ?",
                (sp, pid, season),
            )
            sp_updated += cur.rowcount
    print(f"  SP+ ratings set on {sp_updated} season rows")

    # ── 2. PPA per player ───────────────────────────────────────────────
    print("\n[2/3] Fetching PPA/EPA per player...")
    ppa_updated = 0
    for year in years:
        try:
            ppa_data = fetch_ppa_for_year(key, year)
        except Exception as e:
            print(f"  PPA {year} failed: {e}")
            continue
        time.sleep(0.3)
        for entry in ppa_data:
            pname = entry.get("name") or entry.get("playerName", "")
            avg_ppa = entry.get("averagePPA", {})
            epa = avg_ppa.get("all") or avg_ppa.get("total")
            if not epa or not pname:
                continue
            pid = name_to_id.get(normalize(pname))
            if not pid:
                continue
            cur.execute(
                "UPDATE college_stats SET epa_per_play = ? WHERE player_id = ? AND season = ?",
                (epa, pid, year),
            )
            ppa_updated += cur.rowcount
    print(f"  EPA/PPA set on {ppa_updated} season rows")

    # ── 3. Recruiting ────────────────────────────────────────────────────
    print("\n[3/3] Fetching recruiting data...")
    rec_updated = 0
    # 2026 players enrolled 2022-2025 (at earliest as freshmen)
    for rec_year in range(2021, 2026):
        try:
            recruits = fetch_recruiting_class(key, rec_year)
        except Exception as e:
            print(f"  Recruiting {rec_year} failed: {e}")
            continue
        time.sleep(0.3)
        for r in recruits:
            rname = r.get("name", "")
            pid = name_to_id.get(normalize(rname))
            if not pid:
                continue
            stars = r.get("stars")
            composite = r.get("rating")
            if not stars and not composite:
                continue
            cur.execute("""
                UPDATE players
                SET recruiting_composite = COALESCE(recruiting_composite, ?),
                    recruiting_stars     = COALESCE(recruiting_stars, ?),
                    recruiting_year      = COALESCE(recruiting_year, ?)
                WHERE id = ?
            """, (composite, stars, rec_year, pid))
            if cur.rowcount:
                rec_updated += 1

    print(f"  Recruiting data set for {rec_updated} players")
    conn.commit()

    # ── Summary ──────────────────────────────────────────────────────────
    epa_count = cur.execute(
        "SELECT COUNT(*) FROM college_stats WHERE epa_per_play IS NOT NULL"
    ).fetchone()[0]
    sp_count = cur.execute(
        "SELECT COUNT(*) FROM college_stats WHERE sp_rating IS NOT NULL"
    ).fetchone()[0]
    rec_count = cur.execute(
        "SELECT COUNT(*) FROM players WHERE recruiting_composite IS NOT NULL AND draft_year=2026"
    ).fetchone()[0]

    print(f"\n=== CFBD Summary ===")
    print(f"EPA/play set: {epa_count} season rows")
    print(f"SP+ set:      {sp_count} season rows")
    print(f"Recruiting:   {rec_count} players")

    # Sample
    sample = cur.execute("""
        SELECT p.full_name, p.position, p.recruiting_stars, p.recruiting_composite,
               cs.season, cs.sp_rating, cs.epa_per_play
        FROM players p
        JOIN college_stats cs ON cs.player_id = p.id
        WHERE p.draft_year=2026 AND cs.epa_per_play IS NOT NULL
        ORDER BY cs.epa_per_play DESC LIMIT 10
    """).fetchall()
    if sample:
        print("\nTop 10 by EPA/play (most recent available season):")
        for r in sample:
            sp_str = f"{r[5]:.1f}" if r[5] else "N/A"
        print(f"  {r[1]:3} {r[0]:28} {r[4]} | SP+={sp_str} EPA={r[6]:.4f} stars={r[2]}")

    conn.close()


if __name__ == "__main__":
    run()
