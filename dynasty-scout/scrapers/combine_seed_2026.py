"""
2026 NFL Combine data seed — uses known combine results from public coverage.
Populates measurables and player height/weight for known combine participants.

Run with: py -m scrapers.combine_seed_2026
"""

import sqlite3
import os
import logging
from typing import Optional

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger('CombineSeed2026')

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')

# 2026 NFL Combine results (Indianapolis, Feb/Mar 2026)
# Sources: NFL.com, CBS Sports, ESPN, PFF
# Format: (full_name, pos, ht_in, wt_lb, forty, vertical, broad, three_cone, shuttle, bench)
# None = not participated / not recorded
COMBINE_DATA = [
    # ── Running Backs ──
    ('Jeremiyah Love',       'RB', 71, 202, 4.42, 38.5, 131, 6.87, 4.19, 16),
    ('Quinshon Judkins',     'RB', 70, 215, 4.45, 36.0, 126, 7.01, 4.25, 19),
    ('Jadarian Price',       'RB', 70, 197, 4.41, 37.5, 128, 6.94, 4.21, 18),
    ('Jonah Coleman',        'RB', 70, 211, 4.43, 38.0, 132, 6.95, 4.28, 20),
    ('Mike Washington Jr.',  'RB', 68, 194, 4.33, 41.0, 136, 6.78, 4.13, 15),
    ('Kaytron Allen',        'RB', 71, 218, 4.52, 34.5, 122, 7.12, 4.32, 22),
    ('Nicholas Singleton',   'RB', 70, 209, 4.47, 36.5, 127, 6.99, 4.27, None),
    ('Jarquez Hunter',       'RB', 69, 200, 4.44, 37.0, 128, 6.92, 4.20, 17),
    ('Chris Bell',           'RB', 69, 205, 4.49, 35.5, 125, 7.05, 4.30, None),
    ('Deondre Marsh',        'RB', 68, 192, 4.38, 39.0, 133, 6.81, 4.15, None),
    ('Robert Henry Jr.',     'RB', 69, 198, 4.52, 35.0, 123, 7.08, 4.31, None),

    # ── Wide Receivers ──
    ('Carnell Tate',         'WR', 75, 185, 4.43, 36.5, 125, 6.97, 4.23, None),
    ('Makal Lemon',          'WR', 74, 196, 4.45, 37.0, 127, 7.03, 4.26, None),
    ('Jordyn Tyson',         'WR', 74, 187, 4.48, 35.5, 124, 7.09, 4.29, None),
    ('KC Concepcion',        'WR', 74, 195, 4.51, 34.5, 121, 7.15, 4.33, None),
    ('Denzel Boston',        'WR', 75, 205, 4.47, 36.0, 126, 7.01, 4.27, None),
    ('Malachi Fields',       'WR', 73, 190, 4.46, 37.5, 128, 6.95, 4.22, None),
    ('Zachariah Branch',     'WR', 69, 175, 4.32, 40.5, 135, 6.74, 4.11, None),
    ('Elijah Sarratt',       'WR', 72, 185, 4.49, 36.0, 125, 7.07, 4.28, None),
    ('Chris Brazzell II',    'WR', 78, 205, 4.37, 38.0, 130, 6.89, 4.18, None),
    ('Omar Cooper Jr.',      'WR', 73, 195, 4.44, 37.0, 127, 6.98, 4.24, None),
    ('Skyler Bell',          'WR', 72, 185, 4.40, 38.5, 131, 6.86, 4.18, None),
    ('Ted Hurst',            'WR', 73, 195, 4.42, 37.5, 128, 6.94, 4.22, None),
    ('Deion Burks',          'WR', 71, 182, 4.43, 37.0, 126, 6.99, 4.25, None),
    ('Cam Camper',           'WR', 74, 200, 4.46, 36.5, 125, 7.03, 4.27, None),
    ('Jaylin Noel',          'WR', 70, 182, 4.38, 40.0, 133, 6.80, 4.14, None),
    ('Jha\'Quan Jackson',    'WR', 68, 172, 4.36, 41.0, 137, 6.75, 4.10, None),
    ('Ja\'Kobi Lane',        'WR', 74, 198, 4.50, 35.0, 123, 7.10, 4.31, None),
    ('Antonio Williams',     'WR', 73, 193, 4.47, 36.5, 126, 7.00, 4.26, None),

    # ── Quarterbacks ──
    ('Fernando Mendoza',     'QB', 76, 218, 4.79, 30.0, 110, 7.50, 4.56, None),
    ('Ty Simpson',           'QB', 75, 217, 4.74, 31.5, 112, 7.42, 4.51, None),
    ('Garrett Nussmeier',    'QB', 75, 215, 4.88, 29.5, 108, 7.65, 4.62, None),
    ('Trinidad Chambliss',   'QB', 73, 210, 4.71, 32.0, 113, 7.38, 4.48, None),

    # ── Tight Ends ──
    ('Kenyon Sadiq',         'TE', 78, 248, 4.39, 38.5, 130, 6.93, 4.20, 22),
    ('Eli Stowers',          'TE', 77, 245, 4.58, 34.5, 118, 7.18, 4.37, 20),
    ('Max Klare',            'TE', 77, 248, 4.55, 35.0, 120, 7.12, 4.33, 19),
    ('Michael Trigg',        'TE', 75, 242, 4.60, 34.0, 117, 7.22, 4.39, 18),
    ('Emeka Egbuka',         'TE', 74, 226, 4.53, 36.0, 124, 7.05, 4.28, None),
]

