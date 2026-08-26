'use client';

import { useState, useEffect, useCallback } from 'react';

const KEY = 'dynasty_drafted';
const EVENT = 'drafted-updated';

/** Redraft mode tracks its own drafted set so the two boards never collide. */
export const REDRAFT_DRAFTED_KEY = 'redraft_drafted';

function readDrafted(key: string): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const v = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

/**
 * Shared localStorage-backed "marked drafted" state for the board — lets the
 * user track a live/mock draft by toggling players off the board.
 * Same cross-tab + same-tab sync pattern as the watchlist.
 *
 * `storageKey` defaults to the rookie board's key; the redraft board passes
 * REDRAFT_DRAFTED_KEY so the two modes keep independent draft state.
 */
export function useDrafted(storageKey: string = KEY) {
    const [drafted, setDrafted] = useState<Set<string>>(new Set());

    useEffect(() => {
        const refresh = () => setDrafted(new Set(readDrafted(storageKey)));
        refresh();
        const onStorage = (e: StorageEvent) => { if (e.key === storageKey) refresh(); };
        window.addEventListener(EVENT, refresh);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(EVENT, refresh);
            window.removeEventListener('storage', onStorage);
        };
    }, [storageKey]);

    const toggle = useCallback((slug: string) => {
        const list = readDrafted(storageKey);
        const next = list.includes(slug) ? list.filter(s => s !== slug) : [...list, slug];
        localStorage.setItem(storageKey, JSON.stringify(next));
        window.dispatchEvent(new Event(EVENT));
    }, [storageKey]);

    const reset = useCallback(() => {
        localStorage.setItem(storageKey, '[]');
        window.dispatchEvent(new Event(EVENT));
    }, [storageKey]);

    return { drafted, toggle, reset };
}
