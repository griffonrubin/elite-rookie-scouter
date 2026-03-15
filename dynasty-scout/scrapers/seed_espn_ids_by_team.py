"""
scrapers/seed_espn_ids_by_team.py
Finds ESPN college IDs for players that are missing them by searching
ESPN V2 team rosters for their last college season.

Run: py scrapers/seed_espn_ids_by_team.py
"""

import sqlite3
import requests
import time
import os
import re
import json

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
HEADERS = {"User-Agent": "DynastyScout/1.0 (fantasy football research)"}

ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000"
ESPN_V2_ROSTER = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/{year}/teams/{team_id}/athletes?limit=300"

# Last school + year for each player missing ESPN college ID
# Format: slug -> (school_search_term, [years_to_try])
PLAYER_SCHOOLS = {
    "thomas-castellanos": ("Boston College", [2024, 2023]),
    "nate-johnson":        ("Northern Illinois", [2024, 2023]),
    "jeff-sims":           ("Nebraska", [2024, 2023]),
    "cj-donaldson":        ("West Virginia", [2025, 2024]),
    "byron-cardwell":      ("Oregon", [2024, 2023]),
    "alton-mccaskill-iv":  ("Houston", [2024, 2023]),
    "desmond-reid":        ("Pittsburgh", [2024, 2023]),
    "ej-smith":            ("Stanford", [2024, 2023]),
    "jamarion-miller":     ("Texas A&M", [2024, 2023]),
    "lj-johnson-jr":       ("Texas A&M", [2025, 2024]),
    "sedrick-alexander":   ("Oklahoma", [2024, 2023]),
    "trevonte-citizen":    ("Western Kentucky", [2024, 2023]),
    "trevion-cooley":      ("Pittsburgh", [2025, 2024]),
    "ty-thompson":         ("Oregon", [2024, 2023]),
    "aaron-anderson":      ("LSU", [2024, 2023]),
    "braylon-james":       ("Florida State", [2024, 2023]),
    "cj-williams":         ("Notre Dame", [2025, 2024]),
    "chase-roberts":       ("Wyoming", [2025, 2024]),
    "chris-hilton":        ("Louisiana-Monroe", [2024, 2023]),
    "ej-williams":         ("Clemson", [2024, 2023]),
    "emmanuel-henderson":  ("Southern Miss", [2025, 2024]),
    "eric-rivers":         ("Georgia", [2024, 2023]),
    "jared-brown":         ("Pittsburgh", [2025, 2024]),
    "jayden-thomas":       ("Texas", [2024, 2023]),
    "kaleb-brown":         ("Ohio State", [2025, 2024]),
    "kyron-ware-hudson":   ("Utah", [2025, 2024]),
    "malik-benson":        ("Alabama", [2024, 2023]),
    "max-tomzcak":         ("Western Michigan", [2025, 2024]),
    "noah-thomas":         ("Alabama", [2024, 2023]),
    "lance-mason":         ("California", [2025, 2024]),
    "curtis-allen":        ("Western Kentucky", [2024, 2023]),
}


