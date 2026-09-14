/**
 * Every defence in the league, and what it gives up.
 *
 * One response for all thirty-two, because it is the same answer for every
 * user and every roster — the same reason the start/sit endpoint caches its
 * own copy — and because a reader comparing two flex plays is looking at two
 * different defences at once. Fetching per opponent would make the common
 * case two requests and the interesting case eight.
 *
 * Read from the weekly player table rather than scraped: every row already
 * carries the opponent, so a defence's season is the same games read from
 * the other side.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rankDefences } from '@/lib/defence';
import { defenceCount, loadDefenceTotals } from '@/lib/defenceTotals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEASON = 2026;

export async function GET(_req: NextRequest) {
    const totals = await loadDefenceTotals(SEASON);
    return NextResponse.json({
        season: SEASON,
        /** How many defences a rank is out of, so the page never guesses. */
        of: defenceCount(totals),
        cells: rankDefences(totals),
    });
}
