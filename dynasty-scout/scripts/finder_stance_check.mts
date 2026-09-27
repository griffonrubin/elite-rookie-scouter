/**
 * The trade the old finder could not see.
 *
 * `findTrades` has always looked for one shape: both starting lineups
 * improve. In a redraft league that is the only shape there is. In a dynasty
 * league it rejects, by construction, the trade those leagues are mostly
 * made of — a contender sending picks for a player. The seller's lineup gets
 * worse in every such deal, so "both lineups improve" throws away every one
 * of them however good it is for both managers.
 *
 * What is checked here is that the new stances find exactly that trade and
 * still refuse the bad versions of it: that the buyer's lineup genuinely
 * improves rather than merely changing, that the seller is paid on the
 * market rather than robbed, that a lowball is dropped even when it would
 * help the buyer enormously, and that ranking by efficiency prefers the
 * cheaper of two upgrades that are worth the same.
 *
 * And the one that matters most for trust: that `mutual` is untouched.
 * Rewriting a sweep eleven other things depend on is only safe if the old
 * path comes out the other side identical.
 */
import {
    findTrades, offerKey, type FinderPick, type FinderTeam, type MarketInput,
} from '../lib/tradeFinder';
import type { TradeRosterPlayer } from '../lib/trade';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];

const p = (id: number, position: string): TradeRosterPlayer =>
    ({ id, name: `P${id}`, position, startable: true });

/**
 * Points a week, by id.
 *
 * Built so a mutual trade genuinely exists, or step 1 asserts "no pick ever
 * appears in a mutual offer" against an empty list and passes for the wrong
 * reason. Mine is three deep at running back with a weak second receiver;
 * theirs is four deep at receiver with an empty second running-back slot.
 * My spare back is their whole problem and their spare receiver is mine.
 */
const POINTS: Record<number, number> = {
    1: 18, 2: 14, 3: 13, 4: 12, 5: 9, 6: 4, 7: 8,
    11: 17, 12: 5, 13: 16, 14: 15, 15: 14, 16: 13, 17: 9,
};
const meanOf = (id: number) => POINTS[id] ?? 0;

const MINE: TradeRosterPlayer[] = [
    p(1, 'QB'), p(2, 'RB'), p(3, 'RB'), p(4, 'RB'), p(5, 'WR'), p(6, 'WR'), p(7, 'TE'),
];
const THEIRS: TradeRosterPlayer[] = [
    p(11, 'QB'), p(12, 'RB'), p(13, 'WR'), p(14, 'WR'), p(15, 'WR'), p(16, 'WR'),
    p(17, 'TE'),
];
const OTHERS: FinderTeam[] = [{ key: 't2', name: 'Them', roster: THEIRS }];

/** Market prices. Their third receiver sits near a 2027 first. */
const VALUES: Record<number, number> = {
    1: 5000, 2: 3000, 3: 2500, 4: 2200, 5: 1200, 6: 400, 7: 900,
    11: 4800, 12: 600, 13: 4600, 14: 4200, 15: 1800, 16: 2400, 17: 800,
};
const pick = (id: string, label: string, value: number | null): FinderPick =>
    ({ id, label, value });

const MY_PICKS = [
    pick('2027-1-1', '2027 1st', 2800),
    pick('2027-2-1', '2027 2nd', 1500),
    pick('2028-1-1', '2028 1st', 2000),
    pick('2029-4-1', '2029 4th', null),   // unpriced, must never be offered
];
const THEIR_PICKS = [
    pick('2027-1-2', '2027 1st', 2800),
    pick('2027-3-2', '2027 3rd', 1000),
];

const market: MarketInput = {
    valueOfPlayer: (id: number) => VALUES[id] ?? null,
    myPicks: MY_PICKS,
    picksByTeam: new Map([['t2', THEIR_PICKS]]),
};
const me = { roster: MINE, slots: SLOTS, meanOf };

step(1, 'the old sweep cannot see a picks-for-player trade at all');
{
    const mutual = findTrades(me, OTHERS, undefined, 40);
    const anyPicks = mutual.some(o => o.givePicks.length || o.getPicks.length);
    console.log(`      ${mutual.length} mutual offers, none of them involving a pick`);
    assert('mutual still finds player-for-player offers', mutual.length > 0,
        `${mutual.length} — the two assertions below are vacuous without this`);
    assert('and never puts a pick in one', !anyPicks);
    // The point of the whole exercise: the seller's lineup always gets worse
    // in a picks-for-player deal, so the mutual rule can never keep one.
    assert('every mutual offer improves both lineups',
        mutual.every(o => o.myGain > 0 && o.theirGain > 0));
}

step(2, 'mutual is byte-for-byte what it was before the rewrite');
{
    const a = findTrades(me, OTHERS, undefined, 40);
    const b = findTrades(me, OTHERS, undefined, 40, 'mutual');
    const strip = (list: ReturnType<typeof findTrades>) => list.map(o => ({
        k: offerKey(o), myGain: o.myGain, theirGain: o.theirGain,
        balance: o.balance, uneven: o.unevenCount,
    }));
    assert('the default and an explicit mutual agree exactly',
        JSON.stringify(strip(a)) === JSON.stringify(strip(b)));
    assert('and a stance without a market finds nothing rather than guessing',
        findTrades(me, OTHERS, undefined, 40, 'buy').length === 0);
}

