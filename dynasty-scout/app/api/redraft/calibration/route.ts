/**
 * How often the model's stated range has contained the answer.
 *
 * Read from a table rather than computed, because computing it is nine
 * thousand model runs. scripts/build_model_calibration fills it; this hands
 * it to the page that makes the claim.
 *
 * Missing is a legitimate answer. A clone that has not run the builder has
 * no table, and a page that says nothing about its accuracy is honest where
 * one that invents a number would not be — so this answers with nulls rather
 * than failing, and the page says it does not know.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { shapeCalibration, type CalibrationRow } from '@/lib/modelCalibration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    let rows: CalibrationRow[] = [];
    try {
        rows = await query<CalibrationRow>(
            `SELECT slice, kind, weeks, inside, below, above,
                    from_season, to_season, updated_at
               FROM model_calibration`, []);
    } catch {
        // No table, which is what a fresh clone looks like.
        return NextResponse.json({ overall: null, byPosition: [], byHistory: [],
            claimed: 0.60, measured: false });
    }
    return NextResponse.json({ ...shapeCalibration(rows), measured: rows.length > 0 });
}
