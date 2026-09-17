'use client';

import { useEffect, useMemo } from 'react';
import { useStartSitData } from '@/lib/useStartSit';
import { useLeagueFixtures } from '@/lib/useLeagueFixtures';
import { idsIn, leagueRosters, lineupSlotsOf } from '@/lib/leagueRosters';
import { seasonOdds, type SeasonInput, type SeasonOdds } from '@/lib/seasonOdds';
import type { LeagueSyncState } from '@/lib/useLeagueSync';
import type { Horizon } from '@/lib/simInput';
import type { RedraftPlayer } from '@/lib/types';

/**
 * The league's season, for whichever page asks.
 *
 * Two pages want it and they must not each have their own: the Power page
 * shows the odds and the Start/Sit page prices a lineup decision against
 * them, so a second run of the same simulation is two pages quoting
 * different numbers for one thing.
 *
 * The cost is honest about itself. Pricing every roster in the league
 * means fetching every rostered player, which is a page's worth of data
 * that Start/Sit has no other use for — so it is fetched after everything
 * that does not depend on it has already rendered, and the number appears
 * when it is ready rather than holding up the lineup somebody came to set.
 * Both the player rows and the result are cached for the session, so
 * whichever page a reader lands on second pays nothing.
 */

/** Where the regular season ends when the platform will not say. */
export const DEFAULT_PLAYOFF_WEEK = 15;

interface Cached { key: string; value: SeasonOdds }
let last: Cached | null = null;

export function clearSeasonOddsCache() {
    last = null;
}

export interface SeasonOddsState extends Partial<SeasonOdds> {
    /** Null until every roster has been priced. */
    value: SeasonOdds | null;
    /**
     * Exactly what the run above was given.
     *
     * Handed back so a caller pricing a variant — a waiver claim, a trade —
     * re-runs the same league rather than assembling its own. The player
     * rows in particular are league-wide and fetched by this hook; a page
     * that built its own `SeasonInput` from whatever it happened to have
     * would be ranking a league most of whose rosters it could not price.
     */
    input: SeasonInput | null;
    loading: boolean;
    failed: boolean;
    /** The week being played next. */
    week: number;
}

export function useSeasonOdds(
    league: LeagueSyncState,
    players: RedraftPlayer[],
    opts: { horizon?: Horizon; season: number; enabled?: boolean } ,
): SeasonOddsState {
    const { season, horizon = 'season', enabled = true } = opts;
    const snapshot = league.snapshot;
    const week = league.week ?? 1;

    const teams = useMemo(
        () => (enabled ? leagueRosters(snapshot, players, league.connection?.platform) : null),
        [enabled, snapshot, league.connection?.platform, players]);
    const slots = useMemo(() => lineupSlotsOf(snapshot), [snapshot]);
    const needed = useMemo(() => idsIn(teams), [teams]);

    const { data, loading, failed } = useStartSitData(needed, enabled ? week : null);
    const games = useLeagueFixtures(league);

    const remaining = Math.max(0,
        (snapshot?.playoffWeekStart ?? DEFAULT_PLAYOFF_WEEK) - week);
    const cut = snapshot?.playoffTeams
        ?? Math.max(2, Math.round((teams?.length ?? 12) / 2));
    const scoring = snapshot?.scoring ?? null;
    const scoringKey = `${scoring?.reception ?? 1}:${scoring?.teReceptionBonus ?? 0}`;

    const ready = enabled && !!teams && needed.length > 0 && data.size > 0 && !failed;

    const input: SeasonInput | null = useMemo(() => {
        if (!ready || !teams) return null;
        return {
            teams, slots, players, data, season, horizon, scoring, games,
            week, remaining, cut,
        };
    }, [ready, teams, slots, players, data, season, horizon, scoring, games,
        week, remaining, cut]);

    /**
     * The cache is read during render and written after it.
     *
     * Assigning a module-level variable while rendering is a side effect in
     * the middle of a pure function — it works until a render is discarded
     * or replayed, and then the cache holds a result nobody is showing.
     * Reading it in render is fine; the write belongs in an effect.
     */
    const key = [
        league.connection?.platform, league.connection?.id, week, horizon,
        scoringKey, cut, remaining, needed.length, data.size, games?.length ?? 0,
    ].join('|');
    const cached = last?.key === key ? last.value : null;

    const value = useMemo(() => {
        if (cached) return cached;
        if (!ready || !teams) return null;
        return seasonOdds({
            teams, slots, players, data, season, horizon, scoring, games,
            week, remaining, cut,
        });
    }, [cached, ready, teams, slots, players, data, season, horizon, scoring,
        games, week, remaining, cut]);

    useEffect(() => {
        if (value) last = { key, value };
    }, [key, value]);

    return {
        value,
        input,
        loading: enabled && (loading || (!value && !failed)),
        failed,
        week,
        ...(value ?? {}),
    };
}
