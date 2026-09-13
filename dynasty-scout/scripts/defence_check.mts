/**
 * What a defence gives up, and the measure it is counted in.
 *
 * The page this pins exists because one number does not decide anything.
 * "Points allowed to running backs" does not say whether a defence is being
 * run through or thrown past, and those are opposite recommendations for the
 * two backs on a bench. Seattle last season gave up the fewest yards a carry
 * in the league and the most catches to backs at the same time.
 *
 * It also pins a correction to the model. The matchup adjustment used to
 * read an average over *player*-games, which divides by how many players a
 * defence happened to face — so a defence that kept meeting committee
 * backfields read as stingy while conceding exactly as much. Against the
 * same season the two orderings disagree by up to eleven places, which means
 * the model was moving projections toward the wrong defences. Measured here
 * rather than asserted, because the size of that disagreement is the reason
 * the change was worth making.
 */
import { query } from '../lib/db';
import {
    DEFENCE_POSITIONS, matchupScore, rankBand, rankDefences,
    type DefenceTotals,
} from '../lib/defence';
import { defenceCount, loadDefenceTotals } from '../lib/defenceTotals';
import { matchupEdge } from '../lib/startSit';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SEASON = 2026;

step(1, 'every defence is described, per position');
const totals = await loadDefenceTotals(SEASON);
const of = defenceCount(totals);
console.log(`      ${of} defences, ${totals.length} cells, `
    + `seasons ${[...new Set(totals.map(t => t.season))].sort().join(' and ')}`);
assert('the whole league is there', of >= 30 && of <= 32, String(of));
assert('four positions each', totals.length === of * DEFENCE_POSITIONS.length,
    `${totals.length} for ${of} × ${DEFENCE_POSITIONS.length}`);
assert('every cell has games behind it', totals.every(t => t.games > 0),
    String(totals.filter(t => t.games <= 0).length));
// A team-game, not a player-game: a defence concedes to all of a position's
// players at once, so the numbers are team totals and land far higher than
// the per-player figures the model used to read.
const rbPoints = totals.filter(t => t.position === 'RB').map(t => t.points);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`      backs: ${avg(rbPoints).toFixed(1)} a game on average, `
    + `${Math.min(...rbPoints).toFixed(1)} to ${Math.max(...rbPoints).toFixed(1)}`);
assert('the unit is a team-game', avg(rbPoints) > 14 && avg(rbPoints) < 30,
    avg(rbPoints).toFixed(1));

step(2, 'the correction: player-games and team-games are different leagues');
/**
 * The old measure, recomputed here so the size of the change is a
 * measurement rather than a claim in a commit message.
 */
const perPlayer = await query<{ defense: string; position: string; v: number }>(
    `SELECT opponent AS defense, position, AVG(fantasy_points_ppr) AS v
       FROM nfl_player_week
      WHERE season = ${SEASON - 1} AND season_type = 'REG'
        AND opponent IS NOT NULL AND fantasy_points_ppr IS NOT NULL
        AND position IN ('QB','RB','WR','TE')
      GROUP BY opponent, position`, []);
let worst = 0;
let worstAt = '';
for (const position of DEFENCE_POSITIONS) {
    const order = (xs: { defense: string; v: number }[]) =>
        [...xs].sort((a, b) => b.v - a.v).map(x => x.defense);
    const oldOrder = order(perPlayer.filter(r => r.position === position)
        .map(r => ({ defense: r.defense, v: Number(r.v) })));
    const newOrder = order(totals.filter(t => t.position === position)
        .map(t => ({ defense: t.defense, v: t.points })));
    let moved = 0;
    oldOrder.forEach((d, i) => {
        const j = newOrder.indexOf(d);
        if (j >= 0) moved = Math.max(moved, Math.abs(i - j));
    });
    console.log(`      ${position}: worst move ${moved} places`);
    if (moved > worst) { worst = moved; worstAt = position; }
}
assert('the two measures really do disagree', worst >= 5,
    `${worst} places at ${worstAt}`);
// Which is the finding: not that one number changed, but that the model was
// pointing at different defences.
assert('by enough to have been pointing at the wrong defences', worst >= 7,
    `${worst} places`);

step(3, 'ranks are ranks: one is the most generous, ties share');
const cells = rankDefences(totals);
for (const position of DEFENCE_POSITIONS) {
    const rows = cells.filter(c => c.position === position)
        .sort((a, b) => a.pointsRank - b.pointsRank);
    const top = rows[0];
    const bottom = rows[rows.length - 1];
    console.log(`      ${position}: ${top.defense} ${top.points} (rank ${top.pointsRank}) `
        + `→ ${bottom.defense} ${bottom.points} (rank ${bottom.pointsRank})`);
    assert(`${position}: rank 1 concedes the most`,
        top.points === Math.max(...rows.map(r => r.points)), String(top.points));
    assert(`${position}: the last rank concedes the least`,
        bottom.points === Math.min(...rows.map(r => r.points)), String(bottom.points));
    assert(`${position}: ranks never exceed the league`,
        rows.every(r => r.pointsRank >= 1 && r.pointsRank <= of),
        rows.map(r => r.pointsRank).join(',').slice(0, 40));
    assert(`${position}: the league average is the league's average`,
        Math.abs(top.pointsLeagueAvg - avg(rows.map(r => r.points))) < 0.1,
        `${top.pointsLeagueAvg} vs ${avg(rows.map(r => r.points)).toFixed(1)}`);
}

