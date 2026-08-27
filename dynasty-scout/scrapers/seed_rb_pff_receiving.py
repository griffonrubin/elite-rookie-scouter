"""
Seed PFF RB Receiving metrics for the 2026 draft class.
Data from: @ZWKfootball PFF analysis table.

Columns added to rb_advanced_career:
  pff_recv_rating        -- composite rating (AYPRR-based)
  ayprr                  -- Air Yards Per Route Run
  aypt                   -- Air Yards Per Target
  career_adj_ydg         -- Career Adj Yd/G (all targets)
  career_adj_ydg_nonscreen -- Career Adj Yd/G (non-screen)
  career_adj_ydg_10dot   -- Career Adj Yd/G (10+ DOT)
  best_season_adj_ydg    -- Best Season Adj Yd/TmG (all)
  best_season_adj_ydg_ns -- Best Season Adj Yd/TmG (non-screen)
  best_season_adj_ydg_10 -- Best Season Adj Yd/TmG (10+ DOT)
  drop_rate              -- updated with PFF drop rate (%)

Run: py scrapers/seed_rb_pff_receiving.py [--dry-run]
"""
import sqlite3
import sys
import os

DRY_RUN = '--dry-run' in sys.argv
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')

# (slug, pff_recv_rating, ayprr, aypt, drop_rate_%,
#  career_adj_ydg, career_adj_ydg_nonscreen, career_adj_ydg_10dot,
#  best_season_adj_ydg, best_season_adj_ydg_ns, best_season_adj_ydg_10)
RECORDS = [
    ("eli-heidenreich",    7.43, 5.86, 17.23,  4, 80.11, 71.49, 57.65, 107.77, 100.69, 81.92),
    ("desmond-reid",       3.23, 3.09, 14.38,  4, 76.67, 60.67, 16.17,  81.82,  62.57, 17.29),
    ("dean-connors",       0.93, 2.08,  9.96,  6, 36.98, 24.78,  7.10,  58.83,  42.00, 10.50),
    ("cash-jones",         0.81, 2.79, 12.51,  3, 20.26, 16.02,  5.67,  33.21,  27.14, 13.29),
    ("jeremiyah-love",     0.52, 2.55, 12.88,  6, 23.24, 10.93,  2.34,  37.92,  24.33,  8.00),
    ("nicholas-singleton", 0.45, 2.17, 12.12, 10, 29.26, 13.72,  4.74,  40.67,  22.73,  8.54),
    ("emmett-johnson",     0.44, 1.77, 10.27,  2, 31.71, 18.12,  2.85,  47.92,  22.25,  8.08),
    ("seth-mcgowan",       0.43, 2.37, 11.82, 13, 30.73, 15.33,  6.30,  40.42,  21.00, 11.33),
    ("jonah-coleman",      0.42, 1.76, 11.10,  1, 24.69, 13.41,  3.69,  41.33,  23.23,  7.67),
    ("jaydn-ott",          0.21, 1.52,  9.58,  4, 28.27, 19.44,  2.39,  44.67,  31.75,  5.33),
    ("roman-hemby",        0.21, 1.65, 11.17,  2, 29.85, 11.64,  0.64,  39.54,  20.67,  2.69),
    ("star-thomas",        0.16, 1.79, 13.96,  6, 20.28, 10.51,  1.81,  25.33,  14.53,  4.92),
    ("adam-randall",       0.01, 1.50,  8.83, 12, 25.06, 19.47, 10.12,  29.62,  26.85, 15.23),
    ("kaelon-black",      -0.05, 1.73, 11.52,  2, 14.35,  9.37,  0.82,  29.00,  18.11,  4.44),
    ("jamal-haynes",      -0.52, 1.57,  8.60, 11, 25.34, 13.58,  0.89,  30.46,  18.33,  2.83),
    ("robert-henry-jr",   -0.52, 1.23,  9.34,  5, 18.69,  8.29,  1.37,  25.64,  13.45,  4.36),
    ("jmari-taylor",      -0.57, 1.40,  7.19, 10, 29.85, 18.77,  0.00,  29.85,  18.77,  0.00),
    ("jadarian-price",    -0.60, 1.36, 15.39,  0,  6.76,  1.61,  0.00,  13.08,   5.08,  0.00),
    ("demond-claiborne",  -0.60, 1.42,  8.83, 13, 17.42,  8.25,  3.44,  31.67,  14.25,  7.67),
    ("jamarion-miller",   -0.61, 1.48, 10.72, 11, 13.74,  9.82,  1.05,  17.69,  11.55,  3.15),
    ("chip-trayanum",     -0.66, 1.27,  9.43, 10, 12.33,  9.26,  0.00,  31.09,  23.64,  0.00),
    ("noah-whittington",  -0.73, 1.20,  7.60,  5, 12.67,  8.44,  1.73,  21.08,  12.23,  8.67),
    ("kentrel-bullock",   -0.80, 1.14,  8.98,  4, 13.13,  6.82,  0.00,  18.31,  10.00,  0.00),
    ("mike-washington",   -0.91, 1.19,  6.93, 10, 15.79, 10.36,  1.51,  26.75,  18.42,  3.75),
    ("kaytron-allen",     -0.96, 1.17,  8.11,  8, 14.26,  5.19,  0.56,  20.23,   9.81,  2.31),
    ("cj-donaldson",      -0.98, 0.96,  8.24,  6, 10.80,  6.67,  0.62,  14.54,   9.08,  2.33),
    ("rahsul-faison",     -1.10, 0.70,  6.65,  4, 10.78,  5.27,  1.24,  14.83,   9.67,  3.83),
    ("leveon-moss",       -1.16, 1.11,  8.24, 17, 10.89,  5.71,  0.00,  22.22,   9.78,  0.00),
    ("terion-stewart",    -1.39, 0.56,  7.54, 25,  2.33,  2.19,  0.88,   6.67,   6.67,  4.11),
]

