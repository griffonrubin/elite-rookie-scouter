"""
run_consensus.py — Weighted consensus rankings calculator.

Improvements over v1:
  - Source weights by trust/relevance (dynasty-specific sources weighted higher)
  - Percentile normalization before combining (accounts for different list sizes)
  - Players not ranked by a source get a penalized percentile (25th percentile floor for absent sources)
  - Requires only 1 source to get a consensus rank (no longer requires 2)

Source weights:
  KeepTradeCut   0.35   — most widely used dynasty trade platform
  FantasyCalc    0.30   — dynasty-specific, large community
  FantasyPros    0.20   — broad fantasy community aggregate
  DynastyNerds   0.15   — dynasty-specific community rankings

Run: py scrapers/run_consensus.py
"""
import sqlite3
import logging
from datetime import date

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger("ConsensusRunner")

DB_FILE = "dynasty_scout.db"

SOURCE_WEIGHTS = {
    "KeepTradeCut": 0.35,
    "FantasyCalc":  0.30,
    "FantasyPros":  0.20,
    "DynastyNerds": 0.15,
}

# When a player is not ranked by a source, assign this percentile (0=worst, 1=best)
# 0.10 = penalize heavily but don't fully ignore them
ABSENT_PERCENTILE = 0.10


def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    today = date.today().isoformat()

    # ── 1. Load latest rankings per source ───────────────────────────────────
    cur.execute("""
        SELECT r.player_id, r.source, r.rank_overall
        FROM rankings r
        JOIN (
            SELECT player_id, source, MAX(scraped_at) as max_date
            FROM rankings GROUP BY player_id, source
        ) latest ON r.player_id = latest.player_id
                 AND r.source = latest.source
                 AND r.scraped_at = latest.max_date
        WHERE r.rank_overall IS NOT NULL AND r.rank_overall < 999
    """)
    rows = cur.fetchall()
    logger.info(f"Loaded {len(rows)} raw ranking rows")

    # Build: source -> {player_id: rank}
    source_ranks: dict[str, dict[int, int]] = {}
    for row in rows:
        src = row['source']
        if src not in source_ranks:
            source_ranks[src] = {}
        source_ranks[src][row['player_id']] = row['rank_overall']

    if not source_ranks:
        logger.warning("No rankings found.")
        conn.close()
        return

    for src, d in source_ranks.items():
        logger.info(f"  {src}: {len(d)} players ranked")

    # ── 2. Normalize each source's ranks to 0–1 percentile ───────────────────
    # percentile = 1 - (rank - 1) / (total - 1)  → rank 1 = 1.0, last = 0.0
    source_pct: dict[str, dict[int, float]] = {}
    for src, d in source_ranks.items():
        n = len(d)
        if n <= 1:
            source_pct[src] = {pid: 1.0 for pid in d}
        else:
            sorted_pids = sorted(d.keys(), key=lambda p: d[p])
            source_pct[src] = {}
            for idx, pid in enumerate(sorted_pids):
                source_pct[src][pid] = 1.0 - idx / (n - 1)

    # ── 3. Collect all 2026 players ───────────────────────────────────────────
    cur.execute("SELECT id, position FROM players WHERE draft_year = 2026")
    all_players = cur.fetchall()

    # Normalize weights to available sources
    active_sources = [s for s in SOURCE_WEIGHTS if s in source_pct]
    raw_weight_sum = sum(SOURCE_WEIGHTS[s] for s in active_sources)
    weights = {s: SOURCE_WEIGHTS[s] / raw_weight_sum for s in active_sources}
    logger.info(f"Active sources: {active_sources}")
    logger.info(f"Normalized weights: { {s: round(w, 3) for s, w in weights.items()} }")

    # ── 4. Compute weighted score per player ─────────────────────────────────
    player_scores: dict[int, dict] = {}
    for player in all_players:
        pid = player['id']
        ranked_by = []
        total_weight = 0.0
        weighted_pct_sum = 0.0

        for src, w in weights.items():
            pct = source_pct[src].get(pid)
            if pct is not None:
                weighted_pct_sum += w * pct
                total_weight += w
                ranked_by.append(src)
            else:
                # Not ranked: use absent penalty weighted proportionally
                weighted_pct_sum += w * ABSENT_PERCENTILE
                total_weight += w

        if total_weight == 0:
            continue

        final_score = weighted_pct_sum / total_weight  # 0–1, higher = better

        # Pull raw rank stats for reporting
        all_ranks = [source_ranks[s][pid] for s in active_sources if pid in source_ranks.get(s, {})]
        player_scores[pid] = {
            'score': final_score,
            'avg_rank': round(sum(all_ranks) / len(all_ranks), 1) if all_ranks else 999.0,
            'best_rank': min(all_ranks) if all_ranks else 999,
            'worst_rank': max(all_ranks) if all_ranks else 999,
            'num_sources': len(ranked_by),
        }

    # ── 5. Sort by score descending and assign overall rank ──────────────────
    # Players with 0 ranking sources get pushed to the back
    ranked_ids = sorted(
        [pid for pid, d in player_scores.items() if d['num_sources'] > 0],
        key=lambda pid: player_scores[pid]['score'],
        reverse=True
    )
    unranked_ids = [pid for pid, d in player_scores.items() if d['num_sources'] == 0]

    logger.info(f"Players with ≥1 source: {len(ranked_ids)} | Unranked: {len(unranked_ids)}")

    # ── 6. Save to consensus_rankings ────────────────────────────────────────
    for overall_rank, pid in enumerate(ranked_ids, 1):
        d = player_scores[pid]
        try:
            cur.execute("""
                INSERT INTO consensus_rankings (
                    player_id, rank_overall, avg_rank, best_rank, worst_rank,
                    std_deviation, num_sources, calculated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(player_id, calculated_at) DO UPDATE SET
                    rank_overall = excluded.rank_overall,
                    avg_rank     = excluded.avg_rank,
                    best_rank    = excluded.best_rank,
                    worst_rank   = excluded.worst_rank,
                    num_sources  = excluded.num_sources
            """, (
                pid, overall_rank, d['avg_rank'], d['best_rank'], d['worst_rank'],
                0.0, d['num_sources'], today
            ))
        except Exception as e:
            logger.error(f"Error saving player {pid}: {e}")

    # Unranked players get positions after all ranked players
    base_rank = len(ranked_ids) + 1
    for pid in unranked_ids:
        try:
            cur.execute("""
                INSERT INTO consensus_rankings (
                    player_id, rank_overall, avg_rank, best_rank, worst_rank,
                    std_deviation, num_sources, calculated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(player_id, calculated_at) DO UPDATE SET
                    rank_overall = excluded.rank_overall,
                    avg_rank     = excluded.avg_rank
            """, (pid, base_rank, float(base_rank), base_rank, base_rank, 0.0, 0, today))
            base_rank += 1
        except Exception as e:
            logger.error(f"Error saving unranked {pid}: {e}")

    conn.commit()
    conn.close()

    cur2 = sqlite3.connect(DB_FILE).cursor()
    cur2.execute("SELECT COUNT(*) FROM consensus_rankings WHERE calculated_at=?", (today,))
    total = cur2.fetchone()[0]
    logger.info(f"Consensus complete — {total} players ranked for {today}")


if __name__ == "__main__":
    run()
