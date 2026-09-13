'use client';

import { useEffect, useState } from 'react';
import type { ContingencyOut } from '@/app/api/redraft/successors/route';

/**
 * Who takes the work, for one roster, fetched once per roster.
 *
 * Keyed on the sorted ids rather than on the league, because two teams in
 * two leagues can hold the same men and the answer does not depend on which
 * league is asking. Switching back to a team already looked at is free.
 */
export interface SuccessorData {
    players: ContingencyOut[];
    fromSeason: number | null;
    minAbsence: number | null;
    loading: boolean;
    failed: boolean;
}

interface Payload {
    players: ContingencyOut[];
    fromSeason: number;
    minAbsence: number;
}

const cache = new Map<string, Payload>();
const inflight = new Map<string, Promise<Payload>>();

export function clearSuccessorCache() {
    cache.clear();
    inflight.clear();
}

export function useSuccessors(ids: number[]): SuccessorData {
    const key = [...ids].sort((a, b) => a - b).join(',');
    const [data, setData] = useState<Payload | null>(cache.get(key) ?? null);
    const [loading, setLoading] = useState(ids.length > 0 && !cache.has(key));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!key) { setData(null); setLoading(false); return; }
        const hit = cache.get(key);
        if (hit) { setData(hit); setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        const req = inflight.get(key) ?? fetch(`/api/redraft/successors?ids=${key}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
        inflight.set(key, req);
        req
            .then((d: Payload) => {
                cache.set(key, d);
                if (!cancelled) setData(d);
            })
            .catch(() => { inflight.delete(key); if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [key]);

    return {
        players: data?.players ?? [],
        fromSeason: data?.fromSeason ?? null,
        minAbsence: data?.minAbsence ?? null,
        loading, failed,
    };
}
