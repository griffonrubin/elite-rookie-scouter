"""
scrapers/class_bio_espn.py

Height, weight, hometown and a headshot for a draft class, from ESPN.

A freshly seeded class is a list of names, positions and schools. The board
it came from carries nothing else, so every prospect shows up with no size,
no face and no home town while the same fields are filled in for the class
before it. One ESPN call per player closes four of those gaps.

Not date of birth, which is the one that matters most for dynasty and the
one ESPN does not give. The college athlete endpoint returns `birthPlace`
and no `dateOfBirth` — checked against Jeremiah Smith and Dante Moore, both
of whom have the former and neither the latter. seed_bio.py already has a
best-effort Wikipedia path for that and it is left where it is.

Only empty columns are written. A player whose height came from somewhere
more trustworthy keeps it, and re-running this is free.

Run: py scrapers/class_bio_espn.py 2027
"""

import os
import sqlite3
import sys
import time

import requests

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                       'dynasty_scout.db')
ATHLETE = ("https://sports.core.api.espn.com/v2/sports/football/leagues/"
           "college-football/athletes/{espn_id}")
HEADERS = {"User-Agent": "DynastyScout/1.0 (fantasy football research tool)"}


def fetch(espn_id):
    """The four fields, or Nones where ESPN is silent."""
    try:
        r = requests.get(ATHLETE.format(espn_id=espn_id),
                         headers=HEADERS, timeout=20)
        r.raise_for_status()
        d = r.json()
    except Exception as e:
        print(f"  ! {espn_id}: {str(e)[:60]}")
        return {}

    place = d.get("birthPlace") or {}
    # "Miami Gardens, FL", which is the shape the 2026 rows already use.
    town = ", ".join(x for x in (place.get("city"), place.get("state")) if x)
    height = d.get("height")
    weight = d.get("weight")
    return {
        "height_inches": int(height) if height else None,
        "weight_lbs": int(weight) if weight else None,
        "hometown": town or None,
        "headshot_url": (d.get("headshot") or {}).get("href"),
    }


def run(year: int):
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()
    players = cur.execute(
        """SELECT id, full_name, espn_college_id FROM players
            WHERE draft_year = ? AND espn_college_id IS NOT NULL
              AND (height_inches IS NULL OR weight_lbs IS NULL
                   OR hometown IS NULL OR headshot_url IS NULL)
            ORDER BY full_name""", (year,)).fetchall()
    print(f"{len(players)} players in the {year} class need bio filling")

    filled = 0
    for pid, name, espn_id in players:
        bio = fetch(espn_id)
        if not bio:
            continue
        # COALESCE keeps whatever is already there; this only fills holes.
        cur.execute(
            """UPDATE players SET
                 height_inches = COALESCE(height_inches, ?),
                 weight_lbs    = COALESCE(weight_lbs, ?),
                 hometown      = COALESCE(hometown, ?),
                 headshot_url  = COALESCE(headshot_url, ?)
               WHERE id = ?""",
            (bio["height_inches"], bio["weight_lbs"],
             bio["hometown"], bio["headshot_url"], pid))
        if cur.rowcount:
            filled += 1
        got = [k.split('_')[0] for k, v in bio.items() if v]
        print(f"  {name}: {', '.join(got) if got else 'nothing'}")
        time.sleep(0.3)

    conn.commit()
    have = cur.execute(
        """SELECT SUM(height_inches IS NOT NULL), SUM(weight_lbs IS NOT NULL),
                  SUM(hometown IS NOT NULL), SUM(headshot_url IS NOT NULL),
                  COUNT(*)
             FROM players WHERE draft_year = ?""", (year,)).fetchone()
    print(f"\n{year}: height {have[0]}/{have[4]}, weight {have[1]}/{have[4]}, "
          f"hometown {have[2]}/{have[4]}, headshot {have[3]}/{have[4]}")
    conn.close()


if __name__ == "__main__":
    run(int(sys.argv[1]) if len(sys.argv) > 1 else 2027)
