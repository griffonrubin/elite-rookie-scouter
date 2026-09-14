'use client';

import { useEffect, useState } from 'react';
import type { DefenceCell } from '@/lib/defence';

/**
 * Every defence's profile, fetched once for the whole session.
 *
 * It is the same answer for every user and every roster, it is a hundred and
 * twenty-eight small rows, and a reader comparing two flex plays wants two
 * of them at once. Fetching per opponent would make the common case two
 * requests and the interesting case eight, for data that does not change
 * between them.
 */
export interface DefenceData {
    cells: DefenceCell[];
    /** How many defences a rank is out of, rather than assuming thirty-two. */
    of: number;
    loading: boolean;
    failed: boolean;
}

interface Payload { cells: DefenceCell[]; of: number }

let cached: Payload | null = null;
let inflight: Promise<Payload> | null = null;

/** Drop it, so the reload button actually reloads. */
export function clearDefenceCache() {
    cached = null;
    inflight = null;
}

export function useDefence(nonce = 0): DefenceData {
    const [data, setData] = useState<Payload | null>(cached);
    const [loading, setLoading] = useState(!cached);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (nonce > 0) clearDefenceCache();
        if (cached) { setData(cached); setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        // One request in flight even when four components ask at once, which
        // they do: every open slot on the page wants the same table.
        inflight = inflight ?? fetch('/api/redraft/defense')
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
        inflight
            .then((d: Payload) => {
                cached = d;
                if (!cancelled) setData(d);
            })
            .catch(() => { inflight = null; if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [nonce]);

    return { cells: data?.cells ?? [], of: data?.of ?? 32, loading, failed };
}
