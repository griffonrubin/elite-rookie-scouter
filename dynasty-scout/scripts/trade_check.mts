/**
 * Whether a trade is judged on its value or on its consequences.
 *
 * The claim this file exists to test is the one the page is built on: that
 * re-filling both lineups and re-running the league says something a value
 * ranking cannot. So the fixtures are built to separate the two. A roster
 * that starts two receivers gets a fourth receiver in one trade and a
 * starting tight end of the same quality in another; a value ranking scores
 * those the same and the lineup does not.
 *
 * It also measures the thing TRADE_NOISE is set from. Before and after run
 * from one seed, so every unchanged roster draws identical weeks either side
 * and its delta is the trade's doing rather than the simulation's — but that
 * has to be measured rather than asserted, because it is the reason the
 * floor here can be four times tighter than POWER_NOISE.
 */
import { buildOutcome, type SimPlayer } from '../lib/startSit';
import { POWER_NOISE } from '../lib/power';
import {
    bestLineup, evaluateTrade, TRADE_NOISE,
    type TradeRosterPlayer, type TradeTeam,
} from '../lib/trade';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

/** A player worth roughly `mean` a week, with a real spread behind him. */
const sims = new Map<number, SimPlayer>();
let nextId = 1;
function make(position: string, mean: number, name?: string): TradeRosterPlayer {
    const id = nextId++;
    const shape = [0.4, 1.5, 0.7, 1.2, 0.2, 1.8, 0.9, 1.1, 0.6, 1.4, 0.8, 1.0, 0.3, 1.6, 0.95, 1.25, 0.55];
    const logs = shape.map((f, i) => ({ season: 2025, week: i + 1, points: mean * f }));
    sims.set(id, {
        outcome: buildOutcome({ playerId: id, position, logs,
            context: { impliedTeamTotal: 23, spread: -2 } }, 2025),
        sample: logs.map(l => l.points),
    });
    return { id, name: name ?? `${position}${mean}`, position, startable: true };
}
const simOf = (id: number) => sims.get(id) ?? null;

/** A whole roster: a full lineup plus a five-man bench. */
function roster(scale: number): TradeRosterPlayer[] {
    return [
        make('QB', 19 * scale), make('RB', 15 * scale), make('RB', 12 * scale),
        make('WR', 14 * scale), make('WR', 12 * scale), make('TE', 9 * scale),
        make('RB', 8 * scale), make('K', 8 * scale), make('DST', 7 * scale),
        make('WR', 7 * scale), make('WR', 6 * scale), make('RB', 5 * scale),
        make('TE', 4 * scale), make('QB', 9 * scale),
    ];
}

step(1, 'a lineup is filled from the restrictive slots first');
const r = roster(1);
const filled = bestLineup(SLOTS, r, id => simOf(id)!.outcome.mean);
const named = filled.map((id, i) =>
    `${SLOTS[i]}:${id == null ? '—' : r.find(p => p.id === id)!.name}`);
console.log('      ' + named.join(' '));
assert('every slot is filled', filled.every(id => id != null), named.join(' '));
assert('nobody is in two slots at once',
    new Set(filled).size === filled.length, named.join(' '));
assert('the kicker slot has the kicker',
    r.find(p => p.id === filled[7])!.position === 'K');
assert('the best back starts over the flex back',
    r.find(p => p.id === filled[1])!.name === 'RB15');
// The bug this ordering exists for: a FLEX listed before the last WR slot
// takes the receiver that slot then has nobody for, and the lineup reports a
// hole on a roster that could field nine.
const flexFirst = ['QB', 'FLEX', 'WR', 'WR', 'RB', 'RB', 'TE', 'K', 'DEF'];
const thin = [make('QB', 18), make('WR', 14), make('WR', 12), make('RB', 15),
    make('RB', 11), make('TE', 9), make('K', 8), make('DST', 7), make('RB', 10)];
