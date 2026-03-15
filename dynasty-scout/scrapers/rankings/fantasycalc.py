"""
scrapers/rankings/fantasycalc.py
Fetches 2026 dynasty rookie rankings + bio from FantasyCalc's public API.

Run: py scrapers/rankings/fantasycalc.py
"""

import sqlite3
import requests
import time
import os
import re
from datetime import date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'dynasty_scout.db')

FC_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&ppr=1&superflex=false&rookiesOnly=true"
SOURCE_NAME = "FantasyCalc"
SOURCE_URL = "https://fantasycalc.com/rankings"


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation/suffixes for fuzzy matching."""
    name = name.lower()
    name = re.sub(r"[''`\-\.]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
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


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    player_map = build_player_map(cur)

    print("Fetching FantasyCalc dynasty values...")
    r = requests.get(FC_URL, timeout=15)
    r.raise_for_status()
    data = r.json()

    # Filter to 2026 prospects (not yet drafted — no maybeTeam OR maybeYoe=0)
    prospects = [
        p for p in data
        if p["player"]["position"] not in ("PICK",)
        and (p["player"].get("maybeYoe") == 0 or p["player"].get("maybeTeam") is None)
    ]
    print(f"Found {len(prospects)} named 2026 prospects")

    today = date.today().isoformat()
    matched = 0
    bio_updated = 0
    unmatched = []

    for item in prospects:
        pl = item["player"]
        name_key = normalize_name(pl["name"])
        p_id = player_map.get(name_key)

        if not p_id:
            unmatched.append(pl["name"])
            continue

        matched += 1

        # Upsert ranking (delete+insert since no unique constraint)
        cur.execute("DELETE FROM rankings WHERE player_id=? AND source=?", (p_id, SOURCE_NAME))
        cur.execute("""
            INSERT INTO rankings (player_id, source, rank_overall, rank_positional, value, tier, source_url, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            p_id, SOURCE_NAME,
            item.get("overallRank"),
            item.get("positionRank"),
            item.get("value"),
            item.get("maybeTier"),
            SOURCE_URL, today
        ))

        # Fill bio gaps from "maybe" fields
        h = pl.get("maybeHeight")
        w = pl.get("maybeWeight")
        dob = pl.get("maybeBirthday")  # None for undraunted rookies usually

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

    print(f"\nFantasyCalc scrape complete.")
    print(f"  Prospects matched: {matched}")
    print(f"  Bio rows updated:  {bio_updated}")
    if unmatched:
        print(f"  Unmatched ({len(unmatched)}): {unmatched}")


if __name__ == "__main__":
    run()
