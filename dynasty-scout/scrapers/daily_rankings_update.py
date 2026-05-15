"""
scrapers/daily_rankings_update.py
Runs all dynasty rankings scrapers + consensus in sequence.
Designed to be run daily (via Windows Task Scheduler or cron).

Run manually:  py scrapers/daily_rankings_update.py
"""
import sys
import os
import logging
import subprocess
from datetime import datetime

# Run from the dynasty-scout directory
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_root)
if _root not in sys.path:
    sys.path.insert(0, _root)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("scrapers/rankings_update.log"),
    ],
)
logger = logging.getLogger("DailyRankings")


def run_step(label: str, func):
    logger.info(f"--- {label} ---")
    try:
        func()
        logger.info(f"  {label}: OK")
    except Exception as e:
        logger.error(f"  {label} FAILED: {e}")


def step_ktc():
    from scrapers.rankings.ktc import KTCRankingScraper
    KTCRankingScraper().scrape()


def step_fantasycalc():
    from scrapers.rankings.fantasycalc import run
    run()


def step_dynasty_nerds():
    from scrapers.rankings.dynasty_nerds import run
    run()


def step_fantasypros():
    from scrapers.rankings.fantasypros import FantasyProsRankingScraper
    FantasyProsRankingScraper().scrape()


def step_sttm():
    """sticktothemodel.com - draft board rankings (TankAthlete, PFN, TDN, Brugler, Jeremiah)"""
    from scrapers.sttm_scraper import fetch_csv, sync_rankings, RANK_CSV
    import sqlite3
    db = sqlite3.connect("dynasty_scout.db")
    db.row_factory = sqlite3.Row
    rows = fetch_csv(RANK_CSV)
    sync_rankings(db, rows)
    db.close()


def step_consensus():
    from scrapers.run_consensus import run
    run()


def main():
    logger.info(f"=== Daily Rankings Update starting at {datetime.now().strftime('%Y-%m-%d %H:%M')} ===")

    run_step("KTC (SF + 1QB)",      step_ktc)
    run_step("FantasyCalc (1QB+SF)", step_fantasycalc)
    run_step("DynastyNerds",         step_dynasty_nerds)
    run_step("FantasyPros",          step_fantasypros)
    run_step("Draft Boards (STTM)",  step_sttm)
    run_step("Consensus",            step_consensus)

    logger.info("=== Daily Rankings Update complete ===")


if __name__ == "__main__":
    main()
