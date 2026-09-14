/**
 * How often the model's stated range has actually contained the answer.
 *
 * The start/sit page publishes a floor, a ceiling and a chance of winning
 * the week, and until this existed a reader had no way to know whether any
 * of it had ever been right. That is the one thing worth knowing about a
 * number like "fifty-nine per cent", and every site that ships one keeps it
 * to itself.
 *
 * The measurement is a backtest: every week a player had four games behind
 * him, the distribution built from those games alone, compared against what
 * he then scored. It is slow — nine thousand model runs — so it is computed
 * by a script, stored, and read by the page, the same way the historical
 * spread table behind Pick'ems works.
 *
 * Shapes and arithmetic live here; scripts/build_model_calibration runs the
 * backtest and fills the table, and scripts/calibration_check asserts the
 * model still earns the numbers.
 */

/** One row: a slice of the backtest, and how the claim held up in it. */
export interface CalibrationRow {
    /** 'all', a position, or a sample-size band like '4-5'. */
    slice: string;
    /** What the slice is cut on, so a page can group without parsing names. */
    kind: 'overall' | 'position' | 'history';
    weeks: number;
    /** Weeks the actual landed between the stated floor and ceiling. */
    inside: number;
    below: number;
    above: number;
    from_season: number;
    to_season: number;
    updated_at: string;
}

/**
 * The claim the interval makes, as a share.
 *
 * Floor is the twentieth percentile and ceiling the eightieth, so three
 * fifths of weeks belong between them. Stated as a constant because the page
 * has to print what was promised beside what happened — a coverage figure
 * with no target beside it is a number a reader cannot judge.
 */
export const CLAIMED_COVERAGE = 0.60;

export interface Calibration {
    overall: CalibrationRow | null;
    byPosition: CalibrationRow[];
    byHistory: CalibrationRow[];
    claimed: number;
}

export function coverageOf(row: CalibrationRow): number {
    return row.weeks > 0 ? row.inside / row.weeks : 0;
}

/** Sorted so a page can render without knowing the slicing scheme. */
export function shapeCalibration(rows: CalibrationRow[]): Calibration {
    const order = ['QB', 'RB', 'WR', 'TE'];
    return {
        overall: rows.find(r => r.kind === 'overall') ?? null,
        byPosition: rows.filter(r => r.kind === 'position')
            .sort((a, b) => order.indexOf(a.slice) - order.indexOf(b.slice)),
        byHistory: rows.filter(r => r.kind === 'history')
            .sort((a, b) => Number(a.slice.split('-')[0]) - Number(b.slice.split('-')[0])),
        claimed: CLAIMED_COVERAGE,
    };
}

/**
 * The bands the backtest reports history in.
 *
 * Chosen where the correction is steepest rather than evenly: the interval
 * needed half again its width at four or five games and a tenth more beyond
 * nine, so a reader looking for "is this trustworthy for a player I just
 * picked up" should find that band separated rather than averaged into a
 * season's worth of starters.
 */
export const HISTORY_BANDS: [number, number][] = [
    [4, 5], [6, 8], [9, 12], [13, 20], [21, 99],
];

export function bandFor(games: number): string | null {
    for (const [lo, hi] of HISTORY_BANDS) {
        if (games >= lo && games <= hi) return `${lo}-${hi}`;
    }
    return null;
}