const tight = bestLineup(flexFirst, thin, id => simOf(id)!.outcome.mean);
assert('a flex listed first does not strand a later slot',
    tight.every(id => id != null),
    tight.map((id, i) => `${flexFirst[i]}:${id == null ? '—' : 'x'}`).join(' '));

step(2, 'a league, and a trade of equals inside it');
// Six teams, one of them notably stronger, so there is a real ranking to
// move rather than a table of ties.
const teams: TradeTeam[] = [1.0, 0.97, 0.94, 0.91, 0.88, 0.85].map((s, i) => ({
    key: `t${i}`, name: `team ${i}`, roster: roster(s),
}));
const rbOf = (k: string, nth = 0) => teams.find(t => t.key === k)!.roster
    .filter(p => p.position === 'RB').sort((a, b) =>
        simOf(b.id)!.outcome.mean - simOf(a.id)!.outcome.mean)[nth];
const wrOf = (k: string, nth = 0) => teams.find(t => t.key === k)!.roster
    .filter(p => p.position === 'WR').sort((a, b) =>
        simOf(b.id)!.outcome.mean - simOf(a.id)!.outcome.mean)[nth];
const teOf = (k: string, nth = 0) => teams.find(t => t.key === k)!.roster
    .filter(p => p.position === 'TE').sort((a, b) =>
        simOf(b.id)!.outcome.mean - simOf(a.id)!.outcome.mean)[nth];

// Each side's fourth receiver, neither of whom starts anywhere.
const evens = evaluateTrade(teams, SLOTS,
    { teamKey: 't2', give: [wrOf('t2', 3).id] },
    { teamKey: 't3', give: [wrOf('t3', 3).id] }, simOf);
const evenTraders = evens.effects.filter(e => e.trading);
console.log('      ' + evenTraders.map(e =>
    `${e.name} ${(e.before * 100).toFixed(1)} → ${(e.after * 100).toFixed(1)}`).join(' | '));
assert('both traders are reported', evenTraders.length === 2);
assert('swapping two bench receivers barely moves anything',
    evenTraders.every(e => Math.abs(e.delta) < TRADE_NOISE * 2),
    evenTraders.map(e => (e.delta * 100).toFixed(2) + 'pp').join(', '));
assert('nothing was left unpriced', evens.unpriced.length === 0,
    evens.unpriced.join(','));

step(3, 'a lopsided trade moves the right way');
// t3's best back for t2's fourth receiver: a giveaway.
const lopsided = evaluateTrade(teams, SLOTS,
    { teamKey: 't2', give: [wrOf('t2', 3).id] },
    { teamKey: 't3', give: [rbOf('t3').id] }, simOf);
const got = lopsided.effects.find(e => e.key === 't2')!;
const gave = lopsided.effects.find(e => e.key === 't3')!;
console.log(`      t2 ${(got.delta * 100).toFixed(1)}pp (rank ${got.rankBefore}→${got.rankAfter})`
    + `   t3 ${(gave.delta * 100).toFixed(1)}pp (rank ${gave.rankBefore}→${gave.rankAfter})`);
assert('the team getting the back improves', got.delta > TRADE_NOISE,
    `${(got.delta * 100).toFixed(2)}pp`);
assert('the team giving him up gets worse', gave.delta < -TRADE_NOISE,
    `${(gave.delta * 100).toFixed(2)}pp`);
assert('expected points move with it',
    got.pointsAfter > got.pointsBefore && gave.pointsAfter < gave.pointsBefore,
    `${got.pointsBefore}→${got.pointsAfter}, ${gave.pointsBefore}→${gave.pointsAfter}`);

step(4, 'the lineup consequence, not just the value');
const c2 = lopsided.changes.find(c => c.key === 't2')!;
const c3 = lopsided.changes.find(c => c.key === 't3')!;
const nm = (id: number) => teams.flatMap(t => t.roster).find(p => p.id === id)?.name ?? String(id);
console.log(`      t2 starts now: ${c2.startsNow.map(nm).join(', ') || 'nobody'}`
    + `; displaced: ${c2.displaced.map(nm).join(', ') || 'nobody'}`);