step(4, 'the mechanism is separable, which is the whole point');
/**
 * A single figure cannot distinguish a defence being run through from one
 * being thrown past, and those are opposite recommendations for the two
 * backs on a bench. So the page must be able to find a defence that is
 * hard to run on and easy to throw at.
 */
const rbCells = cells.filter(c => c.position === 'RB');
const split = rbCells
    .map(c => ({
        d: c.defense,
        ypc: c.stats.find(s => s.key === 'ypc')!.rank,
        catches: c.stats.find(s => s.key === 'receptions')!.rank,
    }))
    .sort((a, b) => (b.ypc - b.catches) - (a.ypc - a.catches));
const sharpest = split[0];
console.log(`      ${sharpest.d}: ${sharpest.ypc} of ${of} on yards a carry, `
    + `${sharpest.catches} of ${of} on catches allowed`);
assert('a defence can be tough on the ground and soft through the air',
    sharpest.ypc - sharpest.catches > 15,
    `${sharpest.ypc - sharpest.catches} places apart`);
assert('and every stat is ranked across the league',
    cells.every(c => c.stats.every(s => s.rank >= 1 && s.rank <= of)));
assert('with a league average beside it',
    cells.every(c => c.stats.every(s => Number.isFinite(s.leagueAvg))));

step(5, 'the score is a place in the league, not an opinion');
assert('the softest defence scores ten', matchupScore(1, 32) === 10,
    String(matchupScore(1, 32)));
assert('the hardest scores nothing', matchupScore(32, 32) === 0,
    String(matchupScore(32, 32)));
assert('the middle is a five', Math.abs(matchupScore(16, 32) - 5.2) < 0.2,
    String(matchupScore(16, 32)));
assert('it falls as the rank rises', (() => {
    const xs = Array.from({ length: 32 }, (_, i) => matchupScore(i + 1, 32));
    return xs.every((v, i) => i === 0 || v <= xs[i - 1]);
})());
assert('a league of one is not a ranking', matchupScore(1, 1) === 5,
    String(matchupScore(1, 1)));
console.log('      bands: ' + [1, 5, 11, 16, 22, 28, 32]
    .map(r => `${r}→${rankBand(r, 32)}`).join(' '));
assert('the softest is called soft', rankBand(1, 32) === 'soft');
assert('the hardest is called tough', rankBand(32, 32) === 'tough');
assert('and the middle is not called either',
    rankBand(16, 32) === 'middling' && rankBand(17, 32) === 'middling');

step(6, 'the model reads the same numbers the page draws');
/**
 * They come from one loader, so this cannot drift — which is the point of
 * asserting it. A rating that contradicts the projection printed beside it
 * is worse than no rating, and two copies of one query disagree eventually.
 */
const sample = cells.filter(c => c.position === 'TE').slice(0, 3);
for (const c of sample) {
    const edge = matchupEdge({
        defenseAllowed: c.points,
        defenseLeagueAvg: c.pointsLeagueAvg,
        defenseSample: c.games,
    });
    console.log(`      ${c.defense} vs TE: ${c.points} against ${c.pointsLeagueAvg}, `
        + `${c.games} games → ${(edge * 100).toFixed(1)}% on a projection`);
    assert(`${c.defense}: the edge points the way the numbers do`,
        Math.sign(edge) === Math.sign(c.points - c.pointsLeagueAvg)
            || c.points === c.pointsLeagueAvg,
        edge.toFixed(3));
    // Shrunk and discounted: a full season of a defence is worth a quarter
    // of its raw edge, and never the whole of it.
    assert(`${c.defense}: and is shrunk rather than taken at face value`,
        Math.abs(edge) < Math.abs(c.points / c.pointsLeagueAvg - 1),
        `${(edge * 100).toFixed(1)}% of `
        + `${((c.points / c.pointsLeagueAvg - 1) * 100).toFixed(1)}%`);
}

step(7, 'a full season shrinks exactly as much as it used to');
/**
 * The prior moved from sixty player-games to seventeen team-games. That is a
 * change of units, not of strength: a defence with a full season behind it
 * must still have its raw edge halved by sample size, or this would be a
 * quiet re-tuning of how much matchups matter dressed up as a bug fix.
 */
const full = matchupEdge({ defenseAllowed: 20, defenseLeagueAvg: 10, defenseSample: 17 });
const raw = 20 / 10 - 1;
console.log(`      a full season at twice the league average: `
    + `${(full * 100).toFixed(1)}% of a ${(raw * 100).toFixed(0)}% raw edge`);
assert('a season of evidence still carries a quarter of the raw edge',
    Math.abs(full / raw - 0.25) < 0.02, (full / raw).toFixed(3));
const half = matchupEdge({ defenseAllowed: 20, defenseLeagueAvg: 10, defenseSample: 4 });
assert('and four games carry far less', half < full * 0.6,
    `${(half * 100).toFixed(1)}% vs ${(full * 100).toFixed(1)}%`);
assert('with no games carrying nothing at all',
    matchupEdge({ defenseAllowed: 20, defenseLeagueAvg: 10, defenseSample: 0 }) === 0);

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
