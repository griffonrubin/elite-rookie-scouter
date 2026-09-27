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
    type WireInput,
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
        buy.every(o => (o.theirMarketGain ?? 0) > 0));
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
    const target = buy.filter(o => o.get[0] === 15);
    console.log('      ' + target.map(o =>
        `${o.givePicks.join('+')} eff ${o.efficiency}`).join('  |  '));

    /*
     * This step used to demand that both routes survive so their order could
     * be read off the list, and then failed once the sweep started keeping
     * one route per player. Both cannot be true, and the dedup is the one
     * worth having: seven worse ways to buy a receiver you have already
     * decided to buy is one suggestion wearing seven rows.
     *
     * So the claim moves to where it is still checkable, and is the stronger
     * one anyway — ranking happens before the dedup, so the survivor is the
     * cheapest route rather than whichever the sweep reached first. With only
     * two picks in play the expected answer is arithmetic: P15 costs 1,800,
     * both the 2027 1st at 2,800 and the 2028 1st at 2,000 clear that, and
     * the 2,000 one is cheaper.
     */
    assert('exactly one route to him survives', target.length === 1,
        `${target.length} route(s)`);
    assert('and it is the cheaper of the two that could have bought him',
        target[0]?.givePicks.join('+') === '2028-1-1',
        target[0]?.givePicks.join('+') ?? '(none)');
    assert('priced at the cheaper pick, not the dearer one',
        target[0]?.efficiency === 5, String(target[0]?.efficiency));
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
        sell.every(o => (o.myMarketGain ?? 0) > 0));
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

step('8b', 'the list is one route per player, and the cheapest one');
{
    const buy = findTrades(me, OTHERS, undefined, 40, 'buy', market);
    const targets = buy.map(o => `${o.teamKey}|${o.get[0]}`);
    console.log('      targets: ' + targets.join(', '));
    assert('no player appears twice', new Set(targets).size === targets.length,
        `${targets.length} rows, ${new Set(targets).size} distinct players`);

    // And the one kept must be the cheapest route. Comparing against another
    // call to findTrades cannot show that — the second list is deduped too,
    // so every "rival" set has one member and the test passes on itself. So
    // the expected value is worked out by hand instead.
    //
    // P15 is worth 1,800 and buying him adds 10 points a week. The picks
    // that clear his price are the 2027 1st at 2,800 and the 2028 1st at
    // 2,000; every pair costs more than either. The cheapest valid route is
    // therefore 2,000, at 10 / 2000 * 1000 = 5.0 points per thousand.
    const p15 = buy.find(o => o.get[0] === 15);
    assert('P15 survives to be judged', p15 != null);
    if (p15) {
        console.log(`      P15 kept: ${p15.givePicks.join('+')} at ${p15.efficiency}`);
        assert('the route kept for P15 is the hand-computed cheapest one',
            p15.efficiency === 5 && p15.givePicks.length === 1
            && p15.givePicks[0] === '2028-1-1',
            `${p15.givePicks.join('+')} at ${p15.efficiency}`);
        assert('and it is not the dearer pick that also clears his price',
            !p15.givePicks.includes('2027-1-1'), p15.givePicks.join('+'));
    }
}

step(9, 'a full roster is handled by cutting the spot, not by bartering it');
{
    /*
     * Seven players and a seven-man limit: every buy puts me a man over,
     * which is the state every real roster is in. This step used to assert
     * the opposite behaviour — that the sweep bundled my worst bench player
     * into the deal to keep the counts level. That worked and described
     * something nobody does: a manager buying a receiver for two firsts does
     * not ask the seller to take their twelfth man as well, they drop him.
     *
     * So the offers are now picks for a player, and the cut is reported
     * beside them rather than dressed up as part of the trade.
     */
    const full = findTrades(me, OTHERS, MINE.length, 40, 'buy', market);
    const loose = findTrades(me, OTHERS, undefined, 40, 'buy', market);
    console.log(`      ${loose.length} offers with no roster limit, `
        + `${full.length} with a full roster`);
    assert('a full roster still produces offers', full.length > 0, `${full.length}`);
    assert('and they are picks for a player, with no body bartered in',
        full.every(o => o.give.length === 0 && o.givePicks.length > 0),
        full.filter(o => o.give.length !== 0).length + ' carrying a body');

    // The cut has to be the cheapest man to lose, or the finder is proposing
    // you pay for a roster spot with a starter.
    const worstMean = Math.min(...MINE.map(p => POINTS[p.id] ?? 0));
    assert('every one names the cut it implies',
        full.every(o => o.drops.length === 1), 
        full.map(o => String(o.drops.length)).join(','));
    assert('and the man cut is the one the lineup misses least',
        full.every(o => (POINTS[o.drops[0]] ?? 0) === worstMean),
        full.map(o => `P${o.drops[0]}=${POINTS[o.drops[0]]}`).join(','));

    // A picks-for-a-player trade always moves one body one way and none the
    // other, so it is always uneven and must always say so.
    assert('all of them are tagged as changing a roster size',
        full.every(o => o.unevenCount),
        `${full.filter(o => !o.unevenCount).length} mislabelled`);

    // Where there is room, nobody is cut and the offer says nothing about one.
    assert('with room, no cut is named',
        loose.length > 0 && loose.every(o => o.drops.length === 0),
        `${loose.filter(o => o.drops.length).length} of ${loose.length} name one`);

    const sell = findTrades(me, OTHERS, THEIRS.length, 40, 'sell', market);
    assert('selling into a full roster works the same way',
        sell.length > 0 && sell.every(o => o.get.length === 0
            && o.getPicks.length > 0 && o.theirDrops.length === 1),
        `${sell.length} offers`);
}

