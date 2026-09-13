/**
 * The arithmetic behind a pick, done where it can be checked.
 *
 * A pick'em page that prints "80%" and nothing else is asking to be trusted.
 * Every number here has a derivation a reader can follow: a moneyline is a
 * price, a price implies a probability, two prices imply more than one
 * because the book keeps a margin, and taking that margin out is a division
 * anybody can repeat. The historical rate beside it comes from counting
 * finished games. Neither is an opinion, and where they disagree that is
 * itself the finding.
 */

/** What a book has to be right about for a standard −110 bet to break even. */
export const BREAK_EVEN = 110 / 210;

/** American odds to the raw probability they imply, margin included. */
export function impliedProbability(moneyline: number | null): number | null {
    if (moneyline == null || moneyline === 0) return null;
    return moneyline > 0 ? 100 / (moneyline + 100) : -moneyline / (-moneyline + 100);
}

/**
 * The book's margin on a two-way market.
 *
 * Both sides' implied probabilities sum to more than one, and the excess is
 * the house's cut. Worth showing rather than quietly removing: a reader who
 * sees "−166 and +140 imply 62.4% and 41.7%, which is 104.1%" understands why
 * the page then divides, and a reader who is only handed 60.0% does not.
 */
export function overround(a: number | null, b: number | null): number | null {
    const pa = impliedProbability(a);
    const pb = impliedProbability(b);
    if (pa == null || pb == null) return null;
    return pa + pb - 1;
}

/** The same two prices with the margin taken out proportionally. */
export function devig(a: number | null, b: number | null):
    { a: number; b: number } | null {
    const pa = impliedProbability(a);
    const pb = impliedProbability(b);
    if (pa == null || pb == null || pa + pb <= 0) return null;
    return { a: pa / (pa + pb), b: pb / (pa + pb) };
}

export interface Pickable {
    gameId: string;
    /** Probability the pick wins, 0..1. */
    probability: number | null;
}

/**
 * Confidence points, which is how these pools are actually scored.
 *
 * A pool with sixteen games has sixteen points to give out and each may be
 * used once, so the only decision is the order — which makes the whole
 * exercise a stack rank, and makes a page that does not rank the games a
 * page that has not done the job. The most confident pick gets the highest
 * number, because that is the convention every pool uses.
 *
 * Games with no price sit at the bottom rather than being dropped: a pool
 * makes you pick them anyway.
 */
export function confidencePoints(games: Pickable[]): Map<string, number> {
    const ordered = [...games].sort((x, y) =>
        (y.probability ?? -1) - (x.probability ?? -1));
    const out = new Map<string, number>();
    ordered.forEach((g, i) => out.set(g.gameId, ordered.length - i));
    return out;
}

/**
 * How far the market and the record are apart, in points of probability.
 *
 * Positive means the market likes this favourite more than lines his size
 * have historically deserved. It is not a betting edge and the page says so
 * — the market knows which teams are playing and the bucket does not — but
 * it is the one place a reader can see the two sources disagree, and a
 * disagreement is worth more than either number alone.
 */
export function marketVsHistory(
    market: number | null, history: number | null,
): number | null {
    if (market == null || history == null) return null;
    return Math.round((market - history) * 1000) / 10;
}

/**
 * Whether a sample is big enough to argue with.
 *
 * Under two hundred games a bucket's rate moves by more than the
 * disagreements anybody would act on, so the page says so rather than
 * printing a number to one decimal place and letting it look solid.
 */
export const THIN_SAMPLE = 200;

/**
 * The standard error on a rate, for a sample of this size.
 *
 * Printed beside every historical rate, because "58.4% of 1,113 games" and
 * "58.4% of 40 games" are not the same claim and nothing else on the row
 * says which one a reader is looking at.
 */
export function rateError(rate: number, n: number): number | null {
    if (!n || n <= 1) return null;
    return Math.sqrt(Math.max(0, rate * (1 - rate)) / n);
}
