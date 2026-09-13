/**
 * What a player is worth to a roster, against what he is worth.
 *
 * The whole page rests on one claim: those two numbers are different, and
 * the difference is the useful one. So the fixture is built to make them
 * disagree as sharply as possible — a fifteen-point back with a
 * fourteen-point back behind him, and a ten-point tight end with nobody. The
 * projection ranks the back far above the tight end. The roster does not,
 * and if this file does not show that then the page has nothing to say.
 *
 * It also pins the thing that makes the numbers readable: every variant is
 * drawn against the same simulated weeks, so the gaps between them are the
 * lineup rather than ten separate runs of luck. That is measured here the
 * same way POWER_NOISE and TRADE_NOISE were, by re-running from different
 * seeds and seeing what moves.
 */
import { buildOutcome, type SimPlayer } from '../lib/startSit';
import { POWER_NOISE } from '../lib/power';
import { fieldRates, replacementCost } from '../lib/depth';
import type { TradeRosterPlayer } from '../lib/trade';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

const sims = new Map<number, SimPlayer>();
let nextId = 1;
function make(position: string, mean: number, name: string): TradeRosterPlayer {
    const id = nextId++;
    const shape = [0.4, 1.5, 0.7, 1.2, 0.2, 1.8, 0.9, 1.1, 0.6, 1.4, 0.8, 1.0, 0.3, 1.6, 0.95, 1.25, 0.55];
    const logs = shape.map((f, i) => ({ season: 2025, week: i + 1, points: mean * f }));
    sims.set(id, {
        outcome: buildOutcome({ playerId: id, position, logs,
            context: { impliedTeamTotal: 23, spread: -2 } }, 2025),
        sample: logs.map(l => l.points),
    });
    return { id, name, position, startable: true };
}
const simOf = (id: number) => sims.get(id) ?? null;

/**
 * A roster deep at one position and bare at another.
 *
 * The star back is the best player on it and has *two* men behind him worth
 * fourteen, so the flex absorbs his loss and the lineup does not change at
 * all. The tight end is worth two thirds as much and has nobody: the only
 * other tight end is a three-point body.
 *
 * A projection ranks the back far above the tight end. This roster does not,
 * and separating those two is the only reason the page exists.
 */
const qb = make('QB', 19, 'the quarterback');
const rb1 = make('RB', 15, 'the star back');
const rb2 = make('RB', 14, 'the other back');
const rb3 = make('RB', 14, 'the third back');
const rb4 = make('RB', 14, 'the fourth back');
const wr1 = make('WR', 14, 'the first receiver');
const wr2 = make('WR', 12, 'the second receiver');
const wr3 = make('WR', 11, 'the third receiver');
const te1 = make('TE', 10, 'the tight end');
const te2 = make('TE', 3, 'a body at tight end');
const k = make('K', 8, 'the kicker');
const dst = make('DST', 7, 'the defence');
const roster = [qb, rb1, rb2, rb3, rb4, wr1, wr2, wr3, te1, te2, k, dst];

/** Eleven opponents of roughly the same strength, so there is a real field. */
const field = Array.from({ length: 11 }, (_, i) => {
    const s = 1 - i * 0.015;
    return [make('QB', 18 * s, `qb${i}`), make('RB', 14 * s, `rb${i}a`),
        make('RB', 12 * s, `rb${i}b`), make('WR', 13 * s, `wr${i}a`),
        make('WR', 11 * s, `wr${i}b`), make('TE', 9 * s, `te${i}`),
        make('RB', 8 * s, `fx${i}`), make('K', 8 * s, `k${i}`),
        make('DST', 7 * s, `d${i}`)].map(p => simOf(p.id)!);
});

step(1, 'the baseline is the best lineup this roster can field');
const report = replacementCost(roster, SLOTS, field, simOf, 20000);
console.log(`      ${(report.base * 100).toFixed(1)}% against the field, `
    + `${report.basePoints} expected points`);
assert('every starter is priced', report.rows.length === 9, String(report.rows.length));
assert('the base rate is a rate', report.base > 0.3 && report.base < 0.9,
    (report.base * 100).toFixed(1) + '%');
assert('the base points are a full lineup',
    report.basePoints > 80 && report.basePoints < 160, String(report.basePoints));
assert('every slot is filled', report.lineup.every(id => id != null),
    report.lineup.map((id, i) => `${SLOTS[i]}:${id ?? '—'}`).join(' '));
// The flex takes a back here, which is what makes the depth test work.
assert('the flex holds a spare back',
    roster.find(p => p.id === report.lineup[6])?.position === 'RB',
    roster.find(p => p.id === report.lineup[6])?.name ?? 'nobody');

step(2, 'the star is not the one you cannot lose');
for (const r of report.rows) {
    console.log(`      ${r.name.padEnd(22)} ${r.slot.padEnd(5)} `
        + `costs ${(r.cost * 100).toFixed(2).padStart(5)}pp  `
        + `(${r.pointsWith} → ${r.pointsWithout})  `
        + `replaced by ${r.replacementName ?? 'nobody'}`);
}
const back = report.rows.find(r => r.playerId === rb1.id)!;
const tight = report.rows.find(r => r.playerId === te1.id)!;
assert('the back is the better player',
    simOf(rb1.id)!.outcome.mean > simOf(te1.id)!.outcome.mean,
    `${simOf(rb1.id)!.outcome.mean.toFixed(1)} vs `
    + `${simOf(te1.id)!.outcome.mean.toFixed(1)} a game`);