step(10, 'a mutual offer is costed on the market without being ranked on it');
{
    const bare = findTrades(me, OTHERS, undefined, 40, 'mutual');
    const costed = findTrades(me, OTHERS, undefined, 40, 'mutual', market);

    // The claim that makes this safe to add: pricing the survivors does not
    // change which offers survive, nor their order. Same list, one column
    // richer.
    assert('pricing does not change the list or its order',
        JSON.stringify(bare.map(offerKey)) === JSON.stringify(costed.map(offerKey)),
        `${bare.length} vs ${costed.length}`);
    assert('without prices the market is unmeasured rather than even',
        bare.every(o => o.myMarketGain === null && o.theirMarketGain === null));
    assert('with them, every offer carries a number', costed.length > 0
        && costed.every(o => o.myMarketGain !== null));

    // Arithmetic, not vibes: what arrives minus what leaves, to the penny.
    const expected = (o: typeof costed[number]) =>
        o.get.reduce((t, id) => t + VALUES[id], 0)
        - o.give.reduce((t, id) => t + VALUES[id], 0);
    const wrong = costed.filter(o => o.myMarketGain !== expected(o));
    for (const o of costed.slice(0, 3)) {
        console.log(`      P${o.give.join('+P')} → P${o.get.join('+P')}  `
            + `+${o.myGain}pts  market ${o.myMarketGain} (want ${expected(o)})`);
    }
    assert('it is what arrives minus what leaves', wrong.length === 0,
        `${wrong.length} of ${costed.length} wrong`);
    assert('and the other manager gets the mirror of it',
        costed.every(o => o.theirMarketGain === -o.myMarketGain!));

    // The point of measuring it at all: in a dynasty league two offers that
    // both improve both lineups are not the same offer, and this is the
    // column that says so. If every survivor moved the market the same way
    // there would be nothing to show.
    const gains = new Set(costed.map(o => o.myMarketGain));
    console.log(`      ${gains.size} distinct market outcomes across `
        + `${costed.length} offers`);
    assert('mutual offers differ on the market, which is why it is shown',
        gains.size > 1, `${gains.size} distinct`);
    assert('and they are not all in the reader’s favour',
        costed.some(o => o.myMarketGain! < 0) && costed.some(o => o.myMarketGain! > 0),
        `${costed.filter(o => o.myMarketGain! < 0).length} against, `
        + `${costed.filter(o => o.myMarketGain! > 0).length} for`);

    // One unpriced player poisons that offer and only that offer. A blank on
    // one side would otherwise be compared against a number, which is how a
    // kicker comes to look like a free first-round pick.
    const blind: MarketInput = {
        ...market,
        valueOfPlayer: (id: number) => (id === 13 ? null : VALUES[id] ?? null),
    };
    const partial = findTrades(me, OTHERS, undefined, 40, 'mutual', blind);
    const touching = partial.filter(o => o.give.includes(13) || o.get.includes(13));
    assert('the fixture has offers involving the unpriced man',
        touching.length > 0, `${touching.length} — the next assertion needs them`);
    assert('an offer holding an unpriced player is unmeasured, not guessed',
        touching.every(o => o.myMarketGain === null));
    assert('and the offers beside it are still costed',
        partial.filter(o => !o.give.includes(13) && !o.get.includes(13))
            .every(o => o.myMarketGain !== null));

    // Both sides of the sum, because P13 is on their roster and so can only
    // ever arrive — breaking the outgoing guard left the assertion above
    // green. P3 is mine, and only leaves.
    const blindMine: MarketInput = {
        ...market,
        valueOfPlayer: (id: number) => (id === 3 ? null : VALUES[id] ?? null),
    };
    const outgoing = findTrades(me, OTHERS, undefined, 40, 'mutual', blindMine)
        .filter(o => o.give.includes(3));
    assert('the fixture sends the unpriced man somewhere too',
        outgoing.length > 0, `${outgoing.length} — the next assertion needs them`);
    assert('an unpriced player leaving is unmeasured as well',
        outgoing.every(o => o.myMarketGain === null));
}

