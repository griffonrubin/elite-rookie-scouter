import sqlite3
import requests
import json
import os
import time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')

def update_team_stats():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT espn_school_id, season FROM college_stats WHERE espn_school_id IS NOT NULL AND espn_school_id != ''")
    rows = cur.fetchall()
    
    print(f"Fetching team totals for {len(rows)} school seasons...")
    for tm_id, yr in rows:
        url = f"https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/{yr}/types/2/teams/{tm_id}/statistics"
        try:
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                pass_yds = 0
                rush_yds = 0
                cats = r.json().get('splits', {}).get('categories', [])
                for c in cats:
                    if c.get('name') == 'passing':
                        for s in c.get('stats', []):
                            if s.get('name') == 'passingYards':
                                pass_yds = int(s.get('value', 0))
                    if c.get('name') == 'rushing':
                        for s in c.get('stats', []):
                            if s.get('name') == 'rushingYards':
                                rush_yds = int(s.get('value', 0))

                cur.execute("UPDATE college_stats SET team_pass_yards=?, team_rush_yards=? WHERE espn_school_id=? AND season=?",
                            (pass_yds, rush_yds, tm_id, yr))
                conn.commit()
            time.sleep(0.3)
        except Exception as e:
            print(f"Failed {tm_id} {yr}: {e}")
            
    print("Team stat updates complete!")
    
if __name__ == '__main__':
    update_team_stats()