def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[''`\-\.\,]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def name_match(db_name: str, roster_name: str) -> bool:
    """Fuzzy name match: normalized equality, or one is substring of the other,
    or last name + first initial match."""
    a = normalize(db_name)
    b = normalize(roster_name)
    if a == b:
        return True
    # Substring match (catches "Tommy" vs "Thomas" via last name)
    a_parts = a.split()
    b_parts = b.split()
    if len(a_parts) >= 2 and len(b_parts) >= 2:
        # Last names must match
        if a_parts[-1] == b_parts[-1]:
            # First name first letter match
            if a_parts[0][0] == b_parts[0][0]:
                return True
    return False


def get_team_id(teams, school_name):
    school_lower = school_name.lower()
    best = None
    for team in teams:
        loc = team.get("location", "").lower()
        disp = team.get("displayName", "").lower()
        if school_lower == loc or school_lower == disp:
            return team.get("id")
        if school_lower in disp or disp in school_lower:
            best = team.get("id")
    return best


def fetch_roster_athletes(team_id, year):
    """Returns list of {id, fullName, height, weight} from V2 roster."""
    url = ESPN_V2_ROSTER.format(team_id=team_id, year=year)
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return []
        data = r.json()
        items = data.get("items", [])
        athletes = []
        for item in items:
            ref = item.get("$ref", "")
            if not ref:
                continue
            # Strip query params from ID
            athlete_id = re.sub(r'\?.*$', '', ref.rstrip("/").split("/")[-1])
            r2 = requests.get(ref, headers=HEADERS, timeout=10)
            if r2.status_code != 200:
                continue
            d = r2.json()
            athletes.append({
                "id": athlete_id,
                "fullName": d.get("fullName", ""),
                "height": d.get("height"),
                "weight": d.get("weight"),
            })
            time.sleep(0.05)
        return athletes
    except Exception as e:
        print(f"  Roster error team={team_id} year={year}: {e}")
        return []


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, full_name, slug, height_inches, weight_lbs
        FROM players WHERE draft_year=2026 AND espn_college_id IS NULL
    """)
    missing = {row[2]: row for row in cur.fetchall()}
    print(f"Players missing ESPN college ID: {len(missing)}")

    print("Fetching ESPN team list...")
    r = requests.get(ESPN_TEAMS_URL, headers=HEADERS, timeout=15)
    raw_teams = r.json().get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", [])
    teams = [t.get("team", {}) for t in raw_teams]
    print(f"  {len(teams)} teams loaded")

    espn_id_found = 0
    bio_updated = 0
    roster_cache = {}  # (team_id, year) → athletes

    for slug, player_row in sorted(missing.items()):
        p_id, p_name, p_slug, cur_ht, cur_wt = player_row
        info = PLAYER_SCHOOLS.get(slug)
        if not info:
            print(f"  [{p_name}] No school mapping — skipping")
            continue

        school, years = info
        team_id = get_team_id(teams, school)
        if not team_id:
            print(f"  [{p_name}] Can't find team ID for '{school}'")
            continue

        found = False
        for yr in years:
            cache_key = (team_id, yr)
            if cache_key not in roster_cache:
                print(f"  Loading {school} {yr} roster...")
                time.sleep(0.3)
                roster_cache[cache_key] = fetch_roster_athletes(team_id, yr)
                print(f"    {len(roster_cache[cache_key])} athletes loaded")

            roster = roster_cache[cache_key]
            match = None
            for ath in roster:
                if name_match(p_name, ath["fullName"]):
                    match = ath
                    break

            if match:
                espn_id = match["id"]
                print(f"  [{p_name}] Found ESPN ID={espn_id} on {school} {yr} roster (as '{match['fullName']}')")
                cur.execute("UPDATE players SET espn_college_id=? WHERE id=?", (espn_id, p_id))
                espn_id_found += 1

                h = match.get("height")
                w = match.get("weight")
                if h or w:
                    cur.execute("""
                        UPDATE players SET
                          height_inches = CASE WHEN height_inches IS NULL AND ? IS NOT NULL THEN ROUND(?) ELSE height_inches END,
                          weight_lbs    = CASE WHEN weight_lbs IS NULL AND ? IS NOT NULL THEN ROUND(?) ELSE weight_lbs END
                        WHERE id=?
                    """, (h, h, w, w, p_id))
                    if cur.rowcount:
                        bio_updated += 1
                found = True
                break

        if not found:
            print(f"  [{p_name}] Not found on {school} roster for years {years}")

    conn.commit()
    conn.close()

    print(f"\nComplete. ESPN IDs found: {espn_id_found} | Bio updated: {bio_updated}")
    print("Next: run 'py scrapers/college_stats.py' to fetch stats for newly found ESPN IDs.")


if __name__ == "__main__":
    run()
