from playwright.sync_api import sync_playwright
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import logging
from scrapers import config
from datetime import datetime
import psycopg2
import sqlite3
import time
import re

logger = logging.getLogger("YouTubeTranscriptScraper")

class YouTubeTranscriptScraper:
    """
    Search YouTube for relevant videos and extract transcripts.
    """
    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)
        # Updated search query to specifically target 2026 NFL Draft class
        self.search_url = "https://www.youtube.com/results?search_query=2026+NFL+Draft+prospects+scouting+report&sp=CAI%253D" # Sort by upload date

    def scrape(self):
        logger.info("Starting YouTube Transcript Scrape...")
        
        videos = self.search_videos()
        logger.info(f"Found {len(videos)} videos to process.")
        
        for video in videos:
            self.process_video(video)
            
    def search_videos(self):
        """
        Use Playwright to get video IDs from search results
        """
        videos = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=config.USER_AGENT)
            
            try:
                page.goto(self.search_url, timeout=60000)
                page.wait_for_selector("ytd-video-renderer", timeout=15000)
                
                # Scroll down to load more
                for _ in range(3):
                    page.mouse.wheel(0, 5000)
                    time.sleep(1)
                
                # Extract video details
                video_elements = page.query_selector_all("ytd-video-renderer")
                
                for el in video_elements:
                    try:
                        title_el = el.query_selector("#video-title")
                        if not title_el: continue
                        
                        title = title_el.inner_text().strip()
                        url = title_el.get_attribute("href") # /watch?v=VIDEO_ID
                        
                        channel_el = el.query_selector("#channel-info #text")
                        channel = channel_el.inner_text().strip() if channel_el else "Unknown"
                        
                        view_text = ""
                        meta_els = el.query_selector_all("#metadata-line span")
                        if meta_els:
                            view_text = meta_els[0].inner_text()
                        
                        video_id = url.split("v=")[1].split("&")[0]
                        
                        videos.append({
                            "video_id": video_id,
                            "title": title,
                            "channel": channel,
                            "views": self.parse_views(view_text),
                            "url": f"https://www.youtube.com{url}"
                        })
                        
                    except Exception as e:
                        continue
                        
            except Exception as e:
                logger.error(f"YouTube Search Error: {e}")
            finally:
                browser.close()
                
        return videos

    def parse_views(self, text):
        # "12K views" -> 12000
        try:
            text = text.lower().replace("views", "").strip()
            if "k" in text:
                return int(float(text.replace("k", "")) * 1000)
            elif "m" in text:
                return int(float(text.replace("m", "")) * 1000000)
            else:
                return int(text.replace(",", ""))
        except:
            return 0

    def process_video(self, video):
        video_id = video['video_id']
        logger.info(f"Processing video: {video['title']} ({video_id})")
        
        try:
            # Create API instance and get transcript list
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)
            
            # Find English transcript
            transcript = transcript_list.find_transcript(['en', 'en-US'])
            
            # Fetch the actual transcript data
            transcript_data = transcript.fetch()
            
            # Extract full text from segments
            full_text = " ".join([segment.text for segment in transcript_data])
            
            # Save to DB
            self.save_post(video, full_text)
            logger.info(f"Successfully saved transcript for {video['title']}")
            
        except (TranscriptsDisabled, NoTranscriptFound):
            logger.warning(f"No transcript available for {video_id}")
        except Exception as e:
            logger.error(f"Error processing {video_id}: {e}")

    def save_post(self, video, content):
        try:
            # Check if exists first to avoid duplicate work (or use INSERT OR IGNORE)
            query = """
                INSERT INTO social_posts (platform, post_id, author, content, engagement_score, post_url, posted_at, scraped_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(platform, post_id) DO UPDATE SET
                    engagement_score=excluded.engagement_score,
                    content=excluded.content,
                    scraped_at=excluded.scraped_at
            """
            
            # SQLite parameters are ?
            self.cursor.execute(query, (
                "youtube", 
                video['video_id'], 
                video['channel'], 
                f"{video['title']}\n\n{content}", 
                video['views'], 
                video['url'], 
                datetime.now().isoformat(),
                datetime.now().isoformat()
            ))
            self.conn.commit()
            logger.info(f"Saved transcript for {video['title']}")
            
        except Exception as e:
            logger.error(f"DB Error saving post: {e}")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    scraper = YouTubeTranscriptScraper()
    scraper.scrape()
