import logging
import pandas as pd
import numpy as np
from datetime import date
from scrapers import config

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ConsensusCalculator")

class ConsensusCalculator:
    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)

    def calculate(self):
        logger.info("Calculating Consensus Rankings...")
        
        # Fetch all rankings for today (or latest available per source)
        query = """
            SELECT r.player_id, r.source, r.rank_overall
            FROM rankings r
            WHERE r.scraped_at = ?
        """
        # For demo, just grab everything recently scraped
        # In prod, we'd be more specific about date windows
        today = date.today().isoformat()
        
        # SQLite pandas read
        df = pd.read_sql_query("SELECT * FROM rankings", self.conn)
        
        if df.empty:
            logger.warning("No rankings found to aggregate.")
            return

        # Group by player
        consensus = df.groupby('player_id')['rank_overall'].agg(
            rank_overall='mean', # This is avg_rank actually
            best_rank='min',
            worst_rank='max',
            std_dev='std',
            count='count'
        ).reset_index()

        consensus['avg_rank'] = consensus['rank_overall']
        consensus['rank_overall'] = consensus['avg_rank'].rank(method='min').astype(int) 
        consensus['std_dev'] = consensus['std_dev'].fillna(0)
        
        logger.info(f"Calculated consensus for {len(consensus)} players.")
        
        # Save
        for _, row in consensus.iterrows():
            try:
                # SQLite upsert
                 query = """
                    INSERT INTO consensus_rankings (
                        player_id, rank_overall, avg_rank, best_rank, worst_rank, 
                        std_deviation, num_sources, calculated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(player_id, calculated_at) DO UPDATE SET
                        rank_overall=excluded.rank_overall,
                        avg_rank=excluded.avg_rank,
                        num_sources=excluded.num_sources
                """
                 self.cursor.execute(query, (
                     row['player_id'], row['rank_overall'], row['avg_rank'],
                     row['best_rank'], row['worst_rank'], row['std_dev'], row['count'],
                     today
                 ))
            except Exception as e:
                logger.error(f"Error saving consensus: {e}")
        
        self.conn.commit()
        logger.info("Consensus Calculation Complete.")

if __name__ == "__main__":
    calc = ConsensusCalculator()
    calc.calculate()
