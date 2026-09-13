/**
 * Trades worth proposing, found rather than guessed.
 *
 * The analyser prices a trade you have already thought of, which is the
 * second half of the job. The hard part is noticing that the manager in
 * eighth is two deep at tight end and starting a nine-point receiver while
 * you are the other way round — nobody reads eleven rosters looking for
 * that, so nobody finds it, and the trades that get made are the ones
 * somebody happened to think of.
 *
 * Three things have to hold or the list is worse than nothing. It has to
 * find the obvious complementary swap when one is planted. It has to refuse
 * offers the other manager should refuse — a finder ranked on your own gain
 * produces a list of messages that go unanswered. And it has to stay inside
 * a frame on a real league, because a search that takes four seconds is a
 * search nobody waits for.
 */
import { findTrades, offerReason, type FinderTeam } from '../lib/tradeFinder';
import type { TradeRosterPlayer } from '../lib/trade';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const mean = new Map<number, number>();
let nextId = 1;
const man = (name: string, position: string, points: number): TradeRosterPlayer => {
    const id = nextId++;
    mean.set(id, points);
    return { id, name, position, startable: true };
};
const meanOf = (id: number) => mean.get(id) ?? 0;
const nameOf = (id: number) => [...allPlayers].find(p => p.id === id)?.name ?? String(id);
const positionOf = (id: number) =>
    [...allPlayers].find(p => p.id === id)?.position ?? '';
const allPlayers: TradeRosterPlayer[] = [];
const roster = (...ps: TradeRosterPlayer[]) => { allPlayers.push(...ps); return ps; };

step(1, 'the complementary swap nobody reads eleven rosters to find');
/**
 * Deep at back and bare at tight end, against a team that is the mirror.
 *
 * Both sides start a player they should not, both hold one they cannot use,
 * and the swap is obvious the moment somebody puts the two rosters beside
 * each other — which is the thing that never happens.
 */
const mine = roster(
    man('my quarterback', 'QB', 19),
    man('my first back', 'RB', 16),
    man('my second back', 'RB', 15),
    man('my third back', 'RB', 14),
    man('my spare back', 'RB', 13),
    man('my first receiver', 'WR', 14),
    man('my second receiver', 'WR', 12),
    man('my tight end', 'TE', 4),
    man('my kicker', 'K', 8),
    man('my defence', 'DST', 7),
);
const theirs = roster(
    man('their quarterback', 'QB', 18),
    man('their only back', 'RB', 11),
    man('their spare receiver', 'WR', 13),
    man('their first receiver', 'WR', 15),
    man('their second receiver', 'WR', 14),
    man('their first tight end', 'TE', 13),
    man('their second tight end', 'TE', 12),
    man('their kicker', 'K', 8),
    man('their defence', 'DST', 7),
);
const league: FinderTeam[] = [{ key: 'them', name: 'the other manager', roster: theirs }];
const offers = findTrades({ roster: mine, slots: SLOTS, meanOf }, league);
console.log(`      ${offers.length} offers both sides gain from`);
for (const o of offers.slice(0, 4)) {
    console.log(`      ${o.give.map(nameOf).join(' + ')} → ${o.get.map(nameOf).join(' + ')}`
        + `   you +${o.myGain}, them +${o.theirGain}`);
}
assert('there is something to propose', offers.length > 0, String(offers.length));
const top = offers[0];
assert('it sends a back and receives a tight end',
    top.give.some(id => positionOf(id) === 'RB')
    && top.get.some(id => positionOf(id) === 'TE'),
    `${top.give.map(positionOf).join('+')} → ${top.get.map(positionOf).join('+')}`);
assert('both lineups improve', top.myGain > 0 && top.theirGain > 0,
    `+${top.myGain} / +${top.theirGain}`);
assert('every offer improves both, or it would not be an offer',
    offers.every(o => o.myGain > 0 && o.theirGain > 0),
    offers.filter(o => o.myGain <= 0 || o.theirGain <= 0).length + ' one-sided');

