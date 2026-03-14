import time
import schedule
import subprocess
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("scheduler.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("DynastyScheduler")

def job_news():
    logger.info("Starting News Aggregation...")
    try:
        subprocess.run(["python", "-m", "scrapers.news.aggregator"], check=True)
        logger.info("News Scan Complete.")
    except Exception as e:
        logger.error(f"News Scan Failed: {e}")

def job_social():
    logger.info("Starting Social Media Scan...")
    try:
        subprocess.run(["python", "-m", "scrapers.social.social_aggregator"], check=True)
        logger.info("Social Scan Complete.")
    except Exception as e:
        logger.error(f"Social Scan Failed: {e}")

def job_rankings():
    logger.info("Updating Rankings...")
    try:
        # Run ranking scrapers here if implemented
        # subprocess.run(["python", "-m", "scrapers.rankings.fantasypros"], check=True)
        
        # Always run consensus calc after potential updates
        subprocess.run(["python", "-m", "scrapers.consensus_calculator"], check=True)
        
        # Export to JSON for frontend
        subprocess.run(["python", "scripts/export_db_to_json.py"], check=True)
        
        logger.info("Rankings & JSON Export Complete.")
    except Exception as e:
        logger.error(f"Rankings Update Failed: {e}")

def run_all():
    logger.info("--- Running All Tasks ---")
    job_news()
    job_social()
    job_rankings()
    logger.info("--- All Tasks Complete ---\n")

# Schedule
schedule.every(1).hours.do(run_all)
schedule.every(15).minutes.do(job_news) # News checks more often

if __name__ == "__main__":
    logger.info("Starting Dynasty Scout Scheduler...")
    logger.info("Press Ctrl+C to stop.")
    
    # Run once on start
    run_all()
    
    while True:
        schedule.run_pending()
        time.sleep(60)