step(11, 'two for two, and one row per idea rather than per permutation');
{
    const mutual = findTrades(me, OTHERS, undefined, 40);
    const shape = (o: typeof mutual[number]) => `${o.give.length}for${o.get.length}`;
    const counts: Record<string, number> = {};
    for (const o of mutual) counts[shape(o)] = (counts[shape(o)] ?? 0) + 1;
    console.log('      ' + JSON.stringify(counts));

    // The shape the sweep could not reach at all: each manager dealing from
    // depth at one position into need at another, two players each way. It is
    // also the only multi-player shape that costs neither side a roster spot.
    assert('the sweep now reaches two-for-two', (counts['2for2'] ?? 0) > 0,
        JSON.stringify(counts));
    assert('and has not stopped finding the simple ones',
        (counts['1for1'] ?? 0) > 0, JSON.stringify(counts));
    assert('every two-for-two still improves both lineups',
        mutual.filter(o => o.give.length === 2 && o.get.length === 2)
            .every(o => o.myGain >= 0.25 && o.theirGain >= 0.25));
    // Two out and two back is even, so it must never be tagged as changing
    // a roster's size.
    assert('and none of them is tagged as uneven',
        mutual.filter(o => o.give.length === 2 && o.get.length === 2)
            .every(o => !o.unevenCount));

    /*
     * The flood this shape causes if nothing stops it.
     *
     * Swap either of your two or either of theirs and it is a different offer
     * by exact match while being the same suggestion. Before the variant
     * rule the sweep returned five rows built around one receiver.
     */
    for (const o of mutual) {
        const men = new Set([...o.give, ...o.get]);
        const twins = mutual.filter(x => x !== o && x.teamKey === o.teamKey
            && [...x.give, ...x.get].filter(id => men.has(id)).length >= 3);
        if (twins.length) {
            assert('no offer is a three-quarter copy of another',
                false, `[${o.give}]→[${o.get}] vs [${twins[0].give}]→[${twins[0].get}]`);
            break;
        }
    }
    assert('no offer is a three-quarter copy of another', true);

    // Two one-for-ones can only ever share one player, and both must survive:
    // their back for your receiver and their back for your other receiver are
    // different things to send. The rule must not reach them.
    const ones = mutual.filter(o => o.give.length === 1 && o.get.length === 1);
    const sharing = ones.filter(o => ones.some(x => x !== o && x.teamKey === o.teamKey
        && (x.give[0] === o.give[0] || x.get[0] === o.get[0])));
    console.log(`      ${sharing.length} one-for-ones share a player with another`);
    // Asserted directly rather than behind an "or there are none" escape.
    // That escape passed at 0 of 0 — which is exactly the state an
    // over-aggressive rule produces, so the guard excused the failure it was
    // written to catch. Both ways of reaching zero are failures here.
    assert('one-for-ones that share a player are both kept',
        sharing.length > 0, `${sharing.length} sharing, of ${ones.length}`);
}

