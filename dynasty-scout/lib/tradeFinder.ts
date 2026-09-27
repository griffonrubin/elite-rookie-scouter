/**
 * Trades worth proposing, found rather than guessed.
 *
 * The analyser prices a trade you have already thought of. That is the second
 * half of the job: the hard part is noticing that the manager in eighth place
 * is two deep at tight end and starting a receiver who scores nine, while you
 * are the other way round. Nobody reads eleven rosters looking for that, so
 * nobody finds it, and the trades that get made are the ones somebody happened
 * to think of.
 *
 * Every one-for-one and two-for-one between your roster and every other is
 * tried — about thirty-five thousand offers in a twelve-team league — and the
 * ones that improve *both* starting lineups are kept. Both, because an offer
 * the other manager should refuse is not a trade, it is a message you will not
 * get a reply to, and a finder that ranks by your gain alone produces a list
 * of those.
 *
 * Priced on the best lineup each side could field, deterministically. No
 * simulation: the lineup is a function of the projections, thirty-five
 * thousand Monte Carlo runs would take a minute, and the difference between
 * two lineups is exactly what this needs. The win-rate consequence of the
 * handful that survive is what the analyser below is for.
 */
import { bestLineup, type TradeRosterPlayer } from '@/lib/trade';

/**
 * What the reader is trying to do, which decides what counts as a good offer.
 *
 * The sweep below has always looked for one shape: both starting lineups
 * improve. That is the right and only shape in a redraft league, where
 * everybody wants the same thing, and it is *structurally incapable* of
 * finding the trade dynasty leagues are actually made of — because the
 * dynasty trade is two managers wanting opposite things.
 *
 * A contender gives up picks, which are worth nothing to a lineup this
 * season, and receives a player. Their lineup improves and the seller's gets
 * worse, so "both lineups improve" rejects every such offer no matter how
 * good it is for both of them. The seller is not being robbed; they are
 * being paid in a currency the old rule could not see.
 *
 * So the rule becomes: both sides gain on the axis they each care about.
 * Which axis that is, is the reader's to declare, because we cannot know
 * whether they are chasing this season or next.
 */
export type Stance = 'mutual' | 'buy' | 'sell';

/** A draft pick, as something the sweep can put in an offer. */
export interface FinderPick {
    /** The id `tradePicks` builds, '2027-1-8'. */
    id: string;
    /** "2027 1st", for reading back. */
    label: string;
    /** Market price, or null where the feed does not carry one. */
    value: number | null;
}

export interface Offer {
    teamKey: string;
    teamName: string;
    /** Player ids leaving your roster, and arriving on it. */
    give: number[];
    get: number[];
    /** Picks each way, for the offers that are made of them. */
    givePicks: string[];
    getPicks: string[];
    /** Points a week each side's best lineup gains. */
    myGain: number;
    theirGain: number;
    /**
     * What the offer does to each side's holdings on the dynasty market.
     *
     * The other half of a trade between two managers who want different
     * things: the one giving up this season's points has to be gaining
     * something, and this is what it is.
     *
     * Null where it could not be measured — a redraft league, where the
     * question does not arise, or an offer holding a player the feed does
     * not price. Nullable rather than zero because a trade that is even on
     * the market and a trade nobody costed are opposite pieces of news, and
     * a reader shown `0` for both cannot tell which one they have.
     */
    myMarketGain: number | null;
    theirMarketGain: number | null;
    /**
     * Points a week bought per thousand of market value spent.
     *
     * The ranking a buyer actually wants. Two firsts that both buy you a
     * starter are not the same offer if one costs four thousand and the
     * other costs two, and sorting on the points alone cannot say so.
     */
    efficiency: number;
    /**
     * The smaller of the two gains.
     *
     * What decides whether an offer is worth sending: a deal worth eight
     * points to you and a tenth of one to them is not a deal, it is a
     * message that goes unanswered.
     */
    balance: number;
    /** True when one side receives more players than it sends. */
    unevenCount: boolean;
}

/**
 * A stable identity for an offer.
 *
 * The same trade found on two renders has to be the same key, or a price
 * computed for it lands on nothing. Built from the partner and both sides
 * rather than from the list position, which moves when the list is
 * re-sorted or filtered to one manager.
 */
