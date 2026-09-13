/**
 * What each of your starters is actually worth to you.
 *
 * A projection says a player is worth fifteen points. That is not what he is
 * worth to your team, because if he disappears you do not field eight men —
 * somebody comes off the bench. What he is worth is the gap between him and
 * whoever replaces him, and that number is a fact about your roster rather
 * than about him.
 *
 * The two come apart hard. A fifteen-point back with a fourteen-point back
 * behind him costs you almost nothing; a ten-point tight end with nobody
 * behind him costs you ten. So the player you cannot afford to lose is
 * frequently not the best player you own, and the position you should be
 * trading for is frequently not the one that looks weakest on a projection.
 *
 * Every starter is removed in turn, the lineup refilled from the bench, and
 * the resulting win rate measured against the same eleven opponents on the
 * same simulated weeks. Shared draws, as everywhere else here: the
 * differences between the variants are the only thing displayed, so they
 * must not each carry their own lot of Monte Carlo noise.
 */
import { drawLineup, makeRng, SimPlayer } from '@/lib/startSit';
import { bestLineup, TradeRosterPlayer } from '@/lib/trade';

/**
 * Each lineup's win rate against a fixed field, off one set of draws.
 *
 * Every variant and every opponent is drawn once per trial and all the
 * pairings settled on that week, which is the same trick `powerRank` uses on
 * a league — here it matters more, because ten variants of one lineup differ
 * by a single player and two independent runs would bury that difference
 * under their own randomness.
 */
export function fieldRates(
    variants: SimPlayer[][],
    opponents: SimPlayer[][],
    trials = 20000,
    seed = 23,
): number[] {
    if (variants.length === 0 || opponents.length === 0) return variants.map(() => 0);
    const rng = makeRng(seed);
    const wins = new Float64Array(variants.length);
    const oppDraw = new Float64Array(opponents.length);
    for (let t = 0; t < trials; t++) {
        for (let j = 0; j < opponents.length; j++) oppDraw[j] = drawLineup(opponents[j], rng);
        for (let i = 0; i < variants.length; i++) {
            const mine = drawLineup(variants[i], rng);
            for (let j = 0; j < opponents.length; j++) {
                if (mine > oppDraw[j]) wins[i]++;
                else if (mine === oppDraw[j]) wins[i] += 0.5;
            }
        }
    }
    const games = trials * opponents.length;
    return Array.from(wins, w => w / games);
}

export interface DepthRow {
    playerId: number;
    name: string;
    position: string;
    /** The slot he currently fills. */
    slot: string;
    /**
     * His own expected points this week — the projection.
     *
     * Carried beside the cost so a reader can see the two disagree, which is
     * the only claim this page makes.
     */
    points: number;
    /** Win rate against the field with him, and with him gone. */
    withHim: number;
    without: number;
    /** How much of your season he is holding up, in rate points. */
    cost: number;
    /** Expected lineup score either way. */
    pointsWith: number;
    pointsWithout: number;
    /**
     * Who comes into the lineup that was not in it before.
     *
     * Not always the man who takes the vacated slot: losing a running back
     * usually promotes whoever was in the flex and the bench fills the flex,
     * so the newcomer is a receiver. That cascade is what a manager actually
     * does, and pretending the slot is filled in place reports "replaced by
     * nobody" on a roster with two backs spare.
     */
    replacement: number | null;
    replacementName: string | null;
    /**
     * The slot the newcomer walks into, which is often not the vacated one.
     *
     * Saying "covered by DJ Moore" under a running back reads as a mistake
     * even when the arithmetic is right: what happened is that the flex back
     * moved up and a receiver took the flex. Naming the slot he enters is
     * the difference between a number a reader trusts and one they don't.
     */
    replacementSlot: string | null;
    /** True when the lineup ends a man short — nobody left who can play. */
    uncovered: boolean;
}

export interface DepthReport {
    /** Win rate against the field with the best lineup this roster can field. */
    base: number;
    basePoints: number;
    /** That lineup, slot by slot. */
    lineup: (number | null)[];
    rows: DepthRow[];
}

/**
 * Rank a roster by what it cannot afford to lose.
 *
 * Both sides are the best lineup the roster can field — with the player, and
 * without him. Filling only the slot he vacated looks more careful and is
 * wrong: the replacement for a running back is usually whoever was in the
 * flex, with the bench filling the flex behind him, and a rule that forbids
 * that cascade reports "nobody" on a roster holding two spare backs.
 *
 * Using the optimal lineup on both sides also keeps the answer about depth.
 * Measuring against a lineup the owner has set badly would fold "you have
 * this wrong" into every row, which is a different page's job.
 */
export function replacementCost(
    roster: TradeRosterPlayer[],
    slots: string[],
    opponents: SimPlayer[][],
    simOf: (id: number) => SimPlayer | null,
    trials = 20000,
    seed = 23,
): DepthReport {
    const meanOf = (id: number) => simOf(id)?.outcome.mean ?? -Infinity;
    const byId = new Map(roster.map(p => [p.id, p]));
    const toSims = (ids: (number | null)[]) => ids
        .map(id => (id == null ? null : simOf(id)))
        .filter((s): s is SimPlayer => s != null);

    const lineup = bestLineup(slots, roster, meanOf);
    const before = new Set(lineup.filter((id): id is number => id != null));
    const starters = lineup
        .map((id, i) => ({ id, slot: slots[i] ?? 'FLEX', i }))
        .filter((s): s is { id: number; slot: string; i: number } => s.id != null);

    const refilled = starters.map(s => {
        const next = bestLineup(slots, roster.filter(p => p.id !== s.id), meanOf);
        const after = new Set(next.filter((id): id is number => id != null));
        // Whoever is in the lineup now and was not before. Normally one man;
        // never more, since exactly one place opened up.
        const newcomer = [...after].find(id => !before.has(id)) ?? null;
        const at = newcomer == null ? -1 : next.findIndex(id => id === newcomer);
        return { s, best: newcomer, slot: at < 0 ? null : slots[at] ?? 'FLEX', next };
    });

    const variants = [lineup, ...refilled.map(r => r.next)].map(toSims);
    const rates = fieldRates(variants, opponents, trials, seed);
    const meanOfLineup = (ids: (number | null)[]) => {
        let total = 0;
        for (const id of ids) if (id != null) total += simOf(id)?.outcome.mean ?? 0;
        return Math.round(total * 10) / 10;
    };

    const base = rates[0];
    const basePoints = meanOfLineup(lineup);
    const rows: DepthRow[] = refilled.map((r, k) => {
        const p = byId.get(r.s.id);
        return {
            playerId: r.s.id,
            name: p?.name ?? String(r.s.id),
            position: p?.position ?? '',
            slot: r.s.slot,
            points: Math.round((simOf(r.s.id)?.outcome.mean ?? 0) * 10) / 10,
            withHim: base,
            without: rates[k + 1],
            cost: base - rates[k + 1],
            pointsWith: basePoints,
            pointsWithout: meanOfLineup(r.next),
            replacement: r.best,
            replacementName: r.best == null ? null : byId.get(r.best)?.name ?? null,
            replacementSlot: r.slot,
            uncovered: r.best == null,
        };
    });
    rows.sort((a, b) => b.cost - a.cost);
    return { base, basePoints, lineup, rows };
}
