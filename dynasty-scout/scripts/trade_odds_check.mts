/**
 * A trade priced in the currency an owner actually holds.
 *
 * A win rate is the honest measure of a roster and it is not what anybody
 * is playing for, and the gap between the two is the whole point of this
 * number: the same two points of rate is the difference between missing
 * and making the playoffs for a team on the cut line and is worth
 * literally nothing to a team already in. A page that reports only the
 * rate tells both owners the same thing and is wrong for one of them.
 *
 * So the load-bearing assertion here is that the step function is real —
 * the identical trade, in the identical league, moves a bubble team's
 * odds by a large amount and a runaway leader's by almost none. An
 * implementation that quietly scaled odds off the win rate would pass a
 * "the number moved" check and fail this one.
 *
 * The rest guards the paired comparison. Both sides are run from one seed
 * and one fixture list, so a trade that changes no lineup has to come back
 * at exactly zero rather than at something small — "small" is what a
 * missing seed looks like, and it is indistinguishable from a real tiny
 * trade on the page.
 */
import { evaluateTrade, ODDS_NOISE, type TradeTeam } from '../lib/trade';
import type { SimPlayer } from '../lib/startSit';
import { pairingTable, type LeagueGame } from '../lib/leagueSchedule';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
const POS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'WR', 'RB', 'WR', 'TE'];
const REMAINING = 7, SPOTS = 6, TEAMS = 12;

/**
 * A league of twelve, each roster a little worse than the one above it,
 * and every team level on wins so that the odds are decided by the rosters
 * and the fixtures rather than by a head start.
 */
function league(records?: (i: number) => { wins: number; losses: number }) {
    const sims = new Map<number, SimPlayer>();
    let id = 1;
    const teams: TradeTeam[] = [];
    for (let t = 0; t < TEAMS; t++) {
        const roster = POS.map((position, i) => {
            const pid = id++;
            const mean = 17 - t * 0.35 - i * 1.1;
            sims.set(pid, {
                id: pid, name: `p${pid}`, position,
                outcome: {
                    mean, sd: mean * 0.45, floor: mean * 0.4,
                    ceiling: mean * 1.8, position,
                },
            } as unknown as SimPlayer);
            return { id: pid, name: `p${pid}`, position, startable: true };
        });
        const r = records?.(t) ?? { wins: 4, losses: 3 };
        teams.push({
            key: String(t), name: `T${t}`, roster,
            record: { ...r, ties: 0, pointsFor: 800 + (TEAMS - t) * 9, pointsAgainst: 800 },
        });
    }
    return { teams, simOf: (i: number) => sims.get(i) ?? null };
}

/** A complete round robin over the remaining weeks. */
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

const { teams, simOf } = league();
const KEYS = teams.map(t => t.key);
const pairs = pairingTable(fixtures(KEYS, 8, REMAINING), KEYS, 8, 8 + REMAINING - 1);
const season = { remaining: REMAINING, spots: SPOTS, pairs };

step(1, 'a trade that changes no lineup changes no odds, exactly');
/**
 * Two bench players swapped. Neither can reach a lineup either side, so
 * before and after are the same league — and run from one seed they must
 * agree to the last digit. Anything else means the two runs are not paired,
 * which on the page reads as a tiny real trade.
 */
const bench = evaluateTrade(teams, SLOTS,
    { teamKey: '6', give: [teams[6].roster[9].id] },
    { teamKey: '5', give: [teams[5].roster[9].id] },
    simOf, 20000, 23, season);
const benchMe = bench.effects.find(e => e.key === '6')!;
assert('the odds are reported at all', benchMe.oddsDelta != null,
    `${((benchMe.oddsBefore ?? 0) * 100).toFixed(1)}%`);
assert('and every team in the league moves by exactly nothing',
    bench.effects.every(e => e.oddsDelta === 0),
    `worst ${Math.max(...bench.effects.map(e => Math.abs(e.oddsDelta ?? 1))).toFixed(6)}`);

step(2, 'the same trade is worth a season to one team and nothing to another');
/**
 * The step function, which is the reason this number is on the page. One
 * league, one upgrade — a bench receiver for a starting back — given first
 * to a team on the cut line and then to a team that is already through.
 * Records do the separating, so the rosters and the fixtures are identical
 * in both runs.
 */
const bubble = league(i => (i === 6 ? { wins: 3, losses: 4 } : { wins: 4, losses: 3 }));
const locked = league(i => (i === 6 ? { wins: 7, losses: 0 } : { wins: 3, losses: 4 }));
const upgrade = (L: ReturnType<typeof league>) => {
    const r = evaluateTrade(L.teams, SLOTS,
        { teamKey: '6', give: [L.teams[6].roster[8].id] },
        { teamKey: '2', give: [L.teams[2].roster[1].id] },
        L.simOf, 20000, 23, season);
    return r.effects.find(e => e.key === '6')!;
};
const onTheLine = upgrade(bubble);
const throughAlready = upgrade(locked);
console.log(`      on the cut line: ${(onTheLine.oddsBefore! * 100).toFixed(0)}%`
    + ` → ${(onTheLine.oddsAfter! * 100).toFixed(0)}%`);
