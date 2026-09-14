'use client';

import { useEffect, useState } from 'react';
import type { SosRow } from '@/lib/schedule';

/**
 * The league's remaining schedule, fetched once and shared.
 *
 * The same answer for every user, and a reader comparing two players on
 * different teams wants both at once — so it is one request for all
 * thirty-two teams rather than one per player.
 */
export interface ScheduleData {
    rest: SosRow[];
    playoffs: SosRow[];
    restWeeks: number[];
    playoffWeeks: number[];
    loading: boolean;
    failed: boolean;
}

interface Payload {
    rest: SosRow[]; playoffs: SosRow[];
    restWeeks: number[]; playoffWeeks: number[];
}

const cache = new Map<string, Payload>();
const inflight = new Map<string, Promise<Payload>>();

export function clearScheduleCache() {
    cache.clear();
    inflight.clear();
}

export function useSchedule(from: number | null, playoffWeek: number | null): ScheduleData {
    const key = `${from ?? 1}:${playoffWeek ?? 15}`;
    const [data, setData] = useState<Payload | null>(cache.get(key) ?? null);
    const [loading, setLoading] = useState(!cache.has(key));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const hit = cache.get(key);
        if (hit) { setData(hit); setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        const req = inflight.get(key) ?? fetch(
            `/api/redraft/schedule?from=${from ?? 1}&playoffWeek=${playoffWeek ?? 15}`)
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
    }, [key, from, playoffWeek]);

    return {
        rest: data?.rest ?? [], playoffs: data?.playoffs ?? [],
        restWeeks: data?.restWeeks ?? [], playoffWeeks: data?.playoffWeeks ?? [],
        loading, failed,
    };
}
