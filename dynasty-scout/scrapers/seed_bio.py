"""
seed_bio.py
Fills height_inches, weight_lbs, and dob for 2026 draft players.

Sources:
  1. ESPN V2 athlete endpoint  → height, weight  (184 players with ESPN IDs)
  2. ESPN V3 passing stats fix → completions, pass_attempts now parsed as separate fields
  3. Wikipedia MediaWiki API   → date of birth (best-effort, fuzzy match)

Run: py scrapers/seed_bio.py
"""

import sqlite3
import requests
import re
import time
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')

ESPN_V2_ATHLETE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/athletes/{espn_id}"
WIKI_API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "DynastyScout/1.0 (fantasy football research tool)"}


def fetch_espn_bio(espn_id):
    """Returns (height_inches, weight_lbs) or (None, None)."""
    try:
        r = requests.get(ESPN_V2_ATHLETE.format(espn_id=espn_id), headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None, None
        data = r.json()
        h = data.get("height")   # float, already in inches
        w = data.get("weight")   # float, lbs
        return (round(h) if h else None, round(w) if w else None)
    except Exception:
        return None, None


def fetch_wiki_dob(name, position):
    """Returns DOB as 'YYYY-MM-DD' or None. Uses Wikipedia infobox."""
    try:
        # Search Wikipedia
        r = requests.get(WIKI_API, params={
            "action": "query", "list": "search",
            "srsearch": f"{name} {position} college football",
            "format": "json", "srlimit": 3,
        }, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return None
        results = r.json().get("query", {}).get("search", [])
        if not results:
            return None

        # Try first two results
        for hit in results[:2]:
            title = hit["title"]
            r2 = requests.get(WIKI_API, params={
                "action": "query", "prop": "revisions",
                "titles": title, "rvprop": "content",
                "format": "json", "rvslots": "main", "rvsection": "0",
            }, headers=HEADERS, timeout=10)
            if r2.status_code != 200:
                continue
            pages = r2.json().get("query", {}).get("pages", {})
            for page in pages.values():
                for rev in page.get("revisions", []):
                    content = rev.get("slots", {}).get("main", {}).get("*", "")
                    # {{birth date|1972|3|15}} or {{Birth date and age|1972|3|15}}
                    m = re.search(
                        r"birth[_ ]date[^=]*=[^|{]*(?:\{\{[^}]*\|)?(\d{4})\|(\d{1,2})\|(\d{1,2})",
                        content, re.I
                    )
                    if m:
                        y, mo, d = m.groups()
                        return f"{y}-{int(mo):02d}-{int(d):02d}"
            time.sleep(0.3)
    except Exception as e:
        print(f"    [wiki error] {name}: {e}")
    return None


def main():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    cur.execute(
        "SELECT id, full_name, position, espn_college_id, height_inches, weight_lbs, dob "
        "FROM players WHERE draft_year = 2026"
    )
    players = cur.fetchall()
    print(f"Processing {len(players)} players...")

    bio_updated = 0
    dob_found = 0

    for p_id, name, pos, espn_id, ht, wt, dob in players:
        needs_hw = (ht is None or wt is None)
        needs_dob = (dob is None)

        if not needs_hw and not needs_dob:
            continue

        print(f"  [{name}] ESPN={espn_id} ht={ht} wt={wt} dob={dob}")

        new_ht, new_wt = ht, wt
        new_dob = dob

        # ── ESPN height/weight ──────────────────────────────────
        if needs_hw and espn_id:
            time.sleep(0.25)
            new_ht, new_wt = fetch_espn_bio(espn_id)
            if new_ht or new_wt:
                print(f"    ESPN: {new_ht}\" / {new_wt}lb")

        # ── Wikipedia DOB ───────────────────────────────────────
        if needs_dob:
            time.sleep(0.4)
            new_dob = fetch_wiki_dob(name, pos)
            if new_dob:
                print(f"    Wikipedia DOB: {new_dob}")
                dob_found += 1

        # ── Update DB ───────────────────────────────────────────
        changed = (new_ht != ht or new_wt != wt or new_dob != dob)
        if changed:
            cur.execute(
                "UPDATE players SET height_inches=?, weight_lbs=?, dob=? WHERE id=?",
                (new_ht, new_wt, new_dob, p_id)
            )
            bio_updated += 1

    conn.commit()
    conn.close()
    print(f"\nDone. Updated {bio_updated} players. DOBs found: {dob_found}.")


if __name__ == "__main__":
    main()
