"""
Redraft (PPR) consensus rankings.

Same weighted-percentile method as scrapers/run_consensus.py, with three
redraft-specific changes:

  * iterates the redraft pool rather than the 2026 rookie class;
  * computes rank_positional, which K and D/ST boards depend on;
  * computes a real std_deviation (the rookie runner writes 0.0), so the
    board can show how contested a player's ranking is.

Only players ranked by at least one source get a consensus row. Everyone
else is simply absent, and the board's LEFT JOIN sorts them last — that
avoids writing ~800 meaningless rows for the deep end of the pool.

Weights are renormalised over whichever sources actually reported, so a
scraper that fails degrades the consensus rather than breaking it.

Usage:  py -m scrapers.redraft.run_redraft_consensus
"""
import sqlite3
import statistics
import sys
from datetime import date

DB_FILE = "dynasty_scout.db"
FORMAT = "REDRAFT"

# FantasyPros leads because its ECR is itself a 100+ expert consensus and it
# is the only source covering the full board including K and D/ST.
SOURCE_WEIGHTS = {
    "FantasyPros PPR":      0.20,
    "ESPN Redraft":         0.15,
    "KeepTradeCut Redraft": 0.15,
    "CBS Redraft":          0.10,
    "Yahoo Redraft":        0.10,
    "Sleeper Redraft":      0.10,
    "FantasyCalc Redraft":  0.10,
    "Flock Redraft":        0.10,
}

# A player nobody ranked sits at the bottom of a source's distribution
# rather than being ignored, so broad coverage is rewarded.
ABSENT_PERCENTILE = 0.10

UPSERT = """
INSERT INTO consensus_rankings
    (player_id, format, rank_overall, rank_positional, avg_rank, best_rank,
     worst_rank, std_deviation, num_sources, calculated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(player_id, format, calculated_at) DO UPDATE SET
    rank_overall    = excluded.rank_overall,
    rank_positional = excluded.rank_positional,
    avg_rank        = excluded.avg_rank,
    best_rank       = excluded.best_rank,
    worst_rank      = excluded.worst_rank,
    std_deviation   = excluded.std_deviation,
    num_sources     = excluded.num_sources
"""


def latest_ranks(cur):
    """{source: {player_id: rank}} using each source's most recent scrape."""
    cur.execute("""
        SELECT r.player_id, r.source, r.rank_overall
        FROM rankings r
        JOIN (
            SELECT player_id, source, MAX(scraped_at) AS max_date
            FROM rankings GROUP BY player_id, source
        ) latest
          ON r.player_id = latest.player_id
         AND r.source    = latest.source
         AND r.scraped_at = latest.max_date
        WHERE r.rank_overall IS NOT NULL
          AND r.rank_overall < 999
          AND r.source IN (%s)
    """ % ",".join("?" * len(SOURCE_WEIGHTS)), tuple(SOURCE_WEIGHTS))

    out = {}
    for row in cur.fetchall():
        out.setdefault(row["source"], {})[row["player_id"]] = row["rank_overall"]
    return out


def to_percentiles(ranks):
    """Rank -> 0..1 within a source, so sources of different depth compare."""
    n = len(ranks)
    if n <= 1:
        return {pid: 1.0 for pid in ranks}
    ordered = sorted(ranks, key=lambda p: ranks[p])
    return {pid: 1.0 - i / (n - 1) for i, pid in enumerate(ordered)}


def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    today = date.today().isoformat()

    source_ranks = latest_ranks(cur)
    active = [s for s in SOURCE_WEIGHTS if s in source_ranks]
    if not active:
        print("No redraft ranking sources present — run the scrapers first.")
        return 1

    total = sum(SOURCE_WEIGHTS[s] for s in active)
    weights = {s: SOURCE_WEIGHTS[s] / total for s in active}
    print("Active sources:")
    for s in active:
        print(f"  {s:<24} weight {weights[s]:.3f}  ({len(source_ranks[s])} players)")
    missing = [s for s in SOURCE_WEIGHTS if s not in active]
    if missing:
        print(f"Missing (weights redistributed): {', '.join(missing)}")

    source_pct = {s: to_percentiles(source_ranks[s]) for s in active}

    cur.execute("SELECT id, position FROM players WHERE redraft_pool = 1")
    pool = {r["id"]: (r["position"] or "").upper() for r in cur.fetchall()}

    scores = {}
    for pid in pool:
        weighted = 0.0
        ranks = []
        for src, w in weights.items():
            pct = source_pct[src].get(pid)
            if pct is None:
                weighted += w * ABSENT_PERCENTILE
            else:
                weighted += w * pct
                ranks.append(source_ranks[src][pid])
        if not ranks:
            continue  # unranked everywhere — no consensus row
        scores[pid] = {
            "score": weighted,
            "avg_rank": round(sum(ranks) / len(ranks), 1),
            "best_rank": min(ranks),
            "worst_rank": max(ranks),
            "std": round(statistics.pstdev(ranks), 2) if len(ranks) > 1 else 0.0,
            "num_sources": len(ranks),
        }

    ordered = sorted(scores, key=lambda p: scores[p]["score"], reverse=True)

    pos_counter = {}
    for overall, pid in enumerate(ordered, 1):
        pos = pool[pid]
        pos_counter[pos] = pos_counter.get(pos, 0) + 1
        d = scores[pid]
        cur.execute(UPSERT, (
            pid, FORMAT, overall, pos_counter[pos], d["avg_rank"], d["best_rank"],
            d["worst_rank"], d["std"], d["num_sources"], today,
        ))

    conn.commit()

    print(f"\nConsensus written for {len(ordered)} players")
    print("By position: " + ", ".join(f"{p}={n}" for p, n in sorted(pos_counter.items())))
    print("\nTop 15:")
    cur.execute("""
        SELECT c.rank_overall, p.full_name, p.position, c.rank_positional,
               p.nfl_team, c.avg_rank, c.best_rank, c.worst_rank,
               c.std_deviation, c.num_sources
        FROM consensus_rankings c JOIN players p ON p.id = c.player_id
        WHERE c.format = ? AND c.calculated_at = ?
        ORDER BY c.rank_overall LIMIT 15
    """, (FORMAT, today))
    for r in cur.fetchall():
        print(f"  {r['rank_overall']:>3}. {r['full_name']:<24} "
              f"{r['position']}{r['rank_positional']:<3} {str(r['nfl_team'] or '--'):<4} "
              f"avg {r['avg_rank']:>5}  range {r['best_rank']}-{r['worst_rank']}  "
              f"sd {r['std_deviation']:>5}  n={r['num_sources']}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(run())