export function offerKey(
    o: Pick<Offer, 'teamKey' | 'give' | 'get'>
        & Partial<Pick<Offer, 'givePicks' | 'getPicks'>>,
): string {
    // Picks are in the key because two offers can move the same players and
    // different picks, and a price computed for one would otherwise land on
    // the other.
    const picks = (list?: string[]) => (list ?? []).slice().sort().join('.');
    return `${o.teamKey}:${[...o.give].sort((a, b) => a - b).join('.')}`
        + `+${picks(o.givePicks)}`
        + `>${[...o.get].sort((a, b) => a - b).join('.')}`
        + `+${picks(o.getPicks)}`;
}

export interface FinderInput {
    roster: TradeRosterPlayer[];
    slots: string[];
    meanOf: (id: number) => number;
}

export interface FinderTeam {
    key: string;
    name: string;
    roster: TradeRosterPlayer[];
}

/**
 * How many of each side's players are considered for the two-player packages.
 *
 * Every pair of fifteen is a hundred and five, and against fifteen of theirs
 * across eleven teams that is seventeen thousand offers before the
 * one-for-ones. Capping the pairs at the top eight by projection keeps the
 * search honest — nobody trades two of their worst players for anything — and
 * keeps the whole sweep inside a frame.
 */
const PACKAGE_POOL = 8;

/**
 * And how many for the two-sided packages, where every combination of one
 * side's pairs is tried against every combination of the other's.
 *
 * Smaller than the pool above because the cost is a product rather than a
 * sum: eight-a-side is twenty-eight pairs each way, seven hundred and
 * eighty-four offers per opponent, and it took the sweep from 158ms to
 * 590ms — which a browser runs twice under StrictMode while somebody waits.
 * Six-a-side is fifteen pairs and two hundred and twenty-five.
 *
 * The cut is not arbitrary. A two-for-two names four players and all four
 * have to be worth moving; an offer built from your seventh and eighth best
 * against theirs is not a trade anybody sends, and the same reasoning that
 * caps the pool above applies harder when both sides are packages.
 */
const PAIR_POOL = 6;

/** Offers below this are inside the rounding of a projection. */
const MIN_GAIN = 0.25;

/**
 * At most this many picks from either side are tried in an offer.
 *
 * A twelve-team dynasty league holds twelve future picks per manager, and
 * pairing all of them against every player on eleven rosters is a sweep
 * nobody waits for. The most valuable few are the ones that buy anything
 * worth buying, and a fourth-rounder three years out is not the difference
 * between a deal and no deal.
 */
const PICK_POOL = 6;

export interface MarketInput {
    /** What a player is worth on the dynasty market, where it is known. */
    valueOfPlayer: (id: number) => number | null;
    /** The picks I hold. */
    myPicks: FinderPick[];
    /** And the ones each other manager holds, by team key. */
    picksByTeam: Map<string, FinderPick[]>;
}

export function findTrades(
    me: FinderInput,
    others: FinderTeam[],
    /** Roster spots the league allows, where the platform reports it. */
    rosterSize?: number,
    limit = 40,
    /** 'mutual' keeps the original sweep exactly as it was. */
    stance: Stance = 'mutual',
    market?: MarketInput,
): Offer[] {
    if (stance !== 'mutual') {
        return market
            ? findAcrossStances(me, others, market, stance, rosterSize, limit)
            : [];
    }
    return findMutual(me, others, rosterSize, limit, market);
}

