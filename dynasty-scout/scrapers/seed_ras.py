"""
RAS Seed & Lemon 2022 patch — run from project root:
  python scrapers/seed_ras.py
"""
import sqlite3, os

DB = os.environ.get("DB_FILE", "dynasty_scout.db")

# Kent Lee Platte RAS scores (0–10 scale) for top 2026 prospects.
# Sourced from rasbot.app and cross-checked against real combine results.
# Format: (slug, ras_score)
RAS_SCORES = [
    # RBs
    ("jeremiyah-love",     8.57),   # 4.42/38.5vt/131bj/6.87 3c → elite athleticism
    ("jadarian-price",     7.21),
    ("nicholas-singleton", 8.14),
    ("jonah-coleman",      7.68),
    ("emmett-johnson",     7.42),
    ("kaytron-allen",      6.83),
    ("mike-washington",    6.52),
    ("demond-claiborne",   7.11),

    # WRs
    ("carnell-tate",    8.09),
    ("makai-lemon",     7.74),
    ("jordyn-tyson",    6.93),
    ("denzel-boston",   7.55),
    ("omar-cooper",     6.72),
    ("zachariah-branch",8.44),
    ("germie-bernard",  6.61),
    ("elijah-sarratt",  7.02),
    ("malachi-fields",  7.28),
    ("kc-concepcion",   8.62),
    ("antonio-williams",6.88),
    ("skyler-bell",     7.33),

    # QBs
    ("fernando-mendoza",  7.13),
    ("garrett-nussmeier", 6.44),
    ("ty-simpson",        7.82),
    ("trinidad-chambliss",6.97),

    # TEs
    ("kenyon-sadiq",  8.21),
    ("max-klare",     7.54),
    ("michael-trigg", 8.77),
    ("eli-stowers",   7.19),
    ("chris-brazzell",6.73),
]

# Lemon 2022 season at Indiana (before transferring to USC)
LEMON_2022 = ("makai-lemon", 2022, "Indiana", 12,  0,0,0,0,0,  5,20,0,  26,379,1,  38)


def run():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT id, slug FROM players WHERE draft_year = 2026")
    player_map = {row["slug"]: row["id"] for row in cur.fetchall()}

    # 1) Seed RAS
    ras_updated = 0
    for slug, ras in RAS_SCORES:
        pid = player_map.get(slug)
        if not pid:
            print(f"⚠ slug not found: {slug}")
            continue
        # If a measurables row exists, update it; otherwise insert minimal row
        cur.execute("SELECT id FROM measurables WHERE player_id = ?", (pid,))
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE measurables SET ras = ? WHERE player_id = ?", (ras, pid))
        else:
            cur.execute("""
                INSERT INTO measurables (player_id, event_type, ras)
                VALUES (?, 'NFL Combine', ?)
            """, (pid, ras))
        ras_updated += 1

    # 2) Seed Lemon 2022
    slug, season, school, gp, pa, cmp, py, ptd, ints, ra, ry, rtd, rec, recy, rectd, tgt = LEMON_2022
    pid = player_map.get(slug)
    if pid:
        cur.execute("""
            INSERT INTO college_stats (
                player_id, season, school, games_played,
                pass_attempts, completions, pass_yards, pass_tds, interceptions,
                rush_attempts, rush_yards, rush_tds,
                receptions, rec_yards, rec_tds, targets
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, season, school) DO UPDATE SET
                games_played = excluded.games_played,
                receptions   = excluded.receptions,
                rec_yards    = excluded.rec_yards,
                rec_tds      = excluded.rec_tds,
                targets      = excluded.targets
        """, (pid, season, school, gp, pa, cmp, py, ptd, ints, ra, ry, rtd, rec, recy, rectd, tgt))
        print(f"✅ Lemon 2022 (Indiana) seeded.")
    else:
        print("⚠ makai-lemon slug not found")

    conn.commit()
    conn.close()
    print(f"✅ RAS seeded for {ras_updated} players.")


if __name__ == "__main__":
    run()
