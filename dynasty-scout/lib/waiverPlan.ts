/**
 * Whether a free agent is worth a roster spot, and whose.
 *
 * A waiver list that ranks free agents against each other answers the wrong
 * question. You do not claim a player because he is the best one available;
 * you claim him because he is better than somebody you already have, and the
 * whole cost of finding out is one line of arithmetic nobody does in their
 * head. "Fourth-best available tight end" is a fact about other people's
 * rosters. "Plus one point seven, drop Chig Okonkwo" is a decision.
 *
 * So every candidate is priced the way the trade page prices a trade: field
 * the best lineup this roster can, add him, drop somebody, and field it
 * again. The difference is what the claim is worth. No simulation — the
 * lineup is deterministic given the projections, and a Monte Carlo here
 * would add noise to a subtraction.
 */
import { bestLineup, type TradeRosterPlayer } from '@/lib/trade';

export interface AddDrop {
    /** Points the best lineup gains, at the horizon the means are built on. */
    net: number;
    /** Who to drop for it, and null when nothing needs dropping. */
    dropId: number | null;
    dropName: string | null;
    /** True when the roster has an open spot, so nobody has to go. */
    freeSpot: boolean;
}

/**
 * What each candidate is worth to this roster, and who they replace.
 *
 * Every drop is tried rather than guessed at. The obvious shortcut — drop
 * whoever the depth page says costs least — is wrong often enough to matter:
 * the cheapest man to lose is frequently a backup at a position where the
 * newcomer cannot play, so dropping him adds the newcomer to the bench and
 * changes nothing.
 */
export function planClaims(
    roster: TradeRosterPlayer[],
    candidates: TradeRosterPlayer[],
    slots: string[],
    meanOf: (id: number) => number,
    /** Roster spots the league allows, when the platform reports it. */
    rosterSize?: number,
): Map<number, AddDrop> {
    const out = new Map<number, AddDrop>();
    if (roster.length === 0 || slots.length === 0) return out;
    const points = (ids: (number | null)[]) => {
        let total = 0;
        for (const id of ids) if (id != null) total += meanOf(id);
        return total;
    };
    const lineupOf = (r: TradeRosterPlayer[]) =>
        points(bestLineup(slots, r, id => meanOf(id)));
    const base = lineupOf(roster);
    const freeSpot = rosterSize != null && roster.length < rosterSize;

    for (const c of candidates) {
        // An open spot is the easy case and the page should say so rather
        // than inventing a drop: "claim him, nobody has to go" is a
        // different decision from "claim him instead of your third tight
        // end", and only one of them costs you anything.
        if (freeSpot) {
            const net = lineupOf([...roster, c]) - base;
            out.set(c.id, {
                net: Math.round(net * 10) / 10,
                dropId: null, dropName: null, freeSpot: true,
            });
            continue;
        }
        /**
         * Every drop tried, and ties broken on who you would rather keep.
         *
         * The ties are not rare, they are the normal case: dropping the
         * tight end the newcomer replaces and dropping a backup quarterback
         * who was never in the lineup produce exactly the same lineup, so a
         * plain maximum picks whichever the roster happened to list first.
         * Both are worth the same on Sunday and only one of them is the
         * right answer — you keep the body that might matter in November.
         *
         * So the lineup decides, and where the lineup cannot, the lower
         * projection goes. An epsilon rather than equality, because these
         * are sums of floats and two genuinely identical lineups do not
         * always come back identical.
         */
        const TIE = 1e-6;
        let best = -Infinity;
        let dropId: number | null = null;
        for (const d of roster) {
            const after = lineupOf([...roster.filter(p => p.id !== d.id), c]);
            if (after > best + TIE
                || (Math.abs(after - best) <= TIE && dropId != null
                    && meanOf(d.id) < meanOf(dropId))) {
                best = Math.max(best, after);
                dropId = d.id;
            }
        }
        const drop = roster.find(p => p.id === dropId) ?? null;
        out.set(c.id, {
            net: Math.round((best - base) * 10) / 10,
            dropId, dropName: drop?.name ?? null, freeSpot: false,
        });
    }
    return out;
}

export interface WirePosition {
    position: string;
    /** The weakest player you roster who could hold this slot. */
    mineId: number | null;
    mineName: string | null;
    minePoints: number | null;
    /** The best free agent at it. */
    theirsId: number | null;
    theirsName: string | null;
    theirsPoints: number | null;
    /** Positive when the wire beats your worst. */
    gap: number | null;
    /** How many free agents at this position would start for somebody. */
    startable: number | null;
    /** And how many there are at all. */
    available: number | null;
}

/**
 * Your roster against the wire, position by position.
 *
 * The question underneath every waiver page and the one none of them
 * answer: not "who is available" but "is anything available better than what
 * I already have". Compared against the *weakest* player you hold at the
 * position, because that is the one who would be dropped — comparing against
 * your best would tell you that Jahmyr Gibbs is better than the wire, which
 * you knew.
 */
export function rosterVsWire(
    roster: TradeRosterPlayer[],
    candidates: TradeRosterPlayer[],
    positions: string[],
    meanOf: (id: number) => number,
    /** How deep the wire is at each position, from the server's whole pool. */
    depth?: Record<string, { startable: number; count: number }>,
): WirePosition[] {
    return positions.map(position => {
        const mine = roster
            .filter(p => (p.position ?? '').toUpperCase() === position)
            .sort((a, b) => meanOf(a.id) - meanOf(b.id))[0] ?? null;
        const theirs = candidates
            .filter(p => (p.position ?? '').toUpperCase() === position)
            .sort((a, b) => meanOf(b.id) - meanOf(a.id))[0] ?? null;
        const mp = mine ? Math.round(meanOf(mine.id) * 10) / 10 : null;
        const tp = theirs ? Math.round(meanOf(theirs.id) * 10) / 10 : null;
        return {
            position,
            mineId: mine?.id ?? null, mineName: mine?.name ?? null, minePoints: mp,
            theirsId: theirs?.id ?? null, theirsName: theirs?.name ?? null,
            theirsPoints: tp,
            gap: mp != null && tp != null ? Math.round((tp - mp) * 10) / 10 : null,
            startable: depth?.[position]?.startable ?? null,
            available: depth?.[position]?.count ?? null,
        };
    });
}
