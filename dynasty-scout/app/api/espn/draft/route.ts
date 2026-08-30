import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only relay for an ESPN fantasy draft.
 *
 * Unlike Sleeper, ESPN sends no CORS headers, so a browser cannot call it at
 * all — this route is not a fallback, it is the only way in. It runs on our
 * server, forwards one GET, normalises the answer and stores nothing.
 *
 * Private leagues need the two cookies ESPN sets for a logged-in user. They
 * arrive as request headers rather than query parameters so they stay out of
 * URLs and access logs, are passed straight through to ESPN, and are never
 * written down: the browser holds them, exactly like the Sleeper draft id.
 */

const ESPN_HOST = 'https://lm-api-reads.fantasy.espn.com';

/** ESPN's proTeamId ordering, needed to resolve a D/ST pick to a team. */
const PRO_TEAM: Record<number, string> = {
    1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
    9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA',
    16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI',
    23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR',
    30: 'JAX', 33: 'BAL', 34: 'HOU',
};

/**
 * ESPN numbers team defenses as -16000 minus the proTeamId, so a negative
 * pick id is a D/ST and carries its team in the magnitude.
 */
function dstTeamFor(playerId: number): string | null {
    if (playerId > 0) return null;
    return PRO_TEAM[Math.abs(playerId) - 16000] ?? null;
}

export async function GET(req: NextRequest) {
    const leagueId = req.nextUrl.searchParams.get('leagueId') ?? '';
    const season = req.nextUrl.searchParams.get('season') ?? '2026';
    if (!/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season)) {
        return NextResponse.json({ error: 'bad leagueId or season' }, { status: 400 });
    }

    const swid = req.headers.get('x-espn-swid') ?? '';
    const s2 = req.headers.get('x-espn-s2') ?? '';
    const headers: Record<string, string> = {
        accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; DyCharts/1.0)',
    };
    if (swid && s2) headers.cookie = `SWID=${swid}; espn_s2=${s2}`;

    const url = `${ESPN_HOST}/apis/v3/games/ffl/seasons/${season}`
        + `/segments/0/leagues/${leagueId}?view=mDraftDetail&view=mSettings`;

    let res: Response;
    try {
        res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    } catch {
        return NextResponse.json({ error: 'espn unreachable' }, { status: 502 });
    }

    if (res.status === 401 || res.status === 403) {
        return NextResponse.json({
            error: 'private',
            message: 'This league is private. Add your ESPN SWID and espn_s2 cookies to connect.',
        }, { status: 403 });
    }
    if (res.status === 404) {
        return NextResponse.json({ error: 'not_found', message: 'No such league for that season.' }, { status: 404 });
    }
    if (!res.ok) {
        return NextResponse.json({ error: `espn ${res.status}` }, { status: 502 });
    }

    const data = await res.json().catch(() => null);
    const detail = data?.draftDetail;
    if (!detail) {
        return NextResponse.json({ error: 'no draft on this league' }, { status: 404 });
    }

    const rawPicks: any[] = Array.isArray(detail.picks) ? detail.picks : [];
    const picks = rawPicks
        // A pick with no player is a slot ESPN has created but not filled.
        .filter(p => typeof p?.playerId === 'number' && p.playerId !== 0)
        .map(p => ({
            playerId: String(p.playerId),
            dstTeam: dstTeamFor(p.playerId),
            overall: Number(p.overallPickNumber) || 0,
        }))
        .sort((a, b) => a.overall - b.overall);

    // Rounds are not reported directly: a draft fills every roster spot, so
    // the starters plus the bench are the round count. Injured reserve (slot
    // 21) is the one spot nobody drafts into.
    const settings = data?.settings ?? {};
    const roster: Record<string, unknown> = settings?.rosterSettings?.lineupSlotCounts ?? {};
    const rounds = Object.entries(roster).reduce<number>(
        (sum, [slot, n]) => sum + (slot !== '21' && typeof n === 'number' ? n : 0), 0);

    return NextResponse.json({
        // ESPN reports these two flags rather than a status string.
        status: detail.drafted ? 'complete' : detail.inProgress ? 'drafting' : 'pre_draft',
        name: settings?.name ?? null,
        teams: Number(settings?.size) || 10,
        snake: String(settings?.draftSettings?.type ?? 'SNAKE').toUpperCase() !== 'LINEAR',
        rounds: rounds > 0 ? rounds : 16,
        picks,
    }, { headers: { 'cache-control': 'no-store' } });
}
