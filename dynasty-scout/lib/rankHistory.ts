/**
 * A player's ranking, day by day.
 *
 * This is the reason the rankings table is written with
 * ON CONFLICT (player_id, source, scraped_at) rather than a delete and a
 * reinsert: keeping the date means a rank is a line you can draw instead of
 * a number you can only read today. A player who has slid from 20th to 50th
 * over a month and one who has sat at 50th all year look identical on a
 * board and are not remotely the same asset.
 */
import { query } from '@/lib/db';
import type { RankPoint } from '@/components/RankHistoryChart';

/**
 * The redraft consensus, which already stores its own spread.
 *
 * `consensus_rankings` keeps best_rank and worst_rank per day alongside the
 * consensus, so the band comes free — no need to re-derive the disagreement
 * from the ten underlying sources.
 */
export async function redraftRankHistory(playerId: number): Promise<RankPoint[]> {
    const rows = await query<{
        calculated_at: string; rank_overall: number;
        best_rank: number | null; worst_rank: number | null;
        num_sources: number | null;
    }>(
        `SELECT calculated_at, rank_overall, best_rank, worst_rank, num_sources
           FROM consensus_rankings
          WHERE player_id = $1 AND format = 'REDRAFT' AND rank_overall IS NOT NULL
          ORDER BY calculated_at`,
        [playerId]);
    return rows.map(r => ({
        date: String(r.calculated_at).slice(0, 10),
        rank: r.rank_overall,
        best: r.best_rank,
        worst: r.worst_rank,
        sources: r.num_sources,
    }));
}

/**
 * The dynasty market, which has no consensus table of its own.
 *
 * Drawn from the daily FantasyCalc feed rather than from the rookie sources.
 * Those are a frozen pre-draft snapshot — one date, deliberately — so a line
 * through them would be a flat segment that says nothing and implies the
 * board has not moved since May, when in fact nobody has asked it since.
 *
 * Both formats are offered because they genuinely disagree: a quarterback
 * moves in superflex for reasons that do not apply in 1QB.
 */
export async function dynastyRankHistory(
    playerId: number, format: '1qb' | 'sf' = '1qb',
): Promise<RankPoint[]> {
    const source = format === 'sf' ? 'FantasyCalc Dynasty SF' : 'FantasyCalc Dynasty';
    const rows = await query<{ scraped_at: string; rank_overall: number }>(
        `SELECT scraped_at, rank_overall
           FROM rankings
          WHERE player_id = $1 AND source = $2 AND rank_overall IS NOT NULL
          ORDER BY scraped_at`,
        [playerId, source]);
    return rows.map(r => ({
        date: String(r.scraped_at).slice(0, 10),
        rank: r.rank_overall,
    }));
}
