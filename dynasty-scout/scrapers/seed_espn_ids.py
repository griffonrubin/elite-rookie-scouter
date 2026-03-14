import sqlite3
import requests
import json
import argparse
import sys
import os
import time
import re

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
REVIEW_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'espn_id_review.json')

def slugify(text):
    return re.sub(r'[^a-z0-9]', '', text.lower())

def get_espn_candidates(name):
    url = f"https://site.web.api.espn.com/apis/search/v2?region=us&lang=en&query={requests.utils.quote(name)}&limit=10"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        
        # ESPN unified search wraps athletes in a result type 'player'
        candidates = []
        for res in data.get('results', []):
            if res.get('type') == 'player':
                for item in res.get('contents', []):
                    # Only take college football players
                    if item.get('description', '').upper() == 'NCAAF' or 'college-football' in str(item.get('link', {})):
                        # Extract the integer ID from uid like: 's:20~l:23~a:4871023'
                        uid = item.get('uid', '')
                        if '~a:' in uid:
                            espn_id = uid.split('~a:')[1]
                            candidates.append({
                                'id': int(espn_id),
                                'fullName': item.get('displayName'),
                                'school': item.get('subtitle', ''),
                            })
        return candidates
    except Exception as e:
        print(f"Error fetching {name}: {e}")
        return []

def run_seeder(force=False):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # We want to pull school from college_career or fallback to the player record's nfl_team column if missing
    sql = """
        SELECT 
            p.id, 
            p.full_name, 
            p.position,
            COALESCE(
                 (SELECT school FROM college_stats cs WHERE cs.player_id = p.id ORDER BY season DESC LIMIT 1),
                 (SELECT school FROM college_career cc WHERE cc.player_id = p.id LIMIT 1),
                 p.nfl_team
            ) as school,
            p.espn_college_id,
            p.cfbref_id
        FROM players p
    """
    
    if not force:
        sql += " WHERE p.espn_college_id IS NULL AND p.cfbref_id IS NULL"
        
    cur.execute(sql)
    players = cur.fetchall()
    
    matched = 0
    flagged = 0
    unmatched = 0
    
    review_log = []
    
    print(f"Processing {len(players)} players for ESPN/CFBRef IDs...")
    
    for row in players:
        p_id, p_name, p_pos, p_school, espn_id, cfb_id = row
        time.sleep(0.3)  # Be nice to the API
        
        candidates = get_espn_candidates(p_name)
        
        matches = []
        for item in candidates:
            # Check if name is close enough
            if slugify(item['fullName']) == slugify(p_name):
                # Optionally check if the school listed in item subtitle lines up with our fallback
                # Since the fallback might be outdated (transfer), we heavily weight exact name matches
                # If there are multiple players with the exact same name, it will get flagged for review anyway.
                matches.append(item)
                
        if len(matches) == 1:
            # Unambiguous match
            match = matches[0]
            new_id = match['id']
            cur.execute("UPDATE players SET espn_college_id = ? WHERE id = ?", (new_id, p_id))
            matched += 1
            print(f"[{matched}] Assigned ESPN ID {new_id} to {p_name}")
            
        elif len(matches) > 1:
            # Ambiguous
            flagged += 1
            review_log.append({
                "player_id": p_id,
                "name": p_name,
                "reason": "Multiple exact name matches. Manual resolution needed.",
                "candidates": matches
            })
            print(f"[!] Multiple matches for {p_name}. Flagged for review.")
            
        else:
            # Fallback to CFBRef mapping manually or via fuzzy logic
            # For now we'll just log it as unmatched, we can script CFBRef later or assume it's for smaller schools
            unmatched += 1
            review_log.append({
                "player_id": p_id,
                "name": p_name,
                "reason": "Not found in ESPN. May need CFB Reference fallback.",
                "candidates": []
            })
            print(f"[x] No ESPN match for {p_name}.")
            
    conn.commit()
    conn.close()
    
    with open(REVIEW_FILE, 'w') as f:
        json.dump(review_log, f, indent=2)
        
    print("\nESPN ID Seeding Complete:")
    print(f"  Matched:         {matched}")
    print(f"  Flagged review:  {flagged}")
    print(f"  Unmatched:       {unmatched}")
    print(f"  Review file:     {REVIEW_FILE}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Process all players even if already assigned")
    args = parser.parse_args()
    run_seeder(args.force)
