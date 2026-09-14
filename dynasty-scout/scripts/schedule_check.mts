/**
 * How hard the rest of the year is, for a position rather than for a team.
 *
 * Every site ships a strength of schedule and nearly all of them rank
 * opponents by how good those teams are, which is the wrong question. A
 * defence that cannot be run on and is thrown past all day is a brutal
 * schedule for your back and a gift for your receiver, and one number for
 * both cannot say so — Seattle last season were last in the league in yards
 * a carry allowed and first in catches allowed to backs.
 *
 * So this is checked on the property that matters: two positions facing the
 * same opponents must be able to get opposite answers. Plus the arithmetic
 * nobody should have to take on trust — that a bye is left out rather than
 * counted as a neutral game, that the ranks are ranks, and that the playoff
 * window is measured apart from the rest, because a schedule that is brutal
 * in September and kind in December is a good schedule and an average over
 * both says the opposite.
 */
import { query } from '../lib/db';
import { rankDefences } from '../lib/defence';
import { loadDefenceTotals } from '../lib/defenceTotals';
import { playoffWeeks, scheduleStrength, type ScheduleGame } from '../lib/schedule';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SEASON = 2026;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

step(1, 'the real schedule, against the real defences');
const games = await query<ScheduleGame>(
    `SELECT team, week, opponent FROM vegas_game_lines
      WHERE season = ${SEASON} AND opponent IS NOT NULL ORDER BY team, week`, []);
const cells = rankDefences(await loadDefenceTotals(SEASON)).map(c => ({
    defense: c.defense, position: c.position,
    points: c.points, pointsLeagueAvg: c.pointsLeagueAvg,
}));
const teams = new Set(games.map(g => g.team));
console.log(`      ${games.length} team-weeks across ${teams.size} teams`);
assert('the whole league is scheduled', teams.size >= 30 && teams.size <= 32,
    String(teams.size));

const REST = Array.from({ length: 13 }, (_, i) => i + 2);
const t0 = performance.now();
const rest = scheduleStrength(games, cells, REST, POSITIONS);
const ms = performance.now() - t0;
console.log(`      ranked in ${ms.toFixed(0)}ms`);
// The first version re-filtered the whole fixture list inside the team loop
// and took the dev server down with it: thirty-two teams times four
// positions times two windows over every row is eighty million comparisons
// to answer a question about five hundred games.
assert('and ranked without scanning the league once per team', ms < 200,
    `${ms.toFixed(0)}ms`);
assert('every team is priced at every position',
    rest.length === teams.size * POSITIONS.length,
    `${rest.length} for ${teams.size} × ${POSITIONS.length}`);

step(2, 'the claim: two positions can face the same teams and disagree');
/**
 * If a schedule is one number per team then this page is a worse version of
 * what everybody already has. The whole argument is that it is not.
 */
let widest = 0;
let widestAt = '';
for (const team of teams) {
    const row = (p: string) => rest.find(r => r.team === team && r.position === p);
    const ranks = POSITIONS.map(p => row(p)?.rank ?? 0).filter(Boolean);
    const gap = Math.max(...ranks) - Math.min(...ranks);
    if (gap > widest) {
        widest = gap;
        widestAt = `${team}: ` + POSITIONS
            .map(p => `${p} ${row(p)?.rank}`).join(', ');
    }
}
console.log(`      widest split inside one team: ${widest} places — ${widestAt}`);
assert('one team\'s schedule is not one number', widest >= 10, `${widest} places`);
// And it is not a freak: the split has to be common, or the extra column is
// noise dressed as a finding.
const splits = [...teams].map(team => {
    const ranks = POSITIONS
        .map(p => rest.find(r => r.team === team && r.position === p)?.rank ?? 0)
        .filter(Boolean);
    return Math.max(...ranks) - Math.min(...ranks);
});
const median = [...splits].sort((a, b) => a - b)[Math.floor(splits.length / 2)];
console.log(`      median split across the league: ${median} places`);
assert('and most teams split, not just one', median >= 5, `${median} places`);

