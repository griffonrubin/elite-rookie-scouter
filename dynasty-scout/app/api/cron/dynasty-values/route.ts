import { NextRequest, NextResponse } from 'next/server';
import { refreshDynastyValues } from '@/lib/dynastyValues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Dynasty values for every player and every pick, daily.
 *
 * Before this the only dynasty numbers in the database were the 2026 rookie
 * sources, last scraped in May — 127 days stale, across an entire draft and
 * offseason — and they covered the rookie class alone, so a trade involving
 * a veteran or a 2027 1st could not be priced at all.
 *
 * Auth mirrors the other crons: Vercel Cron sends VERCEL_CRON_SECRET as a
 * bearer token, and the check is skipped when the variable is not set.
 */
export async function GET(req: NextRequest) {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (process.env.VERCEL_CRON_SECRET && secret !== process.env.VERCEL_CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Nameable so a local database can be brought level with production
    // without pretending the rows were fetched today.
    const today = req.nextUrl.searchParams.get('date')
        ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        return NextResponse.json({ error: 'bad date' }, { status: 400 });
    }

    const out = await refreshDynastyValues(today);
    return NextResponse.json(out, { status: out.status === 'ok' ? 200 : 502 });
}
