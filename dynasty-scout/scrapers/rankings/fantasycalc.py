"""
scrapers/rankings/fantasycalc.py
Fetches 2026 dynasty rookie rankings (both 1QB and SF) + bio from FantasyCalc's public API.

Run: py scrapers/rankings/fantasycalc.py
"""

import sqlite3
import requests
import time
import os
import re
from datetime import date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'dynasty_scout.db')

FC_URL_1QB = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&ppr=1&superflex=false&rookiesOnly=true"
FC_URL_SF  = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=1&superflex=true&rookiesOnly=true"
SOURCE_URL = "https://fantasycalc.com/rankings"


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation/suffixes for fuzzy matching."""
    name = name.lower()
    name = re.sub(r"[''`\-\.]", "", name)
    name = re.sub(r"(jr|sr|ii|iii|iv|v)", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def build_player_map(cur):
    """Build {normalized_name: player_id} for 2026 draft class."""
    cur.execute("SELECT id, full_name FROM players WHERE draft_year = 2026")
    mapping = {}
    for p_id, name in cur.fetchall():
        key = normalize_name(name)
        mapping[key] = p_id
    return mapping


def fetch_and_save(cur, url: str, source_name: str, player_map: dict, today: str, update_bio: bool = False):
    """Fetch FantasyCalc data from url and save rankings as source_name."""
    print(f"  Fetching {source_name} from FantasyCalc...")
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    data = r.json()

    prospects = [
        p for p in data
        if p["player"]["position"] not in ("PICK",)
        and (p["player"].get("maybeYoe") == 0 or p["player"].get("maybeTeam") is None)
    ]
    print(f"  Found {len(prospects)} 2026 prospects")

    prospects.sort(key=lambda x: x.get("overallRank") or 9999)

    matched = 0
    bio_updated = 0
    unmatched = []

    for rookie_rank, item in enumerate(prospects, start=1):
        pl = item["player"]
        name_key = normalize_name(pl["name"])
        p_id = player_map.get(name_key)

        if not p_id:
            unmatched.append(pl["name"])
            continue

        matched += 1

        cur.execute("DELETE FROM rankings WHERE player_id=? AND source=?", (p_id, source_name))
        cur.execute("""
            INSERT INTO rankings (player_id, source, rank_overall, rank_positional, value, tier, source_url, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            p_id, source_name,
            rookie_rank,
            item.get("positionRank"),
            item.get("value"),
            item.get("maybeTier"),
            SOURCE_URL, today
        ))

        if update_bio:
            h = pl.get("maybeHeight")
            w = pl.get("maybeWeight")
            dob = pl.get("maybeBirthday")
            if h or w or dob:
                cur.execute("""
                    UPDATE players SET
                      height_inches = CASE WHEN height_inches IS NULL AND ? IS NOT NULL THEN ? ELSE height_inches END,
                      weight_lbs    = CASE WHEN weight_lbs IS NULL AND ? IS NOT NULL THEN ? ELSE weight_lbs END,
                      dob           = CASE WHEN dob IS NULL AND ? IS NOT NULL THEN ? ELSE dob END
                    WHERE id = ?
                """, (h, h, w, w, dob, dob, p_id))
                if cur.rowcount:
                    bio_updated += 1

    print(f"  {source_name}: matched={matched}, bio_updated={bio_updated}")
    if unmatched:
        print(f"  Unmatched ({len(unmatched)}): {unmatched}")
    return matched


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    player_map = build_player_map(cur)
    today = date.today().isoformat()

    print("Fetching FantasyCalc dynasty rookie rankings...")

    # 1QB rankings (source: FantasyCalc)
    fetch_and_save(cur, FC_URL_1QB, "FantasyCalc", player_map, today, update_bio=True)
    time.sleep(1)

    # Superflex rankings (source: FantasyCalc SF)
    fetch_and_save(cur, FC_URL_SF, "FantasyCalc SF", player_map, today, update_bio=False)

    conn.commit()

    # Recompute age_at_draft for any new DOBs
    DRAFT_DATE = date(2026, 4, 23)
    cur.execute("SELECT id, dob FROM players WHERE draft_year=2026 AND dob IS NOT NULL AND age_at_draft IS NULL")
    for p_id, dob_str in cur.fetchall():
        try:
            dob = date.fromisoformat(dob_str)
            age = (DRAFT_DATE - dob).days / 365.25
            cur.execute("UPDATE players SET age_at_draft=? WHERE id=?", (round(age, 2), p_id))
        except Exception:
            pass
    conn.commit()
    conn.close()

    print("FantasyCalc scrape complete.")


if __name__ == "__main__":
    run()
