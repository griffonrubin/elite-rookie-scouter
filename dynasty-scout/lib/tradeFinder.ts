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

export interface Offer {
    teamKey: string;
    teamName: string;
    /** Player ids leaving your roster, and arriving on it. */
    give: number[];
    get: number[];
    /** Points a week each side's best lineup gains. */
    myGain: number;
    theirGain: number;
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
export function offerKey(o: Pick<Offer, 'teamKey' | 'give' | 'get'>): string {
    return `${o.teamKey}:${[...o.give].sort((a, b) => a - b).join('.')}`
        + `>${[...o.get].sort((a, b) => a - b).join('.')}`;
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

/** Offers below this are inside the rounding of a projection. */
const MIN_GAIN = 0.25;

export function findTrades(
    me: FinderInput,
    others: FinderTeam[],
    /** Roster spots the league allows, where the platform reports it. */
    rosterSize?: number,
    limit = 40,
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
    const pairsOf = (r: TradeRosterPlayer[]) => {
        const top = topOf(r);
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
            offers.push({
                teamKey: them.key, teamName: them.name,
                give: give.map(p => p.id), get: get.map(p => p.id),
                myGain: Math.round(myGain * 10) / 10,
                theirGain: Math.round(theirGain * 10) / 10,
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
    const out = offer.give.map(positionOf).filter(Boolean);
    const inn = offer.get.map(positionOf).filter(Boolean);
    const from = out[0];
    const to = inn[0];
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
