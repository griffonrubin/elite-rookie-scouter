/**
 * What a trade actually does to your season.
 *
 * Every trade analyser answers with value: two numbers off a ranking, a
 * winner and a loser. That answer is wrong in a way that matters, because a
 * roster is not a pile of value — it is a lineup with a fixed shape. A third
 * receiver in a league that starts two is worth what your second receiver's
 * injury risk is worth, and no ranking knows that. The number a trade should
 * be judged on is the one you actually care about: how often you win.
 *
 * So both rosters are re-filled from their own best available players, the
 * whole league plays its round robin again, and the answer is the change in
 * win rate. That has two properties a value ranking cannot:
 *
 * It prices the shape. A trade that turns your WR4 into a starting tight end
 * moves the number; a trade that turns your WR4 into a better WR4 does not,
 * and it should not.
 *
 * And it prices the whole league. A trade between two other teams changes
 * where you stand, which is a thing you can do nothing about and ought to
 * know about anyway.
 */
import { SimPlayer } from '@/lib/startSit';
import { eligibleForSlot } from '@/lib/lineup';
import { playoffOdds, powerRank, PowerRow, PowerTeam } from '@/lib/power';

export interface TradeRosterPlayer {
    id: number;
    name: string;
    position: string;
    /** False for injured reserve and taxi, who cannot be started. */
    startable: boolean;
}

export interface TradeTeam {
    key: string;
    name: string;
    /** Everybody on the roster, starters and bench alike. */
    roster: TradeRosterPlayer[];
    record?: PowerTeam['record'];
}

/**
 * The lineup a roster would field, slot by slot.
 *
 * Restrictive slots are filled first — a quarterback slot from the
 * quarterbacks, a kicker from the kickers — and the flexes take whoever is
 * left. Filling in template order instead lets a FLEX listed before the last
 * receiver slot take the receiver that slot then has nobody for, which
 * reports an empty slot on a roster that could field a full lineup.
 *
 * Within a slot the pick is by expected points rather than by simulating
 * every combination. Ordering candidates for one slot is what `rankSlots`
 * does properly, at the cost of a simulation per candidate; here the whole
 * lineup is being rebuilt twice per trade for twelve teams, and the player
 * with the higher mean is the right pick often enough that paying six
 * thousand trials per slot to confirm it would buy nothing a reader sees.
 */
export function bestLineup(
    slots: string[],
    roster: TradeRosterPlayer[],
    meanOf: (id: number) => number,
): (number | null)[] {
    const pool = roster.filter(p => p.startable);
    const order = slots
        .map((slot, i) => ({
            slot, i,
            eligible: pool.filter(p => eligibleForSlot(slot, p.position)).length,
        }))
        .sort((a, b) => a.eligible - b.eligible || a.i - b.i);

    const taken = new Set<number>();
    const filled: (number | null)[] = slots.map(() => null);
    for (const { slot, i } of order) {
        let best: number | null = null;
        let bestMean = -Infinity;
        for (const p of pool) {
            if (taken.has(p.id) || !eligibleForSlot(slot, p.position)) continue;
            const m = meanOf(p.id);
            if (m > bestMean) { bestMean = m; best = p.id; }
        }
        if (best != null) { taken.add(best); filled[i] = best; }
    }
    return filled;
}

/**
 * What losing each player would actually cost this roster, a point a week.
 *
 * The number beside a name on the roster list is what he scores, and that is
 * not the question being asked of it. Nobody trades a player away into a
 * vacuum: the slot he leaves gets filled by whoever is next, so what you give
 * up is the gap between them, not the man. A twelve-point receiver behind
 * another twelve-point receiver costs nothing to lose, and the fourth back on
 * a roster that starts two has been free all along — those are precisely the
 * players worth offering, and a list sorted by points buries them at the
 * bottom looking like the least you have.
 *
 * Computed by rebuilding the best lineup without him and taking the
 * difference, so it prices the whole shape rather than one slot: losing a
 * flex-eligible back can pull a receiver out of the flex and a tight end in
 * behind him, and only a rebuild sees that.
 *
 * Cheap enough to do for everybody — a rebuild is a pass over the roster per
 * slot, and a fifteen-man roster in a nine-slot league is a few thousand
 * comparisons with no simulation anywhere in it.
 */
export function replacementCost(
    slots: string[],
    roster: TradeRosterPlayer[],
    meanOf: (id: number) => number,
): Map<number, number> {
    // An unpriced player scores nothing rather than minus infinity here: he
    // is already reported separately, and letting him poison the arithmetic
    // would put a nonsense number against every other name on the roster.
    const val = (id: number | null) => {
        if (id == null) return 0;
        const m = meanOf(id);
        return Number.isFinite(m) ? m : 0;
    };
    const total = (ids: (number | null)[]) =>
        ids.reduce((sum: number, id) => sum + val(id), 0);

    const base = total(bestLineup(slots, roster, meanOf));
    const out = new Map<number, number>();
    for (const p of roster) {
        const without = roster.filter(q => q.id !== p.id);
        out.set(p.id, Math.max(0, base - total(bestLineup(slots, without, meanOf))));
    }
    return out;
}

