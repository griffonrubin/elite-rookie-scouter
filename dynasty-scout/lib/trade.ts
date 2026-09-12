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
import { powerRank, PowerRow, PowerTeam } from '@/lib/power';

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

    const effects: TradeEffect[] = [];
    for (const t of teams) {
        const x = rowOf(before.rows, t.key);
        const y = rowOf(after.rows, t.key);
        if (!x || !y) continue;
        effects.push({
            key: t.key, name: t.name,
            before: x.winRate, after: y.winRate,
            delta: y.winRate - x.winRate,
            rankBefore: x.rank, rankAfter: y.rank,
            trading: give.has(t.key),
            pointsBefore: x.expected, pointsAfter: y.expected,
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
