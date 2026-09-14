'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_STARTSIT_IDS } from '@/lib/startSit';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';

/**
 * The week's data for a set of players, fetched once per player.
 *
 * Four pages had their own copy of this effect — chunk the ids, fire the
 * requests, merge the rows, handle the failure — and copies drift. One of
 * them chunked at a hundred against an endpoint that caps at eighty, so a
 * request came back a 400 nobody read and Power Rankings ranked a
 * twelve-team league off the seven players that survived. There is now one
 * copy, and it reads the endpoint's own limit rather than a number that
 * looked about right.
 *
 * It also caches, which matters more than it sounds. Every In Season page
 * asks about the same league, so walking from the power table to the trade
 * page to team analysis refetched the same hundred and seventy players three
 * times over — twenty requests to Sleeper and two thirds of a megabyte for
 * four navigations. The cache is per player, per week, per detail level, so
 * a page wanting a hundred and seventy when another has already fetched a
 * hundred and seven asks for the sixty-three it is missing and nothing else.
 */

interface Entry {
    player: StartSitPlayer;
    /** True when this row carries the full box score. */
    detail: boolean;
}

/**
 * Module-level, so it survives a client-side navigation.
 *
 * Deliberately not localStorage: projections, injury reports and game lines
 * move during a day, and a cache that outlived the tab would serve Sunday
 * morning's lines on Sunday afternoon. A reload is a refresh.
 */
const cache = new Map<string, Entry>();
const keyOf = (id: number, week: number) => `${id}:${week}`;

/** Drop everything, so the reload button actually reloads. */
export function clearStartSitCache() {
    cache.clear();
}

/** How many rows are held, for tests that assert the cache is working. */
export function startSitCacheSize() {
    return cache.size;
}

export interface StartSitData {
    /** Rows for every id that came back, cached ones included. */
    data: Map<number, StartSitPlayer>;
    loading: boolean;
    /**
     * True when a request failed.
     *
     * Worth surfacing rather than swallowing: a page that ranks a league
     * against half of it is not giving a partial answer, it is giving a
     * wrong one.
     */
    failed: boolean;
}

/** Everything the cache can serve for this request. */
function collect(
    wanted: number[], week: number, detail: boolean,
): Map<number, StartSitPlayer> {
    const m = new Map<number, StartSitPlayer>();
    for (const id of wanted) {
        const hit = cache.get(keyOf(id, week));
        if (hit && (!detail || hit.detail)) m.set(id, hit.player);
    }
    return m;
}

export function useStartSitData(
    ids: number[],
    week: number | null,
    opts: { detail?: boolean; nonce?: number } = {},
): StartSitData {
    const detail = opts.detail ?? false;
    const nonce = opts.nonce ?? 0;
    const [data, setData] = useState<Map<number, StartSitPlayer>>(new Map());
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const lastNonce = useRef(nonce);

    // Deduplicated and sorted, so a reordered id list is not a new request.
    // Not memoised: joining a hundred and seventy numbers is cheaper than
    // the bookkeeping, and it is the dependency the effect actually wants.
    const signature = [...new Set(ids)].sort((a, b) => a - b).join(',');

    useEffect(() => {
        // A new nonce means the reader pressed reload. Cleared here rather
        // than in an effect of its own, which would run after this one and
        // throw away the rows it had just fetched.
        if (lastNonce.current !== nonce) {
            cache.clear();
            lastNonce.current = nonce;
        }
        if (signature === '' || week == null) { setData(new Map()); return; }
        const wanted = signature.split(',').map(Number);
        // A detail row satisfies a slim request; a slim row does not satisfy
        // a detail one, because the box score is the point of asking.
        const missing = wanted.filter(id => {
            const hit = cache.get(keyOf(id, week));
            return !hit || (detail && !hit.detail);
        });
        // Whatever is already held is served immediately and without a flash
        // of "loading" — the reader waited for this league once already.
        setData(collect(wanted, week, detail));
        if (missing.length === 0) {
            setLoading(false);
            setFailed(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        const chunks: number[][] = [];
        for (let i = 0; i < missing.length; i += MAX_STARTSIT_IDS) {
            chunks.push(missing.slice(i, i + MAX_STARTSIT_IDS));
        }
        Promise.all(chunks.map(c =>
            fetch(`/api/redraft/startsit?ids=${c.join(',')}&week=${week}`
                + (detail ? '&detail=1' : ''))
                .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))))
            .then((rs: { players: StartSitPlayer[] }[]) => {
                if (cancelled) return;
                for (const r of rs) {
                    for (const p of r.players ?? []) {
                        cache.set(keyOf(p.id, week), { player: p, detail });
                    }
                }
                setData(collect(wanted, week, detail));
            })
            .catch(() => { if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [signature, week, detail, nonce]);

    return { data, loading, failed };
}
