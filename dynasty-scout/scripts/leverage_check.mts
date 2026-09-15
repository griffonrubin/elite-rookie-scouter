/**
 * What this Sunday is worth, and why it is read off the same run.
 *
 * A start/sit page optimises one week without ever saying how much that
 * week matters, and the two cases feel identical while you are setting a
 * lineup: four points of playoff odds says the decision barely registers,
 * twenty says it is the week the season turns on.
 *
 * The number is the odds conditional on winning this week against the odds
 * conditional on losing it, bucketed out of the same ten thousand seasons
 * the headline comes from. That is one simulation rather than twenty-four
 * forced ones, and — the reason it is done this way rather than for speed —
 * it cannot disagree with the headline. The odds above it are these two
 * weighted by how often each happens, and this check asserts that identity
 * rather than trusting it, because a bucketing bug produces two plausible
 * numbers that quietly stop adding up.
 *
 * The step function is asserted here too, from the other end from
 * trade_odds_check: the same week is worth a great deal to a team on the
 * cut line and nothing at all to a team already through, and an
 * implementation deriving the swing from anything but the finishing
 * positions would miss it.
 */
import { playoffOdds, type PowerRow } from '../lib/power';
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

/** Twelve teams, a ladder of strength, and a record per team. */
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

/** A complete round robin over the weeks that are left. */
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
const pairs = pairingTable(fixtures(KEYS, 8, REMAINING), KEYS, 8, 8 + REMAINING - 1);

step(1, 'the headline is the two conditionals, weighted');
/**
 * The identity that makes reading these off one run safe. If the bucketing
 * is wrong — a team credited with the result of the week it did not play,
 * a result recorded before the week is settled — the three numbers stop
 * reconciling while each still looks like a probability.
 */
const odds = playoffOdds(level, REMAINING, SPOTS, TRIALS, 41, pairs);
let worst = 0, worstKey = '';
for (const r of level) {
    const o = odds.get(r.key)!;
    if (o.oddsIfWin == null || o.oddsIfLose == null || o.winsThisWeek == null) continue;
    const rebuilt = o.winsThisWeek * o.oddsIfWin + (1 - o.winsThisWeek) * o.oddsIfLose;
    const gap = Math.abs(rebuilt - o.odds);
    if (gap > worst) { worst = gap; worstKey = r.key; }
}
assert('every row reconciles with its own headline', worst < 0.002,
    `worst ${(worst * 100).toFixed(3)} points, on T${worstKey}`);
assert('and every team has the conditionals',
    level.every(r => odds.get(r.key)!.oddsIfWin != null),
    `${level.filter(r => odds.get(r.key)!.oddsIfWin != null).length} of ${level.length}`);

/**
 * The week being conditioned on is *this* week, not some week.
 *
 * Reconciling is necessary and not sufficient: conditioning on the last
 * remaining week instead of the first produces three numbers that add up
 * perfectly and answer a question nobody asked. The discriminator is the
 * opponent — this week's win share has to be the head-to-head rate against
 * the team the fixture list says you play now, and against no other team in
 * the league.
 */
const week8 = fixtures(KEYS, 8, REMAINING).filter(g => g.week === 8);
const oppOf = new Map<string, string>();
for (const g of week8) { oppOf.set(g.home, g.away); oppOf.set(g.away, g.home); }
let mismatched = 0, worstOpp = 0;
for (const r of level) {
    const o = odds.get(r.key)!;
    const expected = r.against[oppOf.get(r.key)!];
    const gap = Math.abs((o.winsThisWeek ?? 0) - expected);
    worstOpp = Math.max(worstOpp, gap);
    if (gap > 0.02) mismatched++;
}
assert('the week conditioned on is the one the fixtures say is next',
    mismatched === 0,
    `worst ${(worstOpp * 100).toFixed(2)} points from the week-8 head-to-head rate`);

step(2, 'winning is never worse than losing');
const swings = level.map(r => {
    const o = odds.get(r.key)!;
    return { key: r.key, swing: (o.oddsIfWin ?? 0) - (o.oddsIfLose ?? 0) };
});
assert('no team is hurt by a win', swings.every(s => s.swing >= 0),
    swings.filter(s => s.swing < 0).map(s => s.key).join(',') || 'none');
console.log('      ' + swings.map(s => `T${s.key} ${(s.swing * 100).toFixed(0)}`).join(' '));