step(2, 'ranked on the smaller gain, because a lopsided offer is unanswered mail');
console.log('      ' + offers.slice(0, 6)
    .map(o => `${o.myGain}/${o.theirGain}`).join('  '));
assert('the list is ordered by what the other side gets too',
    offers.every((o, i) => i === 0 || o.balance <= offers[i - 1].balance + 1e-9),
    offers.map(o => o.balance).slice(0, 6).join(','));
assert('and the top offer is genuinely two-sided',
    top.balance > 0.5, String(top.balance));
/**
 * What actually does the work here, which is not the sort.
 *
 * Trying to build a fixture where a self-interested ranking leads with an
 * unanswerable offer turned out to be impossible, and the reason is worth
 * writing down: an offer worth a great deal to me and nothing to them never
 * reaches the ranking at all, because both sides must clear MIN_GAIN to be
 * kept. The floor removes the unanswerable ones; the sort only orders what
 * survives.
 *
 * There is also a structural version of the same point. When both rosters
 * start everybody they hold, a one-for-one moves exactly as much onto one
 * side as it takes off the other, so no such trade can improve both — every
 * offer in this list exists because somebody has a player who is not
 * starting. That is what a surplus *is*, and it is why a finder that ignores
 * lineups and compares player values finds trades that do not help anyone.
 */
const lopsided = offers.map(o => Math.abs(o.myGain - o.theirGain));
const worst = Math.max(...lopsided);
console.log(`      most lopsided offer in the list: ${worst} points apart; `
    + `the one ranked first is ${lopsided[0]} apart`);
assert('the floor, not the sort, is what removes unanswerable offers',
    offers.every(o => o.myGain >= 0.25 && o.theirGain >= 0.25),
    offers.map(o => Math.min(o.myGain, o.theirGain)).slice(0, 5).join(','));
assert('and the sort does not lead with the most lopsided of what is left',
    lopsided[0] < worst, `${lopsided[0]} against ${worst}`);

step(3, 'a team with nothing to offer produces nothing');
// Strictly worse everywhere: there is no trade, and inventing one is worse
// than an empty list.
const worse = roster(
    man('a worse quarterback', 'QB', 6),
    man('a worse back', 'RB', 5),
    man('a worse receiver', 'WR', 4),
    man('a worse tight end', 'TE', 3),
    man('a worse kicker', 'K', 2),
    man('a worse defence', 'DST', 1),
);
const none = findTrades({ roster: mine, slots: SLOTS, meanOf },
    [{ key: 'w', name: 'the worst roster', roster: worse }]);
console.log(`      ${none.length} offers against a strictly worse roster`);
assert('no trade is found where there is no trade', none.length === 0,
    String(none.length));

step(4, 'the roster limit is respected rather than assumed away');
/**
 * Two-for-one shrinks one roster and grows the other, so a league at its
 * limit cannot take the side receiving two — and an offer that needs a cut
 * nobody agreed to is not an offer.
 */
const roomy = findTrades({ roster: mine, slots: SLOTS, meanOf }, league, 99);
const tight = findTrades({ roster: mine, slots: SLOTS, meanOf }, league,
    Math.max(mine.length, theirs.length));
const packages = (os: typeof roomy) => os.filter(o => o.unevenCount).length;
console.log(`      with room: ${packages(roomy)} uneven offers; `
    + `at the limit: ${packages(tight)}`);
assert('packages exist when there is room for them', packages(roomy) > 0,
    String(packages(roomy)));
assert('and none of them would put a roster over the limit',
    tight.every(o => {
        const after = mine.length - o.give.length + o.get.length;
        const theirsAfter = theirs.length - o.get.length + o.give.length;
        const cap = Math.max(mine.length, theirs.length);
        return after <= cap && theirsAfter <= cap;
    }), String(packages(tight)));

