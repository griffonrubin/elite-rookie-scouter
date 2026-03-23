"""
high_school.py
Populates high_school_stats table and players.high_school using ESPN athlete data.

Sources:
  1. ESPN V2 athlete endpoint → birthPlace (city/state)
  2. ESPN V3 athlete endpoint → high school name (in bio section)

Run: py scrapers/high_school.py
"""

import sqlite3
import requests
import time
import os
import re
import json

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')

ESPN_V2_ATHLETE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/athletes/{espn_id}"
ESPN_V3_ATHLETE = "https://site.api.espn.com/apis/common/v3/sports/football/college-football/athletes/{espn_id}"
HEADERS = {"User-Agent": "DynastyScout/1.0 (fantasy football research)"}


def fetch_espn_v2_bio(espn_id):
    """Returns {city, state} from ESPN V2 athlete endpoint."""
    try:
        r = requests.get(ESPN_V2_ATHLETE.format(espn_id=espn_id), headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return {}
        data = r.json()
        bp = data.get("birthPlace", {})
        city = bp.get("city", "")
        state = bp.get("state", "")
        return {"city": city, "state": state}
    except Exception:
        return {}


def fetch_espn_v3_bio(espn_id):
    """Returns {high_school, city, state, headshot} from ESPN V3 athlete endpoint."""
    try:
        r = requests.get(ESPN_V3_ATHLETE.format(espn_id=espn_id), headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return {}
        data = r.json()
        result = {}

        # Extract headshot
        headshot = data.get("headshot", {}).get("href", "")
        if headshot:
            result["headshot"] = headshot

        # Extract birthPlace
        bp = data.get("birthPlace", {})
        if bp:
            result["city"] = bp.get("city", "")
            result["state"] = bp.get("state", "")

        # Look for high school in various fields
        # ESPN V3 sometimes has it in the 'displayName' of college or in bio text
        # Check if there's a 'college' section with high school info
        bio = data.get("bio", "")
        if bio and isinstance(bio, str):
            # Try to extract high school from bio text
            hs_match = re.search(r'(?:attended|from|played at|went to)\s+([A-Z][^,.]+(?:High School|HS|Prep|Academy))', bio, re.I)
            if hs_match:
                result["high_school"] = hs_match.group(1).strip()

        return result
    except Exception:
        return {}


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, full_name, espn_college_id, hometown, high_school, recruiting_year
        FROM players
        WHERE draft_year = 2026 AND espn_college_id IS NOT NULL
    """)
    players = cur.fetchall()

    print(f"Fetching high school data for {len(players)} players...")

    hs_inserted = 0
    bio_updated = 0

    for i, (p_id, name, espn_id, existing_hometown, existing_hs, recruit_yr) in enumerate(players):
        if i % 20 == 0 and i > 0:
            print(f"  Progress: {i}/{len(players)}...")
            conn.commit()

        time.sleep(0.3)

        # Fetch from ESPN V3 (has the most info)
        v3 = fetch_espn_v3_bio(espn_id)

        city = v3.get("city", "")
        state = v3.get("state", "")
        hs_name = v3.get("high_school", "")

        # If V3 didn't have city/state, try V2
        if not city and not state:
            time.sleep(0.15)
            v2 = fetch_espn_v2_bio(espn_id)
            city = v2.get("city", "")
            state = v2.get("state", "")

        # Build hometown string
        hometown = ""
        if city and state:
            hometown = f"{city}, {state}"
        elif city:
            hometown = city
        elif state:
            hometown = state

        # Update players table (hometown + high_school)
        if hometown or hs_name:
            updates = []
            params = []
            if hometown and not existing_hometown:
                updates.append("hometown = ?")
                params.append(hometown)
            if hs_name and not existing_hs:
                updates.append("high_school = ?")
                params.append(hs_name)
            if updates:
                params.append(p_id)
                cur.execute(f"UPDATE players SET {', '.join(updates)} WHERE id = ?", params)
                bio_updated += 1

        # Upsert high_school_stats
        if city or state or hs_name:
            cur.execute("""
                INSERT INTO high_school_stats (player_id, high_school, city, state, graduating_class, data_source)
                VALUES (?, ?, ?, ?, ?, 'espn')
                ON CONFLICT(player_id) DO UPDATE SET
                    high_school = CASE WHEN excluded.high_school IS NOT NULL AND excluded.high_school != '' THEN excluded.high_school ELSE high_school_stats.high_school END,
                    city = CASE WHEN excluded.city IS NOT NULL AND excluded.city != '' THEN excluded.city ELSE high_school_stats.city END,
                    state = CASE WHEN excluded.state IS NOT NULL AND excluded.state != '' THEN excluded.state ELSE high_school_stats.state END,
                    graduating_class = CASE WHEN excluded.graduating_class IS NOT NULL THEN excluded.graduating_class ELSE high_school_stats.graduating_class END,
                    updated_at = CURRENT_TIMESTAMP
            """, (p_id, hs_name or None, city or None, state or None, recruit_yr))
            hs_inserted += 1

    conn.commit()
    conn.close()

    print(f"\nHigh school scrape complete.")
    print(f"  HS stats rows upserted: {hs_inserted}")
    print(f"  Player bios updated: {bio_updated}")


if __name__ == "__main__":
    run()