console.log(`      already through: ${(throughAlready.oddsBefore! * 100).toFixed(0)}%`
    + ` → ${(throughAlready.oddsAfter! * 100).toFixed(0)}%`);
assert('the team on the cut line gains a lot', onTheLine.oddsDelta! > 0.10,
    `${(onTheLine.oddsDelta! * 100).toFixed(1)} points`);
assert('the team already through gains almost nothing',
    Math.abs(throughAlready.oddsDelta!) < 0.05,
    `${(throughAlready.oddsDelta! * 100).toFixed(1)} points`);
assert('and the win rate does not tell them apart',
    Math.abs(onTheLine.delta - throughAlready.delta) < 0.01,
    `${(onTheLine.delta * 100).toFixed(1)} vs `
    + `${(throughAlready.delta * 100).toFixed(1)} points of rate — `
    + 'the same roster change, which is exactly why the rate is not the verdict');

step(3, 'the league still has the number of places it has');
/**
 * Six places before the trade and six after. A league where the odds sum
 * to seven is a league whose teams were each carried forward on their own
 * rate instead of being paired off against each other, which is the one
 * mistake that makes every number on the page plausible and wrong.
 */
const big = evaluateTrade(bubble.teams, SLOTS,
    { teamKey: '6', give: [bubble.teams[6].roster[8].id] },
    { teamKey: '2', give: [bubble.teams[2].roster[1].id] },
    bubble.simOf, 20000, 23, season);
const sumBefore = big.effects.reduce((s, e) => s + (e.oddsBefore ?? 0), 0);
const sumAfter = big.effects.reduce((s, e) => s + (e.oddsAfter ?? 0), 0);
assert('the odds sum to the places before the trade',
    Math.abs(sumBefore - SPOTS) < 0.02, sumBefore.toFixed(3));
assert('and after it', Math.abs(sumAfter - SPOTS) < 0.02, sumAfter.toFixed(3));

step(4, 'the traders move more than the teams watching');
const traderMove = Math.max(...big.effects.filter(e => e.trading)
    .map(e => Math.abs(e.oddsDelta!)));
const bystanderMove = Math.max(...big.effects.filter(e => !e.trading)
    .map(e => Math.abs(e.oddsDelta!)));
assert('a trade moves its traders most', traderMove > bystanderMove,
    `${(traderMove * 100).toFixed(1)} vs ${(bystanderMove * 100).toFixed(1)} points`);
assert('and the bystanders are not left out of it', bystanderMove > 0,
    `${(bystanderMove * 100).toFixed(1)} points — their rate is measured `
    + 'against these rosters too');

step(5, 'the noise floor covers what the simulation moves by');
/**
 * The same near-level swap from eight seeds, which is how TRADE_NOISE and
 * POWER_NOISE were set. A floor measured on a blockbuster would be far too
 * loose: what matters is the swing near zero, where a reader is deciding
 * whether anything happened at all.
 */
const wash: number[] = [];
for (const seed of [23, 41, 67, 89, 101, 137, 199, 251]) {
    const r = evaluateTrade(teams, SLOTS,
        { teamKey: '6', give: [teams[6].roster[4].id] },
        { teamKey: '5', give: [teams[5].roster[4].id] },
        simOf, 20000, seed, season);
    wash.push(r.effects.find(e => e.key === '6')!.oddsDelta!);
}
const swing = Math.max(...wash) - Math.min(...wash);
console.log(`      eight seeds: ${wash.map(d => (d * 100).toFixed(1)).join(' ')}`);
assert('the floor sits above the measured swing', ODDS_NOISE > swing,
    `${(ODDS_NOISE * 100).toFixed(1)} against ${(swing * 100).toFixed(2)} points`);
assert('and is not so loose it hides a real trade',
    ODDS_NOISE < Math.abs(onTheLine.oddsDelta!) / 4,
    `${(ODDS_NOISE * 100).toFixed(1)} against a `
    + `${(onTheLine.oddsDelta! * 100).toFixed(0)}-point trade`);

step(6, 'no season asked for, no season answered');
const weekOnly = evaluateTrade(teams, SLOTS,
    { teamKey: '6', give: [teams[6].roster[8].id] },
    { teamKey: '2', give: [teams[2].roster[1].id] },
    simOf, 8000, 23, null);
assert('odds are withheld rather than invented',
    weekOnly.effects.every(e => e.oddsDelta == null && e.oddsBefore == null));
assert('and the win rate still answers',
    weekOnly.effects.find(e => e.key === '6')!.delta > 0);

const over = evaluateTrade(teams, SLOTS,
    { teamKey: '6', give: [teams[6].roster[8].id] },
    { teamKey: '2', give: [teams[2].roster[1].id] },
    simOf, 8000, 23, { remaining: 0, spots: SPOTS, pairs: null });
assert('a season with no weeks left is not played out',
    over.effects.every(e => e.oddsDelta == null));

console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
