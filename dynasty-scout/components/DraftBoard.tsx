'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Player } from '@/lib/types';
import { PlayerMiniCard } from '@/components/PlayerMiniCard';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Star } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Fuse from 'fuse.js';
import { useDebounce } from '@/hooks/useDebounce';
import { ViewModeSelector, ViewMode } from '@/components/ViewModeSelector';
import { BoxView } from '@/components/BoxView';
import { HexView } from '@/components/HexView';
import { getColDefs, getGridTemplate, SortKey } from '@/lib/boardColumns';

interface DraftBoardProps { players: Player[]; }
type SortDir = 'asc' | 'desc';

const TIERS = [
    { label: 'S Tier', minRank: 1,  maxRank: 5,    accent: '#FF6B00', bg: 'rgba(255,107,0,0.08)',   border: 'rgba(255,107,0,0.3)'   },
    { label: 'A Tier', minRank: 6,  maxRank: 12,   accent: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.3)'   },
    { label: 'B Tier', minRank: 13, maxRank: 24,   accent: '#00b4d8', bg: 'rgba(0,180,216,0.07)',   border: 'rgba(0,180,216,0.25)'  },
    { label: 'C Tier', minRank: 25, maxRank: 48,   accent: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.25)' },
    { label: 'D Tier', minRank: 49, maxRank: 80,   accent: '#f59e0b', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.25)' },
    { label: 'Depth',  minRank: 81, maxRank: 9999, accent: '#6b7280', bg: 'rgba(107,114,128,0.05)', border: 'rgba(107,114,128,0.2)' },
];
function getTierForRank(rank: number) {
    return TIERS.find(t => rank >= t.minRank && rank <= t.maxRank) ?? TIERS[TIERS.length - 1];
}

