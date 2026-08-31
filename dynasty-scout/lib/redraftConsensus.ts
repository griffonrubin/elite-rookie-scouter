/**
 * Redraft (PPR) consensus rankings.
 *
 * A faithful port of scrapers/redraft/run_redraft_consensus.py, so the board's
 * consensus can be rebuilt in the same pass that refreshes a source instead of
 * waiting for someone to run the local pipeline. Two implementations of one
 * piece of arithmetic is a liability, so this one is held to producing byte-
 * identical output: scripts/consensus_parity.ts compares every field of every
 * row against the Python run over the same data.
 *
 * That parity is why the details below are fussier than they look — Python's
 * round() breaks ties to even, statistics.pstdev works in exact rationals, and
 * float addition is order-dependent, so all three are reproduced rather than
 * approximated.
 */

/**
 * Weighted to balance two kinds of signal: editorial boards (what analysts
 * think should happen) against market ADP (where players actually go).
 *
 * Declaration order matters. The weighted score is a running float sum, and
 * float addition is not associative, so summing in a different order can move
 * the last bits and flip two near-equal players. Kept in the same order as
 * SOURCE_WEIGHTS in the Python.
 */
export const SOURCE_WEIGHTS: Record<string, number> = {
    // editorial
    'FantasyPros PPR': 0.18,
    'ESPN Redraft': 0.12,
    'Flock Redraft': 0.10,
    'CBS Redraft': 0.08,
    // market / ADP
    'Sleeper Redraft': 0.12,
    'Yahoo Redraft': 0.10,
    'Underdog Redraft': 0.10,
    'FantasyCalc Redraft': 0.07,
    'KeepTradeCut Redraft': 0.07,
    'FFPC Redraft': 0.06,
};

/** A player nobody ranked sits at the bottom of a source's distribution. */
const ABSENT_PERCENTILE = 0.10;

export interface ConsensusRow {
    player_id: number;
    rank_overall: number;
    rank_positional: number;
    avg_rank: number;
    best_rank: number;
    worst_rank: number;
    std_deviation: number;
    num_sources: number;
}

/**
 * Python's round(): half-to-even on the value's shortest decimal form.
 *
 * JavaScript rounds halves away from zero, so round(2.25, 1) is 2.3 here and
 * 2.2 there. avg_rank lands on a .x5 boundary often enough that ignoring this
 * costs real rows.
 */
export function pyRound(x: number, digits: number): number {
    if (!Number.isFinite(x)) return x;
    // Work from the shortest round-tripping decimal string, which is what
    // Python's repr shows and what its rounding effectively sees.
    const s = x.toPrecision(17);
    const [intPart, fracPart = ''] = Number(s).toString().split('.');
    if (fracPart.length <= digits) return x;

    const keep = fracPart.slice(0, digits);
    const rest = fracPart.slice(digits);
    const base = Number(`${intPart}.${keep}` || '0');
    const step = Math.pow(10, -digits);
    const sign = x < 0 ? -1 : 1;

    const firstRest = rest[0];
    let roundUp: boolean;
    if (firstRest > '5') roundUp = true;
    else if (firstRest < '5') roundUp = false;
    else if (/[1-9]/.test(rest.slice(1))) roundUp = true;      // > half
    else {
        // Exactly half — go to even.
        const lastKept = keep.length ? keep[keep.length - 1] : intPart[intPart.length - 1];
        roundUp = (Number(lastKept) % 2) === 1;
    }
    const out = roundUp ? base + sign * step : base;
    // Re-round to kill the float noise the addition just introduced.
    return Number(out.toFixed(digits));
}

/**
 * Population standard deviation, computed the way statistics.pstdev does.
 *
 * Python sums in exact rationals before taking the square root. The ranks are
 * integers, so the same exactness is available here through the identity
 * variance = (n*Σx² − (Σx)²) / n², whose numerator is an integer — no float
 * error accumulates before the sqrt. A naive mean-then-subtract loop drifts
 * in the last bits and shows up after rounding to two places.
 */
export function pstdev(values: number[]): number {
    const n = values.length;
    if (n <= 1) return 0;
    let sum = 0;
    let sumSq = 0;
    for (const v of values) { sum += v; sumSq += v * v; }
    const variance = (n * sumSq - sum * sum) / (n * n);
    return Math.sqrt(Math.max(0, variance));
}

/**
 * Rank -> 0..1 within a source, so sources of different depth compare.
 *
 * Ties broken on player id: a source that ranked 389 players last week but
 * 193 today leaves the rest on last week's numbers, which overlap, and
 * without a tiebreak the percentile would depend on database row order.
 */
export function toPercentiles(ranks: Map<number, number>): Map<number, number> {
    const n = ranks.size;
    if (n <= 1) return new Map([...ranks.keys()].map(pid => [pid, 1.0]));
    const ordered = [...ranks.entries()].sort(
        (a, b) => (a[1] - b[1]) || (a[0] - b[0]));
    const out = new Map<number, number>();
    ordered.forEach(([pid], i) => out.set(pid, 1.0 - i / (n - 1)));
    return out;
}

/**
 * Build the consensus.
 *
 * `sourceRanks` is each source's newest rank per player; `pool` is every
 * redraft player's position. Weights are renormalised over whichever sources
 * actually reported, so a failed scrape degrades the consensus rather than
 * breaking it. Only players ranked by at least one source get a row.
 */
export function buildConsensus(
    sourceRanks: Map<string, Map<number, number>>,
    pool: Map<number, string>,
): ConsensusRow[] {
    const active = Object.keys(SOURCE_WEIGHTS).filter(s => sourceRanks.has(s));
    if (active.length === 0) return [];

    const total = active.reduce((t, s) => t + SOURCE_WEIGHTS[s], 0);
    const weights = active.map(s => [s, SOURCE_WEIGHTS[s] / total] as const);
    const pcts = new Map(active.map(s => [s, toPercentiles(sourceRanks.get(s)!)]));

    interface Score { pid: number; score: number; row: Omit<ConsensusRow, 'rank_overall' | 'rank_positional'> }
    const scores: Score[] = [];
    for (const pid of pool.keys()) {
        let weighted = 0;
        const ranks: number[] = [];
        for (const [src, w] of weights) {
            const pct = pcts.get(src)!.get(pid);
            if (pct === undefined) {
                weighted += w * ABSENT_PERCENTILE;
            } else {
                weighted += w * pct;
                ranks.push(sourceRanks.get(src)!.get(pid)!);
            }
        }
        if (ranks.length === 0) continue;      // unranked everywhere
        scores.push({
            pid,
            score: weighted,
            row: {
                player_id: pid,
                avg_rank: pyRound(ranks.reduce((a, b) => a + b, 0) / ranks.length, 1),
                best_rank: Math.min(...ranks),
                worst_rank: Math.max(...ranks),
                std_deviation: ranks.length > 1 ? pyRound(pstdev(ranks), 2) : 0.0,
                num_sources: ranks.length,
            },
        });
    }

    // Deterministic tiebreak, so the board order is reproducible rather than
    // an artefact of the order players came out of the database.
    scores.sort((a, b) => (b.score - a.score) || (a.pid - b.pid));

    const posCount: Record<string, number> = {};
    return scores.map((s, i) => {
        const pos = pool.get(s.pid) ?? '';
        posCount[pos] = (posCount[pos] ?? 0) + 1;
        return { ...s.row, rank_overall: i + 1, rank_positional: posCount[pos] };
    });
}
