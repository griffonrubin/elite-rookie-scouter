@echo off
cd /d "%~dp0"
echo Starting daily redraft update...
python -m scrapers.redraft.daily_redraft_update --ranks-only >> scrapers/redraft_update.log 2>&1
echo Done. See scrapers/redraft_update.log
