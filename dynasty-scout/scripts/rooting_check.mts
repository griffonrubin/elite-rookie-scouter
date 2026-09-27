/**
 * Which of this week's other games move your season.
 *
 * A start/sit page optimises the one game you control and the leverage
 * number says what winning it is worth. Neither says anything about the
 * five games you do not control, which is most of what a Sunday afternoon
 * is once your own is decided — and for a team on the bubble the answer is
 * not always "less". Two rivals playing each other can be worth more to
 * you than your own result, because one of them is going to lose.
 *
 * It costs nothing to know. The simulation already plays every fixture of
 * every trial; this is those same seasons counted a second way, bucketed
 * on who won each game rather than only on who won yours.
 *
 * Three things are asserted, and the first is the one that catches a
 * bucketing bug. Your own fixture appears in this list like any other, so
 * the rooting entry for the game you are playing has to be exactly the
 * conditionals already published for you — same seasons, same buckets,
 * counted through a different index. A cross-tabulation that is off by a
 * row produces a table of entirely plausible numbers, and that identity is
 * the only thing that would notice.
 */
import { playoffOdds, ROOT_NOISE, type PowerRow } from '../lib/power';
import { pairingTable, type LeagueGame } from '../lib/leagueSchedule';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const h2h = (me: number, them: number) => {
    const lo = (p: number) => Math.log(p / (1 - p));
    return 1 / (1 + Math.exp(-(lo(me) - lo(them))));
};

function ladder(records: (i: number) => { wins: number; losses: number }): PowerRow[] {
    const rate = Array.from({ length: 12 }, (_, i) => 0.72 - i * 0.04);
    return rate.map((p, i) => {
        const r = records(i);
        return {
            key: String(i), name: `T${i}`,
            winRate: p, expected: 100 + p * 45,
            rank: i + 1, tied: false,
            pointsRank: null, recordRank: null, luckGap: null,
            record: { ...r, ties: 0, pointsFor: 700 + (12 - i) * 7, pointsAgainst: 700 },
            against: Object.fromEntries(rate
                .map((q, j) => [String(j), h2h(p, q)] as const)
                .filter(([k]) => k !== String(i))),
            priced: 9, filled: 9, slots: 9,
        };
    });
}

function fixtures(keys: string[], from: number, weeks: number): LeagueGame[] {
    const ring = keys.slice();
    const out: LeagueGame[] = [];
    for (let w = from; w < from + weeks; w++) {
        for (let i = 0; i < ring.length / 2; i++) {
            out.push({ week: w, home: ring[i], away: ring[ring.length - 1 - i] });
        }
        ring.splice(1, 0, ring.pop()!);
    }
    return out;
}

const REMAINING = 7, SPOTS = 6, TRIALS = 20000;
const level = ladder(() => ({ wins: 4, losses: 3 }));
const KEYS = level.map(r => r.key);
const games = fixtures(KEYS, 8, REMAINING);
const pairs = pairingTable(games, KEYS, 8, 8 + REMAINING - 1);
const odds = playoffOdds(level, REMAINING, SPOTS, TRIALS, 41, pairs);

step(1, 'every game of the week is listed, once');
const first = games.filter(g => g.week === 8);
const mine = odds.get('4')!;
console.log('      ' + mine.rooting
    .map(r => `${r.home}v${r.away} ${r.swing == null ? '—'
        : (r.swing * 100 >= 0 ? '+' : '') + (r.swing * 100).toFixed(1)}`).join('  '));
assert('six fixtures for twelve teams', mine.rooting.length === 6,
    String(mine.rooting.length));
const listed = new Set(mine.rooting.flatMap(r => [r.home, r.away]));
assert('and every team appears in exactly one of them', listed.size === 12,
    `${listed.size} teams`);
const real = new Set(first.map(g => [g.home, g.away].sort().join('v')));
assert('they are the fixture list\'s own games',
    mine.rooting.every(r => real.has([r.home, r.away].sort().join('v'))),
    mine.rooting.map(r => `${r.home}v${r.away}`).join(','));

step(2, 'your own game reconciles with your own conditionals');
/**
 * The identity that would catch a cross-tabulation off by a row. Your
 * fixture is in the list like anybody's, so its two branches are the two
 * numbers already published for you — whichever side of it you are on.
 */
let worst = 0, worstKey = '';
for (const r of level) {
    const o = odds.get(r.key)!;
    const own = o.rooting.find(x => x.home === r.key || x.away === r.key);
    if (!own || o.oddsIfWin == null || o.oddsIfLose == null) continue;
    const ifIWin = own.home === r.key ? own.oddsIfHome : own.oddsIfAway;
    const ifILose = own.home === r.key ? own.oddsIfAway : own.oddsIfHome;
    if (ifIWin == null || ifILose == null) { fails.push('a branch was missing'); continue; }
    const gap = Math.max(Math.abs(ifIWin - o.oddsIfWin), Math.abs(ifILose - o.oddsIfLose));
    if (gap > worst) { worst = gap; worstKey = r.key; }
}
assert('to the digit, for all twelve', worst < 1e-9,
    `worst ${worst.toExponential(1)}, on T${worstKey}`);

step(3, 'every game reconciles with the headline it hangs under');
/**
 * The strongest thing available, and the reason `homeWins` is published.
 *
 * Each game splits the same seasons in two, so weighting the two branches
 * by how often each happened has to give back the headline — for every
 * team, against every game, not just their own. A cross-tabulation indexed
 * one row out still produces two plausible probabilities and a plausible
 * swing; it does not survive this.
 */
