/**
 * "Will he still be there at my next pick?"
 *
 * The question a draft actually turns on: you want Brandon Aubrey, but you
 * also want a starter this round. If he is 80% to come back to you, take the
 * starter. If he is 15%, he is gone.
 *
 * ── What the number means ───────────────────────────────────────────────────
 * The chance a player is still on the board when your next turn arrives,
 * given he is on the board right now. It conditions on the live draft: as
 * picks go by without him, the estimate updates.
 *
 * ── The model ───────────────────────────────────────────────────────────────
 * Rank him against the players still on the board, then ask whether the
 * draft gets that far before your turn comes round.
 *
 *     P(still there) = 1 - Φ((N - r) / σ)
 *
 * where r is his position among the available players on the board this room
 * drafts off, and N is how many picks happen between now and your next turn.
 * If eight picks separate you from your turn, the man ranked third is in
 * trouble and the man ranked fortieth is not.
 *
 * An earlier version modelled this as a normal around his ADP conditioned on
 * him lasting this long. That reads well but breaks in practice: every player
 * still on the board is by definition one the draft has passed over, so the
 * conditioning term collapses and almost everyone pins to 99%. Ranking
 * against the live pool has no such failure — a stud who slid is simply the
 * best available and correctly reads as about to go, while a deep bench arm
 * is far down the list and correctly reads as safe.
 *
 * ── Where μ and σ come from ─────────────────────────────────────────────────
 * μ is a weighted average of the PPR **ADP** sources that ranked him. Every
 * redraft source in this app is full-PPR, so there is no format mixing, but
 * ADP and editorial ranks answer different questions: ADP is where a player
 * *is* taken, an expert rank is where he *should* be. Only the first predicts
 * availability. Aubrey is the case in point — the ADP sources have him
 * 93/135/167 while the blended consensus rank says 184, because the editorial
 * boards bury kickers. He goes around pick 130, not 184. Players no ADP
 * source reached fall back to the consensus average, flagged as coarser.
 *
 * The weights are not fixed, because the room decides them. People draft off
 * the board in front of them: in a Sleeper draft Sleeper's own ADP is what
 * everyone is looking at, so it carries most of the weight and the others
 * only temper it. In the in-app mock the opponents literally draft off the
 * sources you assigned them, so the weighting is built from exactly those
 * sources, in the proportion the teams picking before your turn use them.
 * Aubrey again: blended evenly he reads pick ~132, but weighted for a Sleeper
 * room — where his ADP is 93 — he reads ~113, twenty picks earlier, which is
 * when he will actually go there.
 *
 * σ blends two kinds of uncertainty: how much the sources disagree about him,
 * and how much any pick drifts in a real draft. The second grows with ADP —
 * the 1.1 goes first overall every time, the ADP-130 kicker can go twenty
 * picks either side — which the linear term below approximates.
 */

import { RedraftPlayer } from '@/lib/types';

/**
 * Baseline spread of a real draft slot around its ADP, in picks.
 *
 * Fitted to how drafts actually behave: about ±2.5 picks at ADP 5, ±10 at
 * ADP 50, ±22 at ADP 130. A player's own cross-source disagreement is used
 * instead whenever it is larger, which is what makes a genuinely contested
 * player read as the coin-flip he is.
 */
function marketSigma(mu: number): number {
    return 1.5 + 0.15 * mu;
}

/** Rank fields that can stand in for "where the room takes him". */
export type RankField =
    | 'sleeper_rank' | 'underdog_rank' | 'ffpc_rank' | 'yahoo_rank'
    | 'fp_rank' | 'espn_rank' | 'cbs_rank' | 'ktc_rank' | 'fc_rank'
    | 'flock_rank' | 'my_rank';

/** Relative weights per source; they are normalised, so any scale works. */
export type SourceWeights = Partial<Record<RankField, number>>;

/** The market ADP boards, used when the room's own board is unknown. */
const DEFAULT_ADP_FIELDS: RankField[] = [
    'sleeper_rank', 'underdog_rank', 'ffpc_rank', 'yahoo_rank',
];

/**
 * How much of the estimate the platform's own board should carry when we know
 * the draft is happening on it.
 *
 * Not all of it: a Sleeper room drafts off Sleeper ADP, but people still
 * reach and still fall, and the other boards are evidence about that. Two
 * thirds keeps the platform decisive without pretending the room is a robot.
 */
export const PLATFORM_WEIGHT = 0.65;

/** Weights for a draft happening on one platform whose board we carry. */
export function platformWeights(field: RankField): SourceWeights {
    const rest = DEFAULT_ADP_FIELDS.filter(f => f !== field);
    const share = (1 - PLATFORM_WEIGHT) / Math.max(rest.length, 1);
    const w: SourceWeights = { [field]: PLATFORM_WEIGHT };
    rest.forEach(f => { w[f] = share; });
    return w;
}

