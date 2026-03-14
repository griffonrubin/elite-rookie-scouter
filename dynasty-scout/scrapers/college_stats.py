import sqlite3
import requests
import json
import os
import time
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
MISSING_LOG = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'missing_stats_log.json')

ESPN_V3_URL = "https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/{espn_id}/stats?region=us&lang=en&contentorigin=espn"
ESPN_V2_GP_URL = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/{year}/types/2/athletes/{espn_id}/statistics"


def fetch_espn_stats(espn_id):
    """Fetch full career stats from ESPN V3. Returns all seasons at once."""
    url = ESPN_V3_URL.format(espn_id=espn_id)
    r = requests.get(url, timeout=15)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def fetch_espn_games_played(espn_id, year):
    """Fetch games played for a specific season from ESPN V2. Returns None on failure."""
    url = ESPN_V2_GP_URL.format(espn_id=espn_id, year=year)
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return None
        for cat in r.json().get('splits', {}).get('categories', []):
            if cat.get('name') == 'general':
                for stat in cat.get('stats', []):
                    if stat.get('name') == 'gamesPlayed':
                        val = stat.get('value')
                        return int(val) if val is not None and int(val) > 0 else None
    except Exception as e:
        print(f"    [V2 GP error] year={year} espn_id={espn_id}: {e}")
    return None


def parse_v3_stats(data):
    """
    Parse ESPN V3 response into a dict of {year: {school, stats...}}.
    Handles multi-school careers via teamSlug lookup.
    """
    if not data or not data.get('categories'):
        return {}

    # Build teams map keyed by both slug and numeric ID (as string) for safe lookup
    teams_by_slug = {}
    teams_by_id = {}
    for team_key, tm in data.get('teams', {}).items():
        teams_by_slug[team_key] = tm
        tid = tm.get('id', '')
        if tid:
            teams_by_id[str(tid)] = tm

    stat_mapping = {
        'rushing': {
            'rushingAttempts': 'rush_attempts',
            'rushingYards': 'rush_yards',
            'rushingTouchdowns': 'rush_tds',
        },
        'receiving': {
            'receptions': 'receptions',
            'receivingYards': 'rec_yards',
            'receivingTouchdowns': 'rec_tds',
            # targets occasionally appear in receiving category
            'targets': 'targets',
        },
        'passing': {
            # ESPN V3 returns separate fields (not compound "C/A") for most players
            'completions': 'completions',
            'passingAttempts': 'pass_attempts',
            # Legacy compound format e.g. "217/330" — kept as fallback
            'completionAttempts': ('completions', 'pass_attempts'),
            'passingYards': 'pass_yards',
            'passingTouchdowns': 'pass_tds',
            'interceptions': 'interceptions',
        },
    }

    seasons = {}

    for cat in data['categories']:
        cat_name = cat['name']
        if cat_name not in stat_mapping:
            continue

        names = cat.get('names', [])
        mapping = stat_mapping[cat_name]

        for stat_row in cat.get('statistics', []):
            yr = stat_row.get('season', {}).get('year')
            if not yr:
                continue

            # Resolve school name: prefer teamSlug lookup, fall back to teamId string
            team_slug = stat_row.get('teamSlug', '')
            team_id_str = str(stat_row.get('teamId', ''))
            tm_obj = teams_by_slug.get(team_slug) or teams_by_id.get(team_id_str) or {}
            school_name = tm_obj.get('location', '') or tm_obj.get('displayName', '') or 'Unknown'

            if yr not in seasons:
                seasons[yr] = {
                    'school': school_name,
                    'espn_school_id': team_id_str,
                    'games_played': None,
                    'pass_attempts': 0, 'completions': 0, 'pass_yards': 0,
                    'pass_tds': 0, 'interceptions': 0,
                    'rush_attempts': 0, 'rush_yards': 0, 'rush_tds': 0,
                    'receptions': 0, 'rec_yards': 0, 'rec_tds': 0,
                }
            elif school_name != 'Unknown' and seasons[yr]['school'] == 'Unknown':
                # Update school if we had Unknown before
                seasons[yr]['school'] = school_name
                seasons[yr]['espn_school_id'] = team_id_str

            stats_arr = stat_row.get('stats', [])
            for i, val_str in enumerate(stats_arr):
                if i >= len(names):
                    continue
                field_name = names[i]
                target = mapping.get(field_name)
                if not target:
                    continue

                if isinstance(target, tuple):
                    # compound stat like completionAttempts "10/20" or "10-20"
                    if isinstance(val_str, str) and ('/' in val_str or '-' in val_str):
                        sep = '/' if '/' in val_str else '-'
                        parts = val_str.split(sep)
                        if len(parts) == 2:
                            try:
                                seasons[yr][target[0]] = int(parts[0])
                                seasons[yr][target[1]] = int(parts[1])
                            except ValueError:
                                pass
                else:
                    try:
                        if isinstance(val_str, str):
                            val_str = val_str.replace(',', '')
                        num = float(val_str) if '.' in str(val_str) else int(val_str)
                        seasons[yr][target] = num
                    except (ValueError, TypeError):
                        pass

    return seasons


