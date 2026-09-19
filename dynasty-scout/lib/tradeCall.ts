/**
 * The verdict in words, in one place because it is now said in two.
 *
 * The detail panel and the bar that follows you down the page are reading
 * the same result and have to reach the same conclusion about it. Two copies
 * of "a materially better season" with two copies of the threshold that
 * decides it is a disagreement waiting for somebody to tune one of them.
 */
import { ODDS_NOISE, TRADE_NOISE, type TradeEffect } from '@/lib/trade';

export interface Call {
    text: string;
    colour: string;
}

/** A rate change as signed points, with a real minus sign. */
export const pp = (d: number) =>
    `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d * 100).toFixed(1)}`;

/**
 * The verdict in playoff odds, where the season is being played out.
 *
 * Deliberately different wording from the win-rate call, because it is a
 * different claim: a roster getting better and an owner getting closer to
 * January are not the same thing, and the gap between them is the most
 * useful thing this page knows. A team already in or already out converts
 * a real improvement into nothing at all, and saying so is worth more than
 * a compliment about the roster.
 */
export function oddsCallFor(delta: number, after: number): Call {
    if (Math.abs(delta) < ODDS_NOISE) {
        return {
            text: after >= 0.9 ? 'already in either way'
                : after <= 0.1 ? 'not enough to matter from here'
                : 'no real change to your season',
            colour: 'rgba(255,255,255,0.45)',
        };
    }
    const big = Math.abs(delta) >= 0.05;
    return delta > 0
        ? { text: big ? 'a materially better season' : 'a slightly better season',
            colour: '#93C5FD' }
        : { text: big ? 'a materially worse season' : 'a slightly worse season',
            colour: '#FCA5A5' };
}

/** The verdict in win rate, because a signed number needs a direction named. */
export function callFor(delta: number): Call {
    if (Math.abs(delta) < TRADE_NOISE) {
        return { text: 'no real change', colour: 'rgba(255,255,255,0.45)' };
    }
    const big = Math.abs(delta) >= 0.03;
    if (delta > 0) {
        return { text: big ? 'clearly better off' : 'a little better off',
            colour: '#93C5FD' };
    }
    return { text: big ? 'clearly worse off' : 'a little worse off',
        colour: '#FCA5A5' };
}

/**
 * Whichever number this side is actually being judged on.
 *
 * Playoff odds where the season was played out, win rate where it was not,
 * so a caller can ask one question and get the answer the page is leading
 * with rather than having to know which mode it is in.
 */
export function headline(e: TradeEffect): {
    delta: number; before: number; after: number; odds: boolean; call: Call;
} {
    if (e.oddsDelta != null && e.oddsBefore != null && e.oddsAfter != null) {
        return {
            delta: e.oddsDelta, before: e.oddsBefore, after: e.oddsAfter,
            odds: true, call: oddsCallFor(e.oddsDelta, e.oddsAfter),
        };
    }
    return {
        delta: e.delta, before: e.before, after: e.after,
        odds: false, call: callFor(e.delta),
    };
}

/**
 * Whether the other manager has any reason to say yes.
 *
 * The finder has always known this — it ranks on the smaller of the two
 * gains, because "an offer worth eight points to you and a tenth of one to
 * them is not a deal, it is a message that goes unanswered". The analyser
 * knew it too and never said it: it would tell you a trade made your season
 * better and leave you to notice, four lines down in the other side's row,
 * that it took ten points off theirs.
 *
 * An offer you are excited about and they will not answer is the most common
 * thing a trade page produces, and the cheapest one to warn about.
 */
export function replyCallFor(theirs: TradeEffect | null): Call | null {
    if (!theirs) return null;
    const h = headline(theirs);
    const floor = h.odds ? ODDS_NOISE : TRADE_NOISE;
    if (h.delta > floor) {
        return { text: 'they gain from this too', colour: '#93C5FD' };
    }
    if (h.delta < -floor) {
        return Math.abs(h.delta) >= (h.odds ? 0.05 : 0.03)
            ? { text: 'expect a no — this costs them a lot', colour: '#FCA5A5' }
            : { text: 'they come off worse — expect a counter', colour: '#FCA5A5' };
    }
    return { text: 'about even for them', colour: 'rgba(255,255,255,0.45)' };
}
