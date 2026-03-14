from scrapers.base_scraper import BaseRankingScraper
from playwright.sync_api import sync_playwright
import logging
from scrapers import config
from datetime import datetime
import time

logger = logging.getLogger("FantasyProsScraper")

class FantasyProsRankingScraper(BaseRankingScraper):
    """
    Source: FantasyPros 2026 Devy Rankings
    Uses Playwright to render dynamic content.
    Filters for 2026 draft class only.
    """
    def __init__(self):
        super().__init__()
        self.source_name = "FantasyPros"
        # Try devy rankings for 2026 class, fallback to rookies if needed
        self.url = "https://www.fantasypros.com/nfl/rankings/devy.php"

    def match_player(self, name):
        """
        Match scraped name to database player using simple string normalization.
        Only matches players with draft_year = 2026.
        """
        clean_name = name.lower().replace(".", "").replace("'", "").split(" jr")[0].split(" iii")[0].strip()
        slug = clean_name.replace(" ", "-")
        
        if slug in self.players:
            player_id = self.players[slug]
            # Verify this is a 2026 prospect
            self.cursor.execute("SELECT draft_year FROM players WHERE id = ?", (player_id,))
            result = self.cursor.fetchone()
            if result and result['draft_year'] == 2026:
                return player_id
        return None

    def scrape(self):
        logger.info(f"Scraping {self.source_name} from {self.url} using Playwright...")
        
        with sync_playwright() as p:
            # Launch browser
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=config.USER_AGENT)
            
            try:
                page.goto(self.url, timeout=60000)
                
                # Wait for potential table selectors
                # FantasyPros often loads the table dynamically
                try:
                    page.wait_for_selector("table", timeout=10000)
                except:
                    logger.warning("Timeout waiting for table selector, continuing anyway...")

                # Get page content for debugging if needed
                # content = page.content()
                
                # Select rows
                # Strategy: Finding rows that look like player rows
                
                # Attempt 1: Standard table rows in the main content area
                rows = page.query_selector_all("table#ranking-table tbody tr")
                if not rows:
                     rows = page.query_selector_all("table#data tbody tr")
                if not rows:
                     rows = page.query_selector_all(".mobile-table table tbody tr")
                
                if not rows:
                    logger.error("Could not find any rows with standard selectors.")
                    # Fallback: Try to find ANY row with a player link
                    rows = page.query_selector_all("tr")
                
                logger.info(f"Found {len(rows)} potential rows.")

                found_count = 0
                for row in rows:
                    try:
                        # Helper to get text from a selector within the row
                        def get_text(selector):
                            el = row.query_selector(selector)
                            return el.inner_text().strip() if el else ""

                        # Extract Name
                        # Check multiple common classes for name
                        full_name = get_text("a.player-name") or get_text(".player-cell .full-name") or get_text("span.full-name")
                        
                        if not full_name:
                            # Try getting text from the second cell if it's a link
                            cells = row.query_selector_all("td")
                            if len(cells) > 1:
                                link = cells[0].query_selector("a") or cells[1].query_selector("a")
                                if link:
                                    full_name = link.inner_text().strip()

                        if not full_name:
                            continue
                        
                        # Extract Rank
                        # Usually the first cell
                        rank_text = ""
                        cells = row.query_selector_all("td")
                        if cells:
                            rank_text = cells[0].inner_text().strip()
                        
                        if not rank_text.isdigit():
                            continue
                            
                        rank = int(rank_text)

                        # Match and Save
                        player_id = self.match_player(full_name)
                        if player_id:
                            self.save_ranking(player_id, rank, self.source_name, self.url)
                            found_count += 1
                            print(f"[{self.source_name}] Saved Rank {rank}: {full_name}")
                        
                    except Exception as e:
                        # logger.debug(f"Row parse error: {e}")
                        continue

                if found_count == 0:
                    logger.warning("No players matched. The page structure might have changed significantly.")

            except Exception as e:
                logger.error(f"Playwright Error: {e}")
            finally:
                browser.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    scraper = FantasyProsRankingScraper()
    scraper.scrape()
