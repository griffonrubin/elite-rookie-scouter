'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ContingencyOut, InheritanceOut } from '@/app/api/redraft/successors/route';

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

/**
 * The same measurement read backwards, for a list of free agents.
 *
 * Separate from `useSuccessors` rather than a flag on it because the two are
 * asked by different pages about different men and would share no cache
 * entry anyway: a roster is a dozen ids that barely change, a waiver pool is
 * sixty that change with every claim in the league.
 */
export interface InheritanceData {
    /** Only the men who inherit from somebody; the rest are simply absent. */
    byPlayer: Map<number, InheritanceOut['from']>;
    loading: boolean;
    failed: boolean;
}

interface InheritPayload {
    players: InheritanceOut[];
}

const inheritCache = new Map<string, InheritPayload>();
const inheritInflight = new Map<string, Promise<InheritPayload>>();

export function clearInheritanceCache() {
    inheritCache.clear();
    inheritInflight.clear();
}

export function useInheritance(ids: number[]): InheritanceData {
    const key = [...ids].sort((a, b) => a - b).join(',');
    const [data, setData] = useState<InheritPayload | null>(inheritCache.get(key) ?? null);
    const [loading, setLoading] = useState(ids.length > 0 && !inheritCache.has(key));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!key) { setData(null); setLoading(false); return; }
        const hit = inheritCache.get(key);
        if (hit) { setData(hit); setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        const req = inheritInflight.get(key)
            ?? fetch(`/api/redraft/successors?inherits=${key}`)
                .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
        inheritInflight.set(key, req);
        req
            .then((d: InheritPayload) => {
                inheritCache.set(key, d);
                if (!cancelled) setData(d);
            })
            .catch(() => { inheritInflight.delete(key); if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [key]);

    const byPlayer = useMemo(() => {
        const out = new Map<number, InheritanceOut['from']>();
        for (const p of data?.players ?? []) out.set(p.playerId, p.from);
        return out;
    }, [data]);

    return { byPlayer, loading, failed };
}
