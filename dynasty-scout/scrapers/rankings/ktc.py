from scrapers.base_scraper import BaseRankingScraper
from playwright.sync_api import sync_playwright
import logging
import re
from scrapers import config
import time

logger = logging.getLogger("KTCScraper")

class KTCRankingScraper(BaseRankingScraper):
    """
    Source: https://keeptradecut.com/dynasty-rankings
    Filters: Rookie
    """
    def __init__(self):
        super().__init__()
        self.source_name = "KeepTradeCut"
        self.base_url = "https://keeptradecut.com/dynasty-rankings"
        # Build additional name map for fuzzy matching
        self._build_name_map()

    def _normalize_name(self, name):
        """Normalize a player name to a consistent form for matching."""
        if not name:
            return ""
        n = name.lower()
        # Remove punctuation
        n = n.replace(".", "").replace("'", "").replace("-", " ")
        # Remove suffixes
        n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', n)
        # Collapse spaces
        n = re.sub(r'\s+', ' ', n).strip()
        return n

    def _build_name_map(self):
        """Build a normalized-name → player_id map for 2026 prospects only."""
        self.cursor.execute(
            "SELECT id, slug, full_name FROM players WHERE draft_year = 2026"
        )
        rows = self.cursor.fetchall()
        self._name_map = {}
        for r in rows:
            norm = self._normalize_name(r['full_name'])
            self._name_map[norm] = r['id']
            # Also index by slug without suffixes
            slug_norm = self._normalize_name(r['slug'].replace("-", " "))
            self._name_map[slug_norm] = r['id']

    def match_player(self, name):
        """
        Match scraped name to a 2026 database player using fuzzy normalization.
        Tries exact slug, then normalized full name, then first+last name only.
        """
        # Method 1: Slug-based (existing logic)
        clean_name = name.lower().replace(".", "").replace("'", "")
        clean_name = re.sub(r'\b(jr|sr|ii|iii|iv|v)\.?\b', '', clean_name)
        clean_name = re.sub(r'\s+', ' ', clean_name).strip()
        slug = clean_name.replace(" ", "-")

        if slug in self.players:
            pid = self.players[slug]
            self.cursor.execute("SELECT draft_year FROM players WHERE id=?", (pid,))
            r = self.cursor.fetchone()
            if r and r['draft_year'] == 2026:
                return pid

        # Method 2: Normalized name map
        norm = self._normalize_name(name)
        if norm in self._name_map:
            return self._name_map[norm]

        # Method 3: First + Last name only (handles middle names or initials)
        parts = norm.split()
        if len(parts) >= 2:
            first_last = f"{parts[0]} {parts[-1]}"
            if first_last in self._name_map:
                return self._name_map[first_last]

        return None

    def scrape(self):
        url = self.base_url
        logger.info(f"Scraping {self.source_name} from {url} using JS evaluation...")
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=config.USER_AGENT)
            
            try:
                page.goto(url, timeout=60000)
                
                # Wait a bit for scripts to initialize if needed
                # page.wait_for_load_state("networkidle") 
                
                # Extract the global playersArray variable
                try:
                    players_data = page.evaluate("playersArray")
                except Exception as e:
                    logger.error(f"Could not evaluate playersArray: {e}")
                    players_data = []

                logger.info(f"Found {len(players_data)} players in JSON payload.")
                
                matched_buffer_sf = []
                matched_buffer_1qb = []
                found_count = 0
                for item in players_data:
                    try:
                        full_name = item.get('playerName')
                        if not full_name:
                            continue

                        sf_values  = item.get('superflexValues', {}) or {}
                        qb1_values = item.get('oneQBValues', {}) or {}

                        sf_rank  = sf_values.get('rank')
                        sf_value = sf_values.get('value')
                        qb1_rank  = qb1_values.get('rank')
                        qb1_value = qb1_values.get('value')

                        if sf_rank is None and qb1_rank is None:
                            continue

                        player_id = self.match_player(full_name)

                        if player_id:
                            if sf_rank is not None and not any(x['pid'] == player_id for x in matched_buffer_sf):
                                matched_buffer_sf.append({'pid': player_id, 'raw': int(sf_rank), 'name': full_name, 'val': int(sf_value) if sf_value else None})
                            if qb1_rank is not None and not any(x['pid'] == player_id for x in matched_buffer_1qb):
                                matched_buffer_1qb.append({'pid': player_id, 'raw': int(qb1_rank), 'name': full_name, 'val': int(qb1_value) if qb1_value else None})

                    except Exception as e:
                        continue

                # Sort by raw KTC rank and save as relative 1..N for each format
                matched_buffer_sf.sort(key=lambda x: x['raw'])
                for idx, item in enumerate(matched_buffer_sf, 1):
                    self.save_ranking(item['pid'], idx, self.source_name, url, value=item['val'])
                    found_count += 1
                    logger.info(f"[{self.source_name} SF] 2026 Relative #{idx} -> {item['name']} (Raw #{item['raw']})")

                matched_buffer_1qb.sort(key=lambda x: x['raw'])
                for idx, item in enumerate(matched_buffer_1qb, 1):
                    self.save_ranking(item['pid'], idx, 'KeepTradeCut 1QB', url, value=item['val'])
                    logger.info(f"[KeepTradeCut 1QB] 2026 Relative #{idx} -> {item['name']} (Raw #{item['raw']})")

                if found_count == 0:
                    logger.warning("No players matched from JSON data.")

                if found_count == 0:
                    logger.warning("No players matched from JSON data.")

            except Exception as e:
                logger.error(f"KTC Scrape Error: {e}")
            finally:
                browser.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    scraper = KTCRankingScraper()
    scraper.scrape()