/** One direction of a trade: who leaves this team. */
export interface TradeSide {
    teamKey: string;
    /** Player ids going the other way. */
    give: number[];
}

export interface TradeEffect {
    key: string;
    name: string;
    /** Win rate against the field before and after, 0..1. */
    before: number;
    after: number;
    /** after − before, in rate points of a share. */
    delta: number;
    rankBefore: number;
    rankAfter: number;
    /** True for the two teams doing the trade. */
    trading: boolean;
    /** Expected lineup score before and after. */
    pointsBefore: number;
    pointsAfter: number;
    /**
     * The share of seasons this team is still playing in January, before
     * and after — null unless the caller asked for the season to be played
     * out.
     *
     * This is the number the win rate is standing in for. A rate says a
     * roster got better; it does not say whether that matters, and whether
     * it matters is the whole question: the same two points of win rate is
     * the difference between missing and making the playoffs for a team on
     * the cut line and nothing at all for a team already in or already out.
     * An owner is not trying to have a good roster, they are trying to
     * still be playing.
     */
    oddsBefore: number | null;
    oddsAfter: number | null;
    oddsDelta: number | null;
}

/** What a team's lineup does, for the two teams in the trade. */
export interface LineupChange {
    key: string;
    name: string;
    slots: string[];
    before: (number | null)[];
    after: (number | null)[];
    /** Players arriving who go straight into the lineup. */
    startsNow: number[];
    /** Players leaving who were in the lineup. */
    wasStarting: number[];
    /** Players already here who lose their slot to an arrival. */
    displaced: number[];
}

export interface TradeResult {
    effects: TradeEffect[];
    changes: LineupChange[];
    /** Ids that could not be priced, so the answer would have been a guess. */
    unpriced: number[];
}

/**
 * How big a win-rate change has to be before it means anything.
 *
 * Smaller than POWER_NOISE, and deliberately: before and after are simulated
 * from one seed, so every team's draws are identical across the pair and
 * only the two rebuilt lineups differ. A paired comparison of this kind
 * carries far less noise than two absolute rates do. Measured the way
 * POWER_NOISE was: the same trade re-run from eight seeds moves a trader's
 * delta by under a third of a rate point, against the 1.5 points an
 * absolute rate moves by. That is the whole reason a trade is evaluated as a
 * re-run of one league rather than as two separate rankings — and why a
 * verdict here can be four times finer than a place in the power table.
 */
export const TRADE_NOISE = 0.004;

/**
 * How far playoff odds have to move before the move is the trade's doing.
 *
 * A percentage point, measured the way the others here were: the same
 * trade re-run from eight seeds in a twelve-team league with seven weeks
 * left. A swap that barely changes a lineup moves the odds by 0.26 points
 * across those seeds on the league's own fixtures and 0.45 on a random
 * schedule, so a floor of one point sits clear of both.
 *
 * It is a coarser number than TRADE_NOISE for a reason worth stating on
 * the page. Odds are a step function of wins — a team on the cut line
 * converts a fraction of a win into ten points of playoff odds, and a team
 * already in or already out converts the same fraction into nothing — so
 * the same trade honestly reads as enormous for one owner and as nothing
 * for another. That is not noise, it is the answer.
 *
 * The seed-to-seed swing does grow with the size of the move: a
 * blockbuster worth fifty-four points of odds swung by 1.6 on real
 * fixtures and 3.0 on a random schedule. A flat floor is therefore
 * conservative where it matters — near zero, where a reader is deciding
 * whether anything happened at all.
 */
export const ODDS_NOISE = 0.01;

/**
 * Run the league before and after, and report what moved.
 *
 * `simOf` must return null for a player whose week could not be priced; the
 * caller is told which, because a trade evaluated with half a roster missing
 * would answer confidently about a lineup it never saw.
 */
