'use client';

import { useState, useEffect, useCallback } from 'react';

const KEY = 'dynasty_drafted';
const EVENT = 'drafted-updated';

function readDrafted(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

/**
 * Shared localStorage-backed "marked drafted" state for the board — lets the
 * user track a live/mock rookie draft by toggling players off the board.
 * Same cross-tab + same-tab sync pattern as the watchlist.
 */
export function useDrafted() {
    const [drafted, setDrafted] = useState<Set<string>>(new Set());

    useEffect(() => {
        const refresh = () => setDrafted(new Set(readDrafted()));
        refresh();
        const onStorage = (e: StorageEvent) => { if (e.key === KEY) refresh(); };
        window.addEventListener(EVENT, refresh);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(EVENT, refresh);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    const toggle = useCallback((slug: string) => {
        const list = readDrafted();
        const next = list.includes(slug) ? list.filter(s => s !== slug) : [...list, slug];
        localStorage.setItem(KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(EVENT));
    }, []);

    const reset = useCallback(() => {
        localStorage.setItem(KEY, '[]');
        window.dispatchEvent(new Event(EVENT));
    }, []);

    return { drafted, toggle, reset };
}