console.log(`      t3 loses from the lineup: ${c3.wasStarting.map(nm).join(', ') || 'nobody'}`);
assert('the arriving back goes straight into the lineup',
    c2.startsNow.includes(rbOf('t3').id), c2.startsNow.map(nm).join(','));
assert('and somebody on t2 loses a slot to him',
    c2.displaced.length === 1, c2.displaced.map(nm).join(','));
assert('the receiver t2 gave up was not starting anyway',
    c2.wasStarting.length === 0, c2.wasStarting.map(nm).join(','));
assert('t3 lost a starter', c3.wasStarting.includes(rbOf('t3').id),
    c3.wasStarting.map(nm).join(','));

step(5, 'the shape is priced, which is the whole point');
/**
 * Two offers of identical value, one of which is worth nothing.
 *
 * The first attempt at this reused the ladder above and offered a 3.4-point
 * tight end against a 6.0-point receiver — neither good enough to start on
 * the receiving roster, so both were worth zero and the test proved nothing
 * except that the fixture was wrong. It takes a roster with a hole in it to
 * show that a hole is what makes a player valuable.
 *
 * So: a roster deep at receiver and empty at tight end. Both offers are
 * twelve points a week, which is what any value ranking would score them on.
 * One walks into the tight end slot and adds seven points to the lineup. The
 * other sits behind a 12.5-point receiver already in the flex and adds
 * nothing at all.
 */
const holey: TradeRosterPlayer[] = [
    make('QB', 19), make('RB', 15), make('RB', 13),
    make('WR', 14), make('WR', 13), make('WR', 12.5),
    make('TE', 5), make('K', 8), make('DST', 7),
];
const offerTe = make('TE', 12, 'the tight end');
const offerWr = make('WR', 12, 'the receiver');
const sparePick = make('WR', 4, 'a spare');
const shapeLeague: TradeTeam[] = [
    { key: 'mine', name: 'deep at receiver', roster: [...holey, sparePick] },
    { key: 'theirs', name: 'holding both', roster: [...roster(0.95), offerTe, offerWr] },
    { key: 'other1', name: 'other 1', roster: roster(0.9) },
    { key: 'other2', name: 'other 2', roster: roster(0.85) },
];
const offer = (id: number) => evaluateTrade(shapeLeague, SLOTS,
    { teamKey: 'mine', give: [sparePick.id] },
    { teamKey: 'theirs', give: [id] }, simOf);
const forTe = offer(offerTe.id);
const forWr = offer(offerWr.id);
const dTe = forTe.effects.find(e => e.key === 'mine')!.delta;
const dWr = forWr.effects.find(e => e.key === 'mine')!.delta;
const ptsTe = forTe.effects.find(e => e.key === 'mine')!;
const ptsWr = forWr.effects.find(e => e.key === 'mine')!;
const teStarts = forTe.changes.find(c => c.key === 'mine')!.startsNow.includes(offerTe.id);
const wrStarts = forWr.changes.find(c => c.key === 'mine')!.startsNow.includes(offerWr.id);
console.log(`      both offers are 12.0 a game before the model touches them`);
console.log(`      tight end:  starts ${teStarts},`
    + ` lineup ${ptsTe.pointsBefore} → ${ptsTe.pointsAfter},`
    + ` ${(dTe * 100).toFixed(2)}pp`);
console.log(`      receiver:   starts ${wrStarts},`
    + ` lineup ${ptsWr.pointsBefore} → ${ptsWr.pointsAfter},`
    + ` ${(dWr * 100).toFixed(2)}pp`);
assert('the tight end walks into the empty slot', teStarts, `starts ${teStarts}`);
assert('the receiver cannot get on the field', !wrStarts, `starts ${wrStarts}`);
assert('so two players of equal value are not equally valuable',
    dTe - dWr > TRADE_NOISE * 2,
    `${(dTe * 100).toFixed(2)}pp vs ${(dWr * 100).toFixed(2)}pp`);
