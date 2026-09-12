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
    /**
     * PPR the opposing defence allowed per player-game at this position last
     * season, alongside the league average at that position and the number of
     * player-games behind it. Raw rates, not a rating: the model does its own
     * shrinking, so the caller never has to know the smoothing rule.
     */
    defenseAllowed?: number | null;
    defenseLeagueAvg?: number | null;
    defenseSample?: number | null;
    /** No game this week. */
    onBye?: boolean;
    /**
     * The official game designation — Out, Doubtful, Questionable — and the
     * practice participation behind it. Both, because practice is reported
     * for players who never get a game status and is often the sharper read.
     */
    reportStatus?: string | null;
    practiceStatus?: string | null;
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
    /**
     * PPR points implied by this week's player prop market, when the books
     * have priced them. Sharper than anything else here and already inclusive
     * of the matchup, the game script and the injury news, which is why it
     * replaces those adjustments rather than joining them.
     */
    marketProjection?: number | null;
    /** How much of the player's game the market actually priced. */
    marketMarkets?: number | null;
    context?: GameContext;
}

/** A player's week, as a distribution rather than a number. */
export interface OutcomeDrivers {
    /** The player's own level: the projection and their form, blended. */
    base: number;
    /**
     * The two halves of that blend, and nulls where one was missing.
     *
     * This is the most contestable choice in the model and the one a reader
     * is most likely to have an opinion about: how much of a player is what
     * somebody projected in August, and how much is what he has actually
     * done since. `formWeight` on the outcome says how the two were mixed.
     * Shown, it is a judgement the reader can overrule; hidden, it is the
     * model quietly deciding for them.
     */
    projectionPerGame: number | null;
    formMean: number | null;
    /** Points from how many the books expect this offence to score. */
    teamTotal: number;
    /** Points from the game script the spread implies. */
    script: number;
    /** Points from what this defence gives up to the position. */
    matchup: number;
    /** Points from the betting market replacing the model's centre. */
    market: number;
}

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
    /**
     * The same adjustment, itemised.
     *
     * A single number says the projection moved; it does not say what moved
     * it, and a reader who cannot see the parts cannot disagree with one of
     * them. These are points, signed, and they add to the mean: base plus
     * the three contributions is the centre (before the floor at zero, which
     * only bites if the context is more negative than the player's own base
     * — rare, and the mean stays authoritative if it does).
     *
     * `market` is non-zero only when a prop line replaced the model's centre
     * outright, in which case the other three are zero by construction: the
     * line already prices the total, the script and the defence, and adding
     * the model's tilt would count them twice.
     */
    drivers: OutcomeDrivers;
    onBye: boolean;
    /**
     * Chance this player is active, from the injury report. Everything above
     * — mean, floor, ceiling — is conditional on them playing, so a hurt
     * starter reads as the player they are plus the risk they are not there,
     * rather than as a quietly smaller player.
     */
    playProbability: number;
    /** What the report said, for the UI to name rather than imply. */
    availability: string | null;
    /**
     * Where the centre came from. 'market' means the betting line priced this
     * player directly; 'model' means it was built from the projection and the
     * player's own history.
     */
    centreSource: 'market' | 'model';
}

/**
 * How likely a player on the injury report is to be active.
 *
 * The designations are coarse and their meanings are well known: Out is a
 * decision already made, Doubtful almost always means inactive, and
 * Questionable is close to a coin flip that lands on "plays" more often than
 * not. The numbers below are the conventional readings of those tags, not a
 * fitted model, and they are deliberately round — pretending to a second
 * decimal here would claim precision the source does not carry.
 *
 * Practice participation is the fallback, and it is not a weak one. Most
 * players on a report never receive a game status at all; for them, a week of
 * not practising is the only signal there is, and it is a real one.
 */
const REPORT_PLAY_RATE: Record<string, number> = {
    OUT: 0,
    DOUBTFUL: 0.1,
    QUESTIONABLE: 0.65,
};

const PRACTICE_PLAY_RATE: Array<[RegExp, number]> = [
    [/did not participate/i, 0.55],
    [/limited/i, 0.9],
    [/full/i, 1],
];

/**
 * The chance a player suits up, from whatever the report says.
 *
 * A game status wins when there is one, because it is the team telling you
 * directly. Silence is not evidence of injury: a player with no row at all is
 * simply healthy as far as anyone has said, and gets 1.
 */
export function playProbability(ctx: GameContext): number {
    const report = (ctx.reportStatus ?? '').trim().toUpperCase();
    if (report && report in REPORT_PLAY_RATE) return REPORT_PLAY_RATE[report];
    const practice = (ctx.practiceStatus ?? '').trim();
    if (practice) {
        for (const [re, rate] of PRACTICE_PLAY_RATE) if (re.test(practice)) return rate;
    }
    return 1;
}

