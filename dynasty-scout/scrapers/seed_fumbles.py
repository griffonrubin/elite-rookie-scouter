"""
Seed fumbles data for all players from CFBD API.
ESPN V3 does not expose fumbles — CFBD is the authoritative source.

Match strategy:
  1. Primary:  ESPN college ID == CFBD playerId (same ID space for most players)
  2. Fallback: normalized player name + year + school first-word

Run:
    python scrapers/seed_fumbles.py          # all players
    python scrapers/seed_fumbles.py --dry-run
    python scrapers/seed_fumbles.py jeremiyah-love  # single player by slug
"""

import sqlite3
import requests
import os
import re
import sys
import time
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
CFBD_KEY = os.getenv('CFBD_API_KEY')
CFBD_BASE = 'https://api.collegefootballdata.com'
HEADERS = {'Authorization': f'Bearer {CFBD_KEY}'}

# Seasons to cover — match what's in our college_stats table
SEASONS = [2020, 2021, 2022, 2023, 2024, 2025]


# ── Name normalisation ────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Lowercase, remove punctuation, strip Jr/Sr/II/III suffixes."""
    name = name.lower().strip()
    name = re.sub(r"['.,-]", '', name)
    name = re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', name)
    return re.sub(r'\s+', ' ', name).strip()


def normalize_school(school: str) -> str:
    """First meaningful word of school name, lowercase."""
    stop = {'university', 'of', 'at', 'the', 'college', 'state'}
    words = [w.lower() for w in school.split() if w.lower() not in stop]
    return words[0] if words else school.lower()


# ── CFBD fetch ────────────────────────────────────────────────────────────────

def fetch_cfbd_fumbles(year: int) -> list[dict]:
    """Return all FUM records for a season from CFBD."""
    r = requests.get(
        f'{CFBD_BASE}/stats/player/season',
        params={'year': year, 'seasonType': 'regular', 'category': 'fumbles'},
        headers=HEADERS,
        timeout=20,
    )
    r.raise_for_status()
    return [rec for rec in r.json() if rec.get('statType') == 'FUM']


# ── Main ──────────────────────────────────────────────────────────────────────

def run(dry_run=False, target_slug=None):
    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()

    # Load our players
    if target_slug:
        cur.execute(
            'SELECT id, full_name, espn_college_id FROM players WHERE slug = ?',
            (target_slug,),
        )
    else:
        cur.execute(
            'SELECT id, full_name, espn_college_id FROM players WHERE draft_year = 2026',
        )
    players = cur.fetchall()
    player_by_espn = {str(p[2]): p for p in players if p[2]}

    # Load our college_stats rows to know which (player_id, season, school) combos exist
    cur.execute(
        'SELECT player_id, season, school FROM college_stats WHERE player_id IN ({})'.format(
            ','.join('?' * len(players))
        ),
        [p[0] for p in players],
    )
    our_rows = {}  # (player_id, season) -> school
    for pid, season, school in cur.fetchall():
        our_rows[(pid, season)] = school

    # Build name+school lookup for fallback: normalize_name(full_name) -> player row
    name_lookup = {}
    for pid, full_name, espn_id in players:
        key = normalize_name(full_name)
        name_lookup[key] = (pid, full_name, espn_id)

    updated = 0
    skipped = 0
    not_found = []

    for year in SEASONS:
        print(f'\nFetching CFBD fumbles for {year}...')
        time.sleep(0.3)
        try:
            cfbd_records = fetch_cfbd_fumbles(year)
        except Exception as e:
            print(f'  ERROR fetching {year}: {e}')
            continue

        # Index CFBD by id and by normalized name+school
        cfbd_by_id = {}
        cfbd_by_name_school = {}
        for rec in cfbd_records:
            cfbd_by_id[str(rec['playerId'])] = rec
            key = (normalize_name(rec['player']), normalize_school(rec.get('team', '')))
            cfbd_by_name_school[key] = rec

        print(f'  {len(cfbd_records)} FUM records from CFBD')

        for pid, full_name, espn_id in players:
            if (pid, year) not in our_rows:
                continue  # we have no stats row for this player/year

            our_school = our_rows[(pid, year)]
            cfbd_rec = None

            # ── Match 1: ESPN ID == CFBD playerId
            if espn_id and str(espn_id) in cfbd_by_id:
                candidate = cfbd_by_id[str(espn_id)]
                # Sanity-check: at minimum the year should align
                if candidate['season'] == year:
                    cfbd_rec = candidate

            # ── Match 2: normalized name + school first-word
            if cfbd_rec is None:
                nname = normalize_name(full_name)
                nschool = normalize_school(our_school)
                key = (nname, nschool)
                if key in cfbd_by_name_school:
                    cfbd_rec = cfbd_by_name_school[key]

            # ── Match 3: normalized name only (loose — only if unique match)
            if cfbd_rec is None:
                nname = normalize_name(full_name)
                candidates = [v for k, v in cfbd_by_name_school.items() if k[0] == nname]
                if len(candidates) == 1:
                    cfbd_rec = candidates[0]

            if cfbd_rec is None:
                skipped += 1
                continue

            fum_val = int(cfbd_rec['stat'])
            match_method = 'id' if (espn_id and str(espn_id) == str(cfbd_rec['playerId'])) else 'name'

            print(f'  [{year}] {full_name} ({our_school}) -> FUM={fum_val}  [{match_method}]')

            if not dry_run:
                cur.execute(
                    '''UPDATE college_stats
                       SET fumbles = ?
                       WHERE player_id = ? AND season = ?''',
                    (fum_val, pid, year),
                )
                updated += 1

    if not dry_run:
        conn.commit()
    conn.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f'\n{"[DRY RUN] " if dry_run else ""}Fumbles seed complete.')
    print(f'  Updated: {updated}')
    print(f'  Skipped (no CFBD match): {skipped}')

    # Report which player-seasons still have NULL fumbles
    conn2 = sqlite3.connect(DB_PATH)
    cur2 = conn2.cursor()
    cur2.execute('''
        SELECT p.full_name, cs.season, cs.school, cs.rush_attempts
        FROM college_stats cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.draft_year = 2026
          AND p.position IN ("RB","QB","WR","TE")
          AND cs.fumbles IS NULL
          AND cs.rush_attempts > 5
        ORDER BY p.full_name, cs.season
    ''')
    nulls = cur2.fetchall()
    conn2.close()
    if nulls:
        print(f'\n  Still NULL fumbles (rush_att > 5): {len(nulls)} rows')
        for row in nulls[:30]:
            print(f'    {row}')


if __name__ == '__main__':
    dry = '--dry-run' in sys.argv
    slug = next((a for a in sys.argv[1:] if not a.startswith('--')), None)
    run(dry_run=dry, target_slug=slug)
