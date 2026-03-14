'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner'; // Assuming we have a toast library or use simple alert/console

export function DataRefresher() {
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        const runRefresh = async () => {
            console.log("Refreshing data...");
            try {
                await fetch('/api/refresh', { method: 'POST' });
                console.log("Data refresh triggered.");
            } catch (e) {
                console.error("Failed to trigger refresh", e);
            }
        };

        runRefresh();
    }, []);

    return null; // Invisible component
}
