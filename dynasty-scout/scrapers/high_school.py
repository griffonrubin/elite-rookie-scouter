"""
high_school.py
Populates high_school_stats table with career high school stats from MaxPreps.

Phase 1: Discover MaxPreps stats URLs via DuckDuckGo search
Phase 2: Fetch MaxPreps stats pages and parse __NEXT_DATA__ JSON
Phase 3: Upsert career stats into SQLite

Run: python scrapers/high_school.py
     python scrapers/high_school.py --scrape-only   (skip URL discovery, use cached URLs)
     python scrapers/high_school.py --discover-only  (only find URLs, don't scrape)
"""

import sqlite3
import requests
import time
import os
import re
import json
import sys
from pathlib import Path

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
URLS_FILE = os.path.join(os.path.dirname(__file__), 'maxpreps_urls.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}


# ── Phase 1: URL Discovery ────────────────────────────────────────────────

def discover_maxpreps_urls(players):
    """Search DuckDuckGo for MaxPreps stats URLs for each player."""
    from duckduckgo_search import DDGS

    url_map = load_url_cache()
    found = sum(1 for v in url_map.values() if v)
    print(f"URL cache: {found} URLs already discovered, {len(players)} total players")

    ddgs = DDGS()
    new_found = 0
    skipped = 0

    for i, player in enumerate(players):
        pid = str(player['id'])
        name = player['full_name']
        state = player.get('state', '') or ''
        city = player.get('city', '') or ''

        # Skip if already have a URL
        if pid in url_map and url_map[pid]:
            skipped += 1
            continue

        if i > 0 and i % 20 == 0:
            print(f"  Progress: {i}/{len(players)} ({new_found} new URLs found)")
            save_url_cache(url_map)

        # Build search query
        query = f'"{name}" maxpreps football stats'
        if state:
            query += f' {state}'

        try:
            results = ddgs.text(query, max_results=8)
            mp_url = None
            for r in results:
                href = r.get('href', '')
                # Prefer stats URL, then career home
                if 'maxpreps.com' in href and '/athletes/' in href:
                    if '/football/stats/' in href:
                        mp_url = href
                        break
                    elif not mp_url:
                        mp_url = href

            if mp_url:
                # Ensure we have the stats URL
                if '/football/stats/' not in mp_url:
                    # Convert career home URL to stats URL
                    # Pattern: .../athletes/name/?careerid=X -> .../athletes/name/football/stats/?careerid=X
                    if '?' in mp_url:
                        base, qs = mp_url.split('?', 1)
                        base = base.rstrip('/')
                        # Check if we need to add /football/stats/
                        if not base.endswith('/football/stats'):
                            # Remove trailing segments that aren't the athlete name
                            if '/bio' in base or '/media' in base:
                                base = re.sub(r'/(bio|media(/.*)?)', '', base)
                            mp_url = f"{base}/football/stats/?{qs}"
                    else:
                        mp_url = mp_url.rstrip('/') + '/football/stats/'

                url_map[pid] = mp_url
                new_found += 1
                print(f"  [{name}] Found: {mp_url[:80]}...")
            else:
                url_map[pid] = None
                print(f"  [{name}] Not found on MaxPreps")

        except Exception as e:
            print(f"  [{name}] Search error: {e}")
            url_map[pid] = None

        time.sleep(1.5)  # Rate limit

    save_url_cache(url_map)
    total_found = sum(1 for v in url_map.values() if v)
    print(f"\nURL discovery complete: {total_found}/{len(players)} players have MaxPreps URLs ({new_found} new)")
    return url_map


def load_url_cache():
    """Load cached MaxPreps URLs from JSON file."""
    if os.path.exists(URLS_FILE):
        with open(URLS_FILE, 'r') as f:
            return json.load(f)
    return {}


def save_url_cache(url_map):
    """Save MaxPreps URLs to JSON file."""
    with open(URLS_FILE, 'w') as f:
        json.dump(url_map, f, indent=2)


# ── Phase 2: Stats Scraping ───────────────────────────────────────────────

def fetch_maxpreps_stats(url, player_name):
    """Fetch MaxPreps stats page and parse __NEXT_DATA__ for career stats."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            print(f"    HTTP {r.status_code} for {player_name}")
            return None

        if '__NEXT_DATA__' not in r.text:
            print(f"    No __NEXT_DATA__ for {player_name}")
            return None

        # Parse __NEXT_DATA__ JSON
        start = r.text.index('__NEXT_DATA__')
        tag_start = r.text.rfind('<script', 0, start)
        tag_end = r.text.index('</script>', start)
        script_content = r.text[r.text.index('>', tag_start) + 1:tag_end]
        data = json.loads(script_content)

        pp = data.get('props', {}).get('pageProps', {})
        if not pp:
            return None

        # Check if stats are available
        cda = pp.get('careerDataAvailability', {})
        has_stats = cda.get('hasStats', False)

        result = {
            'high_school': extract_school_name(pp, url),
            'games': None,
            'pass_yards': None, 'pass_tds': None,
            'rush_yards': None, 'rush_tds': None,
            'rec_yards': None, 'rec_tds': None,
            'receptions': None,
            'interceptions': None,
            'fumbles': None,
            'total_yards': None, 'total_tds': None,
        }

        if not has_stats:
            # Still return school name even without stats
            if result['high_school']:
                return result
            return None

        scp = pp.get('statsCardProps', {})
        if not scp:
            return result

        # Method 1: Extract from featuredStatsHeaderData (pre-computed career totals)
        fsh = scp.get('featuredStatsHeaderData', {})
        featured_stats = {}
        for stat in fsh.get('stats', []):
            featured_stats[stat['name']] = stat.get('value', '')

        # Map featured stats to our fields
        if featured_stats.get('PassingYards'):
            result['pass_yards'] = safe_int(featured_stats['PassingYards'])
        if featured_stats.get('PassingTDNum'):
            result['pass_tds'] = safe_int(featured_stats['PassingTDNum'])
        if featured_stats.get('RushingYards'):
            result['rush_yards'] = safe_int(featured_stats['RushingYards'])
        if featured_stats.get('RushingTDNum'):
            result['rush_tds'] = safe_int(featured_stats['RushingTDNum'])
        if featured_stats.get('ReceivingYards'):
            result['rec_yards'] = safe_int(featured_stats['ReceivingYards'])
        if featured_stats.get('ReceivingTDNum'):
            result['rec_tds'] = safe_int(featured_stats['ReceivingTDNum'])
        if featured_stats.get('ReceivingNum'):
            result['receptions'] = safe_int(featured_stats['ReceivingNum'])
        if featured_stats.get('TotalTDNum'):
            result['total_tds'] = safe_int(featured_stats['TotalTDNum'])
        if featured_stats.get('TotalYards'):
            result['total_yards'] = safe_int(featured_stats['TotalYards'])
        if featured_stats.get('INTs'):
            result['interceptions'] = safe_int(featured_stats['INTs'])

        # Method 2: Supplement from careerRollup (season-by-season data)
        cr = scp.get('careerRollup', {})
        career_totals = compute_career_totals(cr)

        # Fill in anything the featured stats didn't have
        for key in ['pass_yards', 'pass_tds', 'rush_yards', 'rush_tds',
                     'rec_yards', 'rec_tds', 'receptions', 'interceptions',
                     'total_yards', 'total_tds', 'games', 'fumbles']:
            if result.get(key) is None and career_totals.get(key) is not None:
                result[key] = career_totals[key]

        return result

    except Exception as e:
        print(f"    Error parsing {player_name}: {e}")
        return None


def extract_school_name(page_props, url):
    """Extract high school name from MaxPreps page data or URL."""
    # Try from breadcrumb data
    breadcrumbs = page_props.get('breadcrumbListData', {})
    items = breadcrumbs.get('items', [])
    for item in items:
        name = item.get('name', '')
        # School names typically come after the state/city in breadcrumbs
        if 'Football' not in name and 'MaxPreps' not in name and 'Stats' not in name:
            if any(c.isupper() for c in name) and len(name) > 3:
                # This might be the school - check if it looks like a school name
                pass

    # Try from URL path
    # Pattern: /state/city/school-slug/athletes/...
    match = re.search(r'maxpreps\.com/\w+/[\w-]+/([\w-]+)/athletes/', url)
    if match:
        school_slug = match.group(1)
        # Convert slug to name: "christian-brothers-cadets" -> "Christian Brothers"
        # Remove common suffixes
        suffixes = ['eagles', 'tigers', 'panthers', 'warriors', 'bulldogs', 'bears',
                    'lions', 'wildcats', 'knights', 'falcons', 'hawks', 'cougars',
                    'mustangs', 'raiders', 'rams', 'rockets', 'saints', 'wolves',
                    'hornets', 'jaguars', 'spartans', 'trojans', 'cardinals',
                    'cavaliers', 'chiefs', 'colts', 'crusaders', 'demons', 'devils',
                    'dolphins', 'dons', 'dragons', 'friars', 'gators', 'generals',
                    'giants', 'grizzlies', 'huskies', 'indians', 'rebels', 'redhawks',
                    'royals', 'cadets', 'pirates', 'broncos', 'chargers', 'blazers',
                    'ascenders', 'bobcats', 'braves', 'buccaneers', 'cobras',
                    'coyotes', 'explorers', 'flyers', 'foxes', 'greyhounds',
                    'hurricanes', 'leopards', 'longhorns', 'mavericks', 'monarchs',
                    'owls', 'patriots', 'pelicans', 'pioneers', 'stallions',
                    'stingrays', 'storm', 'thunderbolts', 'titans', 'vikings',
                    'volunteers', 'yellowjackets', 'tornadoes', 'senators', 'aggies']
        parts = school_slug.split('-')
        # Remove mascot (last word if it's a known mascot)
        if len(parts) > 1 and parts[-1].lower() in suffixes:
            parts = parts[:-1]
        school_name = ' '.join(p.capitalize() for p in parts)
        return school_name

    # Try from careerContext
    cc = page_props.get('careerContext', {}).get('careerData', {})
    # Sometimes the career context has team info

    # Try from page title
    title = page_props.get('pageTitle', '')
    if title:
        # Pattern: "Player Name's School Name Football Stats"
        match = re.search(r"'s\s+(.+?)\s+Football\s+Stats", title)
        if match:
            return match.group(1).strip()
        # Pattern: "Player Name's School Name Career Home"
        match = re.search(r"'s\s+(.+?)\s+Career\s+Home", title)
        if match:
            return match.group(1).strip()

    return None


def compute_career_totals(career_rollup):
    """Sum season stats from careerRollup to get career totals."""
    totals = {
        'games': 0, 'pass_yards': 0, 'pass_tds': 0,
        'rush_yards': 0, 'rush_tds': 0,
        'rec_yards': 0, 'rec_tds': 0, 'receptions': 0,
        'interceptions': 0, 'fumbles': 0,
        'total_yards': 0, 'total_tds': 0,
    }
    has_data = {k: False for k in totals}

    # Track which seasons we've already counted GP for
    gp_seasons = set()

    for group in career_rollup.get('groups', []):
        group_name = group.get('name', '')
        for subgroup in group.get('subgroups', []):
            sg_name = subgroup.get('name', '')

            for season_entry in subgroup.get('stats', []):
                year = season_entry.get('year', '')
                stats = {s['name']: s.get('value', '') for s in season_entry.get('stats', [])}

                # Games played (only count once per season)
                gp = safe_int(stats.get('GamesPlayed'))
                season_key = f"{year}_{season_entry.get('classYear', '')}"
                if gp and season_key not in gp_seasons:
                    totals['games'] += gp
                    has_data['games'] = True
                    gp_seasons.add(season_key)

                # Passing stats
                if sg_name == 'Passing':
                    val = safe_int(stats.get('PassingYards'))
                    if val: totals['pass_yards'] += val; has_data['pass_yards'] = True
                    # PassingTDs might be named differently
                    val = safe_int(stats.get('PassingTDNum', stats.get('PassingTD')))
                    if val: totals['pass_tds'] += val; has_data['pass_tds'] = True
                    val = safe_int(stats.get('INTs', stats.get('PassingINTs')))
                    if val: totals['interceptions'] += val; has_data['interceptions'] = True

                # Rushing stats
                if sg_name == 'Rushing':
                    val = safe_int(stats.get('RushingYards'))
                    if val: totals['rush_yards'] += val; has_data['rush_yards'] = True
                    val = safe_int(stats.get('RushingTDNum', stats.get('RushingTD')))
                    if val: totals['rush_tds'] += val; has_data['rush_tds'] = True
                    val = safe_int(stats.get('FumblesLost'))
                    if val: totals['fumbles'] += val; has_data['fumbles'] = True

                # Receiving stats
                if sg_name == 'Receiving':
                    val = safe_int(stats.get('ReceivingNum'))
                    if val: totals['receptions'] += val; has_data['receptions'] = True
                    val = safe_int(stats.get('ReceivingYards'))
                    if val: totals['rec_yards'] += val; has_data['rec_yards'] = True

                # Defensive stats
                if sg_name == 'Defensive Statistics':
                    val = safe_int(stats.get('INTs'))
                    if val: totals['interceptions'] += val; has_data['interceptions'] = True

                # Touchdowns subgroup (most reliable for TDs)
                if sg_name == 'Touchdowns':
                    val = safe_int(stats.get('RushingTDNum'))
                    if val and not has_data['rush_tds']:
                        totals['rush_tds'] += val; has_data['rush_tds'] = True
                    val = safe_int(stats.get('ReceivingTDNum'))
                    if val and not has_data['rec_tds']:
                        totals['rec_tds'] += val; has_data['rec_tds'] = True

                # Points/Scoring
                if sg_name == 'Points':
                    val = safe_int(stats.get('TotalTDNum'))
                    if val: totals['total_tds'] += val; has_data['total_tds'] = True

                # Total Yards
                if sg_name == 'Total Yards':
                    val = safe_int(stats.get('TotalYards'))
                    if val: totals['total_yards'] += val; has_data['total_yards'] = True

    # Return None for fields with no data
    return {k: (v if has_data[k] else None) for k, v in totals.items()}


def safe_int(val):
    """Convert value to int, returning None for empty/invalid."""
    if val is None or val == '' or val == '-':
        return None
    try:
        # Handle comma-separated numbers
        return int(str(val).replace(',', '').split('.')[0])
    except (ValueError, TypeError):
        return None


# ── Phase 3: Database Upsert ──────────────────────────────────────────────

def upsert_stats(conn, player_id, stats):
    """Upsert high school stats into SQLite."""
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO high_school_stats (
            player_id, high_school, games,
            pass_yards, pass_tds, rush_yards, rush_tds,
            rec_yards, rec_tds, receptions,
            interceptions, fumbles,
            total_yards, total_tds, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'maxpreps')
        ON CONFLICT(player_id) DO UPDATE SET
            high_school = CASE WHEN excluded.high_school IS NOT NULL AND excluded.high_school != '' THEN excluded.high_school ELSE high_school_stats.high_school END,
            games = CASE WHEN excluded.games IS NOT NULL THEN excluded.games ELSE high_school_stats.games END,
            pass_yards = CASE WHEN excluded.pass_yards IS NOT NULL THEN excluded.pass_yards ELSE high_school_stats.pass_yards END,
            pass_tds = CASE WHEN excluded.pass_tds IS NOT NULL THEN excluded.pass_tds ELSE high_school_stats.pass_tds END,
            rush_yards = CASE WHEN excluded.rush_yards IS NOT NULL THEN excluded.rush_yards ELSE high_school_stats.rush_yards END,
            rush_tds = CASE WHEN excluded.rush_tds IS NOT NULL THEN excluded.rush_tds ELSE high_school_stats.rush_tds END,
            rec_yards = CASE WHEN excluded.rec_yards IS NOT NULL THEN excluded.rec_yards ELSE high_school_stats.rec_yards END,
            rec_tds = CASE WHEN excluded.rec_tds IS NOT NULL THEN excluded.rec_tds ELSE high_school_stats.rec_tds END,
            receptions = CASE WHEN excluded.receptions IS NOT NULL THEN excluded.receptions ELSE high_school_stats.receptions END,
            interceptions = CASE WHEN excluded.interceptions IS NOT NULL THEN excluded.interceptions ELSE high_school_stats.interceptions END,
            fumbles = CASE WHEN excluded.fumbles IS NOT NULL THEN excluded.fumbles ELSE high_school_stats.fumbles END,
            total_yards = CASE WHEN excluded.total_yards IS NOT NULL THEN excluded.total_yards ELSE high_school_stats.total_yards END,
            total_tds = CASE WHEN excluded.total_tds IS NOT NULL THEN excluded.total_tds ELSE high_school_stats.total_tds END,
            data_source = 'maxpreps',
            updated_at = CURRENT_TIMESTAMP
    """, (
        player_id, stats.get('high_school'),
        stats.get('games'),
        stats.get('pass_yards'), stats.get('pass_tds'),
        stats.get('rush_yards'), stats.get('rush_tds'),
        stats.get('rec_yards'), stats.get('rec_tds'),
        stats.get('receptions'),
        stats.get('interceptions'), stats.get('fumbles'),
        stats.get('total_yards'), stats.get('total_tds'),
    ))

    # Also update players.high_school if we got a school name
    if stats.get('high_school'):
        cur.execute("""
            UPDATE players SET high_school = ?
            WHERE id = ? AND (high_school IS NULL OR high_school = '')
        """, (stats['high_school'], player_id))