step(12, 'a full roster is settled by cutting, not by refusing the trade');
{
    const FULL = MINE.length;            // every roster here is at its limit
    const shapes = (list: ReturnType<typeof findTrades>) => {
        const out: Record<string, number> = {};
        for (const o of list) {
            const k = `${o.give.length}for${o.get.length}`;
            out[k] = (out[k] ?? 0) + 1;
        }
        return out;
    };
    const full = findTrades(me, OTHERS, FULL, 40);
    const roomy = findTrades(me, OTHERS, FULL + 2, 40);
    console.log(`      full:  ${JSON.stringify(shapes(full))}`);
    console.log(`      roomy: ${JSON.stringify(shapes(roomy))}`);

    /*
     * The thing this fixes. A trade that left somebody over the limit used to
     * be thrown away, and on a full roster — the normal state of a league —
     * that is every uneven offer there is. Consolidation, the classic fantasy
     * trade, was unreachable in exactly the leagues people play in.
     */
    const uneven = (list: ReturnType<typeof findTrades>) =>
        list.filter(o => o.give.length !== o.get.length).length;
    assert('a roster with room offers uneven trades', uneven(roomy) > 0,
        `${uneven(roomy)} — the next assertion is vacuous without this`);
    assert('and a full one still does', uneven(full) > 0, `${uneven(full)}`);

    // Every one of them has to name the cut it implies, on the side that is
    // over. An offer that silently costs a player is not the offer read.
    const overMine = full.filter(o => o.get.length > o.give.length);
    assert('the fixture produces offers that grow my roster',
        overMine.length > 0, `${overMine.length}`);
    assert('each one names who I would have to cut',
        overMine.every(o => o.drops.length === o.get.length - o.give.length),
        overMine.map(o => `${o.get.length - o.give.length}:${o.drops.length}`).join(' '));
    // And it is the worst man who goes, not an arbitrary one.
    assert('and it is the cheapest player on the roster who goes',
        overMine.every(o => {
            const left = MINE.filter(x => !o.give.includes(x.id)
                && !o.drops.includes(x.id));
            const cut = Math.max(...o.drops.map(meanOf));
            return left.every(x => meanOf(x.id) >= cut);
        }));
    // Nobody in the trade can be the one cut: receiving a player and
    // immediately dropping him is not a trade, it is a rounding error.
    assert('never cutting somebody the trade just brought in',
        full.every(o => !o.drops.some(id => o.get.includes(id))
            && !o.theirDrops.some(id => o.give.includes(id))));
}

step(13, 'an empty lineup slot is worth the wire, not zero');
{
    /*
     * A manager who trades away their only tight end does not start nobody
     * there for the rest of the season; they claim one on Tuesday. Scoring
     * that slot at zero overstates what the trade costs them.
     *
     * Built rather than fished out of the sweep. The first version looked for
     * offers sending the only tight end and compared their gains with and
     * without a wire — and got the same number both ways, because the offers
     * it found were receiving a tight end back, which refills the slot and
     * cancels the whole effect. The opponent here holds none, so the slot
     * really does empty.
     */
    const thin: TradeRosterPlayer[] = [
        p(1, 'QB'), p(2, 'RB'), p(3, 'RB'), p(5, 'WR'), p(6, 'WR'), p(7, 'TE')];
    const thinMe = { roster: thin, slots: SLOTS, meanOf };
    const noTE: FinderTeam[] = [{ key: 't9', name: 'No tight ends',
        roster: [p(11, 'QB'), p(13, 'WR'), p(14, 'WR'), p(15, 'WR'), p(16, 'WR')] }];
    const wire: WireInput = { best: new Map([['TE', 6], ['WR', 5], ['RB', 5]]) };

    const sendsTE = (list: ReturnType<typeof findTrades>) =>
        list.filter(o => o.give.includes(7) && !o.get.some(id => id === 17));
    const bare = sendsTE(findTrades(thinMe, noTE, undefined, 40));
    const wired = sendsTE(
        findTrades(thinMe, noTE, undefined, 40, 'mutual', undefined, wire));
    console.log(`      offers sending the only tight end into a roster with `
        + `none: ${bare.length} bare, ${wired.length} wired`);

    // Both lists have to hold the trade, or the comparison is between two
    // empty sets and says nothing — which is how the first attempt passed.
    assert('the fixture really does offer to trade the only tight end',
        bare.length > 0 && wired.length > 0, `${bare.length} / ${wired.length}`);

    const gainFor = (list: ReturnType<typeof findTrades>) => {
        const byKey = new Map(list.map(o => [offerKey(o), o.myGain]));
        return byKey;
    };
    const b = gainFor(bare);
    const w = gainFor(wired);
    const shared = [...b.keys()].filter(k => w.has(k));
    console.log(`      ${shared.length} offers in both lists`);
    assert('the same offers are reachable either way', shared.length > 0,
        `${shared.length} — nothing to compare otherwise`);
    const better = shared.filter(k => w.get(k)! > b.get(k)!);
    for (const k of shared.slice(0, 3)) {
        console.log(`        ${k}  bare ${b.get(k)}  wired ${w.get(k)}`);
    }
    // Strictly better, not merely no worse: emptying the tight-end slot costs
    // the whole of him without a wire and the gap down to a free agent with
    // one, and those are different numbers.
    assert('losing him costs strictly less when somebody can replace him',
        better.length > 0, `${better.length} of ${shared.length} improved`);
    assert('and never more', shared.every(k => w.get(k)! >= b.get(k)!));
}

console.log(fails.length
    ? `\nFAILED ${fails.length}:\n - ${fails.join('\n - ')}`
    : '\nfinder_stance_check  ok');
process.exit(fails.length ? 1 : 0);
