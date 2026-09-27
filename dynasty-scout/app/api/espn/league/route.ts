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

/**
 * ESPN's lineup slots, in the names the rest of this app uses.
 *
 * The slot ids are stable and public; the names are ours. Only the offensive
 * ones are here because only those get filled from the redraft pool — an IDP
 * league's linebackers would come back as a slot nothing can be assigned to,
 * which is a larger job than renaming a number.
 *
 * Slot 7 is ESPN's "OP", an offensive player, and is the superflex slot: it
 * takes a quarterback, which is the whole reason the distinction matters to
 * a replacement level.
 */
const ESPN_SLOT_NAMES: Record<number, string> = {
    0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'DST', 17: 'K',
    23: 'FLEX', 7: 'SUPER_FLEX', 3: 'WRRB_FLEX', 5: 'REC_FLEX',
};

/**
 * ESPN's stat id for a reception.
 *
 * Fifty-three, which is documented and stable, and the only term this reads.
 * A league that pays something other than a point for it has every number in
 * this app overstated on everyone who catches passes, and that is one lookup
 * away from being right.
 *
 * Tight-end premium is deliberately not attempted here. ESPN expresses it as
 * a position override inside the same scoring item rather than as its own
 * term, and guessing at that shape without a payload to check against is how
 * a correction becomes a new fault.
 */
const ESPN_RECEPTION_STAT = 53;

/** The starting lineup as a list of slot names, longest leagues included. */
export function rosterPositionsFrom(counts: Record<string, number> | null | undefined): string[] | null {
    if (!counts) return null;
    const out: string[] = [];
    for (const [id, n] of Object.entries(counts)) {
        const name = ESPN_SLOT_NAMES[Number(id)];
        if (!name) continue;                       // bench, IR, or a slot we do not fill
        for (let i = 0; i < Math.min(Number(n) || 0, 12); i++) out.push(name);
    }
    return out.length ? out : null;
}

/** Points per catch, when the league says so and not otherwise. */
export function receptionPointsFrom(items: any[] | null | undefined): number | null {
    if (!Array.isArray(items)) return null;
    const rec = items.find(i => Number(i?.statId) === ESPN_RECEPTION_STAT);
    const pts = Number(rec?.points);
    return Number.isFinite(pts) ? pts : null;
}

interface Entry {
    playerId: string;
    dstTeam: string | null;
    name: string | null;
    slotId: number;
    /**
     * And what that slot is called, so the client does not need ESPN's id
     * table to lay out a lineup. Null for the bench, injured reserve, and
     * anything this pool cannot fill.
     */
    slotName: string | null;
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
            slotName: ESPN_SLOT_NAMES[Number(e?.lineupSlotId ?? 20)] ?? null,
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
    const regularWeeks = Number(data?.settings?.scheduleSettings?.matchupPeriodCount) || null;
    const pairs: Record<number, number> = {};
    /**
     * The whole regular season's fixtures, which this route already had and
     * was throwing away.
     *
     * Every entry of `schedule` was being filtered down to the current week
     * for the one thing the page asked of it — who you play now — and the
     * other sixteen weeks discarded. They are the answer to whether a run
     * home is hard and whether a record was earned, and no other source has
     * them: a league's schedule exists only on its platform.
     *
     * Playoff rounds are excluded. They are not fixtures in the sense meant
     * here — a bracket is decided by the seeding this is trying to predict,
     * so feeding it back in would be circular.
     */
    const games: {
        week: number; home: string; away: string;
        homePoints: number | null; awayPoints: number | null;
    }[] = [];
    for (const g of data?.schedule ?? []) {
        const home = Number(g?.home?.teamId), away = Number(g?.away?.teamId);
        if (!home || !away) continue;
        const period = Number(g?.matchupPeriodId);
        if (scoringPeriod && period === scoringPeriod) {
            pairs[home] = away; pairs[away] = home;
        }
        if (!Number.isFinite(period) || period < 1) continue;
        if (regularWeeks && period > regularWeeks) continue;
        const tier = g?.playoffTierType;
        if (tier && tier !== 'NONE') continue;
        const pts = (side: { totalPoints?: unknown } | null | undefined) => {
            const v = Number(side?.totalPoints);
            return Number.isFinite(v) ? v : null;
        };
        games.push({
            week: period,
            home: String(home), away: String(away),
            homePoints: pts(g?.home), awayPoints: pts(g?.away),
        });
    }

    return NextResponse.json({
        name: data?.settings?.name ?? null,
        week: scoringPeriod,
        /** Every regular-season fixture, scores included where played. */
        games,
        /**
         * The first week that is no longer the regular season.
         *
         * Needed so "rest of season" is a number of weeks rather than a
         * mood. ESPN counts regular-season matchup periods; the playoffs
         * start the week after the last of them.
         */
        playoffWeekStart: data?.settings?.scheduleSettings?.matchupPeriodCount != null
            ? Number(data.settings.scheduleSettings.matchupPeriodCount) + 1
            : null,
        /** How many teams make the playoffs, which is where the cut is. */
        playoffTeams: data?.settings?.scheduleSettings?.playoffTeamCount != null
            ? Number(data.settings.scheduleSettings.playoffTeamCount)
            : null,
        /**
         * Divisions, reported rather than modelled.
         *
         * ESPN names them; the seeding rule that goes with them is a
         * separate setting, and the simulation plays a single table. The
         * pages say so rather than printing odds that quietly assume a
         * league has one table when it has four divisions.
         */
        divisions: Array.isArray(data?.settings?.scheduleSettings?.divisions)
            && data.settings.scheduleSettings.divisions.length > 1
            ? data.settings.scheduleSettings.divisions.length
            : null,
        /**
         * The shape of a lineup here, which decides replacement level.
         *
         * Sleeper leagues have sent this for a while and ESPN ones never
         * did, so an ESPN superflex league was still being measured against
         * a one-quarterback replacement — every claimable quarterback
         * reading as far below startable in a league that starts two.
         */
        rosterPositions: rosterPositionsFrom(
            data?.settings?.rosterSettings?.lineupSlotCounts),
        /**
         * And what it pays per catch, for the same reason: every stored
         * number is full PPR, and an ESPN half-PPR league was being shown a
         * six-catch receiver three points a week clear of where its own
         * scoring has him.
         */
        receptionPoints: receptionPointsFrom(
            data?.settings?.scoringSettings?.scoringItems),
        teams: teams.map((t: any) => ({
            teamId: Number(t?.id),
            name: [t?.location, t?.nickname].filter(Boolean).join(' ').trim()
                || t?.name || `Team ${t?.id}`,
            opponentTeamId: pairs[Number(t?.id)] ?? null,
            /**
             * What has happened so far, which the Sleeper path has sent from
             * the start and this one never did.
             *
             * Power Rankings exists to separate a roster from its results —
             * three-and-nothing with the sixth-best roster is a fact about
             * the schedule — and without a record there is nothing to set the
             * ranking against. The page simply had less to say to an ESPN
             * league and did not mention it.
             */
            record: t?.record?.overall ? {
                wins: Number(t.record.overall.wins ?? 0),
                losses: Number(t.record.overall.losses ?? 0),
                ties: Number(t.record.overall.ties ?? 0),
                pointsFor: Number(t.record.overall.pointsFor ?? 0),
                pointsAgainst: Number(t.record.overall.pointsAgainst ?? 0),
            } : null,
            entries: readEntries(t),
        })),
    }, { headers: { 'cache-control': 'no-store' } });
}
