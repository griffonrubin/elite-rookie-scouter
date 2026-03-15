"""
scrapers/combine_2026.py
Fetches 2026 NFL Combine measurements from the official NFL API
via Playwright request interception.

NFL.com's combine tracker loads:
  https://api.nfl.com/football/v2/combine/rankings?limit=500&rankAttribute=FORTY_YARD_DASH&sortOrder=A
Each combineProfile object contains ALL measurements for that player — not just the sorted drill.

The page also exposes draft grades, NFL comparisons, and athletic scores.
These are saved to measurables and players tables where columns exist.

Run: py scrapers/combine_2026.py
"""

import sqlite3
import re
import os
import json
import time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')

# Position tabs on NFL.com combine tracker — each triggers a separate API call
POSITION_TABS = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DI', 'LB', 'CB', 'S']


def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[''`\-\,]", "", name)
    name = re.sub(r"\.", " ", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def build_player_map(cur):
    cur.execute("SELECT id, full_name FROM players WHERE draft_year = 2026")
    m = {}
    for p_id, name in cur.fetchall():
        m[normalize(name)] = p_id
    return m


def match_player(name: str, player_map: dict):
    if not name:
        return None
    key = normalize(name)
    if key in player_map:
        return player_map[key]
    parts = key.split()
    if len(parts) >= 2:
        fl = f"{parts[0]} {parts[-1]}"
        if fl in player_map:
            return player_map[fl]
    return None


def extract_val(obj, *keys):
    """Extract a numeric value from a possibly-null NFL API measurement dict."""
    if obj is None:
        return None
    if isinstance(obj, (int, float)):
        return obj
    if isinstance(obj, dict):
        for k in keys:
            v = obj.get(k)
            if v is not None:
                return v
    return None


def parse_float(val):
    try:
        v = float(val)
        return round(v, 3) if v > 0 else None
    except (TypeError, ValueError):
        return None


def parse_int(val):
    try:
        v = int(float(val))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def profile_to_row(profile: dict) -> dict:
    """Convert an NFL API combineProfile object into DB column values."""
    person = profile.get('person') or {}
    name = (person.get('displayName') or
            f"{person.get('firstName', '')} {person.get('lastName', '')}").strip()

    return {
        'name': name,
        'forty_yard':         parse_float(extract_val(profile.get('fortyYardDash'), 'seconds')),
        'ten_yard_split':     parse_float(extract_val(profile.get('tenYardSplit'), 'seconds')),
        'bench_press':        parse_int(extract_val(profile.get('benchPress'), 'repetitions', 'reps')),
        'vertical_jump':      parse_float(extract_val(profile.get('verticalJump'), 'inches')),
        'broad_jump':         parse_int(extract_val(profile.get('broadJump'), 'inches')),
        'three_cone':         parse_float(extract_val(profile.get('threeConeDrill'), 'seconds')),
        'twenty_yard_shuttle':parse_float(extract_val(profile.get('twentyYardShuttle'), 'seconds')),
        # Extra fields we'll save to players if available
        'headshot':    profile.get('headshot', ''),
        'draft_grade': profile.get('draftGrade'),
        'nfl_comp':    profile.get('nflComparison'),
    }


def run():
    from playwright.sync_api import sync_playwright

    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()
    player_map = build_player_map(cur)
    print(f'Loaded {len(player_map)} 2026 players')

    cur.execute("SELECT COUNT(*) FROM measurables WHERE forty_yard IS NOT NULL")
    before = cur.fetchone()[0]
    print(f'40-yard times before: {before}')

    # Collect all unique profiles keyed by person.id
    all_profiles: dict[str, dict] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage']
        )
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 900},
        )

        def capture_combine_response(response):
            try:
                if 'football/v2/combine/rankings' in response.url and response.status == 200:
                    data = response.json()
                    profiles = data.get('combineProfiles', [])
                    new = 0
                    for prof in profiles:
                        pid = prof.get('id') or prof.get('person', {}).get('id')
                        if pid and pid not in all_profiles:
                            all_profiles[pid] = prof
                            new += 1
                    attr = ''
                    if 'rankAttribute=' in response.url:
                        attr = response.url.split('rankAttribute=')[1].split('&')[0]
                    print(f'  [{attr}] +{new} new profiles (total={len(all_profiles)})')
            except Exception as e:
                print(f'  Capture error: {e}')

        # Load combine tracker main page
        print('\nLoading NFL.com combine tracker...')
        page = context.new_page()
        page.on('response', capture_combine_response)
        try:
            page.goto('https://www.nfl.com/combine/tracker/live-results/', timeout=45000)
            # Wait a reasonable time for the API call to fire
            for _ in range(20):
                if len(all_profiles) > 0:
                    break
                time.sleep(0.5)
            time.sleep(2)
        except Exception as e:
            print(f'  Initial load error (continuing): {e}')

        # Try clicking position tabs to load more player groups
        print('\nTriggering position tabs...')
        try:
            # Dismiss cookie banner first
            cookie_btns = page.query_selector_all('#onetrust-accept-btn-handler, button[id*="accept"], button[class*="cookie"]')
            for btn in cookie_btns:
                try:
                    btn.click()
                    time.sleep(0.5)
                    break
                except Exception:
                    pass

            # Look for position filter tabs
            all_buttons = page.query_selector_all('button, [role="tab"], a[class*="tab"]')
            clicked = set()
            for btn in all_buttons:
                txt = btn.inner_text().strip().upper()
                if txt in POSITION_TABS and txt not in clicked:
                    try:
                        btn.click()
                        clicked.add(txt)
                        time.sleep(1.5)
                        print(f'  Clicked {txt} tab')
                    except Exception:
                        pass
        except Exception as e:
            print(f'  Tab navigation error: {e}')

        # Try injecting additional fetch calls for different sort attributes
        print('\nFetching additional drill sorts...')
        if len(all_profiles) > 0:
            token = page.evaluate('''
                () => {
                    // Try to find the token in localStorage or cookies
                    for (let k of Object.keys(localStorage)) {
                        try {
                            const v = JSON.parse(localStorage[k]);
                            if (v && v.accessToken) return v.accessToken;
                        } catch {}
                    }
                    return null;
                }
            ''')

            if token:
                attrs = ['VERTICAL_JUMP', 'BROAD_JUMP', 'BENCH_PRESS', 'THREE_CONE_DRILL', 'SHORT_SHUTTLE']
                for attr in attrs:
                    try:
                        result = page.evaluate(f'''
                            async () => {{
                                const r = await fetch(
                                    "https://api.nfl.com/football/v2/combine/rankings?limit=500&rankAttribute={attr}&sortOrder=A",
                                    {{ headers: {{ "Authorization": "Bearer {token}", "Accept": "application/json" }} }}
                                );
                                if (!r.ok) return null;
                                return await r.json();
                            }}
                        ''')
                        if result and result.get('combineProfiles'):
                            profiles = result['combineProfiles']
                            new = 0
                            for prof in profiles:
                                pid = prof.get('id') or prof.get('person', {}).get('id')
                                if pid and pid not in all_profiles:
                                    all_profiles[pid] = prof
                                    new += 1
                            print(f'  [{attr}] +{new} new profiles (total={len(all_profiles)})')
                    except Exception as e:
                        print(f'  Fetch {attr} error: {e}')

        page.close()
        browser.close()

    print(f'\nTotal unique profiles captured: {len(all_profiles)}')

    if not all_profiles:
        print('No profiles captured. The page structure may have changed.')
        conn.close()
        return

    # Match and save
    matched = 0
    skipped = []
    measurables_updated = 0
    headshots_updated = 0

    for prof_id, profile in all_profiles.items():
        row = profile_to_row(profile)
        name = row.pop('name', '')
        headshot = row.pop('headshot', '')
        draft_grade = row.pop('draft_grade', None)
        nfl_comp = row.pop('nfl_comp', None)

        p_id = match_player(name, player_map)
        if not p_id:
            skipped.append(name)
            continue
        matched += 1

        # Upsert measurables — only fill nulls
        drill_cols = ['forty_yard', 'ten_yard_split', 'bench_press', 'vertical_jump',
                      'broad_jump', 'three_cone', 'twenty_yard_shuttle']
        set_clauses = []
        vals = []
        for col in drill_cols:
            v = row.get(col)
            if v is not None:
                set_clauses.append(f"{col} = CASE WHEN {col} IS NULL THEN ? ELSE {col} END")
                vals.append(v)

        if set_clauses:
            # Also mark source
            set_clauses.append("data_source = CASE WHEN data_source IS NULL THEN 'NFL.com' ELSE data_source END")
            vals.append(p_id)
            cur.execute(f"UPDATE measurables SET {', '.join(set_clauses)} WHERE player_id = ?", vals)
            if cur.rowcount:
                measurables_updated += 1

        # Update headshot if missing
        if headshot and '{formatInstructions}' in headshot:
            headshot_url = headshot.replace('{formatInstructions}', 'f_auto,q_auto,w_200,h_200')
            cur.execute("UPDATE players SET headshot_url = ? WHERE id = ? AND headshot_url IS NULL", (headshot_url, p_id))
            if cur.rowcount:
                headshots_updated += 1

    conn.commit()

    # Final stats
    cur.execute("SELECT COUNT(*) FROM measurables WHERE forty_yard IS NOT NULL")
    after = cur.fetchone()[0]

    print(f'\n{"="*55}')
    print(f'Profiles captured:    {len(all_profiles)}')
    print(f'Matched to DB:        {matched}')
    print(f'Measurables updated:  {measurables_updated}')
    print(f'Headshots filled:     {headshots_updated}')
    print(f'40-yard times:        {before} -> {after} (+{after - before})')

    if skipped:
        print(f'\nUnmatched ({len(skipped)}): {skipped[:20]}')

    # Top 10 by 40 time
    cur.execute("""
        SELECT p.full_name, p.position, m.forty_yard, m.vertical_jump, m.broad_jump, m.three_cone
        FROM measurables m JOIN players p ON p.id = m.player_id
        WHERE m.forty_yard IS NOT NULL AND p.draft_year = 2026
        ORDER BY m.forty_yard ASC LIMIT 10
    """)
    rows = cur.fetchall()
    if rows:
        print('\nFastest 40 times:')
        for row in rows:
            print(f'  {row[0]:<25} {row[1]} | 40={row[2]}s  vert={row[3]}"  broad={row[4]}"  3cone={row[5]}s')

    conn.close()


if __name__ == '__main__':
    run()