assert('and the tight end is the bigger loss', tight.cost > back.cost,
    `${(tight.cost * 100).toFixed(2)}pp vs ${(back.cost * 100).toFixed(2)}pp`);
assert('by a margin worth showing', tight.cost - back.cost > 0.01,
    `${((tight.cost - back.cost) * 100).toFixed(2)}pp apart`);
assert('the rows are sorted by what they cost',
    report.rows.every((r, i) => i === 0 || r.cost <= report.rows[i - 1].cost),
    report.rows.map(r => (r.cost * 100).toFixed(1)).join(','));

step(3, 'the replacement named is the one who actually plays');
// The cascade: the flex back moves up to the vacated running-back slot and
// the *fourth* back comes off the bench into the flex, so the newcomer is a
// back who was not in the lineup at all. Naming the man who took the empty
// slot instead would report the third back, who was already playing.
assert('the star back is covered from the bench',
    back.replacement === rb4.id || back.replacement === rb3.id,
    back.replacementName ?? 'nobody');
assert('and nothing is left uncovered', !back.uncovered, String(back.uncovered));
assert('the tight end is replaced by the only other tight end',
    tight.replacement === te2.id, tight.replacementName ?? 'nobody');
assert('losing the back barely moves the lineup score',
    back.pointsWith - back.pointsWithout < 2,
    `${back.pointsWith} → ${back.pointsWithout}`);
assert('losing the tight end takes seven points off it',
    tight.pointsWith - tight.pointsWithout > 5,
    `${tight.pointsWith} → ${tight.pointsWithout}`);

step(4, 'a slot with nobody behind it says so');
const bare = replacementCost(
    roster.filter(p => p.position !== 'K' || p.id === k.id),
    SLOTS, field, simOf, 4000);
const kicker = bare.rows.find(r => r.playerId === k.id)!;
console.log(`      kicker: replaced by ${kicker.replacementName ?? 'nobody'}, `
    + `uncovered ${kicker.uncovered}`);
assert('the only kicker is uncovered', kicker.uncovered, String(kicker.uncovered));
assert('and the slot empties rather than taking someone illegal',
    kicker.replacement === null, String(kicker.replacement));
assert('which costs the kicker\'s whole output',
    kicker.pointsWith - kicker.pointsWithout > 7,
    `${kicker.pointsWith} → ${kicker.pointsWithout}`);
assert('and the rest of the roster is untouched', bare.rows.length === 9,
    String(bare.rows.length));

step(5, 'the field rates are rates against the field');
const set = report.lineup.map(id => simOf(id!)!);
const one = fieldRates([set], field, 8000);
assert('one variant, one rate', one.length === 1);
assert('it matches the report', Math.abs(one[0] - report.base) < 0.02,
    `${(one[0] * 100).toFixed(1)}% vs ${(report.base * 100).toFixed(1)}%`);
assert('an empty field is not a rate', fieldRates([[]], [], 100)[0] === 0);
// A lineup of nobody loses every week, and a lineup against itself is even.
const self = fieldRates([set, []], [set], 8000);
console.log(`      against a copy of itself: ${(self[0] * 100).toFixed(1)}%; `
    + `an empty lineup: ${(self[1] * 100).toFixed(1)}%`);
assert('a lineup against its own copy is a coin flip',
    Math.abs(self[0] - 0.5) < 0.02, (self[0] * 100).toFixed(1) + '%');
assert('an empty lineup never wins', self[1] === 0, String(self[1]));

step(6, 'shared draws, so the gaps are the lineup and not the luck');
// The same question from eight seeds. What a starter costs must not move by
// as much as the difference the page is asking a reader to act on.
const seeds = [7, 19, 23, 41, 59, 73, 97, 113];
// Rows come back sorted by cost, which can reorder between seeds, so the
// swing is measured per player rather than per position in the list.
const perSeed = seeds.map(sd =>
    new Map(replacementCost(roster, SLOTS, field, simOf, 20000, sd)
        .rows.map(r => [r.playerId, r.cost])));
let swing = 0;
for (const r of report.rows) {
    const xs = perSeed.map(m => m.get(r.playerId)!);
    swing = Math.max(swing, Math.max(...xs) - Math.min(...xs));
}
console.log(`      worst cost swing across ${seeds.length} seeds: `
    + `${(swing * 100).toFixed(2)}pp`);
assert('a paired cost is quieter than an absolute rate', swing < POWER_NOISE,
    `${(swing * 100).toFixed(2)}pp vs ${(POWER_NOISE * 100).toFixed(1)}pp`);
assert('and the finding survives every seed',
    perSeed.every(m => m.get(te1.id)! > m.get(rb1.id)!),
    perSeed.map(m => `${(m.get(te1.id)! * 100).toFixed(1)}>`
        + `${(m.get(rb1.id)! * 100).toFixed(1)}`).join(' '));

step(7, 'what it costs to compute');
const t0 = performance.now();
replacementCost(roster, SLOTS, field, simOf, 20000);
const ms = performance.now() - t0;
console.log(`      ten variants against eleven opponents: ${ms.toFixed(0)}ms`);
assert('inside the budget', ms < 700, `${ms.toFixed(0)}ms`);

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
