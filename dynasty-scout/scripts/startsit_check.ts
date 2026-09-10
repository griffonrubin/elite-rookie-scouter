/**
 * Check the start/sit model against real game logs.
 *
 * The parts worth guarding are the ones a type error cannot reach: that a
 * single game does not rewrite a season, that two players with the same
 * projection keep different shapes, that the game-environment adjustments
 * point the right way, that the simulation is repeatable, and — the reason
 * the model exists — that the same swap can be right for an underdog and
 * wrong for a favourite.
 *
 * The game-script signs in particular shipped inverted the first time and
 * looked entirely plausible in the output. Isolating one effect at a time is
 * what caught it.
 *
 * Run:  npx tsx scripts/startsit_check.ts
 */
import { buildOutcome, simulateMatchup, rankSwaps, makeRng, formWeight,
         percentile, SimPlayer, GameLog } from '@/lib/startSit';
import { query } from '@/lib/db';

const CUR = 2026;
async function logsFor(name: string) {
    const rows = await query<{ id: number; position: string; season: number; week: number; f: number }>(
        `SELECT p.id, p.position, w.season, w.week, w.fantasy_points_ppr f
           FROM nfl_player_week w JOIN players p ON p.id = w.player_id
          WHERE p.full_name = $1 AND w.season_type = 'REG' ORDER BY w.season, w.week`, [name]);
    if (!rows.length) throw new Error(`no logs for ${name}`);
    return { id: rows[0].id, position: rows[0].position,
             logs: rows.map(r => ({ season: r.season, week: r.week, points: r.f })) as GameLog[] };
}

function show(label: string, o: ReturnType<typeof buildOutcome>) {
    console.log(`  ${label.padEnd(22)} mean ${String(o.mean).padStart(5)}  sd ${String(o.sd).padStart(5)}`
        + `  floor ${String(o.floor).padStart(5)}  ceil ${String(o.ceiling).padStart(5)}`
        + `  n=${o.sample}  ctx ${o.contextAdjustment >= 0 ? '+' : ''}${o.contextAdjustment}`);
}

async function main() {
    console.log('== 1. formWeight: one game must not rewrite a season ==');
    for (const g of [0, 1, 2, 4, 8, 12]) console.log(`   ${g} games -> ${(formWeight(g) * 100).toFixed(0)}% form`);

    console.log('\n== 2. same projection, different shape ==');
    const gibbs = await logsFor('Jahmyr Gibbs');
    const nacua = await logsFor('Puka Nacua');
    const gO = buildOutcome({ playerId: gibbs.id, position: gibbs.position,
        seasonProjection: 340, projectedGames: 17, logs: gibbs.logs }, CUR);
    const nO = buildOutcome({ playerId: nacua.id, position: nacua.position,
        seasonProjection: 340, projectedGames: 17, logs: nacua.logs }, CUR);
    show('Gibbs (proj 20.0/wk)', gO);
    show('Nacua (proj 20.0/wk)', nO);
    console.log(`   identical projection, floor differs by ${(nO.floor - gO.floor).toFixed(1)} pts`);

    console.log('\n== 3a. implied team total (spread held at 0) ==');
    for (const t of [17, 22.5, 28]) {
        show(`RB total ${t}`, buildOutcome({ playerId: gibbs.id, position: 'RB',
            seasonProjection: 340, projectedGames: 17, logs: gibbs.logs,
            context: { impliedTeamTotal: t, spread: 0 } }, CUR));
    }

    console.log('\n== 3b. game script (total held at 22.5, spread varies) ==');
    for (const sp of [-7, 0, +7]) {
        show(`RB spread ${sp > 0 ? '+' : ''}${sp}`, buildOutcome({ playerId: gibbs.id, position: 'RB',
            seasonProjection: 340, projectedGames: 17, logs: gibbs.logs,
            context: { impliedTeamTotal: 22.5, spread: sp } }, CUR));
        show(`WR spread ${sp > 0 ? '+' : ''}${sp}`, buildOutcome({ playerId: nacua.id, position: 'WR',
            seasonProjection: 340, projectedGames: 17, logs: nacua.logs,
            context: { impliedTeamTotal: 22.5, spread: sp } }, CUR));
    }
    console.log('   (RB should fall as the spread rises, WR should rise)');

    show('RB bye', buildOutcome({ playerId: gibbs.id, position: 'RB',
        seasonProjection: 340, projectedGames: 17, logs: gibbs.logs,
        context: { onBye: true } }, CUR));

    console.log('\n== 4. determinism ==');
    const mk = (o: any, s?: number[]): SimPlayer => ({ outcome: o, sample: s });
    const a1 = simulateMatchup([mk(gO)], [mk(nO)], 8000, 3).winProb;
    const a2 = simulateMatchup([mk(gO)], [mk(nO)], 8000, 3).winProb;
    console.log(`   same seed twice: ${a1} vs ${a2} -> ${a1 === a2 ? 'stable' : 'UNSTABLE'}`);

    console.log('\n== 5. the case that justifies the whole model ==');
    // A safe starter vs a volatile bench player worth slightly fewer points.
    const safe  = { playerId: 1, mean: 14.0, sd: 3.0,  floor: 11, ceiling: 17, sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false };
    const spiky = { playerId: 2, mean: 13.0, sd: 11.0, floor: 2,  ceiling: 28, sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false };
    const filler = (n: number, m: number) => Array.from({ length: n }, (_, i) =>
        mk({ playerId: 100 + i, mean: m, sd: 6, floor: m - 5, ceiling: m + 5, sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false }));
    for (const [lbl, oppMean] of [['heavy favourite', 95], ['even', 118], ['heavy underdog', 145]] as const) {
        const opp = filler(8, oppMean / 8);
        const starters = [mk(safe), ...filler(7, 13)];
        const bench = [mk(spiky)];
        const v = rankSwaps(starters, bench, opp, (_b, sIdx) => sIdx === 0, 6000)[0];
        console.log(`   ${lbl.padEnd(16)} swap spiky in for safe: `
            + `${v.deltaPoints >= 0 ? '+' : ''}${v.deltaPoints} pts, `
            + `${v.deltaWinProb >= 0 ? '+' : ''}${v.deltaWinProb} pp win prob`);
    }
    console.log('   (points delta is constant; the win-prob delta should flip sign)');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
