from scrapers.base_scraper import BaseRankingScraper
import logging
from scrapers import config
from scrapers.player_seed_manual import PROSPECTS

logger = logging.getLogger("ManualRanker")

class ManualRankingScraper(BaseRankingScraper):
    """
    Assigns rankings based on the manual seed list order.
    """
    def __init__(self):
        super().__init__()
        self.source_name = "DynastyScout Consensus"
        self.url = "https://dynastyscout.app" # internal

    def scrape(self):
        logger.info(f"Generating {self.source_name} rankings from seed list...")
        
        for idx, p in enumerate(PROSPECTS):
            rank = idx + 1
            slug = p['slug']
            
            if slug in self.players:
                self.save_ranking(self.players[slug], rank, self.source_name, self.url)
                
        logger.info("Manual Rankings Saved.")

if __name__ == "__main__":
    scraper = ManualRankingScraper()
    scraper.scrape()