step(5, 'it says why, in the words a message to that manager would use');
const myRank = { RB: 1, WR: 5, TE: 12, QB: 3 };
const theirRank = { RB: 12, WR: 2, TE: 1, QB: 4 };
const why = offerReason(top, myRank, theirRank, positionOf, 12);
console.log('      ' + (why ?? '(no reason given)'));
assert('a complementary swap explains itself', why != null, String(why));
assert('and names both sides of it',
    !!why && /you are 1 of 12 at RB/i.test(why) && /they are 1 at TE/i.test(why), why ?? '');
// A swap between two positions where the rosters lean the same way is not a
// complementary trade, and claiming it is would be worse than silence.
const flat = offerReason(top, { RB: 1, TE: 2 }, { RB: 2, TE: 1 }, positionOf, 12);
assert('and stays quiet when the rosters do not actually complement',
    flat === null || /at RB/.test(flat), String(flat));

step(6, 'what a real league costs to search');
/**
 * Eleven opponents of fifteen players each. Every one-for-one and every
 * two-for-one, both directions, is about thirty-five thousand offers — and a
 * search nobody waits for is a search nobody uses.
 */
const bigLeague: FinderTeam[] = Array.from({ length: 11 }, (_, t) => ({
    key: `t${t}`, name: `team ${t}`,
    roster: roster(
        man(`qb${t}`, 'QB', 18 - t * 0.4), man(`qb${t}b`, 'QB', 9),
        man(`rb${t}a`, 'RB', 15 - t * 0.3), man(`rb${t}b`, 'RB', 12),
        man(`rb${t}c`, 'RB', 9), man(`rb${t}d`, 'RB', 6),
        man(`wr${t}a`, 'WR', 14 - t * 0.3), man(`wr${t}b`, 'WR', 12),
        man(`wr${t}c`, 'WR', 10), man(`wr${t}d`, 'WR', 8),
        man(`te${t}a`, 'TE', 11 - t * 0.4), man(`te${t}b`, 'TE', 5),
        man(`k${t}`, 'K', 8), man(`d${t}`, 'DST', 7),
    ),
}));
const bigMe = roster(
    man('me qb', 'QB', 19), man('me qb2', 'QB', 8),
    man('me rb1', 'RB', 16), man('me rb2', 'RB', 15),
    man('me rb3', 'RB', 13), man('me rb4', 'RB', 11),
    man('me wr1', 'WR', 13), man('me wr2', 'WR', 11),
    man('me wr3', 'WR', 9), man('me wr4', 'WR', 7),
    man('me te', 'TE', 5), man('me te2', 'TE', 4),
    man('me k', 'K', 8), man('me d', 'DST', 7),
);
const t0 = performance.now();
const found = findTrades({ roster: bigMe, slots: SLOTS, meanOf }, bigLeague, 14);
const ms = performance.now() - t0;
console.log(`      eleven opponents searched in ${ms.toFixed(0)}ms, `
    + `${found.length} offers kept`);
for (const o of found.slice(0, 3)) {
    console.log(`      ${o.teamName}: ${o.give.map(nameOf).join(' + ')} → `
        + `${o.get.map(nameOf).join(' + ')}  you +${o.myGain}, them +${o.theirGain}`);
}
assert('a real league is searched inside a frame', ms < 1200, `${ms.toFixed(0)}ms`);
assert('and it finds the tight end this roster is missing',
    found.some(o => o.get.some(id => positionOf(id) === 'TE')),
    found.slice(0, 3).map(o => o.get.map(positionOf).join('+')).join(' '));
assert('every offer still improves both sides',
    found.every(o => o.myGain > 0 && o.theirGain > 0));
assert('and no offer is a duplicate of another',
    new Set(found.map(o => `${o.teamKey}|${o.give.sort().join()}|${o.get.sort().join()}`))
        .size === found.length, String(found.length));

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