step(3, 'the same week is worth a season to one team and nothing to another');
/**
 * Records do the separating, so the rosters and the fixtures are identical
 * across the two leagues and only the standings differ. A team seven-and-
 * nothing is through and a team nothing-and-seven is out, and for both of
 * them this Sunday is very nearly irrelevant — which is the finding, and
 * the thing a page showing only a win probability cannot tell them.
 */
const spread = ladder(i => i === 0 ? { wins: 7, losses: 0 }
    : i === 11 ? { wins: 0, losses: 7 }
    : { wins: 4, losses: 3 });
const spreadOdds = playoffOdds(spread, REMAINING, SPOTS, TRIALS, 41, pairs);
const swingOf = (k: string) => {
    const o = spreadOdds.get(k)!;
    return (o.oddsIfWin ?? 0) - (o.oddsIfLose ?? 0);
};
const locked = swingOf('0'), doomed = swingOf('11');
const middle = spread.slice(1, 11)
    .map(r => swingOf(r.key)).sort((a, b) => b - a)[0];
console.log(`      7-0 team ${(locked * 100).toFixed(1)} points`
    + ` · 0-7 team ${(doomed * 100).toFixed(1)}`
    + ` · widest in the middle ${(middle * 100).toFixed(1)}`);
assert('a team already through barely notices', locked < 0.06,
    `${(locked * 100).toFixed(1)} points`);
assert('nor does a team already out', doomed < 0.06,
    `${(doomed * 100).toFixed(1)} points`);
assert('and somebody in the middle has a great deal riding on it',
    middle > locked * 2.5 && middle > 0.12,
    `${(middle * 100).toFixed(1)} points`);

step(4, 'a team with no fixture this week is told so, not given a number');
/**
 * Eleven teams on the league's own fixtures: somebody sits out every week,
 * which is what a bye in a league of that shape is. Their week cannot be
 * won or lost, so it has no leverage — and inventing one would be the page
 * telling an owner their empty Sunday decides their season.
 */
const oddSized = ladder(() => ({ wins: 4, losses: 3 })).slice(0, 11);
const oddKeys = oddSized.map(r => r.key);
const oddPairs = pairingTable(
    fixtures(oddKeys, 8, REMAINING), oddKeys, 8, 8 + REMAINING - 1);
const oddOdds = playoffOdds(oddSized, REMAINING, SPOTS, TRIALS, 41, oddPairs);
const idle = oddSized.filter(r => oddOdds.get(r.key)!.winsThisWeek == null);
assert('exactly one team is idle', idle.length === 1,
    idle.map(r => r.name).join(',') || 'none');
assert('and it is given no conditional rather than a flat one',
    idle.every(r => oddOdds.get(r.key)!.oddsIfWin == null
        && oddOdds.get(r.key)!.oddsIfLose == null));
assert('while everybody playing still has one',
    oddSized.filter(r => oddOdds.get(r.key)!.oddsIfWin != null).length === 10);

step(5, 'a random schedule still answers, because the question is still real');
/**
 * Without a fixture list the opponent is drawn each trial, so "win this
 * week" is win against a random team rather than against the one you
 * actually play. Still a coherent question and still worth answering —
 * and it must reconcile exactly as before, because the same bucketing runs.
 */
const drawn = playoffOdds(level, REMAINING, SPOTS, TRIALS, 41, null);
let worstDrawn = 0;
for (const r of level) {
    const o = drawn.get(r.key)!;
    if (o.oddsIfWin == null || o.oddsIfLose == null || o.winsThisWeek == null) continue;
    worstDrawn = Math.max(worstDrawn, Math.abs(
        o.winsThisWeek * o.oddsIfWin + (1 - o.winsThisWeek) * o.oddsIfLose - o.odds));
}
assert('it reconciles too', worstDrawn < 0.002,
    `worst ${(worstDrawn * 100).toFixed(3)} points`);
assert('and nobody is hurt by a win',
    level.every(r => (drawn.get(r.key)!.oddsIfWin ?? 0)
        >= (drawn.get(r.key)!.oddsIfLose ?? 0)));

step(6, 'a season already over has no week to weigh');
const over = playoffOdds(level, 0, SPOTS, 2000, 41, null);
assert('no conditionals are invented',
    level.every(r => over.get(r.key)!.oddsIfWin == null
        && over.get(r.key)!.winsThisWeek == null));

console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
