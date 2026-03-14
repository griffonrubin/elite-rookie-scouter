"""
run_consensus.py - Recalculates consensus rankings from all raw ranking sources.
Also inserts placeholder rankings (999) for players with no ranking data.
"""
import sqlite3
import logging
from datetime import date

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger("ConsensusRunner")

DB_FILE = "dynasty_scout.db"

def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    today = date.today().isoformat()
    
    # Get all rankings grouped by player
    cur.execute("""
        SELECT r.player_id, 
               AVG(r.rank_overall) as avg_rank,
               MIN(r.rank_overall) as best_rank,
               MAX(r.rank_overall) as worst_rank,
               COUNT(*) as num_sources
        FROM rankings r
        JOIN (
            SELECT player_id, source, MAX(scraped_at) as max_date
            FROM rankings
            GROUP BY player_id, source
        ) latest ON r.player_id = latest.player_id AND r.source = latest.source AND r.scraped_at = latest.max_date
        WHERE r.rank_overall IS NOT NULL AND r.rank_overall < 999
        GROUP BY r.player_id
        HAVING COUNT(*) >= 2
    """)
    ranked_players = cur.fetchall()
    
    logger.info(f"Found {len(ranked_players)} players with ranking data.")
    
    # Build ranked list sorted by avg_rank
    ranked_sorted = sorted(ranked_players, key=lambda x: x['avg_rank'])
    
    # Save consensus for ranked players
    for i, row in enumerate(ranked_sorted):
        overall_rank = i + 1
        try:
            cur.execute("""
                INSERT INTO consensus_rankings (
                    player_id, rank_overall, avg_rank, best_rank, worst_rank, 
                    std_deviation, num_sources, calculated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(player_id, calculated_at) DO UPDATE SET
                    rank_overall=excluded.rank_overall,
                    avg_rank=excluded.avg_rank,
                    best_rank=excluded.best_rank,
                    worst_rank=excluded.worst_rank,
                    num_sources=excluded.num_sources
            """, (
                row['player_id'], overall_rank, round(row['avg_rank'], 1),
                row['best_rank'], row['worst_rank'], 0.0, row['num_sources'],
                today
            ))
        except Exception as e:
            logger.error(f"Error saving consensus for player {row['player_id']}: {e}")
    
    # Now handle UNRANKED players — assign them positions AFTER the ranked players
    cur.execute("""
        SELECT p.id, p.position
        FROM players p
        WHERE p.draft_year = 2026
        AND p.id NOT IN (
            SELECT r.player_id FROM rankings r
            JOIN (
                SELECT player_id, source, MAX(scraped_at) as max_date
                FROM rankings
                GROUP BY player_id, source
            ) latest ON r.player_id = latest.player_id AND r.source = latest.source AND r.scraped_at = latest.max_date
            WHERE r.rank_overall < 999
            GROUP BY r.player_id
            HAVING COUNT(*) >= 2
        )
    """)
    unranked = cur.fetchall()
    logger.info(f"Found {len(unranked)} unranked players — assigning positional placeholder ranks.")
    
    # Group unranked by position
    pos_ranks = {'QB': 200, 'RB': 200, 'WR': 200, 'TE': 200}
    base_rank = len(ranked_sorted) + 1
    
    for player in unranked:
        player_id = player['id']
        pos = player['position']
        # Each unranked player gets a rank just past the top ranked players
        # We increment per-position so positional ranks make sense
        pos_rank = pos_ranks.get(pos, 200)
        pos_ranks[pos] = pos_ranks.get(pos, 200) + 1
        
        try:
            cur.execute("""
                INSERT INTO consensus_rankings (
                    player_id, rank_overall, avg_rank, best_rank, worst_rank,
                    std_deviation, num_sources, calculated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(player_id, calculated_at) DO UPDATE SET
                    rank_overall=excluded.rank_overall,
                    avg_rank=excluded.avg_rank
            """, (
                player_id, base_rank, float(base_rank), base_rank, base_rank, 0.0, 0, today
            ))
            base_rank += 1
        except Exception as e:
            logger.error(f"Error saving unranked consensus for {player_id}: {e}")
    
    conn.commit()
    
    # Report
    cur.execute("SELECT COUNT(*) FROM consensus_rankings WHERE calculated_at=?", (today,))
    total = cur.fetchone()[0]
    logger.info(f"Consensus calculation complete! Total players ranked: {total}")
    
    conn.close()

if __name__ == "__main__":
    run()
