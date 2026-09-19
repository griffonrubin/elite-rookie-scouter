'use client';

import { useEffect, useMemo, useState } from 'react';
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

    /**
     * Every roster is priced, or none is.
     *
     * `data.size > 0` alone is true the moment the first chunk of a
     * hundred and seventy players lands, and the run that follows ranks
     * twelve teams off the third of the league it can see — then does it
     * again for the next chunk, and again for the last. Three wrong
     * answers and three long tasks where one right answer belongs.
     * `loading` is false only once every chunk is in.
     */
    const ready = enabled && !!teams && needed.length > 0
        && data.size > 0 && !loading && !failed;

    const input: SeasonInput | null = useMemo(() => {
        if (!ready || !teams) return null;
        return {
            teams, slots, players, data, season, horizon, scoring, games,
            week, remaining, cut,
        };
    }, [ready, teams, slots, players, data, season, horizon, scoring, games,
        week, remaining, cut]);

    /**
     * Read during render, computed after it.
     *
     * The fetch was always deferred — the league's players arrive long
     * after the page does — but the simulation was not: it ran inside a
     * memo, so the render that had the data also paid for ranking twelve
     * rosters twenty thousand times. Measured on Start/Sit, that took the
     * wall clock from picking a team to seeing the board from 481ms to
     * 864ms, with a 423ms task blocking the main thread in the middle of
     * it. The board is the thing somebody came for; the season strip is
     * not, and it has no business delaying it.
     *
     * So the work is handed to a macrotask. The page commits and paints
     * with `value` still null, the simulation runs, and the strip appears
     * when it is ready. It still costs what it costs — but it costs it
     * after the reader has what they asked for.
     */
    const key = [
        league.connection?.platform, league.connection?.id, week, horizon,
        scoringKey, cut, remaining, needed.length, data.size, games?.length ?? 0,
    ].join('|');
    const cached = last?.key === key ? last.value : null;
    const [computed, setComputed] = useState<Cached | null>(null);

    useEffect(() => {
        if (cached || !ready || !teams) return;
        let live = true;
        const timer = setTimeout(() => {
            if (!live) return;
            const value_ = seasonOdds({
                teams, slots, players, data, season, horizon, scoring, games,
                week, remaining, cut,
            });
            last = { key, value: value_ };
            setComputed({ key, value: value_ });
        }, 0);
        return () => { live = false; clearTimeout(timer); };
        // Keyed on what can change the answer rather than on the identity of
        // objects this hook rebuilds on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, cached, ready]);

    const value = cached ?? (computed?.key === key ? computed.value : null);

    return {
        value,
        input,
        loading: enabled && (loading || (!value && !failed)),
        failed,
        week,
        ...(value ?? {}),
    };
}
