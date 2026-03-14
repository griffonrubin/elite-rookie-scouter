import logging
from scrapers import config
from datetime import date

logger = logging.getLogger("BaseScraper")

class BaseRankingScraper:
    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)
        self.players = self._load_player_map()

    def _load_player_map(self):
        # returns dict {slug: id}
        self.cursor.execute("SELECT id, slug, full_name FROM players")
        players = self.cursor.fetchall()
        return {p['slug']: p['id'] for p in players}

    def save_ranking(self, player_id, rank, source, url="", value=None, sentiment_score=None):
        try:
            timestamp = date.today().isoformat()
            query = """
                INSERT INTO rankings (player_id, rank_overall, source, source_url, value, sentiment_score, scraped_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(player_id, source, scraped_at) DO UPDATE SET
                    rank_overall=excluded.rank_overall,
                    source_url=excluded.source_url,
                    value=excluded.value,
                    sentiment_score=excluded.sentiment_score
            """
            self.cursor.execute(query, (player_id, rank, source, url, value, sentiment_score, timestamp))
            self.conn.commit()
            logger.info(f"Saved rank {rank} for player {player_id} from {source}")
        except Exception as e:
            logger.error(f"Error saving ranking for {player_id}: {e}")