NEW_COLS = [
    ("pff_recv_rating",        "REAL"),
    ("ayprr",                  "REAL"),
    ("aypt",                   "REAL"),
    ("career_adj_ydg",         "REAL"),
    ("career_adj_ydg_nonscreen","REAL"),
    ("career_adj_ydg_10dot",   "REAL"),
    ("best_season_adj_ydg",    "REAL"),
    ("best_season_adj_ydg_ns", "REAL"),
    ("best_season_adj_ydg_10", "REAL"),
]

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Add missing columns
    cur.execute("PRAGMA table_info(rb_advanced_career)")
    existing = {r[1] for r in cur.fetchall()}
    for col, typ in NEW_COLS:
        if col not in existing:
            print(f"  ALTER TABLE: adding {col}")
            if not DRY_RUN:
                cur.execute(f"ALTER TABLE rb_advanced_career ADD COLUMN {col} {typ}")

    matched = skipped = 0
    for rec in RECORDS:
        (slug, rating, ayprr, aypt, drop_pct,
         c_all, c_ns, c_10,
         bs_all, bs_ns, bs_10) = rec

        cur.execute("SELECT id FROM players WHERE slug = ?", (slug,))
        row = cur.fetchone()
        if not row:
            print(f"  SKIP (not in DB): {slug}")
            skipped += 1
            continue
        pid = row[0]

        # Ensure row exists in rb_advanced_career
        cur.execute("SELECT id FROM rb_advanced_career WHERE player_id = ?", (pid,))
        if not cur.fetchone():
            if not DRY_RUN:
                cur.execute("INSERT INTO rb_advanced_career (player_id) VALUES (?)", (pid,))
            print(f"  INSERT new row: {slug}")

        if not DRY_RUN:
            cur.execute("""
                UPDATE rb_advanced_career SET
                    pff_recv_rating        = ?,
                    ayprr                  = ?,
                    aypt                   = ?,
                    drop_rate              = ?,
                    career_adj_ydg         = ?,
                    career_adj_ydg_nonscreen = ?,
                    career_adj_ydg_10dot   = ?,
                    best_season_adj_ydg    = ?,
                    best_season_adj_ydg_ns = ?,
                    best_season_adj_ydg_10 = ?,
                    data_source            = 'pff_zwk_2026',
                    updated_at             = CURRENT_TIMESTAMP
                WHERE player_id = ?
            """, (rating, ayprr, aypt, float(drop_pct),
                  c_all, c_ns, c_10, bs_all, bs_ns, bs_10, pid))
        print(f"  {'[DRY] ' if DRY_RUN else ''}UPDATE: {slug} | rating={rating} ayprr={ayprr} drop={drop_pct}%")
        matched += 1

    if not DRY_RUN:
        conn.commit()
    conn.close()
    print(f"\nDone: {matched} updated, {skipped} skipped (not in DB)")

if __name__ == "__main__":
    main()
