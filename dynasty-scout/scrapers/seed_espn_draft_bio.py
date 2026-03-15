"""
seed_espn_draft_bio.py
Fetches height/weight for 2026 draft prospects using the ESPN NFL Draft API.
Fills gaps not covered by the ESPN college athlete endpoint.

Run: py scrapers/seed_espn_draft_bio.py
"""

import sqlite3
import requests
import time
import os
import re

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
HEADERS = {"User-Agent": "DynastyScout/1.0 (fantasy football research)"}

ESPN_DRAFT_LIST = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/draft/athletes?limit=100&page={page}"
ESPN_DRAFT_ATHLETE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/draft/athletes/{id}"


def normalize_name(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[''`\-\.]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def fetch_all_draft_athletes():
    """Paginate through ESPN draft athletes list, return list of {id, ref}."""
    athletes = []
    page = 1
    while True:
        url = ESPN_DRAFT_LIST.format(page=page)
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            print(f"  Page {page} returned {r.status_code}, stopping.")
            break
        data = r.json()
        items = data.get("items", [])
        if not items:
            break
        for item in items:
            ref = item.get("$ref", "")
            if ref:
                athlete_id = ref.rstrip("/").split("/")[-1]
                athletes.append({"id": athlete_id, "ref": ref})
        count = data.get("count", 0)
        page_size = data.get("pageSize", 100)
        print(f"  Page {page}: {len(items)} athletes (total={count})")
        if len(athletes) >= count:
            break
        page += 1
        time.sleep(0.2)
    return athletes


def fetch_athlete_bio(athlete_id):
    """Returns {name, position, height, weight, overall_rank, pos_rank, grade} or None."""
    url = ESPN_DRAFT_ATHLETE.format(id=athlete_id)
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None
        d = r.json()
        name = d.get("displayName") or d.get("fullName") or ""
        pos_data = d.get("position", {})
        position = pos_data.get("abbreviation", "")
        height = d.get("height")   # inches (float)
        weight = d.get("weight")   # lbs (float)
        overall_rank = d.get("overallRank")
        pos_rank = d.get("positionalRank")
        grade = d.get("grade")
        return {
            "name": name,
            "position": position,
            "height": round(height) if height else None,
            "weight": round(weight) if weight else None,
            "overall_rank": overall_rank,
            "pos_rank": pos_rank,
            "grade": grade,
        }
    except Exception as e:
        print(f"  Error fetching {athlete_id}: {e}")
        return None


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    # Build name→player_id map for 2026 class
    cur.execute("SELECT id, full_name FROM players WHERE draft_year=2026")
    name_map = {}
    for p_id, name in cur.fetchall():
        key = normalize_name(name)
        name_map[key] = p_id

    print("Fetching ESPN 2026 NFL Draft athlete list...")
    athletes = fetch_all_draft_athletes()
    print(f"Total athletes: {len(athletes)}")

    bio_updated = 0
    matched = 0
    unmatched = []

    for i, ath in enumerate(athletes):
        time.sleep(0.25)
        bio = fetch_athlete_bio(ath["id"])
        if not bio or not bio["name"]:
            continue

        key = normalize_name(bio["name"])
        p_id = name_map.get(key)
        if not p_id:
            unmatched.append(bio["name"])
            continue

        matched += 1

        # Update height/weight only if missing
        if bio["height"] or bio["weight"]:
            cur.execute("""
                UPDATE players SET
                  height_inches = CASE WHEN height_inches IS NULL AND ? IS NOT NULL THEN ? ELSE height_inches END,
                  weight_lbs    = CASE WHEN weight_lbs IS NULL AND ? IS NOT NULL THEN ? ELSE weight_lbs END
                WHERE id=?
            """, (bio["height"], bio["height"], bio["weight"], bio["weight"], p_id))
            if cur.rowcount:
                bio_updated += 1

        if i % 50 == 0:
            print(f"  Progress: {i}/{len(athletes)} — matched={matched}")
            conn.commit()

    conn.commit()
    conn.close()

    print(f"\nESPN Draft bio scrape complete.")
    print(f"  Athletes fetched: {len(athletes)}")
    print(f"  Matched to DB: {matched}")
    print(f"  Bio rows updated: {bio_updated}")
    print(f"  Unmatched: {len(unmatched)}")
    if unmatched:
        for n in sorted(unmatched)[:20]:
            print(f"    {n}")


if __name__ == "__main__":
    run()
