"""
compute_ras.py
Computes RAS (Relative Athletic Score) for 2026 prospects who have combine
data but no RAS score yet.

Methodology (approximates Kent Lee Platte's RAS):
  - For each drill, compute the player's percentile vs. all historical players
    at that position from 2010-2024 combine data (via nfl-data-py).
  - Scale each percentile to 0-10.
  - Average across available drills for a composite 0-10 RAS.

Run from dynasty-scout/:
  py -3 scrapers/compute_ras.py
"""

import sqlite3
import numpy as np

try:
    import nfl_data_py as nfl
except ImportError:
    print("Run: py -3 -m pip install nfl-data-py")
    raise

DB_PATH = "dynasty_scout.db"

# Drills: (column_in_nfl_data_py, column_in_measurables, lower_is_better)
DRILLS = [
    ("forty",      "forty_yard",           True),
    ("shuttle",    "twenty_yard_shuttle",  True),
    ("cone",       "three_cone",           True),
    ("vertical",   "vertical_jump",        False),
    ("broad_jump", "broad_jump",           False),
    ("bench",      "bench_press",          False),
]

# nfl-data-py position labels → our position labels
POS_MAP = {
    "WR": "WR",
    "TE": "TE",
    "RB": "RB",
    "FB": "RB",
    "QB": "QB",
}


def pct_to_ras(pct: float) -> float:
    """Convert 0-100 percentile to 0-10 RAS scale."""
    return round(pct / 10, 2)


def compute_ras_for_player(drills: dict, hist_by_drill: dict) -> float | None:
    """
    drills: {measurables_col: value}
    hist_by_drill: {measurables_col: sorted np.array of historical values}
    Returns composite 0-10 score, or None if <3 drills available.
    """
    scores = []
    for nfl_col, meas_col, lower_better in DRILLS:
        val = drills.get(meas_col)
        hist = hist_by_drill.get(meas_col)
        if val is None or hist is None or len(hist) < 20:
            continue
        # Percentile: fraction of historical players this player beats
        pct = float(np.sum(hist < val)) / len(hist) * 100
        if lower_better:
            pct = 100 - pct  # lower time → higher score
        scores.append(pct)

    if len(scores) < 3:
        return None
    avg_pct = float(np.mean(scores))
    return round(avg_pct / 10, 2)


def run():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Players to process: have combine data but no RAS (draft_year=2026)
    rows = cur.execute("""
        SELECT p.id, p.position, p.full_name,
               m.forty_yard, m.ten_yard_split, m.twenty_yard_shuttle,
               m.three_cone, m.vertical_jump, m.broad_jump, m.bench_press
        FROM measurables m
        JOIN players p ON p.id = m.player_id
        WHERE p.draft_year = 2026
          AND m.ras IS NULL
          AND (m.forty_yard IS NOT NULL OR m.vertical_jump IS NOT NULL)
    """).fetchall()

    if not rows:
        print("No players missing RAS.")
        conn.close()
        return

    positions_needed = list(set(r["position"] for r in rows))
    print(f"  {len(rows)} players need RAS — positions: {positions_needed}")

    # Load historical combine data
    print("Loading historical combine data (2010-2024)...")
    hist_df = nfl.import_combine_data(list(range(2010, 2025)), positions_needed)
    print(f"  {len(hist_df)} historical combine rows loaded")

    # Build percentile arrays per position per drill
    hist_by_pos: dict[str, dict[str, np.ndarray]] = {}
    for pos in positions_needed:
        sub = hist_df[hist_df["pos"].isin(
            [k for k, v in POS_MAP.items() if v == pos]
        )]
        hist_by_pos[pos] = {}
        for nfl_col, meas_col, _ in DRILLS:
            vals = sub[nfl_col].dropna().values.astype(float)
            if len(vals) >= 20:
                hist_by_pos[pos][meas_col] = np.sort(vals)

    # Compute and store
    updated = 0
    for r in rows:
        pos = r["position"]
        hist = hist_by_pos.get(pos, {})
        drills = {
            "forty_yard":           r["forty_yard"],
            "twenty_yard_shuttle":  r["twenty_yard_shuttle"],
            "three_cone":           r["three_cone"],
            "vertical_jump":        r["vertical_jump"],
            "broad_jump":           r["broad_jump"],
            "bench_press":          r["bench_press"],
        }
        ras = compute_ras_for_player(drills, hist)
        if ras is not None:
            cur.execute("UPDATE measurables SET ras = ? WHERE player_id = ?", (ras, r["id"]))
            updated += 1
            print(f"  {r['full_name']:28} {pos}  RAS={ras}")

    conn.commit()
    print(f"\nComputed RAS for {updated} players")

    # Summary
    total_ras = cur.execute(
        "SELECT COUNT(*) FROM measurables m JOIN players p ON p.id=m.player_id WHERE p.draft_year=2026 AND m.ras IS NOT NULL"
    ).fetchone()[0]
    print(f"Total players with RAS: {total_ras}")

    conn.close()


if __name__ == "__main__":
    run()
