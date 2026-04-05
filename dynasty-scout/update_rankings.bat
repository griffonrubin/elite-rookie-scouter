@echo off
cd /d "%~dp0"
echo Starting daily rankings update...
python scrapers/daily_rankings_update.py >> scrapers/rankings_update.log 2>&1
