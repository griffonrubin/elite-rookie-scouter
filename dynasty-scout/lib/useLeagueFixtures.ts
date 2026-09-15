'use client';

import { useEffect, useState } from 'react';
import { fixturesFrom, getLeagueSchedule } from '@/lib/sleeper';
import type { LeagueGame } from '@/lib/leagueSchedule';
import type { LeagueSyncState } from '@/lib/useLeagueSync';

/**
 * A league's fixture list, fetched only by the page that needs one.
 *
 * The two platforms cost wildly different amounts here and the difference
 * decides the shape of this hook. ESPN sends the whole season inside the
 * payload the league route already fetches, so its fixtures are free and
 * arrive with the snapshot. Sleeper publishes no schedule endpoint at all —
 * the schedule is the matchup groupings, one week at a time — so a fixture
 * list is one request per week.
 *
 * Fourteen requests is a fine price for the page that ranks a run home and
 * an absurd one for the four pages that do not, which is what putting this
 * inside the snapshot did: Start/Sit, Waivers and Team Analysis all waited
 * on a schedule none of them reads. So it is asked for here instead, after
 * the page has already rendered everything that does not depend on it, and
 * cached for the session because a schedule does not change.
 */

/** League id to fixtures, for the life of the tab. A schedule is fixed. */
const cache = new Map<string, LeagueGame[]>();
const inFlight = new Map<string, Promise<LeagueGame[]>>();

export function clearFixtureCache() {
    cache.clear();
    inFlight.clear();
}

export function useLeagueFixtures(league: LeagueSyncState): LeagueGame[] | null {
    const snapshot = league.snapshot;
    const platform = league.connection?.platform ?? null;
    const id = league.connection?.id ?? null;
    /**
     * Where the regular season ends, which is where a fixture list stops
     * being fixtures. The weeks after it are a bracket decided by the
     * seeding these are used to project, so asking for them would feed the
     * answer back into the question.
     */
    const lastRegular = (snapshot?.playoffWeekStart ?? 0) > 1
        ? (snapshot!.playoffWeekStart as number) - 1
        : 14;

    const fromSnapshot = snapshot?.games ?? null;
    const [games, setGames] = useState<LeagueGame[] | null>(fromSnapshot);

    useEffect(() => {
        if (fromSnapshot?.length) { setGames(fromSnapshot); return; }
        if (platform !== 'sleeper' || !id) { setGames(null); return; }

        const hit = cache.get(id);
        if (hit) { setGames(hit); return; }

        let live = true;
        const pending = inFlight.get(id)
            ?? getLeagueSchedule(id, lastRegular)
                .then(fixturesFrom)
                .then(rows => { cache.set(id, rows); inFlight.delete(id); return rows; })
                .catch(() => { inFlight.delete(id); return [] as LeagueGame[]; });
        inFlight.set(id, pending);
        pending.then(rows => { if (live) setGames(rows); });
        return () => { live = false; };
    }, [fromSnapshot, platform, id, lastRegular]);

    return games;
}