function DraftBoardContent({ players }: DraftBoardProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [searchQuery, setSearchQuery]     = useState(searchParams.get('q') || '');
    const [positionFilter, setPositionFilter] = useState(searchParams.get('position') || 'ALL');
    const [viewMode, setViewMode]           = useState<ViewMode>('table');
    const [sortKey, setSortKey]             = useState<SortKey>('rank');
    const [sortDir, setSortDir]             = useState<SortDir>('asc');
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [watchlist, setWatchlist]         = useState<string[]>([]);

    // Load watchlist from localStorage on mount and keep in sync
    useEffect(() => {
        const load = () => {
            try {
                const stored = JSON.parse(localStorage.getItem('dynasty_watchlist') || '[]');
                if (Array.isArray(stored)) setWatchlist(stored);
            } catch { setWatchlist([]); }
        };
        load();
        window.addEventListener('watchlist-updated', load);
        window.addEventListener('storage', load);
        return () => {
            window.removeEventListener('watchlist-updated', load);
            window.removeEventListener('storage', load);
        };
    }, []);

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

    // Higher = better for these — default to desc when first clicked
    const DEFAULT_DESC: SortKey[] = ['ras', 'height', 'arm', 'hand', 'stars', 'spd', 'dom', 'scrim_ypg', 'pass_ypg', 'comp_pct', 'ypa', 'ypr', 'ypc'];

    function handleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir(DEFAULT_DESC.includes(key) ? 'desc' : 'asc'); }
    }

    const filteredPlayers = useMemo(() => {
        let result = players || [];
        if (searchQuery.trim()) result = fuse.search(searchQuery).map(r => r.item);
        if (positionFilter !== 'ALL') result = result.filter(p => p.position === positionFilter);
        if (favoritesOnly) result = result.filter(p => watchlist.includes(p.slug));
        return [...result].sort((a, b) => {
            const MISS = sortDir === 'asc' ? 999999 : -999999;
            let va: number, vb: number;
            switch (sortKey) {
                case 'ktc':    va = (a as any).ktc_rank          ?? MISS; vb = (b as any).ktc_rank          ?? MISS; break;
                case 'sleeper':va = (a as any).sleeper_adp        ?? MISS; vb = (b as any).sleeper_adp        ?? MISS; break;
                case 'fp':     va = (a as any).fantasypros_rank   ?? MISS; vb = (b as any).fantasypros_rank   ?? MISS; break;
                case 'fc':     va = (a as any).fantasycalc_rank   ?? MISS; vb = (b as any).fantasycalc_rank   ?? MISS; break;
                case 'dn':     va = (a as any).dynasty_nerds_rank ?? MISS; vb = (b as any).dynasty_nerds_rank ?? MISS; break;
                case 'forty':    va = (a as any).forty_yard         ?? MISS; vb = (b as any).forty_yard         ?? MISS; break;
                case 'spd':      va = (a as any).speed_score        ?? MISS; vb = (b as any).speed_score        ?? MISS; break;
                case 'ras':      va = (a as any).ras                ?? MISS; vb = (b as any).ras                ?? MISS; break;
                case 'height':   va = (a as any).height_inches      ?? MISS; vb = (b as any).height_inches      ?? MISS; break;
                case 'arm':      va = (a as any).arm_length         ?? MISS; vb = (b as any).arm_length         ?? MISS; break;
                case 'hand':     va = (a as any).hand_size          ?? MISS; vb = (b as any).hand_size          ?? MISS; break;
                case 'stars':    va = (a as any).recruiting_stars   ?? MISS; vb = (b as any).recruiting_stars   ?? MISS; break;
                case 'dom':      va = (a as any).best_dominator     ?? MISS; vb = (b as any).best_dominator     ?? MISS; break;
                case 'pass_ypg': va = (a as any).best_pass_ypg      ?? MISS; vb = (b as any).best_pass_ypg      ?? MISS; break;
                case 'comp_pct': va = (a as any).career_pass_att > 0 ? (a as any).career_completions / (a as any).career_pass_att : MISS;
                                 vb = (b as any).career_pass_att > 0 ? (b as any).career_completions / (b as any).career_pass_att : MISS; break;
                case 'ypa':      va = (a as any).career_pass_att > 0 ? (a as any).career_pass_yards / (a as any).career_pass_att : MISS;
                                 vb = (b as any).career_pass_att > 0 ? (b as any).career_pass_yards / (b as any).career_pass_att : MISS; break;
                case 'scrim_ypg':va = (a as any).career_games_cs > 0 ? (a as any).career_scrim_yards / (a as any).career_games_cs : MISS;
                                 vb = (b as any).career_games_cs > 0 ? (b as any).career_scrim_yards / (b as any).career_games_cs : MISS; break;
                case 'ypr':      va = (a as any).best_ypr           ?? MISS; vb = (b as any).best_ypr           ?? MISS; break;
                case 'ypc':      va = (a as any).best_ypc           ?? MISS; vb = (b as any).best_ypc           ?? MISS; break;
                case 'rank':
                default:       va = (a as any).consensus_rank     ?? MISS; vb = (b as any).consensus_rank     ?? MISS;
            }
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }, [searchQuery, positionFilter, favoritesOnly, watchlist, players, fuse, sortKey, sortDir]);

    const counts = useMemo(() => {
        const all = players || [];
        return {
            QB: all.filter(p => p.position === 'QB').length,
            RB: all.filter(p => p.position === 'RB').length,
            WR: all.filter(p => p.position === 'WR').length,
            TE: all.filter(p => p.position === 'TE').length,
        };
    }, [players]);

    const showTiers = sortKey === 'rank' && sortDir === 'asc' && !searchQuery.trim() && !favoritesOnly;
    const colDefs = getColDefs(positionFilter);
    const gridTemplate = getGridTemplate(positionFilter);

    return (
        <div className="space-y-0">
            {/* ── Controls ── */}
            <div className="flex flex-col gap-3" style={{ marginBottom: '18px' }}>
                {/* Row 1: Search + view mode + sort */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div style={{ position: 'relative', width: '280px', minWidth: '220px', flexShrink: 0 }}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" style={{ zIndex: 1 }} />
                        <input
                            placeholder="Search players, schools..."
                            style={{
                                width: '100%', paddingLeft: '2.25rem', height: '36px',
                                background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / 0.6)',
                                borderRadius: '0.5rem', fontSize: '0.875rem', color: 'hsl(var(--foreground))',
                                outline: 'none', boxSizing: 'border-box',
                            }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={(e) => { e.target.style.borderColor = 'hsl(var(--primary))'; e.target.style.boxShadow = '0 0 0 3px hsl(var(--primary) / 0.18)'; }}
                            onBlur={(e)  => { e.target.style.borderColor = 'hsl(var(--border) / 0.6)'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>
                    <ViewModeSelector mode={viewMode} onChange={setViewMode} />
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort:</span>
                        <Select value={sortKey} onValueChange={(v: SortKey) => { setSortKey(v); setSortDir(DEFAULT_DESC.includes(v as SortKey) ? 'desc' : 'asc'); }}>
                            <SelectTrigger className="w-[180px] bg-card border-border/60 text-xs" style={{ height: '34px', paddingLeft: '14px', paddingRight: '14px', gap: '10px' }}>
                                <SelectValue>
                                    {{ rank: 'Consensus', ktc: 'KTC', sleeper: 'Sleeper', fp: 'FantasyPros', fc: 'FantasyCalc', dn: 'DynNerds', forty: '40yd Dash', spd: 'Speed Score', ras: 'RAS Score', height: 'Height', arm: 'Arm Length', hand: 'Hand Size', stars: 'Recruit ★', dom: 'Dom%', scrim_ypg: 'Scrim/G', pass_ypg: 'Pass/G', comp_pct: 'Comp%', ypa: 'YPA', ypr: 'Yds/Rec', ypc: 'YPC' }[sortKey] ?? 'Consensus'}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="rank">Consensus</SelectItem>
                                <SelectItem value="ktc">KTC Dynasty</SelectItem>
                                <SelectItem value="fp">FantasyPros</SelectItem>
                                <SelectItem value="fc">FantasyCalc</SelectItem>
                                <SelectItem value="dn">DynastyNerds</SelectItem>
                                <SelectItem value="forty">40yd Dash</SelectItem>
                                <SelectItem value="spd">Speed Score</SelectItem>
                                <SelectItem value="ras">RAS Score</SelectItem>
                                <SelectItem value="height">Height</SelectItem>
                                <SelectItem value="arm">Arm Length</SelectItem>
                                <SelectItem value="hand">Hand Size</SelectItem>
                                <SelectItem value="stars">Recruit Stars</SelectItem>
                                <SelectItem value="dom">Dominator %</SelectItem>
                                <SelectItem value="scrim_ypg">Scrim Yds/G</SelectItem>
                                <SelectItem value="pass_ypg">Pass Yds/G</SelectItem>
                                <SelectItem value="comp_pct">Comp %</SelectItem>
                                <SelectItem value="ypa">Yds/Attempt</SelectItem>
                                <SelectItem value="ypr">Yds/Reception</SelectItem>
                                <SelectItem value="ypc">Yds/Carry</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Row 2: Position pills + Favorites filter */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {(['ALL', 'QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                        const active = positionFilter === pos;
                        const displayCount = pos === 'ALL' ? filteredPlayers.length : counts[pos as keyof typeof counts];
                        const posMap: Record<string, { active: string; inactive: string }> = {
                            ALL: { active: 'bg-[#FF6B00] text-white border-[#FF6B00]',                       inactive: 'text-muted-foreground border-border/60 hover:border-[#FF6B00]/50 hover:text-[#FF6B00]' },
                            QB:  { active: 'bg-cyan-500/40 text-cyan-100 border-cyan-500',                    inactive: 'text-muted-foreground border-border/60 hover:border-cyan-500/40 hover:text-cyan-400' },
                            RB:  { active: 'bg-emerald-500/40 text-emerald-100 border-emerald-500',           inactive: 'text-muted-foreground border-border/60 hover:border-emerald-500/40 hover:text-emerald-400' },
                            WR:  { active: 'bg-fuchsia-500/40 text-fuchsia-100 border-fuchsia-500',           inactive: 'text-muted-foreground border-border/60 hover:border-fuchsia-500/40 hover:text-fuchsia-400' },
                            TE:  { active: 'bg-violet-500/40 text-violet-100 border-violet-500',              inactive: 'text-muted-foreground border-border/60 hover:border-violet-500/40 hover:text-violet-400' },
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

                    {/* Favorites filter pill */}
                    <button
                        onClick={() => setFavoritesOnly(f => !f)}
                        style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1, gap: 5 }}
                        className={`border transition-all duration-150 ${
                            favoritesOnly
                                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/60'
                                : 'text-muted-foreground border-border/60 hover:border-yellow-500/40 hover:text-yellow-400'
                        }`}
                    >
                        <Star className={`w-3 h-3 ${favoritesOnly ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        Favs
                        {watchlist.length > 0 && <span style={{ opacity: favoritesOnly ? 1 : 0.6 }}>{watchlist.length}</span>}
                    </button>

                    {(positionFilter !== 'ALL' || searchQuery.trim() || favoritesOnly) && (
                        <span className="text-[11px] text-muted-foreground ml-1">
                            Showing <span className="text-foreground font-semibold">{filteredPlayers.length}</span> of <span className="text-foreground font-semibold">{(players || []).length}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* ── Table View ── */}
            {viewMode === 'table' && (
                <div className="bg-card rounded-xl border border-border/60 shadow-lg shadow-black/20">

                    {/* Column headers — sticky below the app header bar (h-14 = 56px) */}
                    <div className="flex items-stretch px-4 py-0 border-b border-border/40 bg-card gap-3 min-h-[40px] sticky top-14 z-20 rounded-t-xl"
                         style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
                        {/* Rank */}
                        <div className="w-16 flex-shrink-0 flex items-center justify-center">
                            <button
                                onClick={() => handleSort('rank')}
                                className="flex items-center gap-0.5 cursor-pointer group bg-transparent border-0"
                            >
                                <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-0.5 ${sortKey === 'rank' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                    RANK
                                    {sortKey === 'rank'
                                        ? (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)
                                        : <ChevronsUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-50" />}
                                </span>
                            </button>
                        </div>

                        {/* Player */}
                        <div style={{ width: '220px', minWidth: '220px' }}
                            className="flex-shrink-0 flex items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Player
                        </div>

                        {/* Dynamic stat columns — CSS grid, same template as PlayerMiniCard */}
                        <div
                            className="hidden lg:grid flex-1 min-w-0"
                            style={{ gridTemplateColumns: gridTemplate }}
                        >
                            {colDefs.map((col, i) => (
                                <div
                                    key={col.key}
                                    className={`flex items-center justify-center min-h-[40px] ${i === 0 ? 'border-l border-border/30' : ''}`}
                                    title={col.tooltip}
                                >
                                    {col.sortKey ? (
                                        <button
                                            onClick={() => handleSort(col.sortKey!)}
                                            className="flex flex-col items-center justify-center cursor-pointer select-none bg-transparent border-0 p-0 gap-0 group w-full"
                                        >
                                            <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest leading-none transition-colors ${sortKey === col.sortKey ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                                {col.label}
                                                {sortKey === col.sortKey
                                                    ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />)
                                                    : <ChevronsUpDown className="w-2.5 h-2.5 text-muted-foreground/50 group-hover:text-muted-foreground" />}
                                            </div>
                                            {col.subLabel && (
                                                <div className={`text-[9px] leading-none mt-0.5 ${sortKey === col.sortKey ? 'text-primary/70' : 'text-muted-foreground/50'}`}>
                                                    {col.subLabel}
                                                </div>
                                            )}
                                        </button>
                                    ) : (
                                        <div className="flex flex-col items-center gap-0.5 w-full">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none">{col.label}</span>
                                            {col.subLabel && <span className="text-[9px] text-muted-foreground/50 leading-none">{col.subLabel}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {filteredPlayers.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground text-sm">
                            {favoritesOnly && watchlist.length === 0 ? 'No favorites yet — click the ⭐ on any player to add them.' : 'No players found.'}
                        </div>
                    ) : (
                        (() => {
                            let lastTierLabel = '';
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
                                const rank = (player as any).consensus_rank ?? (index + 1);
                                const tier = getTierForRank(rank);
                                const showTierHeader = showTiers && tier.label !== lastTierLabel;
                                if (showTierHeader) lastTierLabel = tier.label;
                                const bounds = tierBounds[tier.label];
                                return (
                                    <div key={player.id}>
                                        {showTierHeader && (
                                            <div
                                                className="flex items-center gap-3 px-10 py-2 text-[11px] font-black uppercase tracking-[0.15em] mb-0.5 mt-2"
                                                style={{ background: tier.accent, color: '#000', borderRadius: '0' }}
                                            >
                                                <span>{tier.label}</span>
                                                <span className="opacity-60 font-bold">
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
                                                rank_overall: (player as any).consensus_rank ?? (index + 1),
                                                avg_rank:     (player as any).avg_rank       ?? undefined,
                                                best_rank:    (player as any).best_rank      ?? undefined,
                                                worst_rank:   (player as any).worst_rank     ?? undefined,
                                                num_sources:  (player as any).num_sources    ?? 0,
                                                rank_change_1d:  (player as any).rank_change_1d  ?? 0,
                                                rank_change_7d:  (player as any).rank_change_7d  ?? 0,
                                                rank_change_30d: (player as any).rank_change_30d ?? 0,
                                            }}
                                            period="1d"
                                            index={index}
                                            positionFilter={positionFilter}
                                        />
                                    </div>
                                );
                            });
                        })()
                    )}
                </div>
            )}

            {viewMode === 'box' && <BoxView players={filteredPlayers} period="1d" />}
            {viewMode === 'hex' && <HexView players={filteredPlayers} period="1d" />}
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
