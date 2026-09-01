/**
 * Prove lib/redraftConsensus.ts agrees with run_redraft_consensus.py.
 *
 * Two implementations of one piece of arithmetic only stay honest if their
 * agreement is checked. This reads the same rankings out of the local SQLite
 * database, runs the TypeScript consensus over them, and compares every field
 * of every row against what the Python wrote into consensus_rankings.
 *
 * Run the Python first, then:  npx tsx scripts/consensus_parity.ts
 */
import { query } from '@/lib/db';
import { buildConsensus, SOURCE_WEIGHTS, ConsensusRow } from '@/lib/redraftConsensus';

async function main() {
    const sources = Object.keys(SOURCE_WEIGHTS);
    const ph = sources.map((_, i) => `$${i + 1}`).join(',');
    const rows = await query<{ player_id: number; source: string; rank_overall: number }>(
        `SELECT r.player_id, r.source, r.rank_overall
           FROM rankings r
           JOIN (SELECT player_id, source, MAX(scraped_at) AS max_date
                   FROM rankings GROUP BY player_id, source) latest
             ON r.player_id = latest.player_id AND r.source = latest.source
            AND r.scraped_at = latest.max_date
          WHERE r.rank_overall IS NOT NULL AND r.rank_overall < 999
            AND r.source IN (${ph})`, sources);

    const sourceRanks = new Map<string, Map<number, number>>();
    for (const r of rows) {
        if (!sourceRanks.has(r.source)) sourceRanks.set(r.source, new Map());
        sourceRanks.get(r.source)!.set(r.player_id, r.rank_overall);
    }
    const pool = new Map((await query<{ id: number; position: string | null }>(
        `SELECT id, position FROM players WHERE redraft_pool = 1`))
        .map(p => [p.id, (p.position || '').toUpperCase()] as const));

    const mine = buildConsensus(sourceRanks, pool);

    const day = (await query<{ d: string }>(
        `SELECT MAX(calculated_at) AS d FROM consensus_rankings WHERE format = 'REDRAFT'`))[0].d;
    const theirs = await query<ConsensusRow>(
        `SELECT player_id, rank_overall, rank_positional, avg_rank, best_rank,
                worst_rank, std_deviation, num_sources
           FROM consensus_rankings WHERE format = 'REDRAFT' AND calculated_at = $1`, [day]);

    console.log(`python rows ${theirs.length} (${day})   typescript rows ${mine.length}`);
    const byPid = new Map(theirs.map(r => [r.player_id, r]));
    const FIELDS = ['rank_overall', 'rank_positional', 'avg_rank', 'best_rank',
                    'worst_rank', 'std_deviation', 'num_sources'] as const;

    let diffs = 0;
    const counts: Record<string, number> = {};
    for (const m of mine) {
        const t = byPid.get(m.player_id);
        if (!t) { diffs++; console.log(`MISSING in python: ${m.player_id}`); continue; }
        for (const f of FIELDS) {
            if (Number(m[f]) !== Number(t[f])) {
                counts[f] = (counts[f] ?? 0) + 1;
                if (diffs < 12) {
                    console.log(`  pid ${m.player_id} ${f}: ts=${m[f]} py=${t[f]}`);
                }
                diffs++;
            }
        }
    }
    for (const t of theirs) if (!mine.some(m => m.player_id === t.player_id)) {
        console.log(`MISSING in typescript: ${t.player_id}`); diffs++;
    }

    if (diffs === 0) console.log('\nPARITY OK — every field of every row matches');
    else console.log(`\n${diffs} MISMATCHES`, counts);
    process.exit(diffs === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
