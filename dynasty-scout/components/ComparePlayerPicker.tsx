'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Scale, X } from 'lucide-react';

interface PlayerResult {
    slug: string;
    full_name: string;
    position: string;
    school: string;
}

interface ComparePlayerPickerProps {
    currentSlugA?: string;
    currentSlugB?: string;
    currentNameA?: string;
    currentNameB?: string;
    /** Search endpoint — redraft mode passes its own pool-scoped route. */
    apiPath?: string;
    /** Where picking a player navigates to. */
    comparePath?: string;
}

function usePlayerSearch(query: string, apiPath: string) {
    const [results, setResults] = useState<PlayerResult[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!query.trim() || query.length < 2) { setResults([]); return; }
        const controller = new AbortController();
        setLoading(true);
        fetch(`${apiPath}?q=${encodeURIComponent(query)}&limit=8`, { signal: controller.signal })
            .then(r => r.json())
            .then(data => { setResults(data || []); setLoading(false); })
            .catch(() => setLoading(false));
        return () => controller.abort();
    }, [query, apiPath]);

    return { results, loading };
}

function PlayerSlot({
    label,
    slugKey,
    currentSlug,
    currentName,
    otherSlug,
    apiPath,
    comparePath,
}: {
    label: string;
    slugKey: 'a' | 'b';
    currentSlug?: string;
    currentName?: string;
    otherSlug?: string;
    apiPath: string;
    comparePath: string;
}) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const { results } = usePlayerSearch(query, apiPath);

    const select = (slug: string) => {
        setOpen(false);
        setQuery('');
        const params = new URLSearchParams();
        if (slugKey === 'a') {
            params.set('a', slug);
            if (otherSlug) params.set('b', otherSlug);
        } else {
            params.set('b', slug);
            if (otherSlug) params.set('a', otherSlug);
        }
        router.push(`${comparePath}?${params.toString()}`);
    };

    return (
        <div className="relative flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>
            {currentSlug && !open ? (
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
                    <span className="text-sm font-bold text-foreground flex-1 truncate">{currentName || currentSlug}</span>
                    <button
                        onClick={() => { setOpen(true); setQuery(''); }}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Change player"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        autoFocus={open}
                        placeholder="Search player name..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onFocus={(e: any) => { setOpen(true); e.target.style.borderColor = 'hsl(var(--primary) / 0.5)'; }}
                        style={{
                            width: '100%', paddingLeft: '2.25rem', height: '38px',
                            background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
                            borderRadius: '0.5rem', fontSize: '0.875rem', color: 'hsl(var(--foreground))',
                            outline: 'none', boxSizing: 'border-box',
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'hsl(var(--border))';
                            setTimeout(() => setOpen(false), 150);
                        }}
                    />
                    {open && results.length > 0 && (
                        <div className="absolute z-50 top-full mt-1 left-0 min-w-[280px] w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                            {results.map(p => (
                                <button
                                    key={p.slug}
                                    onMouseDown={() => select(p.slug)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/10 transition-colors text-left"
                                >
                                    <span className="text-[10px] font-bold text-muted-foreground w-6 shrink-0">{p.position}</span>
                                    <span className="text-sm font-semibold text-foreground flex-1">{p.full_name}</span>
                                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{p.school}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function ComparePlayerPicker({
    currentSlugA, currentSlugB, currentNameA, currentNameB,
    apiPath = '/api/players/search',
    comparePath = '/compare',
}: ComparePlayerPickerProps) {
    return (
        <div className="bg-card border border-border/60 rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-4 sm:mb-8">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                <span className="text-xs sm:text-sm font-bold text-foreground">Compare Players</span>
                <span className="text-[10px] sm:text-[11px] text-muted-foreground hidden sm:inline">Search to change either player</span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2 sm:gap-4">
                <PlayerSlot
                    label="Player A"
                    slugKey="a"
                    currentSlug={currentSlugA}
                    currentName={currentNameA}
                    otherSlug={currentSlugB}
                    apiPath={apiPath}
                    comparePath={comparePath}
                />
                <div className="flex items-center justify-center py-0.5 sm:pt-7 sm:py-0">
                    <span className="text-sm sm:text-lg font-black text-muted-foreground/40">vs</span>
                </div>
                <PlayerSlot
                    label="Player B"
                    slugKey="b"
                    currentSlug={currentSlugB}
                    currentName={currentNameB}
                    otherSlug={currentSlugA}
                    apiPath={apiPath}
                    comparePath={comparePath}
                />
            </div>
        </div>
    );
}
