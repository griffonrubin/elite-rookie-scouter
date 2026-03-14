import sqlite3
import requests
import json
import os
import time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
MISSING_LOG = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'missing_stats_log.json')

import sys

def fetch_espn_stats(espn_id, year=None):
    url = f"https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/{espn_id}/stats?region=us&lang=en&contentorigin=espn"
    if year: url += f"&season={year}"
    r = requests.get(url, timeout=10)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()

def fetch_espn_games_played(espn_id, year):
    try:
        # V2 API contains the explicit 'general' block with gamesPlayed for CFB
        url = f"https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/{year}/types/2/athletes/{espn_id}/statistics"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            for cat in r.json().get('splits', {}).get('categories', []):
                if cat.get('name') == 'general':
                    for stat in cat.get('stats', []):
                        if stat.get('name') == 'gamesPlayed':
                            return int(stat.get('value', 0))
    except:
        pass
    return 0

def run_scraper(dry_run=False):
    if dry_run:
        print("DRY RUN MODE: No database changes will be made.")
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    cur = conn.cursor()
    
    # 1. Log scraper run start
    cur.execute('''
        INSERT INTO scraper_runs (scraper_name, started_at, status, total_players_processed, total_records_upserted, total_errors)
        VALUES ('college_stats_v3', CURRENT_TIMESTAMP, 'running', 0, 0, 0)
    ''')
    run_id = cur.lastrowid
    
    # 2. Get players
    cur.execute("SELECT id, full_name, espn_college_id, cfbref_id FROM players")
    players = cur.fetchall()
    
    processed = 0
    upserted = 0
    errors = 0
    missing_log = []
    
    print(f"Starting college stats scrape for {len(players)} players...")
    
    for p_id, p_name, espn_id, cfbref_id in players:
        processed += 1
        if processed % 10 == 0:
            print(f"Processed {processed}/{len(players)}...")
            
        if not espn_id:
            # For now, if no ESPN ID, log it (CFBRef fallback is planned if strictly necessary)
            cur.execute("INSERT INTO missing_stats_log (player_id, source_tried, reason) VALUES (?, ?, ?)", 
                        (p_id, 'ESPN', 'No ESPN ID assigned'))
            missing_log.append({'player': p_name, 'reason': 'No ESPN ID'})
            continue
            
        try:
            time.sleep(0.3)
            
            found_seasons = []
            wrote_seasons = []
            
            for scrape_yr in range(2021, 2026):
                data = fetch_espn_stats(espn_id, year=scrape_yr)
                
                if not data or not data.get('categories'):
                    continue
                    
                teams_map = {team_k: tm for team_k, tm in data.get('teams', {}).items()}
                
                seasons = {}
            
                # Map ESPN labels to DB columns
                stat_mapping = {
                    'passing': {
                        'completionAttempts': ('completions', 'pass_attempts'), # Will be split by parser "18/30"
                        'passingYards': 'pass_yards',
                        'passingTouchdowns': 'pass_tds',
                        'interceptions': 'interceptions'
                    },
                    'rushing': {
                        'rushingAttempts': 'rush_attempts',
                        'rushingYards': 'rush_yards',
                        'rushingTouchdowns': 'rush_tds'
                    },
                    'receiving': {
                        'receptions': 'receptions',
                        'receivingYards': 'rec_yards',
                        'receivingTouchdowns': 'rec_tds'
                    }
                }
                
                # General category usually has Games Played
                if 'general' not in stat_mapping:
                    stat_mapping['general'] = {'gamesPlayed': 'games_played'}
                    
                for cat in data['categories']:
                    cat_name = cat['name']
                    names = cat.get('names', [])
                    for stat_row in cat.get('statistics', []):
                        yr = stat_row['season']['year']
                        tm_id = stat_row.get('teamId')
                        
                        if yr not in seasons:
                            tm_obj = teams_map.get(tm_id, {})
                            # fallback locations if needed
                            school_name = tm_obj.get('location', '')
                            if not school_name:
                                # Try displayName without mascot
                                school_name = tm_obj.get('displayName', '').replace(' ' + tm_obj.get('name', ''), '')
                                
                            # Edge case for transfers where tm_id might be missing but we know it's a real season
                            if not school_name: school_name = 'Unknown'
                                
                            seasons[yr] = {
                                'school': school_name,
                                'espn_school_id': tm_id,
                                'conference': '', # Optional, not always in standard team payload
                                'games_played': 0,
                                'pass_attempts': 0, 'completions': 0, 'pass_yards': 0, 'pass_tds': 0, 'interceptions': 0,
                                'rush_attempts': 0, 'rush_yards': 0, 'rush_tds': 0,
                                'receptions': 0, 'rec_yards': 0, 'rec_tds': 0
                            }
                        
                        # Parse stat column values
                        st_arr = stat_row.get('stats', [])
                        for i, val_str in enumerate(st_arr):
                            if i >= len(names): continue
                            field_api_name = names[i]
                            
                            target_schema = stat_mapping.get(cat_name, {}).get(field_api_name)
                            if target_schema:
                                # Parse value
                                if isinstance(target_schema, tuple):
                                    # It's a compound stat like Cmp/Att: "10/20"
                                    if isinstance(val_str, str) and '/' in val_str:
                                        cmp, att = val_str.split('-') if '-' in val_str else val_str.split('/')
                                        seasons[yr][target_schema[0]] = int(cmp)
                                        seasons[yr][target_schema[1]] = int(att)
                                else:
                                    if isinstance(val_str, str):
                                        v_clean = val_str.replace(',', '')
                                        try:
                                            num = float(v_clean) if '.' in v_clean else int(v_clean)
                                        except:
                                            num = 0
                                    else:
                                        num = val_str or 0
                                    seasons[yr][target_schema] = num
    
                    # Out of band fetch for games_played for each season
                    for yr_key, s_obj in seasons.items():
                        gp = fetch_espn_games_played(espn_id, yr_key)
                        if gp and gp > 0:
                            s_obj['games_played'] = gp
    
                    # Upsert seasons
                    for yr, sdata in seasons.items():
                        if yr not in found_seasons:
                            found_seasons.append(yr)
                        
                        if dry_run:
                            if yr not in wrote_seasons: wrote_seasons.append(yr)
                            continue
                            
                        # 1. Player transfers
                        cur.execute('''
                            INSERT INTO player_transfers (player_id, season, school, conference, espn_school_id)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(player_id, season) DO UPDATE SET
                              school = excluded.school,
                              conference = excluded.conference,
                              espn_school_id = excluded.espn_school_id
                        ''', (p_id, yr, sdata['school'], sdata['conference'], sdata['espn_school_id']))
                        
                        # 2. College Stats - Upsert with null protection
                        cur.execute('''
                            INSERT INTO college_stats 
                            (player_id, season, school, games_played, pass_attempts, completions, pass_yards, pass_tds, interceptions, 
                             rush_attempts, rush_yards, rush_tds, receptions, rec_yards, rec_tds)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(player_id, season, school) DO UPDATE SET
                              games_played = CASE WHEN excluded.games_played IS NOT NULL THEN excluded.games_played ELSE college_stats.games_played END,
                              pass_attempts = CASE WHEN excluded.pass_attempts IS NOT NULL THEN excluded.pass_attempts ELSE college_stats.pass_attempts END,
                              completions = CASE WHEN excluded.completions IS NOT NULL THEN excluded.completions ELSE college_stats.completions END,
                              pass_yards = CASE WHEN excluded.pass_yards IS NOT NULL THEN excluded.pass_yards ELSE college_stats.pass_yards END,
                              pass_tds = CASE WHEN excluded.pass_tds IS NOT NULL THEN excluded.pass_tds ELSE college_stats.pass_tds END,
                              interceptions = CASE WHEN excluded.interceptions IS NOT NULL THEN excluded.interceptions ELSE college_stats.interceptions END,
                              rush_attempts = CASE WHEN excluded.rush_attempts IS NOT NULL THEN excluded.rush_attempts ELSE college_stats.rush_attempts END,
                              rush_yards = CASE WHEN excluded.rush_yards IS NOT NULL THEN excluded.rush_yards ELSE college_stats.rush_yards END,
                              rush_tds = CASE WHEN excluded.rush_tds IS NOT NULL THEN excluded.rush_tds ELSE college_stats.rush_tds END,
                              receptions = CASE WHEN excluded.receptions IS NOT NULL THEN excluded.receptions ELSE college_stats.receptions END,
                              rec_yards = CASE WHEN excluded.rec_yards IS NOT NULL THEN excluded.rec_yards ELSE college_stats.rec_yards END,
                              rec_tds = CASE WHEN excluded.rec_tds IS NOT NULL THEN excluded.rec_tds ELSE college_stats.rec_tds END
                        ''', (p_id, yr, sdata['school'], sdata['games_played'], sdata['pass_attempts'], sdata['completions'],
                              sdata['pass_yards'], sdata['pass_tds'], sdata['interceptions'], 
                              sdata['rush_attempts'], sdata['rush_yards'], sdata['rush_tds'], 
                              sdata['receptions'], sdata['rec_yards'], sdata['rec_tds']))
                        
                        if yr not in wrote_seasons: wrote_seasons.append(yr)
                        upserted += 1

            if not found_seasons and not dry_run:
                cur.execute("INSERT INTO missing_stats_log (player_id, source_tried, reason) VALUES (?, ?, ?)", 
                            (p_id, 'ESPN', 'API returned no valid categories for 2021-2025'))
                missing_log.append({'player': p_name, 'reason': 'No categories in ESPN API'})
                
            print(f"[{p_name}] ESPN returned {len(found_seasons)} seasons ({', '.join(map(str, sorted(found_seasons)))})")
            print(f"[{p_name}] Wrote {len(wrote_seasons)} rows to college_stats")
            print(f"[{p_name}] Wrote {len(wrote_seasons)} rows to player_transfers")

        except Exception as e:
            print(f"Error processing {p_name} ({espn_id}): {e}")
            errors += 1
            
    # Mark run complete
    cur.execute('''
        UPDATE scraper_runs 
        SET completed_at = CURRENT_TIMESTAMP, status = 'completed', 
            total_players_processed = ?, total_records_upserted = ?, total_errors = ?
        WHERE id = ?
    ''', (processed, upserted, errors, run_id))
    
    if not dry_run:
        conn.commit()
    conn.close()
    
    with open(MISSING_LOG, 'w') as f:
        json.dump(missing_log, f, indent=2)

    print(f"\nStats Scrape Complete.")
    print(f"Players Processed: {processed}")
    print(f"Rows Upserted:     {upserted}")
    print(f"Errors:            {errors}")

if __name__ == "__main__":
    is_dry = '--dry-run' in sys.argv
    run_scraper(dry_run=is_dry)
