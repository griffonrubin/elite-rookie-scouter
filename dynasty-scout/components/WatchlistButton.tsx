'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    playerSlug: string;
    variant?: 'icon' | 'badge';
    className?: string;
}

export function WatchlistButton({ playerSlug, variant = 'icon', className }: Props) {
    const [isWatched, setIsWatched] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem('dynasty_watchlist');
        if (stored) {
            try {
                const list = JSON.parse(stored);
                if (Array.isArray(list) && list.includes(playerSlug)) {
                    setIsWatched(true);
                }
            } catch (e) { }
        }

        // Listen for cross-component updates
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'dynasty_watchlist') {
                try {
                    const newList = e.newValue ? JSON.parse(e.newValue) : [];
                    setIsWatched(Array.isArray(newList) && newList.includes(playerSlug));
                } catch { setIsWatched(false); }
            }
        };

        // Custom event for same-tab updates
        const handleLocalChange = () => {
            try {
                const current = JSON.parse(localStorage.getItem('dynasty_watchlist') || '[]');
                setIsWatched(Array.isArray(current) && current.includes(playerSlug));
            } catch { setIsWatched(false); }
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('watchlist-updated', handleLocalChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('watchlist-updated', handleLocalChange);
        };
    }, [playerSlug]);

    const toggleWatchlist = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const stored = localStorage.getItem('dynasty_watchlist');
        let list: string[] = [];
        try {
            if (stored) list = JSON.parse(stored);
        } catch (e) { }

        if (isWatched) {
            list = list.filter(slug => slug !== playerSlug);
        } else {
            list.push(playerSlug);
        }

        localStorage.setItem('dynasty_watchlist', JSON.stringify(list));
        setIsWatched(!isWatched);

        // Dispatch event so other components on the page update immediately
        window.dispatchEvent(new Event('watchlist-updated'));
    };

    if (!mounted) {
        // Return placeholder matching the size to avoid layout shift
        if (variant === 'badge') {
            return <div className={cn("invisible h-9 w-28", className)} />;
        }
        return <div className={cn("invisible w-5 h-5", className)} />;
    }

    if (variant === 'badge') {
        return (
            <button
                onClick={toggleWatchlist}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                    isWatched
                        ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/20"
                        : "bg-muted/30 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted/80",
                    className
                )}
            >
                <Star className={cn("w-3.5 h-3.5", isWatched && "fill-yellow-500")} />
                {isWatched ? 'Watched' : 'Watchlist'}
            </button>
        );
    }

    return (
        <button
            onClick={toggleWatchlist}
            className={cn(
                "flex items-center justify-center transition-all opacity-40 hover:opacity-100",
                isWatched && "opacity-100",
                className
            )}
            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
        >
            <Star className={cn("w-4 h-4", isWatched ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground")} />
        </button>
    );
}
