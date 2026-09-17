'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { claimWorth, type ClaimWorth, type SeasonInput } from '@/lib/seasonOdds';
import type { LeagueRoster } from '@/lib/leagueRosters';

/**
 * What the best few waiver claims are worth to your season.
 *
 * Priced after the page has drawn, a claim at a time, and only for the few
 * the page is actually recommending. Each one is a full re-run of the
 * league's rest-of-season — about 190ms — and a waiver list is thirty rows
 * long, so pricing all of them would be six seconds of blocked main thread
 * to answer a question about twenty-five claims nobody is considering.
 *
 * Ordered by what the claim gains in points, which is the order the page
 * already ranks by: more points a week is never fewer points of playoff
 * odds for the same team, so the best claim by odds is inside the best few
 * by points. That makes this a cheap way to put a scale on the list rather
 * than a different ranking of it.
 *
 * Yielded between claims so the page stays responsive: a hundred and
 * ninety milliseconds is a dropped frame, and five of them back to back is
 * a page that has stopped answering.
 */

export interface ClaimValues {
    /** Player id to what claiming him is worth. */
    byPlayer: Map<number, ClaimWorth>;
    /** True while more are still being priced. */
    pricing: boolean;
}

export function useClaimWorth(
    input: SeasonInput | null,
    myKey: string | null,
    baseline: number | null | undefined,
    /** The claims to price, best first, each already resolved to a roster. */
    claims: { id: number; roster: LeagueRoster['roster'] }[],
    limit = 4,
): ClaimValues {
    const [byPlayer, setByPlayer] = useState<Map<number, ClaimWorth>>(new Map());
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
        const found = new Map<number, ClaimWorth>();
        let i = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const next = () => {
            if (cancelled || run.current !== mine) return;
            if (i >= wanted.length) {
                setPricing(false);
                return;
            }
            const c = wanted[i++];
            const worth = claimWorth(input, myKey, c.roster, baseline);
            if (worth) found.set(c.id, worth);
            // A new Map each time, so the page shows each claim as it lands
            // rather than all of them at the end.
            setByPlayer(new Map(found));
            timer = setTimeout(next, 0);
        };
        timer = setTimeout(next, 0);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
        // `input` is rebuilt on every render of the caller, so the effect is
        // keyed on what can actually change the answer rather than on its
        // identity — see `signature`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    return { byPlayer, pricing };
}
