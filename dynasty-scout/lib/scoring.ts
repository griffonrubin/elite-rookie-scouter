/**
 * Your league's scoring, applied to numbers that were all full PPR.
 *
 * Every projection this app stores and every weekly total it reads is PPR —
 * `fantasy_points_ppr` in the game logs, PPR projections from the sources —
 * and until now the app simply never asked what a league scores. Roughly
 * half of leagues are not full PPR, and for them every number on every page
 * was wrong in the same direction: receivers and pass-catching backs
 * overstated against runners, by exactly the catches they make.
 *
 * It is not a small gap. A receiver catching six a game is three points a
 * week clear of where a half-PPR league has him, which is larger than most
 * of the differences these pages are asked to arbitrate. A start/sit call
 * between a six-catch receiver and a runner was being decided by the
 * scoring settings of a league the reader is not in.
 *
 * What is corrected here is the reception term and the tight-end bonus, and
 * nothing else. That is not everything a league can change, and pretending
 * otherwise would be its own version of the same mistake — so the two knobs
 * that actually vary between leagues are read from the platform, the rest is
 * assumed standard, and the page says which.
 */

export interface Scoring {
    /** Points per catch. One in PPR, a half in half-PPR, nought in standard. */
    reception: number;
    /** Extra points per catch for a tight end, where a league pays it. */
    teReceptionBonus: number;
}

export const PPR: Scoring = { reception: 1, teReceptionBonus: 0 };

/** Whether this is the scoring every stored number already assumes. */
export function isPpr(s: Scoring | null | undefined): boolean {
    return !s || (s.reception === 1 && s.teReceptionBonus === 0);
}

/** "Half PPR", "Standard", "PPR", "PPR · TE premium" — for a page to print. */
export function scoringLabel(s: Scoring | null | undefined): string {
    if (!s) return 'PPR';
    const base = s.reception === 0 ? 'Standard'
        : s.reception === 1 ? 'PPR'
        : s.reception === 0.5 ? 'Half PPR'
        : `${s.reception} per catch`;
    return s.teReceptionBonus > 0 ? `${base} · TE premium` : base;
}

/**
 * A PPR total, restated in this league's points.
 *
 * Exact rather than modelled, because the reception term is linear and the
 * catches are in the same row: a PPR total minus the catches it was paid
 * for, plus what this league pays for them.
 *
 * Catches unknown means the total is returned untouched, which understates
 * nothing and invents nothing — a log row missing its receptions is a row
 * this cannot correct, and saying so by leaving it alone is better than
 * guessing a catch rate.
 */
export function rescore(
    pprPoints: number,
    receptions: number | null | undefined,
    position: string | null | undefined,
    scoring: Scoring | null | undefined,
): number {
    if (!scoring || isPpr(scoring)) return pprPoints;
    if (receptions == null || !Number.isFinite(receptions)) return pprPoints;
    const te = (position ?? '').toUpperCase() === 'TE';
    const perCatch = scoring.reception + (te ? scoring.teReceptionBonus : 0);
    return pprPoints + (perCatch - 1) * receptions;
}

/**
 * Sleeper's scoring block, read for the two terms that matter.
 *
 * Only an explicit `rec` changes anything. A missing key could mean a
 * standard league paying nothing per catch, or it could mean a payload that
 * does not carry the field — and the two want opposite treatment. Reading
 * absence as zero would take a point off every catch for a full-PPR league
 * whose settings did not come through, which is a new and very visible wrong
 * answer; reading it as PPR leaves a standard league exactly where it
 * already was, which is the wrong answer they have had all along.
 *
 * Between introducing a fault and failing to fix one, the second is the
 * smaller harm. Worth revisiting against a real payload: Sleeper's API is
 * not reachable from where this was written, so which leagues omit the key
 * is unverified rather than known.
 */
export function scoringFrom(
    settings: Record<string, number> | null | undefined,
): Scoring {
    if (!settings || typeof settings.rec !== 'number') return PPR;
    const teBonus = typeof settings.bonus_rec_te === 'number'
        ? settings.bonus_rec_te : 0;
    return { reception: settings.rec, teReceptionBonus: teBonus };
}