function findMutual(
    me: FinderInput,
    others: FinderTeam[],
    rosterSize?: number,
    limit = 40,
    /**
     * Prices, where the league has them.
     *
     * Not used for ranking, and that distinction is the whole of it: a
     * mutual offer is still found and ordered on the lineups, exactly as it
     * always was. This only costs the ones that survive.
     *
     * Because in a dynasty league "both lineups improve" is equally true of
     * the offer that hands a 23-year-old over for a 28-year-old and of the
     * reverse, and a reader choosing between those two was being shown the
     * half of each trade that expires in January and not the half that
     * does not.
     */
    market?: MarketInput,
): Offer[] {
    const { roster: mine, slots, meanOf } = me;
    if (mine.length === 0 || slots.length === 0) return [];
    const value = (r: TradeRosterPlayer[]) => {
        let total = 0;
        for (const id of bestLineup(slots, r, meanOf)) {
            if (id != null) total += meanOf(id);
        }
        return total;
    };
    const myBase = value(mine);
    const byId = new Map(mine.map(p => [p.id, p]));
    const topOf = (r: TradeRosterPlayer[]) => [...r]
        .sort((a, b) => meanOf(b.id) - meanOf(a.id))
        .slice(0, PACKAGE_POOL);
    const pairsOf = (r: TradeRosterPlayer[], pool = PACKAGE_POOL) => {
        const top = topOf(r).slice(0, pool);
        const out: TradeRosterPlayer[][] = [];
        for (let i = 0; i < top.length; i++) {
            for (let j = i + 1; j < top.length; j++) out.push([top[i], top[j]]);
        }
        return out;
    };

    const offers: Offer[] = [];
    for (const them of others) {
        if (them.roster.length === 0) continue;
        const theirBase = value(them.roster);
        const theirById = new Map(them.roster.map(p => [p.id, p]));

        const consider = (give: TradeRosterPlayer[], get: TradeRosterPlayer[]) => {
            const giveIds = new Set(give.map(p => p.id));
            const getIds = new Set(get.map(p => p.id));
            const mineAfter = mine.filter(p => !giveIds.has(p.id)).concat(get);
            const theirsAfter = them.roster.filter(p => !getIds.has(p.id)).concat(give);
            // A trade that would leave either side over the roster limit is
            // not an offer, it is an offer plus a cut nobody agreed to.
            if (rosterSize != null) {
                if (mineAfter.length > rosterSize || theirsAfter.length > rosterSize) return;
            }
            const myGain = value(mineAfter) - myBase;
            if (myGain < MIN_GAIN) return;
            const theirGain = value(theirsAfter) - theirBase;
            if (theirGain < MIN_GAIN) return;
            /**
             * What the offer does to the reader's holdings on the market.
             *
             * Every player in it has to be priced. One blank makes the
             * comparison a number against nothing, which is how a kicker
             * comes to look like a free first-round pick — the same rule the
             * bought-and-sold sweep applies, for the same reason.
             */
            let myMarketGain: number | null = null;
            if (market) {
                let net = 0;
                let priced = true;
                for (const p of give) {
                    const v = market.valueOfPlayer(p.id);
                    if (v == null) { priced = false; break; }
                    net -= v;
                }
                if (priced) {
                    for (const p of get) {
                        const v = market.valueOfPlayer(p.id);
                        if (v == null) { priced = false; break; }
                        net += v;
                    }
                }
                if (priced) myMarketGain = Math.round(net);
            }
            offers.push({
                teamKey: them.key, teamName: them.name,
                give: give.map(p => p.id), get: get.map(p => p.id),
                givePicks: [], getPicks: [],
                myGain: Math.round(myGain * 10) / 10,
                theirGain: Math.round(theirGain * 10) / 10,
                myMarketGain,
                theirMarketGain: myMarketGain == null ? null : -myMarketGain,
                // Nothing was bought here, so there is no price to divide
                // the points by.
                efficiency: 0,
                balance: Math.round(Math.min(myGain, theirGain) * 10) / 10,
                unevenCount: give.length !== get.length,
            });
        };

        for (const a of mine) {
            for (const b of them.roster) consider([a], [b]);
        }
        // Two of mine for one of theirs, and the reverse. The classic trade
        // in a fantasy league is consolidation — two startable players for
        // one who is better than either — and a finder that only tries
        // one-for-ones cannot see it.
        for (const pair of pairsOf(mine)) {
            for (const b of topOf(them.roster)) consider(pair, [b]);
        }
        for (const pair of pairsOf(them.roster)) {
            for (const a of topOf(mine)) consider([a], pair);
        }
        /*
         * Two for two, which is the shape the finder could not see at all.
         *
         * One-for-one is a swap and two-for-one is consolidation; the trade
         * neither of those covers is the one where each manager deals from
         * depth at one position into need at another — two backs for two
         * receivers. It is arguably the most common shape in a real league
         * after the straight swap, and it was unreachable by construction.
         *
         * It is also the only multi-player shape that costs nothing in roster
         * spots: both sides send two and receive two, so it is offered even
         * where the league has no room, unlike the uneven packages above.
         */
        for (const pair of pairsOf(mine, PAIR_POOL)) {
            for (const theirs of pairsOf(them.roster, PAIR_POOL)) {
                consider(pair, theirs);
            }
        }
    }

    /**
     * Deduplicated, because the same swap is reachable more than one way.
     *
     * Ranked on the smaller gain rather than on yours. An offer worth eight
     * points to you and a tenth of one to them will sit unanswered, and a
     * list of those is a list of nothing.
     */
    const seen = new Set<string>();
    const key = (o: Offer) => `${o.teamKey}|${[...o.give].sort().join(',')}`
        + `|${[...o.get].sort().join(',')}`;
    const unique = offers.filter(o => {
        const k = key(o);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    unique.sort((a, b) => b.balance - a.balance || b.myGain - a.myGain);

    /**
     * And one idea per idea, not one row per permutation of it.
     *
     * Two-for-two multiplies the ways of saying the same thing. Swap either
     * of your two, or either of theirs, and it is a different offer by the
     * exact-match rule above while being obviously the same suggestion — the
     * sweep produced five rows built around one receiver, four of which a
     * reader would skip after reading the first.
     *
     * So an offer is dropped when a better-ranked one with the same manager
     * already contains three or more of its players. Three rather than two,
     * because two one-for-ones can only ever share one player and must both
     * survive: "their back for your receiver" and "their back for your other
     * receiver" are genuinely different things to send. It is four-player
     * offers the rule is aimed at, and they are the ones it catches.
     *
     * Sorted first, so the survivor of each cluster is its best member.
     */
    const kept: Offer[] = [];
    for (const o of unique) {
        const men = new Set([...o.give, ...o.get]);
        const variant = kept.some(k => {
            if (k.teamKey !== o.teamKey) return false;
            let shared = 0;
            for (const id of [...k.give, ...k.get]) if (men.has(id)) shared++;
            return shared >= 3;
        });
        if (!variant) kept.push(o);
        if (kept.length >= limit) break;
    }
    return kept;
}

/**
 * Offers between two managers who want different things.
 *
 * A buyer sends picks and receives a player: their lineup improves, the
 * seller's gets worse, and the seller is paid on the market instead. A
 * seller does the reverse. Both sides still have to gain — that rule never
 * changes, because an offer the other manager should refuse is a message
 * that goes unanswered — but each gains on their own axis.
 *
 * Two guards keep the list sendable. The price has to beat what the player
 * is worth, or the seller is being asked to lose on both axes at once; and
 * the buyer's lineup has to actually move, or it is money spent on nothing.
 * What neither guard does is stop a buyer overpaying — paying over the odds
 * to win this season is the entire premise of buying, so the market number
 * is printed beside every row and the judgement left where it belongs.
 */
function findAcrossStances(
    me: FinderInput,
    others: FinderTeam[],
    market: MarketInput,
    stance: Stance,
    rosterSize?: number,
    limit = 40,
): Offer[] {
    const { roster: mine, slots, meanOf } = me;
    if (mine.length === 0 || slots.length === 0) return [];

    const lineup = (r: TradeRosterPlayer[]) => {
        let total = 0;
        for (const id of bestLineup(slots, r, meanOf)) {
            if (id != null) total += meanOf(id);
        }
        return total;
    };
    const myBase = lineup(mine);
    /** Priced picks only: an unpriced one cannot be weighed against a player. */
    const priced = (list: FinderPick[]) => list
        .filter(p => p.value != null && p.value > 0)
        .sort((a, b) => b.value! - a.value!)
        .slice(0, PICK_POOL);
    const sum = (list: FinderPick[]) => list.reduce((t, p) => t + (p.value ?? 0), 0);
    const myPicks = priced(market.myPicks);
    const myPackages: FinderPick[][] = [
        ...myPicks.map(p => [p]),
        ...myPicks.flatMap((a, i) => myPicks.slice(i + 1).map(b => [a, b])),
    ];

    const offers: Offer[] = [];
    for (const them of others) {
        if (them.roster.length === 0) continue;
        const theirBase = lineup(them.roster);
        const theirPicks = priced(market.picksByTeam.get(them.key) ?? []);
        const theirPackages: FinderPick[][] = [
            ...theirPicks.map(p => [p]),
            ...theirPicks.flatMap((a, i) => theirPicks.slice(i + 1).map(b => [a, b])),
        ];

        /**
         * One offer, where `players` move one way and `picks` the other.
         * `buying` says which way round that is.
         */
        const consider = (
            player: TradeRosterPlayer, picks: FinderPick[], buying: boolean,
        ) => {
            /**
             * The spare body that keeps the roster counts legal.
             *
             * A trade of picks for a player moves one body one way and none
             * the other, so the side receiving him ends a man over the limit
             * — and every roster in a real league is already full. Without
             * this the whole search returns nothing, for a reason that has
             * nothing to do with whether the trades are any good.
             *
             * What a manager actually does is put their last bench player in
             * the deal, so that is what is offered: the one whose loss costs
             * the lineup least, which is usually nothing at all. He is not a
             * sweetener, he is the roster spot — and his market value counts
             * towards what the other side is being paid, because they are
             * receiving him.
             */
            const spareOf = (roster: TradeRosterPlayer[]) => {
                if (rosterSize == null || roster.length < rosterSize) return null;
                let worst: TradeRosterPlayer | null = null;
                for (const p of roster) {
                    if (p.id === player.id) continue;
                    if (!worst || meanOf(p.id) < meanOf(worst.id)) worst = p;
                }
                return worst;
            };
            // The buyer receives a body, so the buyer needs the spot.
            const spare = buying ? spareOf(mine) : spareOf(them.roster);
            if (rosterSize != null && !spare
                && (buying ? mine.length : them.roster.length) >= rosterSize) {
                return;
            }

            const drop = (r: TradeRosterPlayer[], p: TradeRosterPlayer | null) =>
                p ? r.filter(x => x.id !== p.id) : r;
            const mineAfter = buying
                ? [...drop(mine, spare), player]
                : drop(mine.filter(p => p.id !== player.id), null);
            const theirsAfter = buying
                ? drop(them.roster.filter(p => p.id !== player.id), null)
                    .concat(spare ? [spare] : [])
                : [...drop(them.roster, spare), player];
            if (rosterSize != null
                && (mineAfter.length > rosterSize || theirsAfter.length > rosterSize)) {
                return;
            }

            const myGain = lineup(mineAfter) - myBase;
            const theirGain = lineup(theirsAfter) - theirBase;
            const spareWorth = spare ? market.valueOfPlayer(spare.id) ?? 0 : 0;
            const cost = sum(picks) + (buying ? spareWorth : 0);
            const worth = (market.valueOfPlayer(player.id) ?? 0)
                + (buying ? 0 : spareWorth);
            // Both halves have to be priced or the comparison is a number
            // against a blank, which is how a kicker ends up looking like a
            // free first-round pick.
            if (market.valueOfPlayer(player.id) == null) return;
            if (worth <= 0 || cost <= 0) return;

            // The side receiving the player gains lineup; the side receiving
            // the picks gains market. Each has to actually gain.
            const buyerGain = buying ? myGain : theirGain;
            if (buyerGain < MIN_GAIN) return;
            // The seller has to be paid over the odds, or there is no reason
            // for them to give up a player who is helping them this season.
            //
            // This single rule is also the whole lowball guard. An earlier
            // version had a second check rejecting offers a quarter or more
            // under the market — which can never fire, because requiring the
            // price to exceed the player's value already puts every surviving
            // offer on the generous side of even. A guard that cannot trigger
            // reads like a protection and provides none, so it is gone rather
            // than kept for the comfort of seeing it.
            const sellerMarketGain = cost - worth;
            if (sellerMarketGain <= 0) return;

            const myMarketGain = buying ? worth - cost : cost - worth;
            offers.push({
                teamKey: them.key, teamName: them.name,
                give: buying
                    ? (spare ? [spare.id] : [])
                    : [player.id],
                get: buying
                    ? [player.id]
                    : (spare ? [spare.id] : []),
                givePicks: buying ? picks.map(p => p.id) : [],
                getPicks: buying ? [] : picks.map(p => p.id),
                myGain: Math.round(myGain * 10) / 10,
                theirGain: Math.round(theirGain * 10) / 10,
                myMarketGain: Math.round(myMarketGain),
                theirMarketGain: Math.round(-myMarketGain),
                // Points a week per thousand spent, for the buyer. The
                // seller reads it the other way: market gained per point
                // of lineup given up.
                efficiency: buying
                    ? Math.round((myGain / cost) * 1000 * 100) / 100
                    : Math.round((myMarketGain / Math.max(0.1, -myGain)) * 100) / 100,
                balance: Math.round(buyerGain * 10) / 10,
                // Bodies, not assets: the tag exists to warn that a roster
                // is about to grow or shrink, and an offer carrying the
                // throw-in that keeps the counts level is not one of those.
                // Set unconditionally it printed "1 for 1" under a heading
                // that means "these do not match".
                unevenCount: (buying ? (spare ? 1 : 0) : 1)
                    !== (buying ? 1 : (spare ? 1 : 0)),
            });
        };

        if (stance === 'buy') {
            for (const b of them.roster) {
                for (const pkg of myPackages) consider(b, pkg, true);
            }
        } else {
            for (const a of mine) {
                for (const pkg of theirPackages) consider(a, pkg, false);
            }
        }
    }

    // Ranked on efficiency rather than raw gain: the question a buyer has is
    // not "what is the biggest upgrade" but "what does this cost me", and two
    // offers that add the same points are not the same offer when one costs
    // twice as much.
    offers.sort((a, b) => b.efficiency - a.efficiency || b.balance - a.balance);

    /**
     * One route per player, and it is the cheapest one.
     *
     * Every combination of picks that can buy a man is an offer, so without
     * this the list is the same player eight times over at eight prices —
     * which is one suggestion wearing eight rows, while the other ten
     * rosters in the league go unmentioned. Nobody wants seven worse ways to
     * buy the back they have already decided to buy; they want to know who
     * else is available.
     *
     * Sorted first, so the survivor is the best-priced route rather than
     * whichever combination the sweep happened to reach first.
     */
    const bestFor = new Set<string>();
    const unique = offers.filter(o => {
        const target = stance === 'buy' ? o.get[0] : o.give[0];
        const k = `${o.teamKey}|${target}`;
        if (bestFor.has(k)) return false;
        bestFor.add(k);
        return true;
    });
    return unique.slice(0, limit);
}

/**
 * Why an offer exists, in the terms a message to the other manager would use.
 *
 * A suggestion a reader cannot explain is a suggestion they will not send.
 * "You are deepest at running back and thinnest at tight end; they are the
 * other way round" is the sentence that gets a reply, and it is derivable
 * from the same positional strengths the roster shapes are drawn from.
 */
export function offerReason(
    offer: Offer,
    myRank: Record<string, number>,
    theirRank: Record<string, number>,
    positionOf: (id: number) => string,
    of: number,
): string | null {
    /**
     * The position each side is actually dealing, where there is one.
     *
     * This used to read the first player each way, which was representative
     * while an offer was one-for-one or two-for-one. A two-for-two names four
     * players, and the first of each pair is whichever the sweep happened to
     * reach — so "you are thin at receiver" could describe a quarter of the
     * trade while the other three players went unmentioned.
     *
     * The canonical two-for-two is homogeneous — two backs for two receivers
     * — and that one is named exactly as before. A mixed package has no
     * single position to name, so it says nothing, on the same principle as
     * the guard below: a sentence that describes part of a trade as though it
     * were the whole is worse than no sentence.
     */
    const only = (ids: number[]) => {
        const seen = new Set(ids.map(positionOf).filter(Boolean));
        return seen.size === 1 ? [...seen][0] : null;
    };
    const from = only(offer.give);
    const to = only(offer.get);
    if (!from || !to || from === to) return null;
    const mineFrom = myRank[from];
    const mineTo = myRank[to];
    const theirsFrom = theirRank[from];
    const theirsTo = theirRank[to];
    if (!mineFrom || !mineTo || !theirsFrom || !theirsTo) return null;
    // Only worth saying when the two rosters genuinely lean opposite ways.
    if (!(mineFrom < mineTo && theirsTo < theirsFrom)) return null;
    return `You are ${mineFrom} of ${of} at ${from} and ${mineTo} at ${to}; `
        + `they are ${theirsTo} at ${to} and ${theirsFrom} at ${from}.`;
}
