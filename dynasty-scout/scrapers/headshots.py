"""
headshots.py
Populates headshot_url for players missing photos using ESPN CDN.
Preserves existing NFL.com headshots (higher quality draft photos).

Run: py scrapers/headshots.py
"""

import sqlite3
import requests
import time
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
ESPN_CDN = "https://a.espncdn.com/i/headshots/college-football/players/full/{}.png"
HEADERS = {"User-Agent": "DynastyScout/1.0 (fantasy football research)"}


def run():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    # Get players missing headshots who have ESPN IDs
    cur.execute("""
        SELECT id, full_name, espn_college_id
        FROM players
        WHERE headshot_url IS NULL AND espn_college_id IS NOT NULL AND draft_year = 2026
    """)
    players = cur.fetchall()

    print(f"Found {len(players)} players without headshots (have ESPN IDs)...")

    updated = 0
    failed = 0

    for p_id, name, espn_id in players:
        url = ESPN_CDN.format(espn_id)
        try:
            time.sleep(0.15)
            r = requests.head(url, headers=HEADERS, timeout=10, allow_redirects=True)
            if r.status_code == 200:
                content_type = r.headers.get('Content-Type', '')
                if 'image' in content_type:
                    cur.execute("UPDATE players SET headshot_url = ? WHERE id = ?", (url, p_id))
                    updated += 1
                    if updated % 20 == 0:
                        print(f"  Progress: {updated} headshots set...")
                else:
                    print(f"  [{name}] URL returned non-image content-type: {content_type}")
                    failed += 1
            else:
                print(f"  [{name}] HEAD returned {r.status_code}")
                failed += 1
        except Exception as e:
            print(f"  [{name}] Error: {e}")
            failed += 1

    conn.commit()
    conn.close()

    print(f"\nHeadshot scrape complete.")
    print(f"  Updated: {updated}")
    print(f"  Failed:  {failed}")
    print(f"  Skipped (already have headshot): run query to check")


if __name__ == "__main__":
    run()
