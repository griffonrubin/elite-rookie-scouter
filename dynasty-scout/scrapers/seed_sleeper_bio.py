"""
scrapers/seed_sleeper_bio.py
Uses Sleeper's free public player API to fill height/weight and DOB gaps.
Also sets sleeper_id on players for future use.

Run: py scrapers/seed_sleeper_bio.py
"""

import sqlite3
import requests
import time
import os
import re
from datetime import date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
SLEEPER_URL = "https://api.sleeper.app/v1/players/nfl"
DRAFT_DATE = date(2026, 4, 23)


def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[''`\-\.\,]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def parse_height(h) -> int | None:
    """Parse Sleeper height — can be '74' (inches), '6\'2\"' string, or int."""
    if h is None:
        return None
    try:
        h_str = str(h).strip()
        if "'" in h_str:
            # Format like 6'2"
            parts = re.split(r"['\"]", h_str)
            feet = int(parts[0]) if parts[0] else 0
            inches = int(parts[1]) if len(parts) > 1 and parts[1] else 0
            return feet * 12 + inches
        val = int(float(h_str))
        # Sanity check: height in inches should be 60–84
        return val if 60 <= val <= 84 else None
    except (ValueError, TypeError):
        return None


def parse_weight(w) -> int | None:
    if w is None:
        return None
    try:
        val = int(float(str(w)))
        return val if 150 <= val <= 400 else None
    except (ValueError, TypeError):
        return None


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    # Build name → (id, has_height, has_weight, has_dob) map for 2026 class
    cur.execute("""
        SELECT id, full_name, height_inches, weight_lbs, dob
        FROM players WHERE draft_year=2026
    """)
    db_players = {}
    for row in cur.fetchall():
        p_id, name, ht, wt, dob = row
        db_players[normalize(name)] = {
            "id": p_id,
            "has_height": ht is not None,
            "has_weight": wt is not None,
            "has_dob": dob is not None,
        }

    print("Fetching Sleeper player database (~14MB)...")
    r = requests.get(SLEEPER_URL, timeout=60)
    r.raise_for_status()
    sleeper_data = r.json()
    print(f"Loaded {len(sleeper_data)} Sleeper players")

    bio_updated = 0
    dob_updated = 0
    skipped_invalid = 0

    for sleeper_id, sp in sleeper_data.items():
        name = sp.get("full_name") or sp.get("display_name") or ""
        if not name or "Invalid" in name or "Duplicate" in name:
            skipped_invalid += 1
            continue

        key = normalize(name)
        db_entry = db_players.get(key)
        if not db_entry:
            continue

        p_id = db_entry["id"]
        h = parse_height(sp.get("height"))
        w = parse_weight(sp.get("weight"))
        dob_str = sp.get("birth_date")  # "YYYY-MM-DD" or None

        # Validate DOB for 2026 prospects (born 1998–2007)
        valid_dob = None
        if dob_str:
            try:
                dob_dt = date.fromisoformat(dob_str)
                if 1998 <= dob_dt.year <= 2007:
                    valid_dob = dob_str
            except ValueError:
                pass

        needs_update = (
            (not db_entry["has_height"] and h) or
            (not db_entry["has_weight"] and w) or
            (not db_entry["has_dob"] and valid_dob)
        )
        if not needs_update:
            continue

        cur.execute("""
            UPDATE players SET
              height_inches = CASE WHEN height_inches IS NULL AND ? IS NOT NULL THEN ? ELSE height_inches END,
              weight_lbs    = CASE WHEN weight_lbs IS NULL AND ? IS NOT NULL THEN ? ELSE weight_lbs END,
              dob           = CASE WHEN dob IS NULL AND ? IS NOT NULL THEN ? ELSE dob END
            WHERE id=?
        """, (h, h, w, w, valid_dob, valid_dob, p_id))

        if cur.rowcount:
            bio_updated += 1
            if valid_dob and not db_entry["has_dob"]:
                dob_updated += 1

    conn.commit()

    # Recompute age_at_draft for any newly added DOBs
    cur.execute("""
        SELECT id, dob FROM players
        WHERE draft_year=2026 AND dob IS NOT NULL AND age_at_draft IS NULL
    """)
    age_updates = 0
    for p_id, dob_str in cur.fetchall():
        try:
            dob = date.fromisoformat(dob_str)
            age = (DRAFT_DATE - dob).days / 365.25
            cur.execute("UPDATE players SET age_at_draft=? WHERE id=?", (round(age, 2), p_id))
            age_updates += 1
        except Exception:
            pass

    conn.commit()
    conn.close()

    print(f"\nSleeper bio scrape complete.")
    print(f"  Players bio updated: {bio_updated}")
    print(f"  DOBs newly added:    {dob_updated}")
    print(f"  Ages recomputed:     {age_updates}")
    print(f"  Invalid entries skipped: {skipped_invalid}")


if __name__ == "__main__":
    run()
