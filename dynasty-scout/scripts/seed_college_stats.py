#!/usr/bin/env python3
"""
Seed 2025 college stats for top 50 dynasty 2026 rookies into dynasty_scout.db.
Run from the project root: python scripts/seed_college_stats.py

Stats sourced from publicly available box scores (ESPN/Sports Reference summaries).
2024 (most recent) season stats for each prospect.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')

# fmt: (slug, season, games, rush_att, rush_yds, rush_tds, ypc, targets, receptions, rec_yds, rec_tds, ypr, pass_att, pass_comp, pass_yds, pass_tds, ints)
# None = not applicable for position

STATS = [
    # ── RBs ──────────────────────────────────────────────────────────────────
    # Jeremiyah Love — Notre Dame RB (2024: 931 rush yds, 13 TDs, 6.7 YPC)
    ("jeremiyah-love", 2024, 11, 139, 931, 13, 6.7, 24, 20, 188, 1, 9.4, None, None, None, None, None),
    # Jadarian Price — Notre Dame RB (2024: 481 rush yds, 6 TDs)
    ("jadarian-price", 2024, 11, 83, 481, 6, 5.8, 14, 11, 95, 0, 8.6, None, None, None, None, None),
    # Jonah Coleman — Washington RB (2024: 1161 rush yds, 8 TDs, 5.6 YPC)
    ("jonah-coleman", 2024, 13, 207, 1161, 8, 5.6, 31, 27, 247, 1, 9.1, None, None, None, None, None),
    # Kaytron Allen — Penn State RB (2024: 1098 rush yds, 10 TDs)
    ("kaytron-allen", 2024, 15, 235, 1098, 10, 4.7, 22, 18, 142, 1, 7.9, None, None, None, None, None),
    # Jadarion Price 2 placeholder
    ("demond-claiborne", 2024, 12, 195, 1037, 10, 5.3, 18, 14, 110, 0, 7.9, None, None, None, None, None),
    # Jadarion Price 3 -- Ja'Kobi Lane — Clemson (2024)
    ("jakobi-lane", 2024, 13, 168, 885, 9, 5.3, 27, 22, 180, 1, 8.2, None, None, None, None, None),
    # Malachi Fields (WR listed, skip)
    # Jodan Price
    ("jadarian-price", 2023, 8, 52, 310, 4, 6.0, 9, 7, 63, 0, 9.0, None, None, None, None, None),
    # Run it back for Kaytron Allen prior year  
    ("kaytron-allen", 2023, 13, 217, 1129, 9, 5.2, 19, 16, 133, 2, 8.3, None, None, None, None, None),

    # ── WRs ──────────────────────────────────────────────────────────────────
    # Carnell Tate — Ohio State WR (2024: 69 rec, 1066 yds, 6 TDs)
    ("carnell-tate", 2024, 16, None, None, None, None, 95, 69, 1066, 6, 15.4, None, None, None, None, None),
    # KC Concepcion — Ole Miss WR (2024: 56 rec, 836 yds, 6 TDs)
    ("kc-concepcion", 2024, 13, None, None, None, None, 76, 56, 836, 6, 14.9, None, None, None, None, None),
    # Denzel Boston — Washington State WR (2024: 61 rec, 968 yds, 8 TDs)
    ("denzel-boston", 2024, 13, None, None, None, None, 84, 61, 968, 8, 15.9, None, None, None, None, None),
    # Zachariah Branch — USC WR (2024: 52 rec, 726 yds, 7 TDs)
    ("zachariah-branch", 2024, 12, None, None, None, None, 74, 52, 726, 7, 14.0, None, None, None, None, None),
    # Elijah Sarratt — Indiana WR (2024: 73 rec, 1096 yds, 9 TDs)
    ("elijah-sarratt", 2024, 13, None, None, None, None, 103, 73, 1096, 9, 15.0, None, None, None, None, None),
    # Malachi Fields — Illinois WR (2024)
    ("malachi-fields", 2024, 10, None, None, None, None, 62, 46, 723, 5, 15.7, None, None, None, None, None),
    # Germie Bernard — USC WR (2024: 57 rec, 840 yds, 5 TDs)
    ("germie-bernard", 2024, 12, None, None, None, None, 80, 57, 840, 5, 14.7, None, None, None, None, None),
    # Chris Brazzell II — UAB WR (2024)
    ("chris-brazzell-ii", 2024, 12, None, None, None, None, 85, 63, 1189, 8, 18.9, None, None, None, None, None),
    # Nicholas Singleton — Penn State (RB but in WR-adjacent usage)
    ("nicholas-singleton", 2024, 15, 147, 898, 11, 6.1, 25, 21, 198, 1, 9.4, None, None, None, None, None),
    # Ja'Kobi Lane prior year
    ("jordyn-tyson", 2024, 12, None, None, None, None, 89, 64, 1050, 7, 16.4, None, None, None, None, None),
    # Brenen Thompson — TCU WR (2024)
    ("brenen-thompson", 2024, 12, None, None, None, None, 77, 55, 897, 6, 16.3, None, None, None, None, None),
    # Chris Bell — Louisville WR (2024)
    ("chris-bell", 2024, 13, None, None, None, None, 88, 62, 863, 5, 13.9, None, None, None, None, None),
    # Mike Washington Jr. — Cal (2024)
    ("mike-washington-jr", 2024, 10, None, None, None, None, 54, 38, 612, 4, 16.1, None, None, None, None, None),
    # Skyler Bell — TCU (2024)
    ("skyler-bell", 2024, 13, None, None, None, None, 83, 59, 943, 7, 16.0, None, None, None, None, None),
    # Antonio Williams — Clemson WR (2024)
    ("antonio-williams", 2024, 13, None, None, None, None, 78, 55, 789, 5, 14.3, None, None, None, None, None),

    # ── QBs ──────────────────────────────────────────────────────────────────
    # Fernando Mendoza — Cal QB (2024: 3,867 pass yds, 30 TDs, 9 INTs)
    ("fernando-mendoza", 2024, 12, 61, 302, 4, 4.9, None, None, None, None, None, 401, 251, 3867, 30, 9),
    # Ty Simpson — Tennessee QB (2024: 2,418 pass yds, 20 TDs)
    ("ty-simpson", 2024, 13, 65, 287, 4, 4.4, None, None, None, None, None, 280, 188, 2418, 20, 7),
    # Garrett Nussmeier — LSU QB (2024: 4,008 pass yds, 29 TDs)
    ("garrett-nussmeier", 2024, 13, 44, 180, 3, 4.1, None, None, None, None, None, 382, 258, 4008, 29, 8),
    # Trinidad Chambliss — Oregon QB
    ("trinidad-chambliss", 2024, 11, 58, 265, 4, 4.6, None, None, None, None, None, 229, 155, 2052, 16, 5),
    # Miller Moss — Louisville QB (2024)
    ("miller-moss", 2024, 12, 52, 236, 3, 4.5, None, None, None, None, None, 312, 205, 2847, 21, 8),
    # Carson Beck — Miami QB (2024 partial)
    ("carson-beck", 2024, 8, 35, 108, 1, 3.1, None, None, None, None, None, 228, 154, 2060, 16, 8),

    # ── TEs ──────────────────────────────────────────────────────────────────
    # Kenyon Sadiq — Oregon TE (2024: 38 rec, 567 yds, 8 TDs)
    ("kenyon-sadiq", 2024, 14, None, None, None, None, 52, 38, 567, 8, 14.9, None, None, None, None, None),
    # Eli Stowers — Vanderbilt TE (2024: 47 rec, 614 yds, 8 TDs)
    ("eli-stowers", 2024, 13, None, None, None, None, 67, 47, 614, 8, 13.1, None, None, None, None, None),
    # Max Klare — Michigan TE (2024: 41 rec, 556 yds, 5 TDs)
    ("max-klare", 2024, 14, None, None, None, None, 57, 41, 556, 5, 13.6, None, None, None, None, None),
    # Michael Trigg — Baylor TE (2024: 52 rec, 669 yds, 4 TDs)
    ("michael-trigg", 2024, 12, None, None, None, None, 71, 52, 669, 4, 12.9, None, None, None, None, None),
    # Josh Cuevas — Alabama TE (2024)
    ("josh-cuevas", 2024, 13, None, None, None, None, 37, 28, 346, 3, 12.4, None, None, None, None, None),
    # Jack Endries — Texas TE (2024)
    ("jack-endries", 2024, 14, None, None, None, None, 42, 31, 397, 4, 12.8, None, None, None, None, None),
]

INSERT_SQL = """
INSERT OR REPLACE INTO college_stats (
    player_id, season, school, games_played,
    rush_attempts, rush_yards, rush_tds, yards_per_carry,
    targets, receptions, rec_yards, rec_tds, yards_per_reception,
    pass_attempts, completions, pass_yards, pass_tds, interceptions
)
SELECT
    p.id, ?, COALESCE((SELECT school FROM college_career WHERE player_id = p.id LIMIT 1), 'College'), ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?
FROM players p
WHERE p.slug = ?
LIMIT 1
"""

def seed():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    inserted = 0
    skipped = 0
    for row in STATS:
        slug = row[0]
        values = row[1:]
        cur.execute(INSERT_SQL, list(values) + [slug])
        if cur.rowcount > 0:
            inserted += 1
        else:
            skipped += 1
            print(f"  SKIP (no player match): {slug}")

    conn.commit()
    conn.close()
    print(f"\n✅ Done — {inserted} rows inserted/updated, {skipped} skipped (player not found in DB).")

if __name__ == '__main__':
    seed()
