'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Player } from '@/lib/types';
import { PlayerMiniCard } from '@/components/PlayerMiniCard';
import { Input } from '@/components/ui/input';
import { Search, SlidersHorizontal, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Fuse from 'fuse.js';
import { useDebounce } from '@/hooks/useDebounce';
import { ViewModeSelector, ViewMode } from '@/components/ViewModeSelector';
import { WatchlistButton } from '@/components/WatchlistButton';
import { BoxView } from '@/components/BoxView';
import { HexView } from '@/components/HexView';

interface DraftBoardProps { players: Player[]; }
type SortKey = 'rank' | 'ktc' | 'sleeper' | 'fp' | 'proj';
type SortDir = 'asc' | 'desc';

const TIERS = [
    { label: 'S Tier', minRank: 1, maxRank: 5, accent: '#FF6B00', bg: 'rgba(255,107,0,0.08)', border: 'rgba(255,107,0,0.3)' },
    { label: 'A Tier', minRank: 6, maxRank: 12, accent: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)' },
    { label: 'B Tier', minRank: 13, maxRank: 24, accent: '#00b4d8', bg: 'rgba(0,180,216,0.07)', border: 'rgba(0,180,216,0.25)' },
    { label: 'C Tier', minRank: 25, maxRank: 48, accent: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.25)' },
    { label: 'Depth', minRank: 49, maxRank: 9999, accent: '#6b7280', bg: 'rgba(107,114,128,0.05)', border: 'rgba(107,114,128,0.2)' },
];
function getTierForRank(rank: number) {
    return TIERS.find(t => rank >= t.minRank && rank <= t.maxRank) ?? TIERS[TIERS.length - 1];
}

// Sortable column header — NO all:unset, so flex-1 from className works correctly
function SortHeader({ label, subLabel, sortKey, currentSort, currentDir, onSort }: {
    label: string; subLabel?: string; sortKey: SortKey;
    currentSort: SortKey; currentDir: SortDir; onSort: (k: SortKey) => void;
}) {
    const active = currentSort === sortKey;
    return (
        <button
            onClick={() => onSort(sortKey)}
            className="flex-1 flex flex-col items-center justify-center cursor-pointer select-none bg-transparent border-0 p-0 gap-0 group"
        >
            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest leading-none transition-colors ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                {label}
                {active
                    ? (currentDir === 'asc'
                        ? <ChevronUp className="w-3.5 h-3.5 text-primary" />
                        : <ChevronDown className="w-3.5 h-3.5 text-primary" />)
                    : <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground" />}
            </div>
            {subLabel && (
                <div className={`text-[9px] leading-none mt-0.5 ${active ? 'text-primary/70' : 'text-muted-foreground/50'}`}>
                    {subLabel}
                </div>
            )}
        </button>
    );
}

function DraftBoardContent({ players }: DraftBoardProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const [positionFilter, setPositionFilter] = useState(searchParams.get('position') || 'ALL');
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [sortKey, setSortKey] = useState<SortKey>('rank');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const debouncedSearch = useDebounce(searchQuery, 300);

    useEffect(() => {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (positionFilter !== 'ALL') params.set('position', positionFilter);
        router.replace(`/?${params.toString()}`, { scroll: false });
    }, [debouncedSearch, positionFilter, router]);

    const fuse = useMemo(() => new Fuse(players || [], {
        keys: ['full_name', 'position', 'school'], threshold: 0.3,
    }), [players]);

    function handleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    }

    const filteredPlayers = useMemo(() => {
        let result = players || [];
        if (searchQuery.trim()) result = fuse.search(searchQuery).map(r => r.item);
        if (positionFilter !== 'ALL') result = result.filter(p => p.position === positionFilter);
        return [...result].sort((a, b) => {
            const MISS = sortDir === 'asc' ? 999999 : -999999;
            let va: number, vb: number;
            switch (sortKey) {
                case 'ktc': va = (a as any).ktc_rank ?? MISS; vb = (b as any).ktc_rank ?? MISS; break;
                case 'sleeper': va = (a as any).sleeper_adp ?? MISS; vb = (b as any).sleeper_adp ?? MISS; break;
                case 'fp': va = (a as any).fantasypros_rank ?? MISS; vb = (b as any).fantasypros_rank ?? MISS; break;
                case 'rank':
                default: va = (a as any).consensus_rank ?? MISS; vb = (b as any).consensus_rank ?? MISS;
            }
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }, [searchQuery, positionFilter, players, fuse, sortKey, sortDir]);

    const counts = useMemo(() => {
        const all = players || [];
        return {
            QB: all.filter(p => p.position === 'QB').length,
            RB: all.filter(p => p.position === 'RB').length,
            WR: all.filter(p => p.position === 'WR').length,
            TE: all.filter(p => p.position === 'TE').length,
        };
    }, [players]);

    // Show tier banners whenever sorted by rank asc and no search query (regardless of position filter)
    const showTiers = sortKey === 'rank' && sortDir === 'asc' && !searchQuery.trim();

    return (
        <div className="space-y-0">
            {/* ── Controls ── */}
            <div className="flex flex-col gap-2.5 mb-4">
                {/* Row 1: Search (own row so it can't be flex-compressed) + toolbar controls */}
                <div className="flex items-center gap-3">
                    {/* Search — independent block, guaranteed 280px */}
                    <div style={{ position: 'relative', width: '280px', minWidth: '280px', flexShrink: 0 }}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" style={{ zIndex: 1 }} />
                        <input
                            placeholder="Search players, schools..."
                            style={{
                                width: '280px', paddingLeft: '2.25rem', height: '36px',
                                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / 0.6)',
                                borderRadius: '0.5rem', fontSize: '0.875rem', color: 'hsl(var(--foreground))',
                                outline: 'none', boxSizing: 'border-box',
                            }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={(e) => { e.target.style.borderColor = 'hsl(var(--primary))'; e.target.style.boxShadow = '0 0 0 3px hsl(var(--primary) / 0.18)'; }}
                            onBlur={(e) => { e.target.style.borderColor = 'hsl(var(--border) / 0.6)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>
                    <ViewModeSelector mode={viewMode} onChange={setViewMode} />
                    <div className="flex items-center gap-1.5 ml-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by:</span>
                        <Select value={sortKey} onValueChange={(v: SortKey) => { setSortKey(v); setSortDir('asc'); }}>
                            <SelectTrigger className="w-[130px] h-9 bg-card border-border/60 text-xs px-3">
                                <SelectValue>
                                    {sortKey === 'rank' ? 'Consensus' : sortKey === 'ktc' ? 'KTC Dyn' : 'FantasyPros'}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="rank">Consensus</SelectItem>
                                <SelectItem value="ktc">KTC Dyn</SelectItem>
                                <SelectItem value="fp">FantasyPros</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>


                {/* Position pills — ALL shows filteredPlayers.length (live count) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {(['ALL', 'QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                        const active = positionFilter === pos;
                        // ALL shows the live filtered count; position pills show their static total
                        const displayCount = pos === 'ALL'
                            ? filteredPlayers.length
                            : counts[pos as keyof typeof counts];
                        const posMap: Record<string, { active: string; inactive: string }> = {
                            ALL: { active: 'bg-[#FF6B00] text-white border-[#FF6B00]', inactive: 'text-muted-foreground border-border/60 hover:border-[#FF6B00]/50 hover:text-[#FF6B00]' },
                            QB: { active: 'bg-cyan-500/40 text-cyan-100 border-cyan-500', inactive: 'text-muted-foreground border-border/60 hover:border-cyan-500/40 hover:text-cyan-400' },
                            RB: { active: 'bg-emerald-500/40 text-emerald-100 border-emerald-500', inactive: 'text-muted-foreground border-border/60 hover:border-emerald-500/40 hover:text-emerald-400' },
                            WR: { active: 'bg-fuchsia-500/40 text-fuchsia-100 border-fuchsia-500', inactive: 'text-muted-foreground border-border/60 hover:border-fuchsia-500/40 hover:text-fuchsia-400' },
                            TE: { active: 'bg-violet-500/40 text-violet-100 border-violet-500', inactive: 'text-muted-foreground border-border/60 hover:border-violet-500/40 hover:text-violet-400' },
                        };
                        return (
                            <button
                                key={pos}
                                onClick={() => setPositionFilter(pos)}
                                style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1, gap: 4 }}
                                className={`border transition-all duration-150 ${active ? posMap[pos].active : posMap[pos].inactive}`}
                            >
                                {pos} <span style={{ opacity: active ? 1 : 0.6 }}>{displayCount}</span>
                            </button>
                        );
                    })}

                    {/* Live count indicator — updates when filter/search changes */}
                    {(positionFilter !== 'ALL' || searchQuery.trim()) && (
                        <span className="text-[11px] text-muted-foreground ml-2">
                            Showing <span className="text-foreground font-semibold">{filteredPlayers.length}</span> of <span className="text-foreground font-semibold">{(players || []).length}</span> players
                        </span>
                    )}
                </div>
            </div>

            {/* ── Table View ── */}
            {viewMode === 'table' && (
                <div className="bg-card rounded-xl border border-border/60 overflow-hidden shadow-lg shadow-black/20">

                    {/* Column headers — each stat col is flex-1, mirrors PlayerMiniCard exactly */}
                    <div className="flex items-stretch px-4 py-0 border-b border-border/40 bg-muted/30 gap-3 min-h-[40px]">
                        {/* Rank — sortable */}
                        <div className="w-16 flex-shrink-0 flex flex-col items-center justify-center">
                            <button
                                onClick={() => handleSort('rank')}
                                className="flex items-center justify-center cursor-pointer group bg-transparent border-0"
                            >
                                <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-0.5 ${sortKey === 'rank' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                    RANK
                                    {sortKey === 'rank'
                                        ? (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)
                                        : <ChevronsUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-50" />}
                                </span>
                            </button>
                        </div>

                        {/* Player — fixed 180px, not sortable */}
                        <div style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }}
                            className="flex-shrink-0 flex items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Player
                        </div>

                        {/* Stat columns — each is flex-1 inside a single flex-1 container */}
                        <div className="hidden lg:flex flex-1 items-stretch">
                            {/* Measurables — not sortable */}
                            <div className="flex-1 flex items-center pl-4 border-l border-border/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Measurables
                            </div>
                            {/* Sortable stat headers — each is flex-1 button */}
                            <SortHeader label="FP" subLabel="Devy" sortKey="fp" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                            <SortHeader label="KTC" subLabel="Dyn" sortKey="ktc" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                            <SortHeader label="Dynasty" subLabel="ADP" sortKey="proj" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                            {/* Tier — not sortable */}
                            <div className="flex-1 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Tier
                            </div>
                        </div>
                    </div>

                    {filteredPlayers.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground text-sm">No players found.</div>
                    ) : (
                        (() => {
                            let lastTierLabel = '';
                            // Pre-compute tier boundary min/max from actual data
                            const tierBounds: Record<string, { first: number; last: number }> = {};
                            const tierCounts: Record<string, Record<string, number>> = {};
                            filteredPlayers.forEach((p, i) => {
                                const r = (p as any).consensus_rank ?? (i + 1);
                                const t = getTierForRank(r);
                                if (!tierBounds[t.label]) tierBounds[t.label] = { first: r, last: r };
                                else tierBounds[t.label].last = r;

                                if (!tierCounts[t.label]) tierCounts[t.label] = { QB: 0, RB: 0, WR: 0, TE: 0 };
                                tierCounts[t.label][p.position] = (tierCounts[t.label][p.position] || 0) + 1;
                            });
                            return filteredPlayers.map((player, index) => {
                                const rank = player.consensus?.rank_overall ?? (index + 1);
                                const tier = getTierForRank(rank);
                                const showTierHeader = showTiers && tier.label !== lastTierLabel;
                                if (showTierHeader) lastTierLabel = tier.label;
                                const bounds = tierBounds[tier.label];
                                return (
                                    <div key={player.id}>
                                        {showTierHeader && (
                                            <div
                                                className="flex items-center gap-3 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.15em] shadow-sm mb-1 mt-2"
                                                style={{ background: tier.accent, color: '#000', borderRadius: '4px' }}
                                            >
                                                <span>{tier.label}</span>
                                                <span className="opacity-60 font-bold">
                                                    {/* When not filtered, use the canonical tier constant ranges (reliable).
                                                        When position-filtered, use dynamic bounds from actual member ranks. */}
                                                    {positionFilter === 'ALL'
                                                        ? (tier.maxRank < 9999 ? `— Ranks ${tier.minRank}–${tier.maxRank}` : `— Ranks ${tier.minRank}+`)
                                                        : bounds && bounds.first === bounds.last
                                                            ? `— Rank ${bounds.first}`
                                                            : `— Ranks ${bounds?.first ?? tier.minRank}–${bounds?.last ?? tier.maxRank}`
                                                    }
                                                    {tierCounts[tier.label] && <span className="ml-3 font-normal tracking-normal text-[10px] opacity-75 hidden sm:inline-block">
                                                        · {Object.entries(tierCounts[tier.label]).filter(([_, c]) => c > 0).map(([pos, c]) => `${pos}×${c}`).join(' ')}
                                                    </span>}
                                                </span>
                                            </div>
                                        )}
                                        <PlayerMiniCard
                                            player={player}
                                            ranking={{
                                                id: 0, player_id: player.id, calculated_at: '',
                                                rank_overall: player.consensus?.rank_overall ?? (index + 1),
                                                avg_rank: player.consensus?.avg_rank ?? undefined,
                                                best_rank: player.consensus?.best_rank ?? undefined,
                                                worst_rank: player.consensus?.worst_rank ?? undefined,
                                                num_sources: (player as any).num_sources ?? 0,
                                                rank_change_1d: player.consensus?.rank_change_1d ?? 0,
                                                rank_change_7d: player.consensus?.rank_change_7d ?? 0,
                                                rank_change_30d: player.consensus?.rank_change_30d ?? 0,
                                            }}
                                            period={"1d"}
                                            index={index}
                                        />
                                    </div>
                                );
                            });
                        })()
                    )}
                </div>
            )}

            {viewMode === 'box' && <BoxView players={filteredPlayers} period={"1d"} />}
            {viewMode === 'hex' && <HexView players={filteredPlayers} period={"1d"} />}
        </div>
    );
}

export function DraftBoard(props: DraftBoardProps) {
    return (
        <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm animate-pulse">Loading board…</div>}>
            <DraftBoardContent {...props} />
        </Suspense>
    );
}
