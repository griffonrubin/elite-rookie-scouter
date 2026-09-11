import { NextRequest, NextResponse } from 'next/server';
import { refreshRankingSources } from '@/lib/redraftSources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Refresh FantasyPros, FantasyCalc and KeepTradeCut on demand.
 *
 * The work lives in lib/redraftSources so the daily projections cron can run
 * it on a schedule without this route claiming a scheduled slot of its own.
 * This exists for the times you want it now rather than tomorrow — and for
 * ?rows=1, which returns the matched rows so a local database can be brought
 * level without a scrape.
 *
 * Auth mirrors the other crons — Vercel Cron sends VERCEL_CRON_SECRET as a
 * bearer token, and the check is skipped when the variable is not set.
 */
export async function GET(req: NextRequest) {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (process.env.VERCEL_CRON_SECRET && secret !== process.env.VERCEL_CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // The caller may be mirroring these rows into another database, so it has
    // to be able to name the date rather than take whatever day this is.
    const today = req.nextUrl.searchParams.get('date')
        ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        return NextResponse.json({ error: 'bad date' }, { status: 400 });
    }

    const out = await refreshRankingSources(
        today, req.nextUrl.searchParams.get('rows') === '1');
    return NextResponse.json(out, { status: out.status === 'ok' ? 200 : 502 });
}
