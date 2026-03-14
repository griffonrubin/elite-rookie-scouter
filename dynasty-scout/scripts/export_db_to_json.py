import sqlite3
import json
import os

DB_FILE = "dynasty_scout.db"
OUTPUT_FILE = "lib/data/players.json"

def export_to_json():
    if not os.path.exists("lib/data"):
        os.makedirs("lib/data")

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Export ALL 2026 players with consensus data, school, and stats summary
    sql = """
      SELECT 
        p.*,
        COALESCE(cc.school, p.nfl_team) as school,
        c.rank_overall,
        c.avg_rank,
        c.rank_change_1d,
        c.rank_change_7d,
        c.rank_change_30d,
        c.num_sources
      FROM players p
      LEFT JOIN college_career cc ON p.id = cc.player_id
      LEFT JOIN consensus_rankings c ON p.id = c.player_id
        AND c.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id)
      WHERE p.draft_year = 2026
      ORDER BY 
        COALESCE(c.rank_overall, 9999) ASC,
        p.full_name ASC
    """
    
    cursor.execute(sql)
    rows = cursor.fetchall()
    
    players = []
    for row in rows:
        r = dict(row)
        rank = r.get('rank_overall')
        player = {
            "id": r['id'],
            "slug": r['slug'],
            "full_name": r['full_name'],
            "first_name": r['first_name'],
            "last_name": r['last_name'],
            "position": r['position'],
            "school": r.get('school'),
            "nfl_team": r.get('nfl_team'),
            "draft_year": r['draft_year'],
            "headshot_url": r['headshot_url'],
            "dob": r.get('dob'),
            "star_rating": r.get('star_rating'),
            "height_inches": r.get('height_inches'),
            "weight_lbs": r.get('weight_lbs'),
            "age_at_draft": r.get('age_at_draft'),
            "consensus": {
                "rank_overall": rank if rank else None,
                "avg_rank": r.get('avg_rank'),
                "rank_change_1d": r.get('rank_change_1d') or 0,
                "rank_change_7d": r.get('rank_change_7d') or 0,
                "rank_change_30d": r.get('rank_change_30d') or 0,
                "num_sources": r.get('num_sources') or 0,
            } if rank else None
        }
        players.append(player)
        
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(players, f, indent=2)
        
    print(f"Exported {len(players)} players to {OUTPUT_FILE}")
    conn.close()

if __name__ == "__main__":
    export_to_json()