step(3, 'ranks are ranks, and easiest is first');
for (const position of POSITIONS) {
    const rows = rest.filter(r => r.position === position)
        .sort((a, b) => a.rank - b.rank);
    const top = rows[0];
    const bottom = rows[rows.length - 1];
    console.log(`      ${position}: ${top.team} ${top.ease > 0 ? '+' : ''}${top.ease}% `
        + `(rank ${top.rank}) → ${bottom.team} ${bottom.ease}% (rank ${bottom.rank})`);
    assert(`${position}: rank one faces the most generous defences`,
        top.ease === Math.max(...rows.map(r => r.ease)), String(top.ease));
    assert(`${position}: the last rank faces the hardest`,
        bottom.ease === Math.min(...rows.map(r => r.ease)), String(bottom.ease));
    assert(`${position}: every rank is inside the league`,
        rows.every(r => r.rank >= 1 && r.rank <= r.of), 'out of range');
}
/**
 * A league-average schedule is zero, so the whole league cannot be easy.
 * Not exactly zero — the teams a given team plays are not a random sample of
 * the league, so the mean is close to but not on it — and a check that
 * demanded exactness would be testing the schedule rather than the code.
 */
const meanEase = rest.filter(r => r.position === 'RB')
    .reduce((a, r) => a + r.ease, 0) / teams.size;
console.log(`      the average team's schedule: ${meanEase.toFixed(2)}%`);
assert('an average schedule is about average', Math.abs(meanEase) < 2,
    meanEase.toFixed(2));

step(4, 'a bye is left out rather than counted as an easy week');
const withByes = rest.filter(r => r.byes > 0);
console.log(`      ${withByes.length / POSITIONS.length} teams have a bye in weeks `
    + `${REST[0]}–${REST[REST.length - 1]}`);
assert('byes are found and counted', withByes.length > 0, String(withByes.length));
assert('and they are not in the average',
    withByes.every(r => r.games === REST.length - r.byes),
    withByes.slice(0, 3).map(r => `${r.team} ${r.games}+${r.byes}`).join(' '));
assert('every listed week names a real opponent',
    rest.every(r => r.weeks.every(w => w.opponent && w.opponent !== r.team)),
    'a team plays itself');
assert('and the weeks are inside the window asked for',
    rest.every(r => r.weeks.every(w => REST.includes(w.week))), 'out of window');

step(5, 'the playoff weeks are measured apart, because they decide the season');
const po = playoffWeeks(15);
console.log(`      playoff window: ${po.join(', ')}`);
assert('three rounds from the first playoff week',
    po.length === 3 && po[0] === 15, po.join(','));
const playoffs = scheduleStrength(games, cells, po, POSITIONS);
/**
 * A schedule that is brutal in September and kind in December is a good
 * schedule, and one number over both says the opposite. So the two windows
 * have to be able to disagree — and on a real season they do, by a lot.
 */
let flips = 0;
let worst = 0;
let worstAt = '';
for (const r of rest) {
    const p = playoffs.find(x => x.team === r.team && x.position === r.position);
    if (!p) continue;
    const move = Math.abs(p.rank - r.rank);
    if (move > worst) {
        worst = move;
        worstAt = `${r.team} ${r.position}: ${r.rank} over the rest, ${p.rank} in the playoffs`;
    }
    if ((r.ease > 1 && p.ease < -1) || (r.ease < -1 && p.ease > 1)) flips++;
}
console.log(`      ${flips} of ${rest.length} flip sign between the two windows`);
console.log(`      biggest move: ${worstAt}`);
assert('the playoff window is a different question', worst >= 15, `${worst} places`);
assert('and enough of them flip outright to be worth showing', flips >= 10,
    String(flips));
assert('each playoff row counts at most three games',
    playoffs.every(r => r.games + r.byes === po.length),
    playoffs.filter(r => r.games + r.byes !== po.length).length + ' wrong');

step(6, 'a defence with no record is skipped, not guessed at');
const missing = scheduleStrength(
    [{ team: 'AAA', week: 2, opponent: 'ZZZ' },
     { team: 'AAA', week: 3, opponent: 'BUF' },
     { team: 'BUF', week: 3, opponent: 'AAA' }],
    cells, [2, 3], ['RB']);
const aaa = missing.find(r => r.team === 'AAA')!;
console.log(`      a team playing one unknown defence: ${aaa.games} games counted, `
    + `${aaa.weeks.length} weeks listed`);
assert('the unknown week is still listed', aaa.weeks.length === 2, String(aaa.weeks.length));
assert('but not counted in the average', aaa.games === 1, String(aaa.games));
assert('and it shows as having no number rather than as neutral',
    aaa.weeks.some(w => w.ease === null), JSON.stringify(aaa.weeks));

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
