/**
 * Ranking a league by roster, and the arithmetic around the luck column.
 *
 * Two separate things need pinning here. The simulation has to recover an
 * order it was handed — a ladder of rosters built to be strictly better than
 * each other has to come back in that order, or the ranking is noise with a
 * bar chart on it. And the table has to be symmetric: one run per pair read
 * from both sides, so the league never believes A beats B 60% while B beats
 * A 60%.
 *
 * The luck column is the part that was wrong. It compares a strength rank
 * against a record rank, and in week one every record in the league is 0-0
 * with nothing scored. A plain descending sort hands out first through
 * twelfth in roster order off those identical values, so the column read
 * "five better off than the roster" against a league that had not played a
 * game. Ties now hold as ties, a league that is entirely level reports no
 * gap at all, and a strength rank inside a tie group reports zero — because
 * a record that cannot separate two teams is not evidence about either.
 */
import { buildOutcome, simulateMatchup, type SimPlayer } from '../lib/startSit';
import { POWER_NOISE, powerRank, type PowerTeam } from '../lib/power';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number, s: string) => console.log(`\n── ${n}. ${s}`);

/** A player worth roughly `mean` a week, with a real spread of games behind it. */
let nextId = 1;
const player = (mean: number): SimPlayer => {
    // Seventeen games scattered around the mean, so the draw resamples a
    // distribution rather than taking the cheap normal path.
    const shape = [0.4, 1.5, 0.7, 1.2, 0.2, 1.8, 0.9, 1.1, 0.6, 1.4, 0.8, 1.0, 0.3, 1.6, 0.95, 1.25, 0.55];
    const logs = shape.map((f, i) => ({ season: 2025, week: i + 1, points: mean * f }));
    const outcome = buildOutcome({
        playerId: nextId++, position: 'RB', logs,
        context: { impliedTeamTotal: 23, spread: -2 },
    }, 2025);
    return { outcome, sample: logs.map(l => l.points) };
};

/** A nine-man lineup whose players all average `per` points. */
const roster = (per: number) => Array.from({ length: 9 }, () => player(per));

step(1, 'a ladder of rosters comes back as a ladder');
// Twelve points a man apart is a wide gap by design: this is asking whether
// the ranking can order rosters it should have no trouble ordering.
const ladder: PowerTeam[] = [22, 19, 16, 13, 10, 7].map((per, i) => ({
    key: `t${i}`, name: `${per} a man`, lineup: roster(per),
}));
const t0 = performance.now();
const laddered = powerRank(ladder, 6000).rows;
const ladderMs = performance.now() - t0;
console.log('      ' + laddered.map(r => `${r.rank}:${r.name}=${(r.winRate * 100).toFixed(0)}%`).join('  '));
assert('every team is ranked', laddered.length === 6, String(laddered.length));
assert('the strongest roster ranks first', laddered[0].name === '22 a man', laddered[0].name);
assert('the order is the ladder',
    laddered.map(r => r.name).join('|') === ladder.map(t => t.name).join('|'),
    laddered.map(r => r.name).join(' > '));
assert('win rates fall monotonically',
    laddered.every((r, i) => i === 0 || r.winRate <= laddered[i - 1].winRate));

step(2, 'the table is symmetric');
let worst = 0;
for (const r of laddered) {
    for (const [k, p] of Object.entries(r.against)) {
        const back = laddered.find(o => o.key === k)!.against[r.key];
        worst = Math.max(worst, Math.abs(p + back - 1));
    }
}
assert('A-beats-B and B-beats-A sum to one', worst < 1e-12, `worst ${worst.toExponential(1)}`);
assert('nobody plays themselves', laddered.every(r => !(r.key in r.against)));
assert('everybody plays everybody else',
    laddered.every(r => Object.keys(r.against).length === 5));

step(3, 'week one: no record, so no luck column');
// This is the real league's week-1 state — twelve rosters, every record
// 0-0 and nothing scored.
const zero = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
const week1 = ladder.map(t => ({ ...t, record: { ...zero } }));
const fresh = powerRank(week1, 2000).rows;
assert('the strength ranking still works', fresh.length === 6 && fresh[0].rank === 1);
assert('no team is given a luck gap', fresh.every(r => r.luckGap == null),
    JSON.stringify(fresh.map(r => r.luckGap)));
assert('no record rank is invented', fresh.every(r => r.recordRank == null));
assert('no points rank is invented', fresh.every(r => r.pointsRank == null));

