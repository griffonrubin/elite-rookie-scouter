"""
run_rankings.py - Runs all ranking scrapers in sequence.
Orchestrates KTC API fallback, KTC, and the MultiRankings suite.
"""
import logging
import subprocess
import sys

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger("RankingsRunner")

def run():
    logger.info("Starting rankings scrape pipeline...")
    
    # 1. KTC API Fallback (if exists)
    try:
        from scrapers.rankings.ktc_api import KTCApiScraper
        ktc_api = KTCApiScraper()
        ktc_api.scrape()
    except Exception as e:
        pass
        
    # 2. KTC Dynasty Rankings
    try:
        logger.info("\n--- Scraping KeepTradeCut ---")
        from scrapers.rankings.ktc import KTCRankingScraper
        ktc = KTCRankingScraper()
        ktc.scrape()
    except Exception as e:
        logger.error(f"KTC scrape failed: {e}")
        
    # 3. MultiRankings (FP Devy, Nerds, etc)
    try:
        logger.info("\n--- Running MultiRankings ---")
        subprocess.run([sys.executable, "scrapers/multi_rankings.py"], check=True)
    except Exception as e:
        logger.error(f"MultiRankings failed: {e}")
        
    # 4. Consensus
    try:
        logger.info("\n--- Running Consensus ---")
        subprocess.run([sys.executable, "scrapers/run_consensus.py"], check=True)
    except Exception as e:
        logger.error(f"Consensus failed: {e}")

if __name__ == "__main__":
    run()
