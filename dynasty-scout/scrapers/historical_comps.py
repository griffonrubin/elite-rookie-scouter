"""
Historical comparables engine using nfl-data-py.

For each 2026 prospect with measurables, finds the 3 most athletically
similar players from the 2010–2024 draft classes and shows their draft
position + career Approximate Value.

Table created: historical_comps
  player_id      -> 2026 prospect
  comp_name      -> historical player name
  comp_year      -> their draft year
  comp_round     -> their draft round
  comp_pick      -> their draft pick (overall)
  comp_team      -> their draft team
  comp_position  -> their position
  comp_car_av    -> career AV (lifetime)
  similarity     -> 0-100 similarity score
  shared_metrics -> which metrics were used (comma-separated)
"""

import re
import sqlite3

import nfl_data_py as nfl
import numpy as np
import pandas as pd

DB_PATH = "dynasty_scout.db"


# ── helpers ────────────────────────────────────────────────────────────────

def parse_height(ht_str):
    """'6-3' -> 75.0 inches"""
    if not ht_str or pd.isna(ht_str):
        return None
    m = re.match(r"(\d+)-(\d+)", str(ht_str))
    if m:
        return int(m.group(1)) * 12 + int(m.group(2))
    return None


def safe_int(v):
    try:
        return int(v) if v is not None and not (isinstance(v, float) and np.isnan(v)) else None
    except (ValueError, TypeError):
        return None


def similarity_score(prospect_vec, hist_vec, cols):
    """
    Returns 0-100 similarity using normalized Euclidean distance.
    Only considers features both players have.
    """
    p = np.array([prospect_vec.get(c) for c in cols])
    h = np.array([hist_vec.get(c) for c in cols])
    mask = ~(np.isnan(p) | np.isnan(h))
    if mask.sum() < 2:
        return None, []
    p_m, h_m = p[mask], h[mask]
    used_cols = [c for c, m in zip(cols, mask) if m]
    dist = np.sqrt(np.sum((p_m - h_m) ** 2))
    # Max possible distance across unit-normalized space
    score = max(0, 100 - dist * 20)
    return round(float(score), 1), used_cols


# ── main ───────────────────────────────────────────────────────────────────