let off = 0, offWhere = '';
let counted = 0;
for (const r of level) {
    const o = odds.get(r.key)!;
    for (const g of o.rooting) {
        if (g.homeWins == null || g.oddsIfHome == null || g.oddsIfAway == null) continue;
        counted++;
        const rebuilt = g.homeWins * g.oddsIfHome + (1 - g.homeWins) * g.oddsIfAway;
        const gap = Math.abs(rebuilt - o.odds);
        if (gap > off) { off = gap; offWhere = `T${r.key} on ${g.home}v${g.away}`; }
    }
}
assert('all seventy-two of them', counted === 72, String(counted));
assert('and none is off by more than rounding', off < 1e-9,
    `worst ${off.toExponential(1)} at ${offWhere}`);

step('3b', 'a season already settled cannot be moved by anybody');
/**
 * The invariant with no judgement in it. Run the last week of a league
 * where one team is through whatever happens, and every game — its own
 * included — has to be worth exactly nothing to it. A number that drifts
 * here is a number leaking between rows.
 */
const lateRecs = [7, 7, 6, 5, 4, 4, 4, 4, 3, 3, 2, 1];
const late = ladder(i => ({ wins: lateRecs[i], losses: 9 - lateRecs[i] }));
const lastWeek = pairingTable(fixtures(KEYS, 10, 1), KEYS, 10, 10);
const lateOdds = playoffOdds(late, 1, 6, TRIALS, 41, lastWeek);
const through = lateOdds.get('3')!;
console.log(`      T3 is ${(through.odds * 100).toFixed(0)}% with one week left;`
    + ` swings ${through.rooting.map(r => (r.swing! * 100).toFixed(1)).join(' ')}`);
assert('it is already through', through.odds > 0.999, `${(through.odds * 100).toFixed(1)}%`);
assert('so no game this week is worth anything to it',
    through.rooting.every(r => r.swing != null && Math.abs(r.swing) < 1e-9),
    through.rooting.map(r => (r.swing! * 100).toFixed(2)).join(','));

step('3c', 'and a contested one can be moved by a game it is not in');
/**
 * The feature justifying itself. With two weeks left and four teams on
 * four wins for two places, the game between two of them is worth real
 * playoff odds to the other two — who are not playing in it. If nothing
 * here ever cleared the noise floor measured below, this panel would be a
 * table of zeroes with a confident heading on it.
 */
const twoLeft = pairingTable(fixtures(KEYS, 10, 2), KEYS, 10, 11);
const race = playoffOdds(late, 2, 6, TRIALS, 41, twoLeft);
const watcher = race.get('6')!;
const notMine = watcher.rooting.filter(r => r.home !== '6' && r.away !== '6');
const biggest = notMine.slice().sort(
    (a, b) => Math.abs(b.swing ?? 0) - Math.abs(a.swing ?? 0))[0];
console.log(`      T6 at ${(watcher.odds * 100).toFixed(0)}%: `
    + notMine.map(r => `${r.home}v${r.away} ${(r.swing! * 100).toFixed(1)}`).join('  '));
assert('a game it is not playing in moves it past the noise floor',
    Math.abs(biggest.swing ?? 0) > 0.04,
    `${biggest.home}v${biggest.away} ${(biggest.swing! * 100).toFixed(1)} points`);
assert('and it is a game between the teams it is racing',
    ['4', '5', '7'].includes(biggest.home) && ['4', '5', '7'].includes(biggest.away),
    `${biggest.home}v${biggest.away}`);

step(4, 'how much of this is the simulation\'s own noise');
/**
 * Measured, not guessed, exactly as the other floors on this page were.
 * Eight seeds over the same league; the largest move any one game's swing
 * makes between them is what a printed number has to clear before it means
 * anything.
 */
let spread = 0, where = '';
const runs = [41, 7, 99, 1234, 55, 808, 3, 61]
    .map(sd => playoffOdds(level, REMAINING, SPOTS, TRIALS, sd, pairs));
for (const r of level) {
    const series = runs.map(run => run.get(r.key)!.rooting);
    for (let g = 0; g < series[0].length; g++) {
        const xs = series.map(s => s[g].swing).filter((x): x is number => x != null);
        if (xs.length < 2) continue;
        const d = Math.max(...xs) - Math.min(...xs);
        if (d > spread) { spread = d; where = `T${r.key} on ${series[0][g].home}v${series[0][g].away}`; }
    }
}
console.log(`      widest spread across eight seeds: ${(spread * 100).toFixed(2)} points (${where})`);
/**
 * Four points, and the guess going in was two.
 *
 * Bigger than the headline's own floor for a reason worth stating: each
 * branch here is drawn from roughly half the seasons, and the effect
 * being measured is small, so the ratio of signal to noise is the worst
 * of any number this app prints. That is what sets ROOT_NOISE, and it is
 * why most of what this panel computes is not shown — in a league with
 * nothing at stake, every game is inside it, and the honest report is
 * that none of them matters rather than six numbers under a point.
 */
assert('the floor the page prints above covers it',
    spread < ROOT_NOISE, `${(spread * 100).toFixed(2)} points against a `
    + `${(ROOT_NOISE * 100).toFixed(0)} floor`);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery step passed');
process.exit(fails.length ? 1 : 0);