/**
 * The receiver adds nothing to the lineup and still moves the number, which
 * is not a bug and is worth a reader knowing.
 *
 * "Mine" gains 1.8 points of win rate on a lineup that did not change by a
 * tenth of a point, because the other side gave up a starter and got a spare
 * back. A rate against the field goes up when the field gets worse. This
 * assertion started life as "the one who cannot play is worth nothing at
 * all" and was simply false: a trade can help you purely by weakening
 * somebody you have to play eleven times.
 */
const theirWr = forWr.effects.find(e => e.key === 'theirs')!;
console.log(`      and the other side: lineup ${theirWr.pointsBefore}`
    + ` → ${theirWr.pointsAfter}, ${(theirWr.delta * 100).toFixed(2)}pp`);
assert('the receiver adds nothing to my lineup',
    Math.abs(ptsWr.pointsAfter - ptsWr.pointsBefore) < 0.5,
    `${ptsWr.pointsBefore} → ${ptsWr.pointsAfter}`);
assert('yet my rate rises, because they gave up a starter',
    dWr > 0 && theirWr.delta < -TRADE_NOISE,
    `mine +${(dWr * 100).toFixed(2)}pp, theirs ${(theirWr.delta * 100).toFixed(2)}pp`);
assert('which is a smaller gain than filling my own hole',
    dWr < dTe / 2, `${(dWr * 100).toFixed(2)}pp vs ${(dTe * 100).toFixed(2)}pp`);
assert('and the lineup score says the same thing',
    ptsTe.pointsAfter - ptsTe.pointsBefore > 5
    && Math.abs(ptsWr.pointsAfter - ptsWr.pointsBefore) < 1,
    `+${(ptsTe.pointsAfter - ptsTe.pointsBefore).toFixed(1)} vs `
    + `+${(ptsWr.pointsAfter - ptsWr.pointsBefore).toFixed(1)}`);

step(6, 'a trade between two other teams still moves your standing');
const elsewhere = evaluateTrade(teams, SLOTS,
    { teamKey: 't4', give: [wrOf('t4', 3).id] },
    { teamKey: 't5', give: [rbOf('t5').id] }, simOf);
const bystanders = elsewhere.effects.filter(e => !e.trading);
console.log('      ' + bystanders.map(e =>
    `${e.name} ${(e.delta * 100).toFixed(2)}pp`).join(' | '));
assert('every other team is reported too', bystanders.length === 4,
    String(bystanders.length));
assert('somebody not in the trade is affected by it',
    bystanders.some(e => Math.abs(e.delta) > TRADE_NOISE / 2),
    bystanders.map(e => (e.delta * 100).toFixed(2)).join(','));
// Rate against the field is a share of the same fixed set of pairings, so
// the league total has to stay put whoever trades with whom.
const sumDelta = elsewhere.effects.reduce((a, e) => a + e.delta, 0);
assert('and the league still averages out', Math.abs(sumDelta) < 1e-9,
    sumDelta.toExponential(1));

step(7, 'what the paired comparison is worth, measured');
/**
 * The measurement TRADE_NOISE is set from.
 *
 * The first version of this varied the trial count and called what moved
 * "noise", which conflated two different things: a different trial count
 * genuinely gives a different estimate, and a bystander genuinely shifts
 * when two lineups in its league change. Neither is the quantity that gates
 * a verdict.
 *
 * The quantity that gates a verdict is how much one trader's delta moves
 * when nothing changes but the random draws. Before and after run from one
 * seed, so a team's own weeks are identical either side and the delta is
 * almost entirely signal — which is why this floor can sit four times below
 * POWER_NOISE, and it has to be shown rather than claimed.
 */
const seeds = [7, 19, 23, 41, 59, 73, 97, 113];
const swingOf = (key: string, runs: ReturnType<typeof evaluateTrade>[]) => {
    const ds = runs.map(x => x.effects.find(e => e.key === key)!.delta);
    return Math.max(...ds) - Math.min(...ds);
};
const paired = seeds.map(sd => evaluateTrade(teams, SLOTS,
    { teamKey: 't2', give: [wrOf('t2', 3).id] },
    { teamKey: 't3', give: [rbOf('t3').id] }, simOf, 20000, sd));