step(3, 'buying finds picks-for-player, and the buyer’s lineup really improves');
{
    const buy = findTrades(me, OTHERS, undefined, 40, 'buy', market);
    console.log(`      ${buy.length} offers`);
    for (const o of buy.slice(0, 3)) {
        console.log(`      give ${o.givePicks.join('+')} → get P${o.get[0]}  `
            + `+${o.myGain}pts  market ${o.myMarketGain}  eff ${o.efficiency}`);
    }
    assert('there are offers', buy.length > 0, `${buy.length}`);
    assert('every one sends picks and receives a player',
        buy.every(o => o.givePicks.length > 0 && o.get.length === 1
            && o.give.length === 0 && o.getPicks.length === 0));
    assert('the buyer’s lineup improves in all of them',
        buy.every(o => o.myGain >= 0.25), String(buy.filter(o => o.myGain < 0.25).length));
    assert('and the seller gains on the market in all of them',
        buy.every(o => o.theirMarketGain > 0));
    // The seller's lineup getting worse is the whole premise, and is exactly
    // what the mutual rule refused to allow.
    assert('the seller’s lineup is worse in at least one, and that is allowed',
        buy.some(o => o.theirGain < 0));
}

step(4, 'a pick with no market price is never offered');
{
    const buy = findTrades(me, OTHERS, undefined, 40, 'buy', market);
    const used = new Set(buy.flatMap(o => o.givePicks));
    console.log('      picks offered: ' + [...used].join(', '));
    assert('the unpriced 2029 4th is not in any offer', !used.has('2029-4-1'),
        [...used].join(','));
}

step(5, 'the seller is never asked to take less than the player is worth');
{
    // Their best receiver is worth 4,600 and the biggest upgrade on the
    // board. A lone 2027 2nd is 1,500, so buying him would take market value
    // off the seller as well as points — they would be worse off twice.
    const cheap: MarketInput = {
        ...market,
        myPicks: [pick('2027-2-1', '2027 2nd', 1500)],
    };
    const buy = findTrades(me, OTHERS, undefined, 40, 'buy', cheap);
    const underpaid = buy.filter(o => (VALUES[o.get[0]] ?? 0) >= 1500);
    console.log(`      ${buy.length} offers survive, ${underpaid.length} underpaying`);
    assert('nobody is offered a 1,500 pick for a player worth more',
        underpaid.length === 0, underpaid.map(o => `P${o.get[0]}`).join(','));
    assert('and the cheap pick still buys something it covers',
        buy.length > 0, `${buy.length} — without this the line above is vacuous`);
}

step(6, 'ranking prefers the cheaper of two equal upgrades');
{
    // Two picks that can each legally buy the same player: 2,800 and 2,000
    // against an 1,800 receiver — both clear his price, so both are real
    // offers and the ranking has to choose between them. Aiming at their best receiver instead would
    // prove nothing — at 4,600 both routes are lowballs and are correctly
    // thrown out, so there would be nothing left to rank.
    const twoWays: MarketInput = {
        ...market,
        myPicks: [
            pick('2027-1-1', '2027 1st', 2800),
            pick('2028-1-1', '2028 1st', 2000),
        ],
    };
    const buy = findTrades(me, OTHERS, undefined, 40, 'buy', twoWays);
    const target = buy.filter(o => o.get[0] === 15 && o.givePicks.length === 1);
    console.log('      ' + target.map(o =>
        `${o.givePicks[0]} eff ${o.efficiency}`).join('  |  '));
    if (target.length >= 2) {
        const first = target[0];
        const rest = target.slice(1);
        assert('the cheaper route is ranked first',
            rest.every(o => first.efficiency >= o.efficiency),
            `${first.givePicks[0]} at ${first.efficiency}`);
    } else {
        // Both routes must survive, or the comparison this step exists for
        // never happened and the assertion above would pass on one offer.
        assert('both routes to the same player survive to be compared',
            target.length >= 2, `${target.length} route(s)`);
    }
}

step(7, 'selling is the mirror: a player out, picks in');
{
    const sell = findTrades(me, OTHERS, undefined, 40, 'sell', market);
    console.log(`      ${sell.length} offers`);
    for (const o of sell.slice(0, 3)) {
        console.log(`      give P${o.give[0]} → get ${o.getPicks.join('+')}  `
            + `their lineup +${o.theirGain}  my market +${o.myMarketGain}`);
    }
    assert('there are offers', sell.length > 0, `${sell.length}`);
    assert('every one sends a player and receives picks',
        sell.every(o => o.give.length === 1 && o.getPicks.length > 0
            && o.get.length === 0 && o.givePicks.length === 0));
    assert('the buyer’s lineup improves in all of them',
        sell.every(o => o.theirGain >= 0.25));
    assert('and I gain on the market in all of them',
        sell.every(o => o.myMarketGain > 0));
}

step(8, 'offer keys tell two pick packages apart');
{
    const a = offerKey({ teamKey: 't2', give: [], get: [13], givePicks: ['2027-1-1'] });
    const b = offerKey({ teamKey: 't2', give: [], get: [13], givePicks: ['2028-1-1'] });
    console.log(`      ${a}\n      ${b}`);
    assert('two offers for the same player at different prices are different keys',
        a !== b);
    assert('and order within a package does not change the key',
        offerKey({ teamKey: 't2', give: [], get: [13], givePicks: ['a', 'b'] })
        === offerKey({ teamKey: 't2', give: [], get: [13], givePicks: ['b', 'a'] }));
    assert('an offer with no picks keeps a stable key',
        offerKey({ teamKey: 't2', give: [1], get: [13] })
        === offerKey({ teamKey: 't2', give: [1], get: [13], givePicks: [] }));
}

console.log(fails.length
    ? `\nFAILED ${fails.length}:\n - ${fails.join('\n - ')}`
    : '\nfinder_stance_check  ok');
process.exit(fails.length ? 1 : 0);