step(4, 'a separated record gives a signed gap');
// The ladder inverted: the best roster is last in the standings, the worst
// is first. Every gap should be the full width of the league.
const inverted = ladder.map((t, i) => ({
    ...t,
    record: { wins: i, losses: 5 - i, ties: 0, pointsFor: 100 + i * 10, pointsAgainst: 0 },
}));
const luck = powerRank(inverted, 2000).rows;
console.log('      ' + luck.map(r => `${r.name}: str ${r.rank} rec ${r.recordRank} gap ${r.luckGap}`).join(' | '));
assert('the best roster is bottom of the standings',
    luck[0].recordRank === 6, String(luck[0].recordRank));
assert('and reads as robbed', luck[0].luckGap === -5, String(luck[0].luckGap));
assert('the worst roster tops the standings and reads as lucky',
    luck[5].luckGap === 5, String(luck[5].luckGap));
assert('the gap is strength rank minus record rank',
    luck.every(r => r.luckGap === r.rank - (r.recordRank ?? 0)),
    luck.map(r => r.luckGap).join(','));

step(5, 'a tie group reports no gap for anyone inside it');
// Three teams at 1-1 and three at 0-2: within the leading group the record
// says nothing about who is better, so a strength rank of 1, 2 or 3 is not
// a gap — but a strength rank of 5 against a 1-1 record is.
const tied = ladder.map((t, i) => ({
    ...t,
    record: { wins: i < 3 ? 1 : 0, losses: i < 3 ? 1 : 2, ties: 0, pointsFor: 100, pointsAgainst: 0 },
}));
const groups = powerRank(tied, 2000).rows;
console.log('      ' + groups.map(r => `${r.name}: str ${r.rank} rec ${r.recordRank} gap ${r.luckGap}`).join(' | '));
const leaders = groups.filter(r => r.recordRank === 1);
assert('the three 1-1 teams share first', leaders.length === 3, String(leaders.length));
assert('the next group starts at fourth',
    groups.filter(r => r.recordRank === 4).length === 3);
assert('strength inside the tie group is no gap',
    groups.filter(r => r.rank <= 3).every(r => r.luckGap === 0),
    groups.filter(r => r.rank <= 3).map(r => r.luckGap).join(','));
assert('identical points give every team the same points rank or none',
    new Set(groups.map(r => r.pointsRank)).size === 1,
    JSON.stringify([...new Set(groups.map(r => r.pointsRank))]));

step(6, 'an empty roster is left out rather than ranked last');
const withHole = [...ladder.slice(0, 3), { key: 'empty', name: 'nobody', lineup: [] }];
const held = powerRank(withHole, 1000);
assert('a team with no matched lineup is dropped', held.rows.length === 3, String(held.rows.length));
assert('and is named rather than vanished',
    held.unranked.length === 1 && held.unranked[0].name === 'nobody',
    JSON.stringify(held.unranked));
assert('and does not appear in anyone\'s head-to-head',
    held.rows.every(r => !('empty' in r.against)));
assert('one live team is not a league',
    powerRank(ladder.slice(0, 1), 1000).rows.length === 0);

// The bug this guards: a lineup we could only half price is not a weak
// lineup, and ranking it as one hands every other team a free win, so the
// whole table moves and not just its row.
const halfRead = [
    ...ladder.slice(0, 3),
    { key: 'thin', name: 'half read', filled: 9, slots: 9, lineup: roster(20).slice(0, 4) },
];
const thin = powerRank(halfRead, 1000);
assert('a quarter-priced roster stays out', thin.rows.length === 3, String(thin.rows.length));
assert('and says how much of it was read',
    thin.unranked[0]?.priced === 4 && thin.unranked[0]?.filled === 9,
    JSON.stringify(thin.unranked[0]));
const mostlyRead = [
    ...ladder.slice(0, 3),
    { key: 'most', name: 'mostly read', filled: 9, slots: 9, lineup: roster(20).slice(0, 7) },
];
assert('but one or two unmatched players does not remove a team',
    powerRank(mostlyRead, 1000).rows.length === 4);
assert('and its coverage is on the row',
    powerRank(mostlyRead, 1000).rows.some(r => r.priced === 7 && r.filled === 9));

// An owner who starts eight of nine is fielding eight, and that is their
// decision rather than a gap in our reading of it — so it is ranked, and
// the shortfall is reported as a lineup rather than as missing data.
const shortLineup = [
    ...ladder.slice(0, 3),
    { key: 'short', name: 'empty kicker slot', filled: 8, slots: 9, lineup: roster(20).slice(0, 8) },
];
const short = powerRank(shortLineup, 1000);
assert('a team starting eight of nine is still ranked', short.rows.length === 4);
const sr = short.rows.find(r => r.key === 'short')!;
assert('with nothing reported as unpriced', sr.priced === sr.filled, `${sr.priced}/${sr.filled}`);
assert('and the empty slot reported as a lineup', sr.filled === 8 && sr.slots === 9,
    `${sr.filled} of ${sr.slots}`);