export interface AdpEstimate {
    /** Expected pick number. */
    mu: number;
    /** Spread of that pick number, in picks. */
    sigma: number;
    /** How many ADP sources contributed; 0 means the consensus fallback. */
    sources: number;
}

/**
 * Market ADP for a player, or null when nothing ranked him at all.
 *
 * These are each source's dense 1..N ordering, so they are already in
 * pick-number units and comparable to one another.
 */
export function adpFor(p: RedraftPlayer, weights?: SourceWeights): AdpEstimate | null {
    const fields = weights
        ? (Object.keys(weights) as RankField[])
        : DEFAULT_ADP_FIELDS;

    const seen: { v: number; w: number }[] = [];
    for (const f of fields) {
        const v = p[f] as number | null | undefined;
        const w = weights ? (weights[f] ?? 0) : 1;
        if (typeof v === 'number' && v > 0 && w > 0) seen.push({ v, w });
    }

    if (seen.length > 0) {
        const totalW = seen.reduce((s, x) => s + x.w, 0);
        const mu = seen.reduce((s, x) => s + x.v * x.w, 0) / totalW;

        // Weighted spread around that mean. When one board dominates, the
        // others disagreeing with it matters proportionally less — which is
        // the point: we are estimating this room, not the market at large.
        const variance = seen.length > 1
            ? seen.reduce((s, x) => s + x.w * (x.v - mu) ** 2, 0) / totalW
            : 0;
        const spread = Math.sqrt(variance);
        return { mu, sigma: Math.max(marketSigma(mu), spread), sources: seen.length };
    }

    // No ADP source reached him. The consensus average still says roughly
    // where the market has him, just with more noise.
    const fallback = p.avg_rank ?? p.rank_overall;
    if (fallback == null || fallback <= 0) return null;
    return {
        mu: fallback,
        sigma: Math.max(marketSigma(fallback), p.std_deviation ?? 0),
        sources: 0,
    };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, via erf). */
function normalCdf(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
        + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - p : p;
}

/**
 * How fuzzy the draft's frontier is, in rank positions.
 *
 * After N picks the players taken are not exactly the top N available —
 * people reach and people slide — and that fuzziness grows the deeper you
 * go, because agreement thins out. A player his sources genuinely disagree
 * about is fuzzier still, so his own spread widens it further.
 */
function frontierSigma(rank: number, adpSigma: number): number {
    return Math.max(3, 0.28 * rank, 0.6 * adpSigma);
}

/**
 * Chance a player ranked `rank` among the available pool survives the next
 * `picksBetween` picks. Clamped either side — a draft is never a certainty.
 */
export function survivalOdds(
    rank: number, picksBetween: number, adpSigma: number,
): number {
    if (picksBetween <= 0) return 0.995;
    const z = (picksBetween - rank) / frontierSigma(rank, adpSigma);
    return Math.min(0.995, Math.max(0.005, 1 - normalCdf(z)));
}

// ── Draft position maths ─────────────────────────────────────────────────────

export interface DraftShape {
    teams: number;
    /** 1-based slot you are drafting from. */
    slot: number;
    snake: boolean;
}

/** Overall pick number of a slot's turn in a given round. */
export function pickForSlot(round: number, { teams, slot, snake }: DraftShape): number {
    const inRound = !snake || round % 2 === 1 ? slot : teams + 1 - slot;
    return (round - 1) * teams + inRound;
}

/**
 * Your next turn strictly after `picksMade` picks have happened.
 *
 * Returns null past the end of `maxRounds`, where there is no next pick to
 * ask about.
 */
export function nextPickAfter(
    picksMade: number, shape: DraftShape, maxRounds = 30,
): number | null {
    for (let round = 1; round <= maxRounds; round++) {
        const pick = pickForSlot(round, shape);
        if (pick > picksMade) return pick;
    }
    return null;
}

/** The turn after that — "two rounds out" is a question people ask too. */
export function pickAfterNext(
    picksMade: number, shape: DraftShape, maxRounds = 30,
): number | null {
    const next = nextPickAfter(picksMade, shape, maxRounds);
    return next == null ? null : nextPickAfter(next, shape, maxRounds);
}

// ── The shape the UI consumes ────────────────────────────────────────────────

/**
 * Weights built from the boards the opponents between here and your next turn
 * are actually drafting off.
 *
 * In the in-app mock this is exact rather than an assumption: each AI team is
 * assigned a source and picks from it, so counting the sources of the teams on
 * the clock before your turn gives the true mix. A team set to Consensus or to
 * your own tiers contributes nothing here — neither is a board this model can
 * read a pick number off — and if that leaves nothing, the caller falls back
 * to the market average.
 */
