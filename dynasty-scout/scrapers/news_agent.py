"""
news_agent.py - AI-powered news fetcher using Google News RSS (no API key needed)
Fetches recent news for each player and saves to the news table.
"""
import sqlite3
import requests
import xml.etree.ElementTree as ET
import logging
import time
import html
import re
from datetime import datetime, timedelta
from urllib.parse import quote_plus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("NewsAgent")

DB_FILE = "dynasty_scout.db"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def get_players(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, p.full_name, p.position,
               COALESCE(cc.school, p.nfl_team) as school
        FROM players p
        LEFT JOIN college_career cc ON p.id = cc.player_id
        WHERE p.draft_year = 2026
        ORDER BY p.id
    """)
    return cur.fetchall()

def parse_rss_date(date_str):
    """Parse RSS date format to ISO string."""
    if not date_str:
        return None
    try:
        # RFC 2822 format: "Mon, 02 Mar 2026 12:00:00 +0000"
        dt = datetime.strptime(date_str[:25].strip(), "%a, %d %b %Y %H:%M:%S")
        return dt.isoformat()
    except Exception:
        return None

def fetch_news_for_player(player_name, position, school):
    """Fetch Google News RSS for a player."""
    # Build targeted query for football context
    school_str = f" {school}" if school else ""
    query = f'"{player_name}"{school_str} NFL draft 2026 fantasy football'
    encoded_query = quote_plus(query)
    
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            logger.warning(f"  [{player_name}] RSS request failed: {resp.status_code}")
            return []
        
        # Parse XML
        root = ET.fromstring(resp.content)
        channel = root.find('channel')
        if channel is None:
            return []
        
        items = channel.findall('item')
        articles = []
        cutoff = datetime.now() - timedelta(days=180)  # Last 6 months
        
        for item in items[:8]:  # Check top 8, save up to 5
            try:
                title = html.unescape(item.findtext('title', '').strip())
                link = item.findtext('link', '').strip()
                pub_date_str = item.findtext('pubDate', '').strip()
                
                # Try to get description from description tag
                desc_raw = item.findtext('description', '').strip()
                # Strip HTML from description
                desc = re.sub(r'<[^>]+>', '', html.unescape(desc_raw)).strip()
                
                if not title or not link:
                    continue
                
                # Parse and filter by date
                pub_date = parse_rss_date(pub_date_str)
                if pub_date_str:
                    try:
                        dt = datetime.strptime(pub_date_str[:25].strip(), "%a, %d %b %Y %H:%M:%S")
                        if dt < cutoff:
                            continue  # Skip old articles
                    except Exception:
                        pass
                
                # Extract source from title (Google News format: "Title - Source")
                source = ""
                if " - " in title:
                    parts = title.rsplit(" - ", 1)
                    title = parts[0].strip()
                    source = parts[1].strip()
                
                articles.append({
                    "title": title[:500],
                    "summary": desc[:1000] if desc else None,
                    "source": source or "Google News",
                    "source_url": link,
                    "published_at": pub_date,
                })
                
                if len(articles) >= 5:
                    break
                    
            except Exception as e:
                logger.debug(f"  Item parse error: {e}")
                continue
        
        return articles
        
    except Exception as e:
        logger.error(f"  [{player_name}] Fetch error: {e}")
        return []

def save_news(conn, player_id, articles):
    """Save articles to the news table."""
    cur = conn.cursor()
    saved = 0
    for article in articles:
        try:
            cur.execute("""
                INSERT INTO news (player_id, title, summary, source, source_url, published_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_url) DO UPDATE SET
                    title=excluded.title,
                    summary=excluded.summary,
                    published_at=excluded.published_at
            """, (
                player_id,
                article['title'],
                article['summary'],
                article['source'],
                article['source_url'],
                article['published_at'],
            ))
            saved += 1
        except Exception as e:
            logger.debug(f"  Save error: {e}")
    conn.commit()
    return saved

def run():
    conn = get_db()
    players = get_players(conn)
    logger.info(f"Fetching news for {len(players)} players...")
    
    total_saved = 0
    for i, player in enumerate(players):
        player_id = player['id']
        name = player['full_name']
        position = player['position']
        school = player['school']
        
        logger.info(f"[{i+1}/{len(players)}] {name} ({position})")
        
        articles = fetch_news_for_player(name, position, school)
        if articles:
            saved = save_news(conn, player_id, articles)
            total_saved += saved
            logger.info(f"  -> Saved {saved} articles")
        else:
            logger.info(f"  -> No articles found")
        
        # Rate limit: Google News allows ~1 req/sec comfortably
        time.sleep(1.2)
    
    conn.close()
    logger.info(f"\nNews fetch complete! Total articles saved: {total_saved}")

if __name__ == "__main__":
    run()