# ── Main ──────────────────────────────────────────────────────────────────

def run(discover_only=False, scrape_only=False):
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row

    # Get all players with their location info
    players = conn.execute("""
        SELECT p.id, p.full_name, p.position,
               h.state, h.city, h.high_school,
               h.rush_tds, h.rec_tds, h.pass_tds
        FROM players p
        LEFT JOIN high_school_stats h ON h.player_id = p.id
        WHERE p.draft_year = 2026
        ORDER BY p.id
    """).fetchall()
    players = [dict(p) for p in players]
    print(f"Total players: {len(players)}")

    # Phase 1: Discover MaxPreps URLs
    if not scrape_only:
        url_map = discover_maxpreps_urls(players)
    else:
        url_map = load_url_cache()

    if discover_only:
        conn.close()
        return

    # Phase 2 + 3: Scrape stats and upsert
    found_urls = {pid: url for pid, url in url_map.items() if url}
    print(f"\nScraping stats from {len(found_urls)} MaxPreps pages...")

    scraped = 0
    stats_found = 0
    school_found = 0
    errors = 0

    for pid_str, mp_url in found_urls.items():
        pid = int(pid_str)
        player = next((p for p in players if p['id'] == pid), None)
        if not player:
            continue

        name = player['full_name']

        # Skip if we already have stats for this player
        if player.get('rush_tds') is not None or player.get('rec_tds') is not None or player.get('pass_tds') is not None:
            continue

        scraped += 1
        if scraped % 10 == 0:
            print(f"  Scrape progress: {scraped}/{len(found_urls)} ({stats_found} with stats, {school_found} with school name)")
            conn.commit()

        time.sleep(1.0)  # Rate limit

        stats = fetch_maxpreps_stats(mp_url, name)
        if stats:
            has_any_stat = any(stats.get(k) is not None for k in
                              ['pass_yards', 'pass_tds', 'rush_yards', 'rush_tds',
                               'rec_yards', 'rec_tds', 'receptions', 'interceptions',
                               'total_yards', 'total_tds'])
            if has_any_stat:
                stats_found += 1
                print(f"  [{name}] Stats: rush={stats.get('rush_yards')}/{stats.get('rush_tds')}td, rec={stats.get('receptions')}/{stats.get('rec_yards')}/{stats.get('rec_tds')}td, pass={stats.get('pass_yards')}/{stats.get('pass_tds')}td, int={stats.get('interceptions')}")
            if stats.get('high_school'):
                school_found += 1

            upsert_stats(conn, pid, stats)
        else:
            errors += 1

    conn.commit()
    conn.close()

    print(f"\n=== SCRAPE COMPLETE ===")
    print(f"  Pages scraped: {scraped}")
    print(f"  Players with stats: {stats_found}")
    print(f"  Players with school names: {school_found}")
    print(f"  Errors: {errors}")


if __name__ == "__main__":
    args = sys.argv[1:]
    discover_only = '--discover-only' in args
    scrape_only = '--scrape-only' in args
    run(discover_only=discover_only, scrape_only=scrape_only)
