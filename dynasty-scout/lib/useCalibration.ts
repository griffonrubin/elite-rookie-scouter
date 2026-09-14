'use client';

import { useEffect, useState } from 'react';
import type { Calibration } from '@/lib/modelCalibration';

/**
 * The model's measured accuracy, fetched once for the session.
 *
 * The same answer for every reader and it changes when a season lands, so
 * one request and a module-level cache is the whole of it.
 */
export interface CalibrationData extends Calibration {
    measured: boolean;
    loading: boolean;
}

let cache: (Calibration & { measured: boolean }) | null = null;
let inflight: Promise<Calibration & { measured: boolean }> | null = null;

export function useCalibration(): CalibrationData {
    const [data, setData] = useState(cache);
    const [loading, setLoading] = useState(!cache);

    useEffect(() => {
        if (cache) { setData(cache); setLoading(false); return; }
        let cancelled = false;
        const req = inflight ?? fetch('/api/redraft/calibration')
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
        inflight = req;
        req
            .then(d => { cache = d; if (!cancelled) setData(d); })
            .catch(() => { inflight = null; })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    return {
        overall: data?.overall ?? null,
        byPosition: data?.byPosition ?? [],
        byHistory: data?.byHistory ?? [],
        claimed: data?.claimed ?? 0.60,
        measured: data?.measured ?? false,
        loading,
    };
}