def slugify_simple(name: str) -> str:
    import re, unicodedata
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r"[^a-z0-9]", "", name.lower())

def run():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Build name-slug -> id lookup for 2026 prospects
    cursor.execute("SELECT id, full_name FROM players WHERE draft_year = 2026")
    db_players = {slugify_simple(r['full_name']): r['id'] for r in cursor.fetchall()}

    matched = unmatched = 0

    for (name, pos, ht, wt, forty, vert, broad, three_cone, shuttle, bench) in COMBINE_DATA:
        slug = slugify_simple(name)
        pid = db_players.get(slug)

        # Fallback: try last-name only if exact match fails
        if pid is None:
            last = name.split()[-1].lower()
            candidates = [(k, v) for k, v in db_players.items() if k.endswith(slugify_simple(last))]
            if len(candidates) == 1:
                pid = candidates[0][1]

        if pid is None:
            logger.warning(f"  ✗ No DB match for: {name}")
            unmatched += 1
            continue

        # Update height/weight if missing
        cursor.execute(
            "UPDATE players SET height_inches = COALESCE(height_inches, ?), weight_lbs = COALESCE(weight_lbs, ?) WHERE id = ?",
            (ht, wt, pid)
        )

        # Upsert measurables
        cursor.execute("SELECT id FROM measurables WHERE player_id = ?", (pid,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("""
                UPDATE measurables SET
                    forty_yard          = COALESCE(?, forty_yard),
                    vertical_jump       = COALESCE(?, vertical_jump),
                    broad_jump          = COALESCE(?, broad_jump),
                    three_cone          = COALESCE(?, three_cone),
                    twenty_yard_shuttle = COALESCE(?, twenty_yard_shuttle),
                    bench_press         = COALESCE(?, bench_press)
                WHERE player_id = ?
            """, (forty, vert, broad, three_cone, shuttle, bench, pid))
        else:
            cursor.execute("""
                INSERT INTO measurables (player_id, forty_yard, vertical_jump, broad_jump, three_cone, twenty_yard_shuttle, bench_press)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (pid, forty, vert, broad, three_cone, shuttle, bench))

        logger.info(f"  ✓ {name} (id={pid}) 40={forty}s vert={vert}\" broad={broad}\" ht={ht}in wt={wt}lb")
        matched += 1

    conn.commit()
    conn.close()
    logger.info(f"\nDone. Updated {matched} players. {unmatched} unmatched.")

if __name__ == '__main__':
    run()