export function evaluateTrade(
    teams: TradeTeam[],
    slots: string[],
    a: TradeSide,
    b: TradeSide,
    simOf: (id: number) => SimPlayer | null,
    trials = 20000,
    seed = 23,
    /**
     * Play the rest of the season out either side of the trade, so the
     * verdict can be given in the currency an owner actually holds.
     *
     * `pairs` is the league's own fixture list where the platform gave a
     * complete one, from `pairingTable`; without it the remaining weeks
     * are drawn at random, exactly as the Power page does, and the caller
     * says which on the page.
     */
    season?: {
        remaining: number;
        spots: number;
        pairs?: Int32Array | null;
    } | null,
): TradeResult {
    const give = new Map([[a.teamKey, new Set(a.give)], [b.teamKey, new Set(b.give)]]);
    const byKey = new Map(teams.map(t => [t.key, t]));
    const traded = [a, b].filter(s => byKey.has(s.teamKey));
    if (traded.length < 2 || a.teamKey === b.teamKey) {
        return { effects: [], changes: [], unpriced: [] };
    }

    const unpriced: number[] = [];
    const meanOf = (id: number) => {
        const s = simOf(id);
        if (!s) { if (!unpriced.includes(id)) unpriced.push(id); return -Infinity; }
        return s.outcome.mean;
    };

    // After the trade each side holds its own players minus what it gave,
    // plus what the other side gave.
    const rosterAfter = (t: TradeTeam): TradeRosterPlayer[] => {
        const gone = give.get(t.key);
        if (!gone) return t.roster;
        const other = t.key === a.teamKey ? b : a;
        const incoming = (byKey.get(other.teamKey)?.roster ?? [])
            .filter(p => other.give.includes(p.id))
            // Somebody on injured reserve is startable once he is not on
            // this team's injured reserve any more, so arrivals come across
            // as ordinary roster players.
            .map(p => ({ ...p, startable: true }));
        return [...t.roster.filter(p => !gone.has(p.id)), ...incoming];
    };

    const lineupsBefore = new Map<string, (number | null)[]>();
    const lineupsAfter = new Map<string, (number | null)[]>();
    for (const t of teams) {
        lineupsBefore.set(t.key, bestLineup(slots, t.roster, meanOf));
        lineupsAfter.set(t.key, give.has(t.key)
            ? bestLineup(slots, rosterAfter(t), meanOf)
            : lineupsBefore.get(t.key)!);
    }

    const powerTeams = (lineups: Map<string, (number | null)[]>): PowerTeam[] =>
        teams.map(t => {
            const ids = lineups.get(t.key)!;
            return {
                key: t.key, name: t.name, record: t.record,
                filled: ids.filter(id => id != null).length,
                slots: slots.length,
                lineup: ids.map(id => (id == null ? null : simOf(id)))
                    .filter((s): s is SimPlayer => s != null),
            };
        });

    // One seed across both runs, so an unchanged roster draws the identical
    // weeks either side of the trade and its delta is the trade's doing
    // rather than the simulation's.
    const before = powerRank(powerTeams(lineupsBefore), trials, seed);
    const after = powerRank(powerTeams(lineupsAfter), trials, seed);
    const rowOf = (rows: PowerRow[], key: string) => rows.find(r => r.key === key);

    /**
     * The same seed and the same fixtures on both sides, for the reason the
     * whole function works this way: the two runs then differ by the trade
     * and by nothing else, so a delta of half a point is a real half point
     * rather than the gap between two independent samples.
     */
    const oddsBefore = season && season.remaining > 0 && before.rows.length > 1
        ? playoffOdds(before.rows, season.remaining, season.spots,
            Math.max(2000, Math.round(trials / 2)), seed + 1, season.pairs ?? null)
        : null;
    const oddsAfter = season && season.remaining > 0 && after.rows.length > 1
        ? playoffOdds(after.rows, season.remaining, season.spots,
            Math.max(2000, Math.round(trials / 2)), seed + 1, season.pairs ?? null)
        : null;

    const effects: TradeEffect[] = [];
    for (const t of teams) {
        const x = rowOf(before.rows, t.key);
        const y = rowOf(after.rows, t.key);
        if (!x || !y) continue;
        const ob = oddsBefore?.get(t.key)?.odds ?? null;
        const oa = oddsAfter?.get(t.key)?.odds ?? null;
        effects.push({
            key: t.key, name: t.name,
            before: x.winRate, after: y.winRate,
            delta: y.winRate - x.winRate,
            rankBefore: x.rank, rankAfter: y.rank,
            trading: give.has(t.key),
            pointsBefore: x.expected, pointsAfter: y.expected,
            oddsBefore: ob, oddsAfter: oa,
            oddsDelta: ob != null && oa != null ? oa - ob : null,
        });
    }
    // Traders first, then by how far the trade moved them: the reader came
    // for two rows and stayed for the rest.
    effects.sort((p, q) => Number(q.trading) - Number(p.trading)
        || Math.abs(q.delta) - Math.abs(p.delta));

    const changes: LineupChange[] = traded.map(side => {
        const t = byKey.get(side.teamKey)!;
        const bef = lineupsBefore.get(t.key)!;
        const aft = lineupsAfter.get(t.key)!;
        const inBefore = new Set(bef.filter((id): id is number => id != null));
        const inAfter = new Set(aft.filter((id): id is number => id != null));
        const arriving = new Set((byKey.get(side.teamKey === a.teamKey ? b.teamKey : a.teamKey)
            ?.roster ?? []).filter(p => (side.teamKey === a.teamKey ? b : a).give.includes(p.id))
            .map(p => p.id));
        return {
            key: t.key, name: t.name, slots,
            before: bef, after: aft,
            startsNow: [...arriving].filter(id => inAfter.has(id)),
            wasStarting: side.give.filter(id => inBefore.has(id)),
            // Somebody who was starting, is still on the roster, and is now
            // on the bench: the real cost of an arrival, and the thing a
            // value ranking never shows.
            displaced: [...inBefore].filter(id =>
                !inAfter.has(id) && !side.give.includes(id)),
        };
    });

    return { effects, changes, unpriced };
}
