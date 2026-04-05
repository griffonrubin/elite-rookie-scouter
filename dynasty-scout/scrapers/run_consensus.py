"""
run_consensus.py — Weighted consensus rankings calculator.
Produces separate SF and 1QB consensus rankings.

SF sources:  KeepTradeCut (0.35), FantasyCalc SF (0.30), FantasyPros (0.20), DynastyNerds (0.15)
1QB sources: KeepTradeCut 1QB (0.35), FantasyCalc (0.30), FantasyPros (0.20), DynastyNerds (0.15)

Run: py scrapers/run_consensus.py
"""
import sqlite3
import logging
from datetime import date

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("ConsensusRunner")

DB_FILE = "dynasty_scout.db"

# Sources for each format — draft boards excluded from consensus
FORMAT_WEIGHTS = {
    "SF": {
        "KeepTradeCut":    0.35,
        "FantasyCalc SF":  0.30,
        "FantasyPros":     0.20,
        "DynastyNerds":    0.15,
    },
    "1QB": {
        "KeepTradeCut 1QB": 0.35,
        "FantasyCalc":      0.30,
        "FantasyPros":      0.20,
        "DynastyNerds":     0.15,
    },
}

ABSENT_PERCENTILE = 0.10


def run_format(conn, fmt: str, today: str):
    """Compute and store consensus for a single format (SF or 1QB)."""
    SOURCE_WEIGHTS = FORMAT_WEIGHTS[fmt]
    cur = conn.cursor()

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

    source_ranks: dict[str, dict[int, int]] = {}
    for row in rows:
        src = row["source"] if isinstance(row, dict) else row[1]
        pid = row["player_id"] if isinstance(row, dict) else row[0]
        rank = row["rank_overall"] if isinstance(row, dict) else row[2]
        if src not in source_ranks:
            source_ranks[src] = {}
        source_ranks[src][pid] = rank

    source_pct: dict[str, dict[int, float]] = {}
    for src, d in source_ranks.items():
        n = len(d)
        if n <= 1:
            source_pct[src] = {pid: 1.0 for pid in d}
        else:
            sorted_pids = sorted(d.keys(), key=lambda p: d[p])
            source_pct[src] = {pid: 1.0 - idx / (n - 1) for idx, pid in enumerate(sorted_pids)}

    cur.execute("SELECT id FROM players WHERE draft_year = 2026")
    all_pids = [r[0] for r in cur.fetchall()]

    active = [s for s in SOURCE_WEIGHTS if s in source_pct]
    raw_sum = sum(SOURCE_WEIGHTS[s] for s in active)
    weights = {s: SOURCE_WEIGHTS[s] / raw_sum for s in active}
    logger.info(f"[{fmt}] Active sources: {active}")

    player_scores: dict[int, dict] = {}
    for pid in all_pids:
        ranked_by = []
        weighted_pct_sum = 0.0
        total_weight = 0.0
        for src, w in weights.items():
            pct = source_pct[src].get(pid)
            if pct is not None:
                weighted_pct_sum += w * pct
                total_weight += w
                ranked_by.append(src)
            else:
                weighted_pct_sum += w * ABSENT_PERCENTILE
                total_weight += w
        if total_weight == 0:
            continue
        final_score = weighted_pct_sum / total_weight
        all_ranks = [source_ranks[s][pid] for s in active if pid in source_ranks.get(s, {})]
        player_scores[pid] = {
            "score": final_score,
            "avg_rank": round(sum(all_ranks) / len(all_ranks), 1) if all_ranks else 999.0,
            "best_rank": min(all_ranks) if all_ranks else 999,
            "worst_rank": max(all_ranks) if all_ranks else 999,
            "num_sources": len(ranked_by),
        }

    ranked_ids = sorted(
        [pid for pid, d in player_scores.items() if d["num_sources"] > 0],
        key=lambda pid: player_scores[pid]["score"],
        reverse=True
    )
    unranked_ids = [pid for pid, d in player_scores.items() if d["num_sources"] == 0]

    for overall_rank, pid in enumerate(ranked_ids, 1):
        d = player_scores[pid]
        cur.execute("""
            INSERT INTO consensus_rankings
                (player_id, format, rank_overall, avg_rank, best_rank, worst_rank,
                 std_deviation, num_sources, calculated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, format, calculated_at) DO UPDATE SET
                rank_overall = excluded.rank_overall,
                avg_rank     = excluded.avg_rank,
                best_rank    = excluded.best_rank,
                worst_rank   = excluded.worst_rank,
                num_sources  = excluded.num_sources
        """, (pid, fmt, overall_rank, d["avg_rank"], d["best_rank"], d["worst_rank"],
               0.0, d["num_sources"], today))

    for i, pid in enumerate(unranked_ids):
        base = len(ranked_ids) + 1 + i
        cur.execute("""
            INSERT INTO consensus_rankings
                (player_id, format, rank_overall, avg_rank, best_rank, worst_rank,
                 std_deviation, num_sources, calculated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, format, calculated_at) DO UPDATE SET
                rank_overall = excluded.rank_overall
        """, (pid, fmt, base, float(base), base, base, 0.0, 0, today))

    conn.commit()
    logger.info(f"[{fmt}] Consensus saved — {len(ranked_ids)} ranked, {len(unranked_ids)} unranked")


def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    today = date.today().isoformat()
    run_format(conn, "SF", today)
    run_format(conn, "1QB", today)
    conn.close()
    logger.info("Both SF and 1QB consensus complete.")


if __name__ == "__main__":
    run()
