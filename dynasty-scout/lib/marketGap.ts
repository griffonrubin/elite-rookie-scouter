/**
 * How lopsided a trade has to be, on the market's scale, before it is worth
 * saying so.
 *
 * Not a fixed number of points, because these values are not a fixed scale:
 * ten per cent of a 1.01 is several hundred, ten per cent of a 4th is
 * eighty. Expressed against the bigger side, which is the side the gap is
 * being measured out of.
 *
 * Ten per cent is where the community's own tolerance sits — trade
 * calculators that colour anything at all tend to call a deal fair inside
 * it, and two humans agreeing a deal are rarely arguing over less.
 *
 * Lives here rather than in either page because both of them say it now: the
 * dynasty calculator, which is only ever about market value, and the In
 * Season analyser, which reports it beside what a trade does to the season.
 * Two copies of a threshold is two answers to "is this fair" from one app.
 */
export const FAIR = 0.10;
export const LOPSIDED = 0.25;

export interface MarketCall {
    text: string;
    colour: string;
    /** The gap as a share of the bigger side, 0 when there is nothing on it. */
    share: number;
}

/**
 * The call on a gap.
 *
 * `diff` is positive when the side you receive is worth more; `bigger` is the
 * larger of the two totals.
 */
export function marketVerdict(diff: number, bigger: number): MarketCall {
    if (bigger === 0) {
        return {
            text: 'nothing on the table yet',
            colour: 'rgba(255,255,255,0.4)',
            share: 0,
        };
    }
    const share = Math.abs(diff) / bigger;
    if (share < FAIR) {
        return { text: 'an even trade', colour: 'rgba(255,255,255,0.55)', share };
    }
    const yours = diff > 0;
    if (share < LOPSIDED) {
        return {
            text: `tilts ${yours ? 'your' : 'their'} way`,
            colour: '#93C5FD',
            share,
        };
    }
    return {
        text: `heavily ${yours ? 'your' : 'their'} way`,
        colour: yours ? '#93C5FD' : '#FCA5A5',
        share,
    };
}
