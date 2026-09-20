'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type ClaimWorth, type SeasonInput } from '@/lib/seasonOdds';
import { epochOf, runChange } from '@/lib/seasonWorkerClient';
import type { LeagueRoster } from '@/lib/leagueRosters';

/**
 * What the best few roster changes are worth to your season.
 *
 * A waiver claim replaces one roster and a trade replaces two, so an item
 * carries its own list of replacements rather than a single roster. The
 * pricing is identical either way, which is the point: a claim and an
 * offer come back on one scale and can be compared.
 *
 * Priced after the page has drawn, a claim at a time, and only for the few
 * the page is actually recommending. Each one is a full re-run of the
 * league's rest-of-season, and a waiver list is thirty rows long, so
 * pricing all of them would be a question about twenty-five claims nobody
 * is considering.
 *
 * Ordered by what the claim gains in points, which is the order the page
 * already ranks by: more points a week is never fewer points of playoff
 * odds for the same team, so the best claim by odds is inside the best few
 * by points. That makes this a cheap way to put a scale on the list rather
 * than a different ranking of it.
 *
 * The runs themselves happen in the season worker, one after another, so
 * the page stays responsive throughout rather than between claims — and
 * because the worker is already holding this league, each claim costs the
 * rosters it changes rather than a hundred and seventy players' game logs
 * sent again.
 */

export interface ClaimValues {
    /** The item's own id to what making that change is worth. */
    byPlayer: Map<string | number, ClaimWorth>;
    /** True while more are still being priced. */
    pricing: boolean;
}

export function useClaimWorth(
    input: SeasonInput | null,
    myKey: string | null,
    baseline: number | null | undefined,
    /**
     * The changes to price, best first, each already resolved to the
     * rosters it would leave behind. One entry for a waiver claim, two for
     * a trade.
     */
    claims: { id: string | number;
              overrides: { key: string; roster: LeagueRoster['roster'] }[] }[],
    limit = 4,
): ClaimValues {
    const [byPlayer, setByPlayer] =
        useState<Map<string | number, ClaimWorth>>(new Map());
    const [pricing, setPricing] = useState(false);
    /** Identity of the request, so a stale run cannot publish its answer. */
    const run = useRef(0);

    const wanted = useMemo(
        () => claims.slice(0, limit), [claims, limit]);
    const signature = wanted.map(c => c.id).join(',')
        + `|${myKey}|${input?.week}|${input?.remaining}|${input?.cut}`
        + `|${input?.teams.length}|${baseline ?? ''}`;

    useEffect(() => {
        if (!input || !myKey || wanted.length === 0 || input.remaining <= 0) {
            setByPlayer(new Map());
            setPricing(false);
            return;
        }
        const mine = ++run.current;
        // A local flag rather than the ref in the cleanup: by the time
        // cleanup runs the ref has moved on, so reading it there is reading
        // somebody else's state.
        let cancelled = false;
        setPricing(true);
        const found = new Map<string | number, ClaimWorth>();
        let i = 0;

        const epoch = epochOf(input);
        const next = async () => {
            if (cancelled || run.current !== mine) return;
            if (i >= wanted.length) {
                setPricing(false);
                return;
            }
            const c = wanted[i++];
            const worth = await runChange(
                epoch, input, myKey, c.overrides, baseline ?? null);
            if (cancelled || run.current !== mine) return;
            if (worth) found.set(c.id, worth);
            // A new Map each time, so the page shows each claim as it lands
            // rather than all of them at the end.
            setByPlayer(new Map(found));
            void next();
        };
        void next();
        return () => { cancelled = true; };
        // `input` is rebuilt on every render of the caller, so the effect is
        // keyed on what can actually change the answer rather than on its
        // identity — see `signature`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    return { byPlayer, pricing };
}
