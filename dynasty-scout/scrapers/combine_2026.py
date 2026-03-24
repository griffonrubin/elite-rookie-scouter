"""
scrapers/combine_2026.py
Fetches 2026 NFL Combine data from NFL.com via Playwright.

The combine tracker page auto-fires api.nfl.com/football/v2/combine/rankings
~10s after load (after cookie consent dismiss). No click interaction needed.

Data captured per player:
  - Combine drills: 40yd, 10yd split, vertical, broad jump, 3-cone, shuttle, bench
  - Physical: height, weight, hand size, arm length
  - NFL grades: draft grade, athleticism score, production score
  - NFL comparison player, scouting overview, strengths, weaknesses
  - Profile author (e.g. Lance Zierlein)

Run: py scrapers/combine_2026.py
Run single: py scrapers/combine_2026.py carnell-tate
"""

import sqlite3
import re
import os
import time
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')


# ─── Schema helpers ──────────────────────────────────────────────────────────

def ensure_schema(conn):
    cur = conn.cursor()
    # Add new columns to measurables if they don't exist
    for col, typ in [
        ('athleticism_score', 'REAL'),
        ('draft_grade_nfl',   'REAL'),
        ('nfl_comparison',    'TEXT'),
    ]:
        try:
            cur.execute(f'ALTER TABLE measurables ADD COLUMN {col} {typ}')
        except Exception:
            pass  # Already exists

    # New table for NFL.com scouting reports
    cur.execute("""
        CREATE TABLE IF NOT EXISTS nfl_scout_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER REFERENCES players(id) UNIQUE,
            overview TEXT,
            strengths TEXT,
            weaknesses TEXT,
            profile_author TEXT,
            athleticism_score REAL,
            production_score REAL,
            size_score REAL,
            draft_grade REAL,
            nfl_comparison TEXT,
            source TEXT DEFAULT 'nfl_combine_2026',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()


# ─── Player matching ──────────────────────────────────────────────────────────

def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[''`\-\.,]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def build_player_map(cur):
    cur.execute("SELECT id, full_name, position FROM players WHERE draft_year = 2026")
    m = {}
    for p_id, name, pos in cur.fetchall():
        key = normalize(name)
        m[key] = (p_id, pos)
    return m


def match_player(name: str, player_map: dict):
    if not name:
        return None
    key = normalize(name)
    if key in player_map:
        return player_map[key][0]
    # Try first + last only
    parts = key.split()
    if len(parts) >= 2:
        fl = f"{parts[0]} {parts[-1]}"
        if fl in player_map:
            return player_map[fl][0]
    return None


# ─── Data extraction ──────────────────────────────────────────────────────────

def parse_drill(obj):
    """Extract seconds/value from an NFL API drill object like {'seconds': 4.26, 'designation': 'OFFICIAL'}."""
    if obj is None:
        return None
    if isinstance(obj, (int, float)):
        return float(obj) if obj > 0 else None
    if isinstance(obj, dict):
        v = obj.get('seconds') or obj.get('inches') or obj.get('value') or obj.get('repetitions')
        return float(v) if v and float(v) > 0 else None
    return None


def parse_float(val):
    try:
        v = float(val)
        return round(v, 3) if v and v > 0 else None
    except (TypeError, ValueError):
        return None


def strip_html(html: str) -> str:
    if not html:
        return ''
    text = re.sub(r'<li[^>]*>', '• ', html)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_profile(prof: dict) -> dict:
    person = prof.get('person') or {}
    name = (person.get('displayName') or
            f"{person.get('firstName', '')} {person.get('lastName', '')}").strip()

    return {
        'name': name,
        # Drills
        'forty_yard':          parse_drill(prof.get('fortyYardDash')),
        'ten_yard_split':      parse_drill(prof.get('tenYardSplit')),
        'vertical_jump':       parse_drill(prof.get('verticalJump')),
        'broad_jump':          parse_drill(prof.get('broadJump')),
        'three_cone':          parse_drill(prof.get('threeConeDrill')),
        'twenty_yard_shuttle': parse_drill(prof.get('twentyYardShuttle')),
        'bench_press':         parse_drill(prof.get('benchPress')),
        # Physical
        'height':              parse_float(prof.get('height')),
        'weight':              parse_float(prof.get('weight')),
        'hand_size':           parse_float(prof.get('handSize')),
        'arm_length':          parse_float(prof.get('armLength')),
        # NFL grades/scores
        'athleticism_score':   parse_float(prof.get('athleticismScore')),
        'production_score':    parse_float(prof.get('productionScore')),
        'size_score':          parse_float(prof.get('sizeScore')),
        'draft_grade':         parse_float(prof.get('draftGrade')),
        'nfl_comparison':      prof.get('nflComparison'),
        # Scouting
        'overview':            strip_html(prof.get('overview') or ''),
        'strengths':           strip_html(prof.get('strengths') or ''),
        'weaknesses':          strip_html(prof.get('weaknesses') or ''),
        'profile_author':      prof.get('profileAuthor'),
        # Meta
        'headshot':            prof.get('headshot', ''),
        'position':            prof.get('position', ''),
    }


# ─── DB upserts ──────────────────────────────────────────────────────────────

def upsert_measurables(cur, player_id: int, row: dict):
    # Check if row exists
    cur.execute("SELECT id FROM measurables WHERE player_id = ?", (player_id,))
    existing = cur.fetchone()

    drills = {
        'forty_yard':          row['forty_yard'],
        'ten_yard_split':      row['ten_yard_split'],
        'vertical_jump':       row['vertical_jump'],
        'broad_jump':          row['broad_jump'],
        'three_cone':          row['three_cone'],
        'twenty_yard_shuttle': row['twenty_yard_shuttle'],
        'bench_press':         row['bench_press'],
        'hand_size':           row['hand_size'],
        'arm_length':          row['arm_length'],
        'athleticism_score':   row['athleticism_score'],
        'draft_grade_nfl':     row['draft_grade'],
        'nfl_comparison':      row['nfl_comparison'],
    }

    if existing:
        # Only update non-null values
        updates = {k: v for k, v in drills.items() if v is not None}
        if updates:
            set_clause = ', '.join(f"{k} = ?" for k in updates)
            cur.execute(
                f"UPDATE measurables SET {set_clause}, data_source='nfl_combine_2026' WHERE player_id = ?",
                list(updates.values()) + [player_id]
            )
    else:
        non_null = {k: v for k, v in drills.items() if v is not None}
        cols = ', '.join(['player_id', 'event_type', 'data_source'] + list(non_null.keys()))
        placeholders = ', '.join(['?'] * (3 + len(non_null)))
        cur.execute(
            f"INSERT INTO measurables ({cols}) VALUES ({placeholders})",
            [player_id, 'combine', 'nfl_combine_2026'] + list(non_null.values())
        )


def upsert_scout_profile(cur, player_id: int, row: dict):
    cur.execute("""
        INSERT INTO nfl_scout_profiles
            (player_id, overview, strengths, weaknesses, profile_author,
             athleticism_score, production_score, size_score, draft_grade,
             nfl_comparison)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET
            overview = excluded.overview,
            strengths = excluded.strengths,
            weaknesses = excluded.weaknesses,
            profile_author = excluded.profile_author,
            athleticism_score = excluded.athleticism_score,
            production_score = excluded.production_score,
            size_score = excluded.size_score,
            draft_grade = excluded.draft_grade,
            nfl_comparison = excluded.nfl_comparison,
            updated_at = CURRENT_TIMESTAMP
    """, (
        player_id,
        row['overview'] or None,
        row['strengths'] or None,
        row['weaknesses'] or None,
        row['profile_author'],
        row['athleticism_score'],
        row['production_score'],
        row['size_score'],
        row['draft_grade'],
        row['nfl_comparison'],
    ))


def update_headshot(cur, player_id: int, headshot_url: str):
    if headshot_url and '{formatInstructions}' in headshot_url:
        # Replace NFL's placeholder with a real format
        url = headshot_url.replace('{formatInstructions}', 'f_auto,q_auto')
        cur.execute(
            "UPDATE players SET headshot_url = ? WHERE id = ? AND (headshot_url IS NULL OR headshot_url = '')",
            (url, player_id)
        )


# ─── Main scrape ─────────────────────────────────────────────────────────────

def scrape_combine_profiles() -> list:
    """Use Playwright to load NFL.com and capture combine API responses."""
    from playwright.sync_api import sync_playwright

    all_profiles = {}

    def on_response(resp):
        if 'football/v2/combine' in resp.url and resp.status == 200:
            try:
                data = resp.json()
                for prof in data.get('combineProfiles', []):
                    pid = prof.get('id') or (prof.get('person') or {}).get('id')
                    if pid and pid not in all_profiles:
                        all_profiles[pid] = prof
            except Exception as e:
                print(f'  Parse error: {e}')

    print('Launching browser...')
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage']
        )
        ctx = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 900},
        )
        page = ctx.new_page()
        page.on('response', on_response)

        try:
            page.goto(
                'https://www.nfl.com/combine/tracker/live-results/',
                timeout=30000,
                wait_until='domcontentloaded'
            )
        except Exception as e:
            print(f'  Page load (non-fatal): {e}')

        # Dismiss cookie consent if present
        try:
            page.click('#onetrust-accept-btn-handler', timeout=4000)
            print('  Cookie banner dismissed')
        except Exception:
            pass

        time.sleep(2)

        # Trigger data load by interacting with the search input
        # (filling the search box causes the page to load combine profiles via API)
        try:
            search = page.wait_for_selector('input[placeholder*="Search"]', timeout=8000)
            search.fill('a')
            print('  Triggered search to load combine data...')
            time.sleep(2)
            search.fill('')
            time.sleep(1)
        except Exception as e:
            print(f'  Search trigger failed (non-fatal): {e}')

        # Wait for combine API to fire
        print('  Waiting for combine API...')
        for i in range(20):
            time.sleep(1)
            if len(all_profiles) > 0:
                print(f'  API fired: {len(all_profiles)} profiles')
                time.sleep(2)
                break

        browser.close()

    return list(all_profiles.values())


def run(target_slug: str = None):
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()
    ensure_schema(conn)

    player_map = build_player_map(cur)
    print(f'Loaded {len(player_map)} 2026 players from DB')

    raw_profiles = scrape_combine_profiles()
    print(f'\nCaptured {len(raw_profiles)} combine profiles from NFL.com\n')

    if not raw_profiles:
        print('No profiles captured — check network access and try again')
        conn.close()
        return

    matched = 0
    skipped = 0
    not_found = []

    for prof in raw_profiles:
        row = extract_profile(prof)
        name = row['name']

        # Skip if targeting a specific slug
        if target_slug:
            from scrapers.jfoster_scraper import slug_from_name
            if slug_from_name(name) != target_slug:
                continue

        player_id = match_player(name, player_map)
        if player_id is None:
            not_found.append(f"{name} ({row['position']})")
            continue

        upsert_measurables(cur, player_id, row)
        upsert_scout_profile(cur, player_id, row)
        if row['headshot']:
            update_headshot(cur, player_id, row['headshot'])

        has_drill = any(row[k] for k in ['forty_yard', 'vertical_jump', 'bench_press', 'three_cone'])
        mark = 'OK' if has_drill else '--'
        print(f"  [{mark}] {name} ({row['position']}) | "
              f"40yd={row['forty_yard'] or '-'} | "
              f"vert={row['vertical_jump'] or '-'} | "
              f"grade={row['draft_grade'] or '-'} | "
              f"comp={row['nfl_comparison'] or '-'}")
        matched += 1

    conn.commit()
    conn.close()

    print(f'\n{"="*50}')
    print(f'Matched: {matched} | Skipped (no DB match): {len(not_found)}')
    if not_found:
        print(f'Not found: {", ".join(not_found[:20])}')


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else None
    run(target)