def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Create table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS historical_comps (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id     INTEGER NOT NULL,
            comp_name     TEXT,
            comp_year     INTEGER,
            comp_round    INTEGER,
            comp_pick     INTEGER,
            comp_team     TEXT,
            comp_position TEXT,
            comp_car_av   INTEGER,
            comp_w_av     INTEGER,
            comp_probowls INTEGER,
            similarity    REAL,
            shared_metrics TEXT,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players(id)
        )
    """)
    cur.execute("DELETE FROM historical_comps")  # refresh
    conn.commit()

    # ── Load historical data ──────────────────────────────────────────────
    print("Fetching historical combine data (2010-2024)...")
    hist_combine = nfl.import_combine_data(
        years=list(range(2010, 2025)),
        positions=["WR", "RB", "QB", "TE"],
    )
    hist_combine["height_in"] = hist_combine["ht"].apply(parse_height)
    hist_combine["weight"] = pd.to_numeric(hist_combine["wt"], errors="coerce")
    hist_combine["forty"]  = pd.to_numeric(hist_combine["forty"], errors="coerce")
    hist_combine["vert"]   = pd.to_numeric(hist_combine["vertical"], errors="coerce")
    hist_combine["broad"]  = pd.to_numeric(hist_combine["broad_jump"], errors="coerce")
    hist_combine["cone"]   = pd.to_numeric(hist_combine["cone"], errors="coerce")
    hist_combine["shut"]   = pd.to_numeric(hist_combine["shuttle"], errors="coerce")

    print("Fetching draft pick outcomes (2010-2024)...")
    hist_picks = nfl.import_draft_picks(years=list(range(2010, 2025)))
    # Keep all positions in picks (some players may be categorized differently)

    # Join combine + picks on pfr_id to get career outcomes (w_av, probowls)
    # combine already has draft_round, draft_ovr, draft_team built in
    hist = hist_combine.merge(
        hist_picks[["pfr_player_id", "w_av", "probowls"]],
        left_on="pfr_id",
        right_on="pfr_player_id",
        how="left",
    )

    # Per-position normalization stats (mean/std) for z-scoring
    FEAT_COLS = ["height_in", "weight", "forty", "vert", "broad"]

    # ── Load 2026 prospects from DB ───────────────────────────────────────
    prospects = cur.execute("""
        SELECT p.id, p.full_name, p.position,
               p.height_inches, p.weight_lbs,
               m.forty_yard, m.vertical_jump, m.broad_jump
        FROM players p
        LEFT JOIN measurables m ON m.player_id = p.id
        WHERE p.draft_year = 2026
          AND p.position IN ('WR','RB','QB','TE')
          AND m.forty_yard IS NOT NULL
    """).fetchall()

    print(f"2026 prospects with measurables: {len(prospects)}")

    inserted = 0
    for pid, name, pos, ht, wt, forty, vert, broad in prospects:
        pos_hist = hist[hist["pos"] == pos].copy()
        if len(pos_hist) < 5:
            continue

        # Compute per-position z-score norms
        norms = {}
        for col, val in [("height_in", ht), ("weight", wt),
                          ("forty", forty), ("vert", vert), ("broad", broad)]:
            col_data = pos_hist[col].dropna()
            mu, sd = col_data.mean(), col_data.std()
            norms[col] = (mu, sd if sd > 0 else 1.0)

        def z(val, col):
            if val is None or pd.isna(val):
                return float("nan")
            mu, sd = norms[col]
            return (val - mu) / sd

        prospect_vec = {
            "height_in": z(ht, "height_in"),
            "weight":    z(wt, "weight"),
            "forty":     z(forty, "forty"),
            "vert":      z(vert, "vert"),
            "broad":     z(broad, "broad"),
        }

        comps = []
        for _, row in pos_hist.iterrows():
            hist_vec = {
                "height_in": z(row["height_in"], "height_in"),
                "weight":    z(row["weight"], "weight"),
                "forty":     z(row["forty"], "forty"),
                "vert":      z(row["vert"], "vert"),
                "broad":     z(row["broad"], "broad"),
            }
            score, used = similarity_score(prospect_vec, hist_vec, FEAT_COLS)
            if score is not None and score >= 60:
                comps.append({
                    "name":      row["player_name"],
                    "year":      safe_int(row.get("draft_year")),
                    "round":     safe_int(row.get("draft_round")),
                    "pick":      safe_int(row.get("draft_ovr")),
                    "team":      row.get("draft_team"),
                    "car_av":    safe_int(row.get("car_av")),
                    "w_av":      safe_int(row.get("w_av")),
                    "probowls":  safe_int(row.get("probowls")),
                    "score":     score,
                    "metrics":   ",".join(used),
                })

        # Sort by similarity descending, take top 3
        comps.sort(key=lambda x: x["score"], reverse=True)
        top3 = comps[:3]

        for c in top3:
            cur.execute("""
                INSERT INTO historical_comps
                  (player_id, comp_name, comp_year, comp_round, comp_pick,
                   comp_team, comp_position, comp_car_av, comp_w_av, comp_probowls,
                   similarity, shared_metrics)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (pid, c["name"], c["year"], c["round"], c["pick"],
                  c["team"], pos, c["car_av"], c["w_av"], c["probowls"],
                  c["score"], c["metrics"]))
            inserted += 1

    conn.commit()
    conn.close()

    print(f"\nDone. Inserted {inserted} historical comps for {inserted // 3} prospects.")

    # Show sample
    conn2 = sqlite3.connect(DB_PATH)
    sample = conn2.execute("""
        SELECT p.full_name, p.position, hc.comp_name, hc.comp_year,
               hc.comp_round, hc.similarity, hc.comp_w_av
        FROM historical_comps hc
        JOIN players p ON p.id = hc.player_id
        ORDER BY p.full_name, hc.similarity DESC
        LIMIT 15
    """).fetchall()
    for r in sample:
        print(f"  {r[1]:3} {r[0]:28} -> {r[2]:28} ({r[3]}) Rd{r[4]} sim={r[5]} wAV={r[6]}")
    conn2.close()


if __name__ == "__main__":
    run()