export function weightsFromRoom(sourcesOnClock: string[]): SourceWeights | undefined {
    const w: SourceWeights = {};
    let any = false;
    for (const src of sourcesOnClock) {
        if (!src || src === 'consensus' || src === 'mine') continue;
        const f = src as RankField;
        w[f] = (w[f] ?? 0) + 1;
        any = true;
    }
    return any ? w : undefined;
}

export interface DraftOddsContext {
    shape: DraftShape;
    picksMade: number;
    /**
     * The turn the question is about: the next time you pick *after* the one
     * you are on the clock for.
     *
     * "Does he come back to me" only makes sense once you have used your
     * current pick on somebody else. Taking the next turn at or including the
     * pick you are making right now leaves no picks in between, which is what
     * made every player read 99% while you were on the clock.
     */
    nextPick: number | null;
    /** The turn after that. */
    followingPick: number | null;
    /** True when it is your pick right now. */
    onClock: boolean;
    /** The board this room is drafting off; undefined means market average. */
    weights?: SourceWeights;
    /** Short label for the weighting, shown in tooltips. */
    weightLabel?: string;
}

export function buildOddsContext(
    shape: DraftShape, picksMade: number, maxRounds = 30,
    weights?: SourceWeights, weightLabel?: string,
): DraftOddsContext {
    const immediate = nextPickAfter(picksMade, shape, maxRounds);
    const onClock = immediate === picksMade + 1;
    // On the clock, your "next" pick is the one after this one.
    const nextPick = onClock && immediate != null
        ? nextPickAfter(immediate, shape, maxRounds)
        : immediate;
    return {
        shape,
        picksMade,
        nextPick,
        followingPick: nextPick == null
            ? null
            : nextPickAfter(nextPick, shape, maxRounds),
        onClock,
        weights,
        weightLabel,
    };
}

export interface PlayerOdds {
    /** 0..1 chance he lasts to your next turn. */
    next: number;
    /** 0..1 chance he lasts to the turn after that. */
    following: number | null;
    /** His position among the players still on the board. */
    rank: number;
    /** How many picks stand between now and your next turn. */
    picksBetween: number;
    /** False when this rests on the consensus fallback rather than real ADP. */
    fromAdp: boolean;
    /** The board the estimate leans on, when the caller named one. */
    board?: string;
}

/**
 * Odds for every available player, ranked against each other.
 *
 * Has to be computed for the pool as a whole rather than per player, because
 * the number depends on where a man sits in the queue of players still on the
 * board — which is exactly what makes it respond to the draft as it happens.
 */
export function buildOddsBoard(
    players: RedraftPlayer[],
    isTaken: (p: RedraftPlayer) => boolean,
    ctx: DraftOddsContext,
): Map<string, PlayerOdds> {
    const out = new Map<string, PlayerOdds>();
    if (ctx.nextPick == null) return out;

    const pool: { p: RedraftPlayer; mu: number; sigma: number; fromAdp: boolean }[] = [];
    for (const p of players) {
        if (isTaken(p)) continue;
        const adp = adpFor(p, ctx.weights);
        if (!adp) continue;
        pool.push({ p, mu: adp.mu, sigma: adp.sigma, fromAdp: adp.sources > 0 });
    }
    pool.sort((a, b) => a.mu - b.mu);

    // Picks that happen before your turn: everything from the next one up to
    // the one before yours.
    const between = Math.max(0, ctx.nextPick - ctx.picksMade - 1);
    const betweenFollowing = ctx.followingPick == null
        ? null
        : Math.max(0, ctx.followingPick - ctx.picksMade - 1);

    pool.forEach((entry, i) => {
        const rank = i + 1;
        out.set(entry.p.slug, {
            next: survivalOdds(rank, between, entry.sigma),
            following: betweenFollowing == null
                ? null
                : survivalOdds(rank, betweenFollowing, entry.sigma),
            rank,
            picksBetween: between,
            fromAdp: entry.fromAdp,
            board: ctx.weightLabel,
        });
    });
    return out;
}

/** Colour band for a probability, shared by every surface that shows one. */
export function oddsTone(pct: number): string {
    if (pct >= 0.75) return 'text-emerald-400';
    if (pct >= 0.45) return 'text-sky-400';
    if (pct >= 0.20) return 'text-amber-400';
    return 'text-rose-400';
}

/** 1st, 2nd, 3rd, 4th … for the "he is Nth on the board" phrasing. */
export function ordinal(n: number): string {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export function formatOdds(pct: number): string {
    const n = pct * 100;
    if (n >= 99) return '99+%';
    if (n < 1) return '<1%';
    return `${Math.round(n)}%`;
}