/** The short label the UI shows, or null when there is nothing to say. */
export function availabilityLabel(ctx: GameContext): string | null {
    const report = (ctx.reportStatus ?? '').trim();
    if (report) return report;
    const practice = (ctx.practiceStatus ?? '').trim();
    if (/did not participate/i.test(practice)) return 'No practice';
    if (/limited/i.test(practice)) return 'Limited';
    return null;
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

/**
 * How hard the matchup pulls, and why it is not pulled at face value.
 *
 * Points allowed to a position is the standard matchup number and it is a
 * confounded one. A defence's rate reflects who it happened to play, how many
 * receivers those teams fielded, and how often it was ahead — not only how
 * hard it is to score on. Two separate discounts follow from that, doing two
 * different jobs.
 *
 * DEFENSE_PRIOR_GAMES shrinks the rate toward the positional average by
 * sample size, so a cell built on twenty player-games moves the projection
 * far less than one built on eighty. That handles noise.
 *
 * DEFENSE_ELASTICITY handles bias: even a perfectly measured rate is last
 * year's defence, with this year's personnel and scheme, so only part of it
 * carries forward. Half is a deliberately conservative read — enough for a
 * genuinely soft matchup to show up next to the Vegas line, not enough for it
 * to outvote the line.
 */
const DEFENSE_PRIOR_GAMES = 60;
const DEFENSE_ELASTICITY = 0.5;

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
/**
 * How much the opposing defence moves a player's week, as a fraction of it.
 *
 * Returns 0 whenever the answer would be guesswork — no rate, no league
 * average to compare it to, or a league average of zero — so a missing
 * matchup leaves the projection exactly where the rest of the model put it
 * rather than nudging it toward an invented neutral.
 */
export function matchupEdge(ctx: GameContext): number {
    const { defenseAllowed: allowed, defenseLeagueAvg: avg } = ctx;
    if (allowed == null || avg == null || avg <= 0) return 0;
    const n = ctx.defenseSample ?? 0;
    const weight = n / (n + DEFENSE_PRIOR_GAMES);
    const raw = allowed / avg - 1;
    return weight * raw * DEFENSE_ELASTICITY;
}

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

    // ── the market, when it has priced this player ──────────────────────
    //
    // A prop line already contains everything the adjustments below are
    // trying to estimate: the books know the total, the spread, the defence
    // and who is hurt, and they have moved the number accordingly. Adding the
    // model's own tilt on top would count the same information twice, so when
    // the market is present it replaces those adjustments rather than joining
    // them, and the outcome says which it used.
    //
    // A thinly priced player — a yards line and nothing else — is not a full
    // projection, so the market only takes over once at least two of their
    // markets were priced. Below that the model keeps its own centre.
    // The player's own level, before anything about this particular week.
    // Kept so the UI can show what the context did rather than only its sum.
    const base = centre;

    const market = p.marketProjection;
    const marketUsable = market != null && market > 0 && (p.marketMarkets ?? 0) >= 2;
    if (marketUsable) {
        centre = market;
    }

    // ── game environment ────────────────────────────────────────────────
    const drivers: OutcomeDrivers = {
        base,
        projectionPerGame: perGameProjection,
        formMean,
        teamTotal: 0, script: 0, matchup: 0,
        market: marketUsable ? market! - base : 0,
    };
    if (!ctx.onBye && !marketUsable) {
        if (ctx.impliedTeamTotal != null) {
            const elasticity = TEAM_TOTAL_ELASTICITY[pos] ?? 0.45;
            const relative = (ctx.impliedTeamTotal - NEUTRAL_TEAM_TOTAL) / NEUTRAL_TEAM_TOTAL;
            drivers.teamTotal = centre * elasticity * relative;
        }
        if (ctx.spread != null) {
            drivers.script = (SCRIPT_PER_POINT[pos] ?? 0) * ctx.spread;
        }
        drivers.matchup = centre * matchupEdge(ctx);
    }
    const adjustment = drivers.teamTotal + drivers.script + drivers.matchup;
    centre = Math.max(0, centre + adjustment);

    if (ctx.onBye) {
        return {
            playerId: p.playerId, mean: 0, sd: 0, floor: 0, ceiling: 0,
            sample: shapeSample.length, formWeight: w,
            contextAdjustment: 0, onBye: true,
            drivers: {
                base, projectionPerGame: perGameProjection, formMean,
                teamTotal: 0, script: 0, matchup: 0, market: 0,
            },
            playProbability: 0, availability: null,
            centreSource: 'model',
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

    const r1 = (v: number) => Math.round(v * 10) / 10;

    /**
     * Rounded so the parts still add to the whole.
     *
     * Rounding each contribution on its own is what turns an audit back into
     * an illustration: 17.34 base with -0.16, -0.47 and +0.14 of context
     * displays as 17.3 and -0.2, -0.5, +0.1, which sums to 16.7 beside a
     * stated mean of 16.9. Every number is individually correct and the
     * column does not add up, which is worse than a coarser number would be.
     *
     * So the residual is given to the largest contribution, where one tenth
     * is the smallest relative lie available. The mean is never adjusted — it
     * is the figure the simulation actually used.
     */
    const shown = {
        base: r1(drivers.base),
        projectionPerGame: drivers.projectionPerGame != null
            ? r1(drivers.projectionPerGame) : null,
        formMean: drivers.formMean != null ? r1(drivers.formMean) : null,
        teamTotal: r1(drivers.teamTotal),
        script: r1(drivers.script), matchup: r1(drivers.matchup),
        market: r1(drivers.market),
    };
    const meanShown = r1(centre);
    // The clamp at zero can legitimately break the identity; leave those be
    // rather than inventing a contribution to cover it.
    if (centre > 0) {
        const keys = ['teamTotal', 'script', 'matchup', 'market'] as const;
        const residual = r1(meanShown
            - (shown.base + keys.reduce((t, k) => t + shown[k], 0)));
        if (residual !== 0) {
            let biggest: typeof keys[number] | null = null;
            for (const k of keys) {
                if (shown[k] !== 0
                    && (biggest === null || Math.abs(shown[k]) > Math.abs(shown[biggest]))) {
                    biggest = k;
                }
            }
            if (biggest) shown[biggest] = r1(shown[biggest] + residual);
            else shown.base = r1(shown.base + residual);
        }
    }

    return {
        playerId: p.playerId,
        drivers: shown,
        mean: meanShown,
        sd: Math.round(sd * 10) / 10,
        floor: Math.round(floor * 10) / 10,
        ceiling: Math.round(ceiling * 10) / 10,
        sample: shapeSample.length,
        formWeight: Math.round(w * 100) / 100,
        contextAdjustment: Math.round(adjustment * 10) / 10,
        onBye: false,
        // Conditional on playing: everything above describes the week this
        // player has when active, and this is the chance they are.
        playProbability: playProbability(ctx),
        availability: availabilityLabel(ctx),
        centreSource: marketUsable ? 'market' : 'model',
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

/**
 * Whether a player's games can stand in for their week.
 *
 * They cannot when they are all zero, which is not a hypothetical: nflverse's
 * weekly points cover passing, rushing and receiving, so every kicker-week in
 * the table reads 0.0. Resampled at face value that put a kicker at zero in
 * all twenty thousand simulated weeks while their stated mean said nine — the
 * lineup was scored without them.
 *
 * A mean at or below a point is the signal. It means the sample is measuring
 * something other than what this player is projected to do, and the model is
 * better off with the distribution it built from the projection.
 */
export function usableSample(sample?: number[]): boolean {
    if (!sample || sample.length < 4) return false;
    return sampleMeanOf(sample) > 1;
}

/**
 * A sample's mean, worked out once.
 *
 * `drawLineup` needs it to rescale a resampled week onto the projection, and
 * it is a constant for the player — but it was being computed inside the
 * trial loop, twice: once by `usableSample` and again for the scale. At
 * seventeen games, eighteen players and six thousand trials that is six
 * million additions per simulated matchup, and the slot board runs fifty of
 * them. It was the whole reason a loaded board took three and a half seconds
 * on a mid-range phone, and it never varied.
 *
 * Keyed on the array rather than the player: samples are built once and
 * never mutated, and a WeakMap lets them be collected with their owner.
 */
const sampleMeans = new WeakMap<number[], number>();

export function sampleMeanOf(sample: number[]): number {
    const hit = sampleMeans.get(sample);
    if (hit !== undefined) return hit;
    let total = 0;
    for (let i = 0; i < sample.length; i++) total += sample[i];
    const m = sample.length ? total / sample.length : 0;
    sampleMeans.set(sample, m);
    return m;
}

function drawLineup(players: SimPlayer[], rng: () => number): number {
    let total = 0;
    for (const p of players) {
        if (p.outcome.onBye) continue;
        // Injury risk enters as the thing it actually is: a chance of zero,
        // not a smaller number every week. A questionable starter is not
        // two-thirds of a player — he is the whole player most weeks and an
        // empty slot the rest, and those two lineups win differently.
        if (p.outcome.playProbability < 1 && rng() >= p.outcome.playProbability) continue;
        const s = p.sample;
        if (s && s.length >= 4) {
            const m = sampleMeanOf(s);
            if (m > 1) {
                total += drawFrom(s, p.outcome.mean / m, rng);
                continue;
            }
        }
        total += drawNormal(p.outcome.mean, p.outcome.sd, rng);
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
    /**
     * Both simulated score distributions, binned, when asked for.
     *
     * The simulation already draws twenty thousand of each and then throws
     * them away to report two averages. The shapes are the interesting part:
     * where they overlap is precisely how a favourite loses, and no pair of
     * means can show that.
     */
    hist?: ScoreHistogram;
}

export interface ScoreHistogram {
    /** Left edge of each bin; bins are of equal width. */
    edges: number[];
    width: number;
    /** Share of trials in each bin, so the two are comparable. */
    mine: number[];
    theirs: number[];
    /** Share of trials in which their score beats yours. */
    lossShare: number;
}

function histogram(mine: number[], theirs: number[], bins: number): ScoreHistogram {
    const all = [...mine, ...theirs];
    const lo = Math.max(0, Math.min(...all));
    const hi = Math.max(...all);
    const width = (hi - lo) / bins || 1;
    const edges = Array.from({ length: bins }, (_, i) => lo + i * width);
    const put = (xs: number[]) => {
        const out = new Array(bins).fill(0);
        for (const x of xs) {
            const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / width)));
            out[i]++;
        }
        return out.map(n => n / xs.length);
    };
    let losses = 0;
    for (let i = 0; i < mine.length; i++) if (theirs[i] >= mine[i]) losses++;
    return { edges, width, mine: put(mine), theirs: put(theirs), lossShare: losses / mine.length };
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
    opts: { bins?: number } = {},
): MatchupOdds {
    const rng = makeRng(seed);
    let wins = 0, sumFor = 0, sumAgainst = 0;
    const totals: number[] = new Array(trials);
    const oppTotals: number[] | null = opts.bins ? new Array(trials) : null;
    for (let i = 0; i < trials; i++) {
        const f = drawLineup(mine, rng);
        const a = drawLineup(theirs, rng);
        totals[i] = f;
        if (oppTotals) oppTotals[i] = a;
        sumFor += f; sumAgainst += a;
        if (f > a) wins++;
    }
    return {
        ...(oppTotals ? { hist: histogram(totals, oppTotals, opts.bins!) } : {}),
        winProb: wins / trials,
        pointsFor: Math.round((sumFor / trials) * 10) / 10,
        pointsAgainst: Math.round((sumAgainst / trials) * 10) / 10,
        range: [
            Math.round(percentile(totals, 0.10) * 10) / 10,
            Math.round(percentile(totals, 0.90) * 10) / 10,
        ],
    };
}

/**
 * Every candidate for one slot, off one set of draws.
 *
 * Scoring a slot used to re-simulate the entire lineup for each candidate:
 * nine players plus nine opponents, six times over, when five of those six
 * runs differ by exactly one player. Same answer for four or five times the
 * work, and it was seventy per cent of what the page computed on a load.
 *
 * Here the unchanged starters and the opponent are drawn once per trial and
 * each candidate is drawn against that same week. Fewer draws, and better
 * numbers: the candidates now share their randomness exactly, so the
 * differences between them — which is the only thing the board displays —
 * stop carrying two independent lots of Monte Carlo noise.
 *
 * `others` must already exclude whoever is being replaced.
 */
export function slotWinProbs(
    others: SimPlayer[], candidates: SimPlayer[], opponent: SimPlayer[],
    trials = 6000, seed = 7,
): number[] {
    const rng = makeRng(seed);
    const wins = new Array(candidates.length).fill(0);
    for (let i = 0; i < trials; i++) {
        const rest = drawLineup(others, rng);
        const them = drawLineup(opponent, rng);
        for (let c = 0; c < candidates.length; c++) {
            if (rest + drawLineup([candidates[c]], rng) > them) wins[c]++;
        }
    }
    return wins.map(w => w / trials);
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
/**
 * How often one player outscores another, head to head.
 *
 * A slot's win-probability delta says what a change is worth to the lineup,
 * which is the right thing to rank on and a hard thing to feel. This is the
 * same comparison in the units of the argument people actually have: start
 * him and you have the better player in 58% of weeks, not in all of them, and
 * the 42% is why it was ever a question.
 *
 * Drawn from the same distributions the simulation uses, so it cannot
 * disagree with the ranking above it.
 */
export function beatsProbability(
    a: SimPlayer, b: SimPlayer, trials = 4000, seed = 13,
): number {
    const rng = makeRng(seed);
    let wins = 0, ties = 0;
    for (let i = 0; i < trials; i++) {
        const x = drawLineup([a], rng);
        const y = drawLineup([b], rng);
        if (x > y) wins++;
        else if (x === y) ties++;
    }
    // Two players who both post zero — a pair of ruled-out starters — are not
    // a 100% answer in either direction, so ties split.
    return (wins + ties / 2) / trials;
}

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