step(7, 'what a twelve-team league costs');
// Sixty-six pairings, which is what the page pays on a real league — and
// four and a half times the six-team fixture above.
const twelve: PowerTeam[] = Array.from({ length: 12 }, (_, i) => ({
    key: `x${i}`, name: `team ${i}`, lineup: roster(20 - i),
}));
const t1 = performance.now();
const big = powerRank(twelve, 6000).rows;
const bigMs = performance.now() - t1;
console.log(`      6 teams / 15 pairings: ${ladderMs.toFixed(0)}ms`);
console.log(`     12 teams / 66 pairings: ${bigMs.toFixed(0)}ms`);
assert('twelve teams all ranked', big.length === 12);
// Drawing each roster once per trial instead of once per pairing took this
// from 680ms to under a tenth of that. The budget is set where the old
// approach could not reach, so a regression to it fails here rather than in
// somebody's browser.
assert('inside the compute budget', bigMs < 200, `${bigMs.toFixed(0)}ms`);

step(8, 'shared draws agree with simulating each pair on its own');
// The round robin draws every roster once per trial and settles all the
// pairings on that one week, rather than redrawing both sides of each. That
// is eleven times less work for a twelve-team league, and it is only worth
// anything if it lands on the same numbers — so every pairing in the ladder
// is checked against a separate, independent simulation of it.
let worstDiff = 0, worstPair = '';
for (let i = 0; i < ladder.length; i++) {
    for (let j = i + 1; j < ladder.length; j++) {
        const a = laddered.find(r => r.key === ladder[i].key)!;
        const b = ladder[j];
        const solo = simulateMatchup(ladder[i].lineup, b.lineup, 20000, 101).winProb;
        const d = Math.abs(a.against[b.key] - solo);
        if (d > worstDiff) { worstDiff = d; worstPair = `${ladder[i].name} v ${b.name}`; }
    }
}
// Two Monte Carlo runs of 6,000 and 20,000 trials differ by their own
// noise; anything past two points would be a different answer, not noise.
assert('every pairing matches an independent run', worstDiff < 0.02,
    `worst ${(worstDiff * 100).toFixed(1)}pp on ${worstPair}`);
const solo0 = simulateMatchup(ladder[0].lineup, ladder[0].lineup, 20000, 101).pointsFor;
assert('expected points match too',
    Math.abs(laddered[0].expected - solo0) < 1, `${laddered[0].expected} vs ${solo0}`);

step(9, 'a rank the simulation itself would reverse is shown as a tie');
// The measurement behind POWER_NOISE. Twelve rosters within half a point a
// man, ranked from eight different Monte Carlo seeds: whatever moves is the
// simulation and not the roster, and the table must not print it as an
// order. Buying precision instead does not work — 60,000 trials halves the
// swing and triples the cost.
const tight: PowerTeam[] = Array.from({ length: 12 }, (_, i) => ({
    key: `n${i}`, name: `n${i}`, lineup: roster(12.5 - i * 0.05),
}));
const seeds = [11, 29, 47, 83, 101, 211, 307, 401];
const runs = seeds.map(sd => powerRank(tight, 20000, sd).rows);
let swing = 0;
for (const key of tight.map(t => t.key)) {
    const rates = runs.map(r => r.find(x => x.key === key)!.winRate);
    swing = Math.max(swing, Math.max(...rates) - Math.min(...rates));
}
console.log(`      worst rate swing across ${seeds.length} seeds: `
    + `${(swing * 100).toFixed(2)}pp; noise floor is ${(POWER_NOISE * 100).toFixed(1)}pp`);
assert('the floor covers what the simulation actually moves by', swing <= POWER_NOISE,
    `${(swing * 100).toFixed(2)}pp vs ${(POWER_NOISE * 100).toFixed(1)}pp`);
assert('near-identical rosters are marked as sharing a place',
    runs[0].some(r => r.tied), `${runs[0].filter(r => r.tied).length} of 12 tied`);
// The other half of the claim: a floor wide enough to swallow real gaps
// would be useless, so a clearly laddered league must still come back
// strictly ordered.
assert('a real ladder is not collapsed into ties',
    laddered.every(r => !r.tied), laddered.filter(r => r.tied).map(r => r.name).join(','));
assert('shared places use competition numbering', (() => {
    const rs = runs[0].map(r => r.rank);
    return rs.every((v, i) => i === 0 || v >= rs[i - 1])
        && rs.every((v, i) => v <= i + 1);
})(), runs[0].map(r => r.rank).join(','));

step(10, 'the same league twice gives the same table');
const again = powerRank(twelve, 6000).rows;
assert('the order is reproducible',
    again.map(r => r.key).join('|') === big.map(r => r.key).join('|'));
assert('the rates are identical',
    again.every((r, i) => r.winRate === big[i].winRate));

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
