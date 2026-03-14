"""
run_pipeline.py - Master data pipeline orchestrator.
Runs all data population steps in the correct order.
Usage: py run_pipeline.py [--step STEP_NAME]
"""
import sys
import logging
import argparse
import subprocess
import os

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("Pipeline")

def run_step(step_name, module_path):
    """Run a pipeline step as a subprocess."""
    logger.info(f"\n{'='*60}")
    logger.info(f"STEP: {step_name}")
    logger.info(f"{'='*60}")
    
    try:
        result = subprocess.run(
            [sys.executable, module_path],
            capture_output=False,  # Show output live
            timeout=600,  # 10 min max per step
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        if result.returncode != 0:
            logger.warning(f"Step {step_name} exited with code {result.returncode}")
        else:
            logger.info(f"Step {step_name} COMPLETE")
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        logger.error(f"Step {step_name} TIMED OUT after 10 minutes")
        return False
    except Exception as e:
        logger.error(f"Step {step_name} FAILED: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Elite Rookie Scouter Data Pipeline")
    parser.add_argument("--step", choices=["school", "rankings", "stats", "age", "news", "consensus", "export", "all"], 
                       default="all", help="Which step to run (default: all)")
    parser.add_argument("--skip-slow", action="store_true", 
                       help="Skip slow scrapers (stats, age) for quick ranking/news refresh")
    args = parser.parse_args()
    
    base = os.path.dirname(os.path.abspath(__file__))
    scrapers_dir = os.path.join(base, "scrapers")
    scripts_dir = os.path.join(base, "scripts")
    
    steps = {
        "school":    os.path.join(scrapers_dir, "fix_school_data.py"),
        "rankings":  os.path.join(scrapers_dir, "run_rankings.py"),
        "consensus": os.path.join(scrapers_dir, "run_consensus.py"),
        "stats":     os.path.join(scrapers_dir, "college_stats.py"),
        "age":       os.path.join(scrapers_dir, "age_scraper.py"),
        "news":      os.path.join(scrapers_dir, "news_agent.py"),
        "export":    os.path.join(scripts_dir, "export_db_to_json.py"),
    }

    if args.step != "all":
        if args.step in steps:
            run_step(args.step, steps[args.step])
        else:
            logger.error(f"Unknown step: {args.step}")
        return

    logger.info("Starting FULL data pipeline...")
    
    # 1. Fix school data (fast, no network)
    run_step("Fix School Data", steps["school"])
    
    # 2. Scrape rankings from KTC + FantasyPros  
    run_step("Scrape Rankings", steps["rankings"])
    
    # 3. Calculate consensus from scraped rankings
    run_step("Calculate Consensus", steps["consensus"])
    
    # 4. Fetch news for all players (fast, ~5 min for 274 players)
    run_step("Fetch News (Google RSS)", steps["news"])
    
    if not args.skip_slow:
        # 5. Scrape college stats from sports-reference (slow, ~20 min)
        logger.info("NOTE: College stats scraper is slow (~20 min). Use --skip-slow to skip.")
        run_step("Scrape College Stats", steps["stats"])
        
        # 6. Populate age/DOB (can be slow due to rate limits)
        run_step("Populate Ages", steps["age"])
    
    # 7. Export DB to JSON for frontend cache
    run_step("Export to JSON", steps["export"])
    
    logger.info("\n" + "="*60)
    logger.info("DATA PIPELINE COMPLETE!")
    logger.info("="*60)
    logger.info("Refresh http://localhost:3000 to see updated data.")

if __name__ == "__main__":
    main()