const tradeSwing = Math.max(swingOf('t2', paired), swingOf('t3', paired));

// The same league ranked from those seeds without any trade, which is the
// POWER_NOISE quantity — the thing a page showing two independent rankings
// would be up against instead.
const absolute = seeds.map(sd => evaluateTrade(teams, SLOTS,
    { teamKey: 't2', give: [] }, { teamKey: 't3', give: [] }, simOf, 20000, sd));
let absSwing = 0;
for (const t of teams) {
    const rs = absolute.map(x => x.effects.find(e => e.key === t.key)!.before);
    absSwing = Math.max(absSwing, Math.max(...rs) - Math.min(...rs));
}
console.log(`      a trader's delta moves ${(tradeSwing * 100).toFixed(2)}pp across`
    + ` ${seeds.length} seeds`);
console.log(`      an absolute rate moves ${(absSwing * 100).toFixed(2)}pp across the same`);
console.log(`      floors: trade ${(TRADE_NOISE * 100).toFixed(1)}pp,`
    + ` power ${(POWER_NOISE * 100).toFixed(1)}pp`);
assert('the floor covers what a paired delta actually moves by',
    tradeSwing <= TRADE_NOISE, `${(tradeSwing * 100).toFixed(2)}pp`);
assert('a paired re-run is quieter than an absolute rate',
    tradeSwing < absSwing, `${(tradeSwing * 100).toFixed(2)}pp vs `
    + `${(absSwing * 100).toFixed(2)}pp`);
assert('the absolute swing is what POWER_NOISE covers',
    absSwing <= POWER_NOISE, `${(absSwing * 100).toFixed(2)}pp`);
// A trade with nothing in it is the one case where the answer must be
// exactly zero, and it is the sharpest test that the pair really is paired.
assert('a trade of nothing moves nothing, exactly',
    absolute.every(x => x.effects.every(e => e.delta === 0)),
    absolute.flatMap(x => x.effects.map(e => e.delta)).filter(d => d !== 0)
        .slice(0, 3).join(','));
assert('and the verdict on a real trade clears the floor',
    Math.abs(got.delta) > TRADE_NOISE * 5, `${(got.delta * 100).toFixed(2)}pp`);

step(8, 'nonsense in, nothing out');
assert('a team cannot trade with itself', evaluateTrade(teams, SLOTS,
    { teamKey: 't1', give: [wrOf('t1', 3).id] },
    { teamKey: 't1', give: [rbOf('t1', 2).id] }, simOf).effects.length === 0);
assert('an unknown team is not a trade', evaluateTrade(teams, SLOTS,
    { teamKey: 't1', give: [] }, { teamKey: 'nope', give: [] }, simOf)
    .effects.length === 0);
const blind = evaluateTrade(teams, SLOTS,
    { teamKey: 't2', give: [wrOf('t2', 3).id] },
    { teamKey: 't3', give: [rbOf('t3').id] },
    id => (id === rbOf('t3').id ? null : simOf(id)));
assert('a player we cannot price is named rather than ignored',
    blind.unpriced.includes(rbOf('t3').id), blind.unpriced.join(','));

step(9, 'a multi-player trade');
const two = evaluateTrade(teams, SLOTS,
    { teamKey: 't2', give: [wrOf('t2', 3).id, teOf('t2', 1).id] },
    { teamKey: 't3', give: [rbOf('t3').id] }, simOf);
const t2two = two.effects.find(e => e.key === 't2')!;
console.log(`      two for one: t2 ${(t2two.delta * 100).toFixed(2)}pp`);
assert('two for one still resolves', two.effects.length === teams.length);
assert('both departures are accounted for',
    two.changes.find(c => c.key === 't2')!.after
        .every(id => id !== wrOf('t2', 3).id && id !== teOf('t2', 1).id));

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
