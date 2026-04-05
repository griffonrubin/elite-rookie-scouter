from scrapers.base_scraper import BaseRankingScraper
from playwright.sync_api import sync_playwright
import logging
from scrapers import config
from datetime import datetime
import time

logger = logging.getLogger("FantasyProsScraper")

class FantasyProsRankingScraper(BaseRankingScraper):
    """
    Source: FantasyPros 2026 Rookie Rankings.
    Scrapes both 1QB (devy.php -> rookies.php) and SF (devy-superflex.php) formats.
    Uses Playwright to render dynamic content.
    Filters for 2026 draft class only.
    """
    def __init__(self):
        super().__init__()
        self.source_name = "FantasyPros"
        self.url = "https://www.fantasypros.com/nfl/rankings/devy.php"  # redirects to rookies.php
        self.url_sf = "https://www.fantasypros.com/nfl/rankings/devy-superflex.php"

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

    def _scrape_url(self, page, url: str, source_name: str) -> int:
        """Scrape one FP URL and save rankings. Returns count saved."""
        logger.info(f"Scraping {source_name} from {url}...")
        page.goto(url, timeout=60000)
        try:
            page.wait_for_selector("table", timeout=10000)
        except Exception:
            logger.warning("Timeout waiting for table selector, continuing anyway...")

        rows = page.query_selector_all("table#ranking-table tbody tr")
        if not rows:
            rows = page.query_selector_all("table#data tbody tr")
        if not rows:
            rows = page.query_selector_all(".mobile-table table tbody tr")
        if not rows:
            rows = page.query_selector_all("tr")

        logger.info(f"Found {len(rows)} potential rows.")
        found_count = 0

        for row in rows:
            try:
                def get_text(selector):
                    el = row.query_selector(selector)
                    return el.inner_text().strip() if el else ""

                full_name = (get_text("a.player-name") or get_text(".player-cell .full-name")
                             or get_text("span.full-name"))
                if not full_name:
                    cells = row.query_selector_all("td")
                    if len(cells) > 1:
                        link = cells[0].query_selector("a") or cells[1].query_selector("a")
                        if link:
                            full_name = link.inner_text().strip()
                        else:
                            # Plain text fallback — name is often in cells[1] or cells[2]
                            raw = cells[1].inner_text().strip().split("\n")[0]
                            if raw and not raw.isdigit():
                                full_name = raw
                if not full_name:
                    continue

                cells = row.query_selector_all("td")
                rank_text = cells[0].inner_text().strip() if cells else ""
                if not rank_text.isdigit():
                    continue
                rank = int(rank_text)

                player_id = self.match_player(full_name)
                if player_id:
                    self.save_ranking(player_id, rank, source_name, url)
                    found_count += 1
            except Exception:
                continue

        if found_count == 0:
            logger.warning(f"No players matched for {source_name}.")
        return found_count

    def scrape(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=config.USER_AGENT)
            try:
                self._scrape_url(page, self.url, "FantasyPros")
                self._scrape_url(page, self.url_sf, "FantasyPros SF")
            except Exception as e:
                logger.error(f"Playwright Error: {e}")
            finally:
                browser.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    scraper = FantasyProsRankingScraper()
    scraper.scrape()