def run_scraper(dry_run=False, target_slug=None):
    if dry_run:
        print("DRY RUN MODE: No database changes will be made.")

    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    cur = conn.cursor()

    # Log scraper run start
    cur.execute('''
        INSERT INTO scraper_runs (scraper_name, started_at, status, total_players_processed, total_records_upserted, total_errors)
        VALUES ('college_stats_v3', CURRENT_TIMESTAMP, 'running', 0, 0, 0)
    ''')
    run_id = cur.lastrowid

    # Get players — optionally filter to one player for debugging
    if target_slug:
        cur.execute("SELECT id, full_name, espn_college_id FROM players WHERE slug = ?", (target_slug,))
    else:
        cur.execute("SELECT id, full_name, espn_college_id FROM players WHERE draft_year = 2026")
    players = cur.fetchall()

    processed = 0
    upserted = 0
    errors = 0
    missing_log = []

    print(f"Starting college stats scrape for {len(players)} players...")

    for p_id, p_name, espn_id in players:
        processed += 1
        if processed % 10 == 0:
            print(f"  Progress: {processed}/{len(players)}...")

        if not espn_id:
            cur.execute(
                "INSERT OR IGNORE INTO missing_stats_log (player_id, source_tried, reason) VALUES (?, ?, ?)",
                (p_id, 'ESPN', 'No ESPN ID assigned')
            )
            missing_log.append({'player': p_name, 'reason': 'No ESPN ID'})
            continue

        try:
            time.sleep(0.4)

            data = fetch_espn_stats(espn_id)
            if not data or not data.get('categories'):
                cur.execute(
                    "INSERT OR IGNORE INTO missing_stats_log (player_id, source_tried, reason) VALUES (?, ?, ?)",
                    (p_id, 'ESPN', 'V3 API returned no categories')
                )
                missing_log.append({'player': p_name, 'reason': 'No categories in ESPN V3'})
                print(f"  [{p_name}] No V3 stats available")
                continue

            seasons = parse_v3_stats(data)
            if not seasons:
                print(f"  [{p_name}] Parsed 0 seasons from V3")
                continue

            # Fetch GP from V2 for each season found
            for yr, s_obj in seasons.items():
                time.sleep(0.15)
                gp = fetch_espn_games_played(espn_id, yr)
                if gp is not None and gp > 0:
                    s_obj['games_played'] = gp
                else:
                    # Keep None — do not overwrite existing good GP with null
                    pass

            print(f"  [{p_name}] {len(seasons)} seasons: {sorted(seasons.keys())} | GP: {[seasons[y]['games_played'] for y in sorted(seasons.keys())]}")

            if dry_run:
                continue

            for yr, sdata in seasons.items():
                school = sdata['school']
                gp = sdata['games_played']

                # 1. Upsert player_transfers
                cur.execute('''
                    INSERT INTO player_transfers (player_id, season, school, conference, espn_school_id)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(player_id, season) DO UPDATE SET
                      school = CASE WHEN excluded.school != 'Unknown' THEN excluded.school ELSE player_transfers.school END,
                      espn_school_id = CASE WHEN excluded.espn_school_id IS NOT NULL THEN excluded.espn_school_id ELSE player_transfers.espn_school_id END
                ''', (p_id, yr, school, '', sdata['espn_school_id']))

                # 2. Upsert college_stats — never overwrite with zero/null when existing data is good
                cur.execute('''
                    INSERT INTO college_stats
                    (player_id, season, school, games_played,
                     pass_attempts, completions, pass_yards, pass_tds, interceptions,
                     rush_attempts, rush_yards, rush_tds,
                     receptions, rec_yards, rec_tds)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(player_id, season, school) DO UPDATE SET
                      games_played = CASE
                        WHEN excluded.games_played IS NOT NULL AND excluded.games_played > 0
                        THEN excluded.games_played
                        ELSE college_stats.games_played
                      END,
                      pass_attempts = CASE WHEN excluded.pass_attempts > 0 THEN excluded.pass_attempts ELSE college_stats.pass_attempts END,
                      completions   = CASE WHEN excluded.completions > 0   THEN excluded.completions   ELSE college_stats.completions END,
                      pass_yards    = CASE WHEN excluded.pass_yards > 0    THEN excluded.pass_yards    ELSE college_stats.pass_yards END,
                      pass_tds      = CASE WHEN excluded.pass_tds > 0      THEN excluded.pass_tds      ELSE college_stats.pass_tds END,
                      interceptions = CASE WHEN excluded.interceptions > 0 THEN excluded.interceptions ELSE college_stats.interceptions END,
                      rush_attempts = CASE WHEN excluded.rush_attempts > 0 THEN excluded.rush_attempts ELSE college_stats.rush_attempts END,
                      rush_yards    = CASE WHEN excluded.rush_yards > 0    THEN excluded.rush_yards    ELSE college_stats.rush_yards END,
                      rush_tds      = CASE WHEN excluded.rush_tds > 0      THEN excluded.rush_tds      ELSE college_stats.rush_tds END,
                      receptions    = CASE WHEN excluded.receptions > 0    THEN excluded.receptions    ELSE college_stats.receptions END,
                      rec_yards     = CASE WHEN excluded.rec_yards > 0     THEN excluded.rec_yards     ELSE college_stats.rec_yards END,
                      rec_tds       = CASE WHEN excluded.rec_tds > 0       THEN excluded.rec_tds       ELSE college_stats.rec_tds END
                ''', (
                    p_id, yr, school, gp,
                    sdata['pass_attempts'], sdata['completions'], sdata['pass_yards'],
                    sdata['pass_tds'], sdata['interceptions'],
                    sdata['rush_attempts'], sdata['rush_yards'], sdata['rush_tds'],
                    sdata['receptions'], sdata['rec_yards'], sdata['rec_tds']
                ))
                upserted += 1

            conn.commit()

        except Exception as e:
            print(f"  ERROR [{p_name}] ({espn_id}): {e}")
            import traceback; traceback.print_exc()
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
    target = None
    for arg in sys.argv[1:]:
        if not arg.startswith('--'):
            target = arg
    run_scraper(dry_run=is_dry, target_slug=target)
