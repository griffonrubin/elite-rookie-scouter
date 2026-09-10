/**
 * What a week from a player looks like.
 *
 * Every start/sit tool answers "who scores more on average". That is the
 * wrong question twice over. It throws away the shape of the outcome — a
 * 12-point average is 12 every week or it is 4-4-28, and those are opposite
 * calls — and it optimises the wrong objective, because you are not trying
 * to score points, you are trying to win one matchup against one opponent.
 *
 * So this models a distribution rather than a number, and scores a decision
 * by how much it moves your win probability rather than your projected total.
 * The two come apart exactly when it matters: trailing a strong opponent you
 * want variance, protecting a lead you want floor, and a mean-maximising
 * tool tells you the same thing in both situations.
 *
 * The distribution is assembled from three sources, in the order they
 * deserve trust early in a season:
 *
 *   centre  this year's projection, pro-rated to a week. A season projection
 *           is the best available estimate of a player's level and it is
 *           what changes when a depth chart does.
 *   shape   last year's weekly logs — the variance and the skew, which are
 *           far more stable across seasons than the mean, and which no
 *           projection carries.
 *   tilt    this week's game environment: the implied team total and the
 *           spread, because a back on a seven-point favourite and the same
 *           back on a seven-point underdog do not play the same game.
 *
 * Current-season games fold into the centre as they accumulate, with weight
 * rising as the sample does. In week 2 one game tells you almost nothing and
 * is treated that way; by week 8 it outweighs the preseason projection.
 */

/** One completed game. */
export interface GameLog {
    season: number;
    week: number;
    points: number;
}

/** This week's game environment for a player's team. */
export interface GameContext {
    /** Points the market expects this team to score. */
    impliedTeamTotal?: number | null;
    /** Negative when this team is favoured, as a spread is quoted. */
    spread?: number | null;
    /** No game this week. */
    onBye?: boolean;
}

export interface PlayerInputs {
    playerId: number;
    position: string;
    /** Season projection in PPR points, from the projections table. */
    seasonProjection?: number | null;
    /** Games the projection is spread over. */
    projectedGames?: number;
    /** Weekly logs, most recent season first is not required — season is on each. */
    logs: GameLog[];
    context?: GameContext;
}

/** A player's week, as a distribution rather than a number. */
export interface Outcome {
    playerId: number;
    /** Expected points. */
    mean: number;
    /** Spread of the distribution, in points. */
    sd: number;
    /** 20th percentile — the bad-but-not-disastrous week. */
    floor: number;
    /** 80th percentile — the week that wins you a matchup. */
    ceiling: number;
    /** Games behind the shape estimate; low means the sd is mostly a prior. */
    sample: number;
    /** How much of the centre came from this season rather than projection. */
    formWeight: number;
    /** Why the centre moved off the projection, for the UI to explain itself. */
    contextAdjustment: number;
    onBye: boolean;
}

/** Typical week-to-week spread by position, used when a player has no history. */
const PRIOR_SD: Record<string, number> = {
    QB: 7.5, RB: 7.0, WR: 7.5, TE: 5.5, K: 4.0, DST: 5.5, FB: 3.0,
};

/** Fantasy scoring is bounded below and has a long right tail. */
const MIN_SD = 2.0;

/** League-average implied team total; the tilt is measured against this. */
const NEUTRAL_TEAM_TOTAL = 22.5;

/**
 * How much a player's week rides on their offence scoring.
 *
 * A kicker and a quarterback both depend on the team's total but not equally,
 * and a defense moves the opposite way — it wants the OTHER team held down,
 * which the caller passes as this team's implied total for the D/ST row.
 */
const TEAM_TOTAL_ELASTICITY: Record<string, number> = {
    QB: 0.55, RB: 0.40, WR: 0.50, TE: 0.45, K: 0.60, DST: 0.35, FB: 0.30,
};

/**
 * Game script: how a player's usage shifts when their team is ahead or behind.
 *
 * Running backs gain when their team is favoured and grinds out a lead;
 * receivers and quarterbacks gain when their team trails and has to throw.
 * Small per point of spread, but a fourteen-point swing between two options
 * is not small.
 *
 * Signed against the spread as it is quoted — NEGATIVE means favoured — so a
 * back carries a negative coefficient to gain from a negative spread, and a
 * receiver a positive one to gain from a positive spread. Reading these as
 * "points per point of underdog" is the way to keep them straight.
 */
const SCRIPT_PER_POINT: Record<string, number> = {
    RB: -0.13, WR: 0.10, TE: 0.05, QB: 0.08, K: -0.04, DST: -0.10, FB: -0.10,
};

function mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function pstdev(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/** Linear-interpolated percentile of a sorted-on-demand sample. */
export function percentile(xs: number[], p: number): number {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    if (s.length === 1) return s[0];
    const i = (s.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/**
 * How far to trust this season's games over the preseason projection.
 *
 * Reaches half at four games and keeps climbing, which is roughly where the
 * evidence says a fantasy sample starts carrying real signal. The point is
 * to stop a single week-1 dud from rewriting a player's season.
 */
export function formWeight(gamesThisSeason: number): number {
    return gamesThisSeason / (gamesThisSeason + 4);
}

/**
 * Build the distribution for one player's week.
 */
export function buildOutcome(p: PlayerInputs, currentSeason: number): Outcome {
    const pos = (p.position || '').toUpperCase();
    const ctx = p.context ?? {};

    const thisYear = p.logs.filter(l => l.season === currentSeason).map(l => l.points);
    // Shape comes from the fullest recent sample, which early in a season is
    // last year. Efficiency regresses hard between seasons; how spiky a
    // player's usage makes them does not.
    const priorYear = p.logs.filter(l => l.season === currentSeason - 1).map(l => l.points);
    const shapeSample = (priorYear.length >= 4 ? priorYear : [])
        .concat(thisYear.length >= 4 ? thisYear : []);

    const perGameProjection = p.seasonProjection && p.projectedGames
        ? p.seasonProjection / p.projectedGames
        : null;

    const w = formWeight(thisYear.length);
    const formMean = thisYear.length ? mean(thisYear) : null;
    let centre =
        perGameProjection != null && formMean != null ? perGameProjection * (1 - w) + formMean * w
        : formMean != null ? formMean
        : perGameProjection != null ? perGameProjection
        : shapeSample.length ? mean(shapeSample)
        : 0;

    // Spread scales with level: a 20-point player swings more in absolute
    // terms than an 8-point one, so a raw sd from a different usage era
    // travels badly. Carry the coefficient of variation instead.
    const sampleSd = shapeSample.length >= 4 ? pstdev(shapeSample) : 0;
    const sampleMean = shapeSample.length >= 4 ? mean(shapeSample) : 0;
    const cv = sampleSd > 0 && sampleMean > 1 ? sampleSd / sampleMean : null;
    const priorSd = PRIOR_SD[pos] ?? 6.5;
    let sd = cv != null
        ? Math.max(MIN_SD, cv * Math.max(centre, 1))
        : Math.max(MIN_SD, priorSd * (centre / 12 || 1));

    // ── game environment ────────────────────────────────────────────────
    let adjustment = 0;
    if (!ctx.onBye) {
        if (ctx.impliedTeamTotal != null) {
            const elasticity = TEAM_TOTAL_ELASTICITY[pos] ?? 0.45;
            const relative = (ctx.impliedTeamTotal - NEUTRAL_TEAM_TOTAL) / NEUTRAL_TEAM_TOTAL;
            adjustment += centre * elasticity * relative;
        }
        if (ctx.spread != null) {
            adjustment += (SCRIPT_PER_POINT[pos] ?? 0) * ctx.spread;
        }
    }
    centre = Math.max(0, centre + adjustment);

    if (ctx.onBye) {
        return {
            playerId: p.playerId, mean: 0, sd: 0, floor: 0, ceiling: 0,
            sample: shapeSample.length, formWeight: w,
            contextAdjustment: 0, onBye: true,
        };
    }

    // Percentiles come from the real sample where there is one, rescaled to
    // the centre we settled on — that keeps each player's own skew, which a
    // normal curve would flatten and which is the whole point for a
    // boom-or-bust back.
    let floor: number;
    let ceiling: number;
    if (shapeSample.length >= 4 && sampleMean > 1) {
        const scale = centre / sampleMean;
        floor = Math.max(0, percentile(shapeSample, 0.20) * scale);
        ceiling = percentile(shapeSample, 0.80) * scale;
        sd = Math.max(MIN_SD, sampleSd * scale);
    } else {
        floor = Math.max(0, centre - 0.84 * sd);
        ceiling = centre + 0.84 * sd;
    }

    return {
        playerId: p.playerId,
        mean: Math.round(centre * 10) / 10,
        sd: Math.round(sd * 10) / 10,
        floor: Math.round(floor * 10) / 10,
        ceiling: Math.round(ceiling * 10) / 10,
        sample: shapeSample.length,
        formWeight: Math.round(w * 100) / 100,
        contextAdjustment: Math.round(adjustment * 10) / 10,
        onBye: false,
    };
}

// ── Lineups ─────────────────────────────────────────────────────────────────

/**
 * Simulating a matchup, rather than adding up two projections.
 *
 * Adding projections tells you who is expected to score more. It cannot tell
 * you how likely you are to win, and those rank options differently whenever
 * the two lineups are not evenly matched. Down against a strong opponent,
 * the play that raises your mean by half a point while cutting your spread
 * is actively the wrong one; a simulation says so and a sum never can.
 *
 * Each player's week is drawn from their own distribution — the sample where
 * they have one, so a spiky player stays spiky, and a fitted curve otherwise.
 */

/** Draw one week for a player whose distribution came from real games. */
function drawFrom(sample: number[], scale: number, rng: () => number): number {
    // Resampling the player's own weeks keeps their skew: a back with three
    // 30-point games and nine quiet ones should produce that pattern, not a
    // symmetric wobble around his average.
    const pick = sample[Math.floor(rng() * sample.length)] ?? 0;
    // Jitter within the sample so repeated draws are not just the same
    // twelve numbers, sized to the gaps between them.
    const jitter = (rng() + rng() + rng() - 1.5) * (scale * 0.25);
    return Math.max(0, pick * scale + jitter);
}

/** Draw one week from a fitted curve, for a player without enough history. */
function drawNormal(mean: number, sd: number, rng: () => number): number {
    // Sum of three uniforms: near enough to normal for this, and cheap.
    const z = (rng() + rng() + rng() - 1.5) * 2;
    return Math.max(0, mean + z * sd);
}

export interface SimPlayer {
    outcome: Outcome;
    /** The player's own weekly points, when there are enough to resample. */
    sample?: number[];
}

/** A deterministic generator, so the same lineup always reports the same odds. */
export function makeRng(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        // xorshift32 — small, fast, and repeatable, which matters more here
        // than statistical pedigree: a start/sit answer that changes on
        // refresh is not an answer.
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5;  s >>>= 0;
        return s / 4294967296;
    };
}

function drawLineup(players: SimPlayer[], rng: () => number): number {
    let total = 0;
    for (const p of players) {
        if (p.outcome.onBye) continue;
        if (p.sample && p.sample.length >= 4) {
            const m = p.sample.reduce((a, b) => a + b, 0) / p.sample.length;
            total += drawFrom(p.sample, m > 1 ? p.outcome.mean / m : 1, rng);
        } else {
            total += drawNormal(p.outcome.mean, p.outcome.sd, rng);
        }
    }
    return total;
}

export interface MatchupOdds {
    /** 0..1 chance this lineup outscores the opponent. */
    winProb: number;
    /** Expected points for and against. */
    pointsFor: number;
    pointsAgainst: number;
    /** Middle 80% of this lineup's outcomes. */
    range: [number, number];
}

const DEFAULT_TRIALS = 20000;

/**
 * Chance this lineup beats that one.
 *
 * The opponent is simulated too rather than treated as a fixed number,
 * because their variance is what decides whether you need a ceiling: a
 * steady opponent you must simply out-score, a volatile one you can lose to
 * while doing everything right, and the correct response differs.
 */
export function simulateMatchup(
    mine: SimPlayer[], theirs: SimPlayer[],
    trials = DEFAULT_TRIALS, seed = 1,
): MatchupOdds {
    const rng = makeRng(seed);
    let wins = 0, sumFor = 0, sumAgainst = 0;
    const totals: number[] = new Array(trials);
    for (let i = 0; i < trials; i++) {
        const f = drawLineup(mine, rng);
        const a = drawLineup(theirs, rng);
        totals[i] = f;
        sumFor += f; sumAgainst += a;
        if (f > a) wins++;
    }
    return {
        winProb: wins / trials,
        pointsFor: Math.round((sumFor / trials) * 10) / 10,
        pointsAgainst: Math.round((sumAgainst / trials) * 10) / 10,
        range: [
            Math.round(percentile(totals, 0.10) * 10) / 10,
            Math.round(percentile(totals, 0.90) * 10) / 10,
        ],
    };
}

export interface SwapVerdict {
    inId: number;
    outId: number;
    /** Percentage points of win probability gained by making the swap. */
    deltaWinProb: number;
    /** Points gained, which is what every other tool shows. */
    deltaPoints: number;
}

/**
 * Score every bench player against every starter at a slot.
 *
 * Reported in both currencies on purpose: the points delta is what the rest
 * of the industry shows, and seeing it disagree with the win-probability
 * delta is the moment the tool earns its keep.
 */
export function rankSwaps(
    starters: SimPlayer[], bench: SimPlayer[], opponent: SimPlayer[],
    eligible: (benchIdx: number, starterIdx: number) => boolean,
    trials = 6000,
): SwapVerdict[] {
    const base = simulateMatchup(starters, opponent, trials, 7).winProb;
    const out: SwapVerdict[] = [];
    for (let b = 0; b < bench.length; b++) {
        for (let s = 0; s < starters.length; s++) {
            if (!eligible(b, s)) continue;
            const swapped = [...starters];
            swapped[s] = bench[b];
            // Same seed for every candidate so the comparison is between the
            // lineups and not between two different sets of random draws.
            const w = simulateMatchup(swapped, opponent, trials, 7).winProb;
            out.push({
                inId: bench[b].outcome.playerId,
                outId: starters[s].outcome.playerId,
                deltaWinProb: Math.round((w - base) * 1000) / 10,
                deltaPoints: Math.round(
                    (bench[b].outcome.mean - starters[s].outcome.mean) * 10) / 10,
            });
        }
    }
    return out.sort((a, b) => b.deltaWinProb - a.deltaWinProb);
}
