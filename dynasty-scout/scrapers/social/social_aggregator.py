import logging
import config
from datetime import datetime

logger = logging.getLogger("SocialAggregator")

class SocialAggregator:
    """
    Scrapes/Aggregates social sentiment from Reddit (r/DynastyFF) and Twitter.
    """
    
    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)

    def run(self):
        logger.info("Starting Social Aggregation...")
        
        # MOCK IMPLEMENTATION
        # Real implementation would use PRAW for Reddit and Tweepy/other for X.
        
        mock_posts = [
            {
                "platform": "reddit",
                "post_id": "r1",
                "author": "DynastyGuru",
                "content": "Jeremiah Love is the RB1 of this class, stop overthinking it.",
                "url": "https://reddit.com/r/DynastyFF/...",
                "engagement": 150,
                "player_slug": "jeremiah-love"
            },
            {
                "platform": "twitter",
                "post_id": "t1",
                "author": "AdamSchefter",
                "content": "Sources say Arch Manning expecting to declare for 2026 draft.",
                "url": "https://twitter.com/...",
                "engagement": 5000,
                "player_slug": "arch-manning"
            }
        ]
        
        for post in mock_posts:
            # Find player
            self.cursor.execute("SELECT id FROM players WHERE slug = %s", (post['player_slug'],))
            res = self.cursor.fetchone()
            if res:
                pid = res['id']
                try:
                    self.cursor.execute("""
                        INSERT INTO social_posts (player_id, platform, post_id, author, content, engagement_score, post_url, posted_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (platform, post_id) DO NOTHING
                    """, (
                        pid, post['platform'], post['post_id'], post['author'], 
                        post['content'], post['engagement'], post['url'], datetime.now()
                    ))
                    self.conn.commit()
                except Exception as e:
                    logger.error(f"Error: {e}")
                    self.conn.rollback()
                    
        logger.info("Social Aggregation Complete.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agg = SocialAggregator()
    agg.run()
