import feedparser
import logging
from datetime import datetime
import config
from dateutil import parser
import time

logger = logging.getLogger("NewsAggregator")

class NewsAggregator:
    """
    Aggregates news from RSS feeds and links them to players.
    """
    
    FEEDS = [
        {"source": "Rotoworld", "url": "https://www.nbcsports.com/rss/football/player-news"},
        {"source": "DynastyLeagueFootball", "url": "https://dynastyleaguefootball.com/feed/"},
        {"source": "FantasyPros", "url": "https://www.fantasypros.com/nfl/player-news/rss.php"},
    ]
    
    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)
        self.players = self._load_players()

    def _load_players(self):
        """Cache player names and IDs for tagging."""
        self.cursor.execute("SELECT id, full_name, slug FROM players")
        players = self.cursor.fetchall()
        # Create lookup map
        return players

    def run(self):
        logger.info("Starting News Aggregation...")
        
        for feed_info in self.FEEDS:
            try:
                feed = feedparser.parse(feed_info['url'])
                for entry in feed.entries:
                    self._process_entry(entry, feed_info['source'])
            except Exception as e:
                logger.error(f"Error parsing feed {feed_info['source']}: {e}")
                
        logger.info("News Aggregation Complete.")

    def _process_entry(self, entry, source):
        title = entry.get('title', '')
        summary = entry.get('summary', '') or entry.get('description', '')
        link = entry.get('link', '')
        
        # Parse date
        published_at = datetime.now()
        if 'published' in entry:
            try:
                published_at = parser.parse(entry.published)
            except:
                pass
                
        # Link to players
        # Simple string matching for now (fuzzy matching is better but optional)
        matched_player_id = None
        
        full_text = f"{title} {summary}"
        
        for p in self.players:
            if p['full_name'] in full_text:
                matched_player_id = p['id']
                break # Just match first found for now
        
        # Save
        try:
            self.cursor.execute("""
                INSERT OR IGNORE INTO news (player_id, title, summary, source, source_url, published_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                matched_player_id,
                title[:255], # Truncate title if needed or change schema to TEXT
                summary,
                source,
                link,
                published_at.isoformat() if hasattr(published_at, 'isoformat') else str(published_at)
            ))
            self.conn.commit()
        except Exception as e:
            logger.error(f"Error saving news: {e}")
            self.conn.rollback()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    aggregator = NewsAggregator()
    aggregator.run()
