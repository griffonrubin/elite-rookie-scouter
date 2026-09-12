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
         percentile, usableSample, playProbability,
         SimPlayer, GameLog } from '@/lib/startSit';
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

    console.log('\n== 3c. matchup, isolated ==');
    // Total and spread held neutral so only the defence moves. The league
    // average is fixed at 7.0 and the sample is large, so the shrinkage term
    // is near 1 and the elasticity is what is being read here.
    for (const [lbl, allowed] of [
        ['toughest (5.7)', 5.7], ['average (7.0)', 7.0], ['softest (8.8)', 8.8],
    ] as const) {
        show(`WR vs ${lbl}`, buildOutcome({ playerId: nacua.id, position: 'WR',
            seasonProjection: 340, projectedGames: 17, logs: nacua.logs,
            context: {
                impliedTeamTotal: 22.5, spread: 0,
                defenseAllowed: allowed, defenseLeagueAvg: 7.0, defenseSample: 76,
            } }, CUR));
    }
    // A thin sample must barely move, whatever it claims.
    show('WR vs softest, 8 games only', buildOutcome({ playerId: nacua.id, position: 'WR',
        seasonProjection: 340, projectedGames: 17, logs: nacua.logs,
        context: {
            impliedTeamTotal: 22.5, spread: 0,
            defenseAllowed: 8.8, defenseLeagueAvg: 7.0, defenseSample: 8,
        } }, CUR));
    // No matchup data must leave the projection untouched.
    show('WR, no matchup data', buildOutcome({ playerId: nacua.id, position: 'WR',
        seasonProjection: 340, projectedGames: 17, logs: nacua.logs,
        context: { impliedTeamTotal: 22.5, spread: 0 } }, CUR));
    console.log('   (mean should rise with points allowed; the 8-game cell should sit');
    console.log('    close to average; no data should equal the average row exactly)');

    console.log('\n== 4. determinism ==');
    const mk = (o: any, s?: number[]): SimPlayer => ({ outcome: o, sample: s });
    const filler = (n: number, m: number) => Array.from({ length: n }, (_, i) =>
        mk({ playerId: 100 + i, mean: m, sd: 6, floor: m - 5, ceiling: m + 5, sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false }));
    const a1 = simulateMatchup([mk(gO)], [mk(nO)], 8000, 3).winProb;
    const a2 = simulateMatchup([mk(gO)], [mk(nO)], 8000, 3).winProb;
    console.log(`   same seed twice: ${a1} vs ${a2} -> ${a1 === a2 ? 'stable' : 'UNSTABLE'}`);

    console.log('\n== 4b. a sample that does not describe the player ==');
    // nflverse scores no kicking, so every kicker-week in the table reads 0.0.
    // Resampled at face value that scored a lineup as if its kicker were not
    // in it. The lineup below is one kicker; its simulated total must land on
    // the kicker's mean, not on zero.
    const kicker = { playerId: 9, mean: 9.9, sd: 2.8, floor: 7.5, ceiling: 12.2,
        sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false };
    const zeroes = Array.from({ length: 17 }, () => 0);
    const nobody = [mk({ ...kicker, playerId: 10, mean: 0.01, sd: 0.01 })];
    for (const [lbl, smp] of [['all-zero games', zeroes], ['no games', undefined]] as const) {
        const odds = simulateMatchup([mk(kicker, smp as number[] | undefined)], nobody, 8000, 5);
        console.log(`   ${lbl.padEnd(16)} simulated points for ${odds.pointsFor} (must be ~9.9, never 0)`);
    }
    console.log('   usableSample: zeroes ->', usableSample(zeroes),
        '| real games ->', usableSample([4, 12, 9, 21, 7]));

    console.log('\n== 3d. the market replaces the adjustments, never joins them ==');
    // A prop line already prices the total, the spread and the defence. The
    // trap is adding the model's tilt on top and counting the same thing
    // twice, so the market centre must be the market number exactly — the
    // same under a great environment and an awful one.
    const loud = { impliedTeamTotal: 30, spread: -10, defenseAllowed: 9.5,
        defenseLeagueAvg: 6.8, defenseSample: 80 };
    const grim = { impliedTeamTotal: 15, spread: 9, defenseAllowed: 5.2,
        defenseLeagueAvg: 6.8, defenseSample: 80 };
    for (const [lbl, ctx] of [['great spot', loud], ['awful spot', grim]] as const) {
        const withMarket = buildOutcome({ playerId: nacua.id, position: 'WR',
            seasonProjection: 340, projectedGames: 17, logs: nacua.logs,
            marketProjection: 18.4, marketMarkets: 3, context: ctx }, CUR);
        const without = buildOutcome({ playerId: nacua.id, position: 'WR',
            seasonProjection: 340, projectedGames: 17, logs: nacua.logs,
            context: ctx }, CUR);
        console.log(`   ${lbl.padEnd(11)} market ${withMarket.mean} (${withMarket.centreSource})`
            + `   model ${without.mean} (${without.centreSource})`);
    }
    // Thinly priced is not priced: one market alone leaves the model in charge.
    const thin = buildOutcome({ playerId: nacua.id, position: 'WR',
        seasonProjection: 340, projectedGames: 17, logs: nacua.logs,
        marketProjection: 18.4, marketMarkets: 1, context: loud }, CUR);
    console.log(`   one market only -> ${thin.mean} (${thin.centreSource})`);
    console.log('   (both market rows must read 18.4; the model rows must differ)');

    console.log('\n== 4c. injury risk is variance, not a haircut ==');
    // The same expected points, arrived at two ways: a player who always
    // plays and scores 13, and a player who scores 20 in the 65% of weeks he
    // suits up. Both average 13. They are not the same start, and a model
    // that only scaled the mean could never say which.
    const healthy = { playerId: 20, mean: 13, sd: 4, floor: 9, ceiling: 17,
        sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false,
        playProbability: 1, availability: null };
    const doubtful = { ...healthy, playerId: 21, mean: 20, sd: 4, floor: 16,
        ceiling: 24, playProbability: 0.65, availability: 'Questionable' };
    for (const [lbl, oppTotal] of [['trailing badly', 150], ['level', 110]] as const) {
        const opp = filler(8, oppTotal / 8);
        const a = simulateMatchup([mk(healthy), ...filler(7, 13)], opp, 12000, 7);
        const b = simulateMatchup([mk(doubtful), ...filler(7, 13)], opp, 12000, 7);
        console.log(`   ${lbl.padEnd(15)} certain 13.0 -> ${(a.winProb * 100).toFixed(1)}% | `
            + `65% of 20.0 -> ${(b.winProb * 100).toFixed(1)}%`);
    }
    console.log('   (same expected points; the gamble should win more when behind)');
    console.log('   play rates:',
        ['Out', 'Doubtful', 'Questionable'].map(r =>
            `${r}=${playProbability({ reportStatus: r })}`).join(' '),
        '| DNP-no-status =', playProbability({ practiceStatus: 'Did Not Participate In Practice' }),
        '| nothing reported =', playProbability({}));

    console.log('\n== 5. the case that justifies the whole model ==');
    // A safe starter vs a volatile bench player worth slightly fewer points.
    const safe  = { playerId: 1, mean: 14.0, sd: 3.0,  floor: 11, ceiling: 17, sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false };
    const spiky = { playerId: 2, mean: 13.0, sd: 11.0, floor: 2,  ceiling: 28, sample: 17, formWeight: 0, contextAdjustment: 0, onBye: false };
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
    // ── 6. the decomposition has to add up ──────────────────────────────────
    //
    // The panel's whole claim is that base plus the contributions is the mean.
    // Rounding each on its own quietly breaks that — 17.34 with -0.16, -0.47 and
    // +0.14 displays as 17.3 with -0.2, -0.5, +0.1 and sums to 16.7 next to a
    // stated 16.9 — so the identity is asserted on the rounded numbers, which is
    // what a reader actually adds up.
    console.log('\n== 6. the parts add to the whole ==');
    {
        const logs = (pts: number[]) =>
            pts.map((points, i) => ({ season: 2025, week: i + 1, points }));
        const cases: [string, Parameters<typeof buildOutcome>[0]][] = [
            ['soft spot', { playerId: 1, position: 'RB', logs: logs([14, 9, 18, 11, 16, 12, 13]),
                context: { impliedTeamTotal: 28.25, spread: -7,
                    defenseAllowed: 19.5, defenseLeagueAvg: 14, defenseSample: 40 } }],
            ['tough spot', { playerId: 2, position: 'WR', logs: logs([11, 7, 15, 9, 13]),
                context: { impliedTeamTotal: 17.5, spread: 7,
                    defenseAllowed: 4.5, defenseLeagueAvg: 6.8, defenseSample: 60 } }],
            ['awkward rounding', { playerId: 3, position: 'RB',
                logs: logs([17.3, 17.4, 17.35, 17.33, 17.37]),
                context: { impliedTeamTotal: 22.0, spread: 3.5,
                    defenseAllowed: 8.0, defenseLeagueAvg: 7.7, defenseSample: 49 } }],
            ['market priced', { playerId: 4, position: 'WR', logs: logs([10, 12, 8, 14, 11]),
                marketProjection: 17.5, marketMarkets: 3,
                context: { impliedTeamTotal: 28, spread: -7,
                    defenseAllowed: 20, defenseLeagueAvg: 14, defenseSample: 40 } }],
        ];
        for (const [label, input] of cases) {
            const o = buildOutcome(input, 2025);
            const d = o.drivers;
            const sum = Math.round(
                (d.base + d.teamTotal + d.script + d.matchup + d.market) * 10) / 10;
            const adds = Math.abs(sum - o.mean) < 0.051;
            console.log(`   ${adds ? 'ok  ' : 'FAIL'} ${label.padEnd(18)}`
                + ` ${d.base} ${d.teamTotal >= 0 ? '+' : ''}${d.teamTotal}`
                + ` ${d.script >= 0 ? '+' : ''}${d.script}`
                + ` ${d.matchup >= 0 ? '+' : ''}${d.matchup}`
                + `${d.market ? ` mkt ${d.market >= 0 ? '+' : ''}${d.market}` : ''}`
                + ` = ${sum}  mean ${o.mean}`);
            if (!adds) process.exitCode = 1;
        }
        // ── the base is a blend, and says so ────────────────────────────────
    //
    // How much of a player is August's projection and how much is what he
    // has done since is the most contestable choice here, so the split has
    // to be reported and has to reconcile with the weight it claims.
    console.log('\n== 7. the base splits into projection and form ==');
    {
        const g = (season: number, pts: number[]) =>
            pts.map((points, i) => ({ season, week: i + 1, points }));
        for (const n of [0, 4, 16]) {
            const o = buildOutcome({ playerId: 9, position: 'RB',
                seasonProjection: 13 * 17, projectedGames: 17,
                logs: [...g(2024, [12, 14, 13, 11, 12]), ...g(2025, Array(n).fill(19))],
                context: {} }, 2025);
            const { projectionPerGame: proj, formMean: form, base } = o.drivers;
            const w = o.formWeight;
            const rebuilt = form == null ? proj
                : Math.round(((proj ?? 0) * (1 - w) + form * w) * 10) / 10;
            const agrees = rebuilt != null && Math.abs(rebuilt - base) < 0.11;
            console.log(`   ${agrees ? 'ok  ' : 'FAIL'} ${String(n).padStart(2)} games`
                + `  weight ${(w * 100).toFixed(0)}%  form ${form ?? '—'}`
                + `  proj ${proj}  base ${base}`);
            if (!agrees) process.exitCode = 1;
            // With no games this season there is nothing to blend, and the
            // panel must say "all projection" rather than invent a form.
            if (n === 0 && form !== null) {
                console.log('   FAIL no games played must leave form null');
                process.exitCode = 1;
            }
        }
    }

    // The market replaces the model's tilt; it must never stack on top of it.
        const m = buildOutcome(cases[3][1], 2025);
        const stacked = m.drivers.teamTotal || m.drivers.script || m.drivers.matchup;
        console.log(`   ${stacked ? 'FAIL' : 'ok  '} a priced player has no model tilt`
            + `  ${stacked ? 'stacked!' : 'replaced, not added'}`);
        if (stacked) process.exitCode = 1;
    }

}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
