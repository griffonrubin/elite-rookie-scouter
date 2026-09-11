import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only relay for an ESPN league's rosters and weekly matchups.
 *
 * The sibling of /api/espn/draft, for the same reason: ESPN sends no CORS
 * headers, so this is not a fallback but the only way in. It forwards one
 * GET and stores nothing.
 *
 * Private leagues need the two cookies a signed-in browser holds. They
 * arrive as request headers rather than query parameters so they stay out of
 * URLs and access logs, and are never written down on our side.
 */

const ESPN_HOST = 'https://lm-api-reads.fantasy.espn.com';

/** ESPN numbers a team defense as -16000 minus the proTeamId. */
const PRO_TEAM: Record<number, string> = {
    1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
    9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA',
    16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI',
    23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR',
    30: 'JAX', 33: 'BAL', 34: 'HOU',
};

function dstTeamFor(playerId: number): string | null {
    if (playerId > 0) return null;
    return PRO_TEAM[Math.abs(playerId) - 16000] ?? null;
}

/**
 * ESPN's lineup slot ids. Anything above 20 is bench or injured reserve,
 * which is what separates a starter from a roster spot.
 */
const BENCH_SLOTS = new Set([20, 21]);

interface Entry {
    playerId: string;
    dstTeam: string | null;
    name: string | null;
    slotId: number;
    starting: boolean;
}

function readEntries(team: any): Entry[] {
    const entries = team?.roster?.entries ?? [];
    return entries.map((e: any) => {
        const id = Number(e?.playerId);
        return {
            playerId: String(id),
            dstTeam: dstTeamFor(id),
            name: e?.playerPoolEntry?.player?.fullName ?? null,
            slotId: Number(e?.lineupSlotId ?? 20),
            starting: !BENCH_SLOTS.has(Number(e?.lineupSlotId ?? 20)),
        };
    });
}

export async function GET(req: NextRequest) {
    const leagueId = req.nextUrl.searchParams.get('leagueId') ?? '';
    const season = req.nextUrl.searchParams.get('season') ?? '2026';
    const week = req.nextUrl.searchParams.get('week') ?? '';
    if (!/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season)
        || (week && !/^\d{1,2}$/.test(week))) {
        return NextResponse.json({ error: 'bad leagueId, season or week' }, { status: 400 });
    }

    const swid = req.headers.get('x-espn-swid') ?? '';
    const s2 = req.headers.get('x-espn-s2') ?? '';
    const headers: Record<string, string> = {
        accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; DyCharts/1.0)',
    };
    if (swid && s2) headers.cookie = `SWID=${swid}; espn_s2=${s2}`;

    const views = ['mRoster', 'mTeam', 'mSettings', 'mMatchup'].map(v => `view=${v}`).join('&');
    const url = `${ESPN_HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`
        + `?${views}${week ? `&scoringPeriodId=${week}` : ''}`;

    let res: Response;
    try {
        res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
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
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (!res.ok) return NextResponse.json({ error: `espn ${res.status}` }, { status: 502 });

    const data = await res.json().catch(() => null);
    const teams = Array.isArray(data?.teams) ? data.teams : [];
    if (teams.length === 0) {
        return NextResponse.json({ error: 'no teams on this league' }, { status: 404 });
    }

    // One schedule entry per game; each names the two teams by id.
    const scoringPeriod = Number(data?.scoringPeriodId ?? week ?? 0) || null;
    const pairs: Record<number, number> = {};
    for (const g of data?.schedule ?? []) {
        if (scoringPeriod && Number(g?.matchupPeriodId) !== scoringPeriod) continue;
        const home = Number(g?.home?.teamId), away = Number(g?.away?.teamId);
        if (home && away) { pairs[home] = away; pairs[away] = home; }
    }

    return NextResponse.json({
        name: data?.settings?.name ?? null,
        week: scoringPeriod,
        teams: teams.map((t: any) => ({
            teamId: Number(t?.id),
            name: [t?.location, t?.nickname].filter(Boolean).join(' ').trim()
                || t?.name || `Team ${t?.id}`,
            opponentTeamId: pairs[Number(t?.id)] ?? null,
            entries: readEntries(t),
        })),
    }, { headers: { 'cache-control': 'no-store' } });
}
