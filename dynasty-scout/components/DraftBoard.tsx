'use client';

import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Player } from '@/lib/types';
import { PlayerMiniCard } from '@/components/PlayerMiniCard';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Fuse from 'fuse.js';
import { useDebounce } from '@/hooks/useDebounce';
import { ViewModeSelector, ViewMode } from '@/components/ViewModeSelector';
import { BoxView } from '@/components/BoxView';
import { HexView } from '@/components/HexView';
import { getColDefs, getGridTemplate, SortKey } from '@/lib/boardColumns';

interface DraftBoardProps { players: Player[]; }
type SortDir = 'asc' | 'desc';

import { POSITION_PILL_ACTIVE } from '@/lib/constants';

const TIERS = [
    { label: 'S Tier', minRank: 1,  maxRank: 5,    accent: '#f97316', bg: 'rgba(249,115,22,0.06)',   border: 'rgba(249,115,22,0.25)'  },
    { label: 'A Tier', minRank: 6,  maxRank: 12,   accent: '#22c55e', bg: 'rgba(34,197,94,0.06)',    border: 'rgba(34,197,94,0.25)'   },
    { label: 'B Tier', minRank: 13, maxRank: 24,   accent: '#38bdf8', bg: 'rgba(56,189,248,0.05)',   border: 'rgba(56,189,248,0.2)'   },
    { label: 'C Tier', minRank: 25, maxRank: 48,   accent: '#a78bfa', bg: 'rgba(167,139,250,0.05)',  border: 'rgba(167,139,250,0.2)'  },
    { label: 'D Tier', minRank: 49, maxRank: 80,   accent: '#f59e0b', bg: 'rgba(245,158,11,0.05)',   border: 'rgba(245,158,11,0.2)'   },
    { label: 'Depth',  minRank: 81, maxRank: 9999, accent: '#475569', bg: 'rgba(71,85,105,0.04)',    border: 'rgba(71,85,105,0.15)'   },
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
    const [draftCapFilter, setDraftCapFilter] = useState<'all' | 'r1' | 'r2plus' | 'day3'>('all');
    const [ageFilter, setAgeFilter]           = useState<'all' | 'u21' | 'u22'>('all');
    const [rasFilter, setRasFilter]           = useState<'all' | 'ras7' | 'ras8'>('all');
    const [showHelp, setShowHelp]             = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [format, setFormat] = useState<'SF' | '1QB'>('SF');
    const searchInputRef = useRef<HTMLInputElement>(null);

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

    // Auto-switch to BoxView on mobile (table is unusable at <768px)
    useEffect(() => {
        if (window.innerWidth < 768 && viewMode === 'table') {
            setViewMode('box');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const debouncedSearch = useDebounce(searchQuery, 300);

    useEffect(() => {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('q', debouncedSearch);
        if (positionFilter !== 'ALL') params.set('position', positionFilter);
        router.replace(`/?${params.toString()}`, { scroll: false });
    }, [debouncedSearch, positionFilter, router]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const focused = document.activeElement;
            const inInput = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement;

            if (e.key === '/' && !inInput) {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === 'Escape') {
                if (showHelp) { setShowHelp(false); return; }
                if (inInput) { (focused as HTMLElement).blur(); return; }
                setSearchQuery('');
            } else if (e.key === 'f' && !inInput) {
                setFavoritesOnly(v => !v);
            } else if (e.key === '?' && !inInput) {
                setShowHelp(v => !v);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showHelp]);

    const fuse = useMemo(() => new Fuse(players || [], {
        keys: ['full_name', 'position', 'school'], threshold: 0.3,
    }), [players]);

    // Higher = better for these — default to desc when first clicked
    const DEFAULT_DESC: SortKey[] = ['ras', 'height', 'arm', 'hand', 'stars', 'spd', 'dom', 'scrim_ypg', 'pass_ypg', 'comp_pct', 'ypa', 'ypr', 'ypc'];

    function handleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir(DEFAULT_DESC.includes(key) ? 'desc' : 'asc'); }
    }

    // All filters except position for accurate per-position pill counts
    const prePositionPlayers = useMemo(() => {
        let result = players || [];
        if (searchQuery.trim()) result = fuse.search(searchQuery).map(r => r.item);
        if (favoritesOnly) result = result.filter(p => watchlist.includes(p.slug));
        if (draftCapFilter !== 'all') result = result.filter(p => {
            const rankField = format === '1QB' ? 'rank_1qb' : 'rank_sf';
            const rank = (p as any)[rankField] ?? 9999;
            if (draftCapFilter === 'r1')     return rank <= 32;
            if (draftCapFilter === 'r2plus') return rank > 32 && rank <= 96;
            if (draftCapFilter === 'day3')   return rank > 96;
            return true;
        });
        if (ageFilter !== 'all') result = result.filter(p => {
            const age = (p as any).age_at_draft;
            if (!age) return false;
            if (ageFilter === 'u21') return age <= 21;
            if (ageFilter === 'u22') return age <= 22;
            return true;
        });
        if (rasFilter !== 'all') result = result.filter(p => {
            const ras = (p as any).ras;
            if (!ras) return false;
            if (rasFilter === 'ras7') return ras >= 7;
            if (rasFilter === 'ras8') return ras >= 8.5;
            return true;
        });
        return result;
    }, [searchQuery, favoritesOnly, watchlist, draftCapFilter, ageFilter, rasFilter, players, fuse, format]);

    const filteredPlayers = useMemo(() => {
        let result = prePositionPlayers;
        if (positionFilter !== 'ALL') result = result.filter(p => p.position === positionFilter);
        return [...result].sort((a, b) => {
            const MISS = sortDir === 'asc' ? 999999 : -999999;
            let va: number, vb: number;
            switch (sortKey) {
                case 'ktc':    va = (a as any)[format === '1QB' ? 'ktc_1qb_rank' : 'ktc_rank'] ?? MISS; vb = (b as any)[format === '1QB' ? 'ktc_1qb_rank' : 'ktc_rank'] ?? MISS; break;
                case 'sleeper':va = (a as any).sleeper_adp ?? MISS; vb = (b as any).sleeper_adp ?? MISS; break;
                case 'fp':     { const f = format === 'SF' ? 'fantasypros_sf_rank' : 'fantasypros_rank'; va = (a as any)[f] ?? MISS; vb = (b as any)[f] ?? MISS; break; }
                case 'fc':     { const f = format === 'SF' ? 'fantasycalc_sf_rank' : 'fantasycalc_rank'; va = (a as any)[f] ?? MISS; vb = (b as any)[f] ?? MISS; break; }
                case 'dn':     { const f = format === 'SF' ? 'dynasty_nerds_sf_rank' : 'dynasty_nerds_rank'; va = (a as any)[f] ?? MISS; vb = (b as any)[f] ?? MISS; break; }
                case 'tfc':    va = (a as any).tyler_ff_sf_rank ?? MISS; vb = (b as any).tyler_ff_sf_rank ?? MISS; break;
                case 'forty':    va = (a as any).forty_yard ?? MISS; vb = (b as any).forty_yard ?? MISS; break;
                case 'spd':      va = (a as any).speed_score ?? MISS; vb = (b as any).speed_score ?? MISS; break;
                case 'ras':      va = (a as any).ras ?? MISS; vb = (b as any).ras ?? MISS; break;
                case 'height':   va = (a as any).height_inches ?? MISS; vb = (b as any).height_inches ?? MISS; break;
                case 'arm':      va = (a as any).arm_length ?? MISS; vb = (b as any).arm_length ?? MISS; break;
                case 'hand':     va = (a as any).hand_size ?? MISS; vb = (b as any).hand_size ?? MISS; break;
                case 'stars':    va = (a as any).recruiting_stars ?? MISS; vb = (b as any).recruiting_stars ?? MISS; break;
                case 'dom':      va = (a as any).best_dominator ?? MISS; vb = (b as any).best_dominator ?? MISS; break;
                case 'pass_ypg': va = (a as any).best_pass_ypg ?? MISS; vb = (b as any).best_pass_ypg ?? MISS; break;
                case 'comp_pct': va = (a as any).career_pass_att > 0 ? (a as any).career_completions / (a as any).career_pass_att : MISS; vb = (b as any).career_pass_att > 0 ? (b as any).career_completions / (b as any).career_pass_att : MISS; break;
                case 'ypa':      va = (a as any).career_pass_att > 0 ? (a as any).career_pass_yards / (a as any).career_pass_att : MISS; vb = (b as any).career_pass_att > 0 ? (b as any).career_pass_yards / (b as any).career_pass_att : MISS; break;
                case 'scrim_ypg':va = (a as any).career_games_cs > 0 ? (a as any).career_scrim_yards / (a as any).career_games_cs : MISS; vb = (b as any).career_games_cs > 0 ? (b as any).career_scrim_yards / (b as any).career_games_cs : MISS; break;
                case 'ypr':      va = (a as any).best_ypr ?? MISS; vb = (b as any).best_ypr ?? MISS; break;
                case 'ypc':      va = (a as any).best_ypc ?? MISS; vb = (b as any).best_ypc ?? MISS; break;
                case 'rank':
                default: {
                    const rankField = format === '1QB' ? 'rank_1qb' : 'rank_sf';
                    va = (a as any)[rankField] ?? MISS; vb = (b as any)[rankField] ?? MISS; break;
                }
            }
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }, [prePositionPlayers, positionFilter, sortKey, sortDir, format]);

    const counts = useMemo(() => ({
        QB: prePositionPlayers.filter(p => p.position === 'QB').length,
        RB: prePositionPlayers.filter(p => p.position === 'RB').length,
        WR: prePositionPlayers.filter(p => p.position === 'WR').length,
        TE: prePositionPlayers.filter(p => p.position === 'TE').length,
    }), [prePositionPlayers]);

    const showTiers = sortKey === 'rank' && sortDir === 'asc' && !searchQuery.trim() && !favoritesOnly && draftCapFilter === 'all' && ageFilter === 'all' && rasFilter === 'all';
    const colDefs = getColDefs(positionFilter);
    const gridTemplate = getGridTemplate(positionFilter);

    // Pre-build ranking objects so PlayerMiniCard's React.memo sees stable references.
    const rankingMap = useMemo(() => {
        const rankField = format === '1QB' ? 'rank_1qb' : 'rank_sf';
        const map = new Map<number, any>();
        filteredPlayers.forEach((p, i) => {
            map.set(p.id, {
                id: 0, player_id: p.id, calculated_at: '',
                rank_overall:    (p as any)[rankField]       ?? (i + 1),
                avg_rank:        (p as any).avg_rank         ?? undefined,
                best_rank:       (p as any).best_rank        ?? undefined,
                worst_rank:      (p as any).worst_rank       ?? undefined,
                num_sources:     (p as any).num_sources      ?? 0,
                rank_change_1d:  (p as any).rank_change_1d   ?? 0,
                rank_change_7d:  (p as any).rank_change_7d   ?? 0,
                rank_change_30d: (p as any).rank_change_30d  ?? 0,
            });
        });
        return map;
    }, [filteredPlayers, format]);

    return (
        <div className="space-y-0">
            {/* ── Keyboard Shortcuts Help Modal ── */}
            {showHelp && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowHelp(false)}
                >
                    <div
                        className="bg-card border border-border/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Keyboard Shortcuts</h2>
                            <button onClick={() => setShowHelp(false)} className="text-muted-foreground/50 hover:text-foreground text-lg leading-none">×</button>
                        </div>
                        <div className="space-y-2.5">
                            {[
                                { key: '/',   desc: 'Focus search'      },
                                { key: 'Esc', desc: 'Clear / blur search' },
                                { key: 'F',   desc: 'Toggle favorites'  },
                                { key: '?',   desc: 'Show this help'    },
                            ].map(({ key, desc }) => (
                                <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">{desc}</span>
                                    <kbd className="text-[11px] font-mono font-bold bg-muted/60 border border-border/60 px-2 py-0.5 rounded text-foreground">{key}</kbd>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground/40 mt-5 text-center">Shortcuts work when not typing in a field</p>
                    </div>
                </div>
            )}

            {/* ── Controls ── */}
            <div className="flex flex-col gap-2 sm:gap-3 mb-3 sm:mb-5 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-white/[0.05]" style={{ background: 'var(--bg-elevated)', backdropFilter: 'blur(12px)' }}>
                {/* Row 1: Search + view mode + sort */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative w-full sm:w-[340px] sm:min-w-[240px] sm:flex-shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" style={{ zIndex: 1 }} />
                        <input
                            ref={searchInputRef}
                            placeholder="Search players…"
                            className="w-full pl-9 pr-10 h-9 bg-[var(--bg-base)] border border-white/[0.06] rounded-[0.625rem] text-[0.8125rem] text-foreground outline-none shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] focus:border-primary/70 focus:shadow-[inset_0_1px_3px_rgba(0,0,0,0.3),0_0_0_3px_rgba(249,115,22,0.12)] transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-[var(--font-jetbrains),monospace] font-bold text-muted-foreground/30 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded">/</kbd>
                    </div>
                    <ViewModeSelector mode={viewMode} onChange={setViewMode} />
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:inline">Sort:</span>
                        <Select value={sortKey} onValueChange={(v: SortKey) => { setSortKey(v); setSortDir(DEFAULT_DESC.includes(v as SortKey) ? 'desc' : 'asc'); }}>
                            <SelectTrigger className="w-[140px] sm:w-[180px] bg-card border-border/60 text-xs" style={{ height: '34px', paddingLeft: '14px', paddingRight: '14px', gap: '10px' }}>
                                <SelectValue>
                                    {({ rank: 'Consensus', ktc: 'KTC ' + format, sleeper: 'Sleeper', fp: 'FantasyPros', fc: 'FC ' + format, dn: 'DynNerds', tfc: 'TylerFF SF', forty: '40yd Dash', spd: 'Speed Score', ras: 'RAS Score', height: 'Height', arm: 'Arm Length', hand: 'Hand Size', stars: 'Recruit', dom: 'Dom%', scrim_ypg: 'Scrim/G', pass_ypg: 'Pass/G', comp_pct: 'Comp%', ypa: 'YPA', ypr: 'Yds/Rec', ypc: 'YPC' } as {[k:string]:string})[sortKey] ?? 'Consensus'}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="rank">Consensus</SelectItem>
                                <SelectItem value="ktc">KTC Dynasty</SelectItem>
                                <SelectItem value="fp">FantasyPros</SelectItem>
                                <SelectItem value="fc">FantasyCalc</SelectItem>
                                <SelectItem value="dn">DynastyNerds</SelectItem>
                                <SelectItem value="tfc">TylerFFCreator SF</SelectItem>
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
                                        {/* SF / 1QB format toggle */}
                    <div className="flex items-center rounded-md border border-border/40 overflow-hidden text-[10px] font-bold uppercase tracking-widest">
                        <button
                            onClick={() => setFormat('SF')}
                            className={format === 'SF' ? 'px-2.5 py-1.5 bg-sky-500/20 text-sky-400' : 'px-2.5 py-1.5 text-muted-foreground/40 hover:text-muted-foreground/60'}
                        >SF</button>
                        <div className="w-px h-4 bg-border/40" />
                        <button
                            onClick={() => setFormat('1QB')}
                            className={format === '1QB' ? 'px-2.5 py-1.5 bg-amber-500/20 text-amber-400' : 'px-2.5 py-1.5 text-muted-foreground/40 hover:text-muted-foreground/60'}
                        >1QB</button>
                    </div>
                    {/* ? shortcut help — desktop only */}
                    <button
                        onClick={() => setShowHelp(true)}
                        title="Keyboard shortcuts (?)"
                        className="ml-auto hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-border/50 text-muted-foreground/50 hover:text-foreground hover:border-border transition-colors text-xs font-bold"
                    >?</button>
                </div>

                {/* Row 2: Position pills + Favorites filter */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {(['ALL', 'QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                        const active = positionFilter === pos;
                        const displayCount = pos === 'ALL' ? filteredPlayers.length : counts[pos as keyof typeof counts];
                        const pill = POSITION_PILL_ACTIVE[pos];
                        return (
                            <button
                                key={pos}
                                onClick={() => setPositionFilter(pos)}
                                style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 9999, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1 }}
                                className={`border transition-all duration-200 px-2.5 py-1 text-[11px] gap-1 sm:px-4 sm:py-1.5 sm:text-[13px] sm:gap-1.5 ${active ? pill.active : pill.inactive}`}
                            >
                                {pos} <span className="text-[10px] sm:text-[12px]" style={{ opacity: active ? 1 : 0.5 }}>{displayCount}</span>
                            </button>
                        );
                    })}

                    {/* Favorites filter pill */}
                    <button
                        onClick={() => setFavoritesOnly(f => !f)}
                        style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 9999, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1 }}
                        className={`px-2.5 py-1 text-[10px] gap-1 sm:px-3.5 sm:py-1.5 sm:text-[12px] sm:gap-1.5 border transition-all duration-150 ${
                            favoritesOnly
                                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/60'
                                : 'text-muted-foreground border-border/60 hover:border-yellow-500/40 hover:text-yellow-400'
                        }`}
                    >
                        <Star className={`w-3 h-3 ${favoritesOnly ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        Favs
                        {watchlist.length > 0 && <span style={{ opacity: favoritesOnly ? 1 : 0.6 }}>{watchlist.length}</span>}
                    </button>

                    {(positionFilter !== 'ALL' || searchQuery.trim() || favoritesOnly || draftCapFilter !== 'all' || ageFilter !== 'all' || rasFilter !== 'all') && (
                        <span className="text-[11px] text-muted-foreground ml-1">
                            Showing <span className="text-foreground font-semibold">{filteredPlayers.length}</span> of <span className="text-foreground font-semibold">{(players || []).length}</span>
                        </span>
                    )}
                </div>

                {/* Row 3: Quick filters — collapsible on mobile */}
                <button
                    onClick={() => setShowMobileFilters(v => !v)}
                    className="flex md:hidden items-center gap-1.5 text-[11px] font-semibold text-muted-foreground/60 border border-white/[0.06] px-3 py-1.5 rounded-lg hover:text-foreground transition-colors"
                >
                    <span>Filters</span>
                    {(draftCapFilter !== 'all' || ageFilter !== 'all' || rasFilter !== 'all') && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                    <ChevronDown className={`w-3 h-3 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
                </button>
                <div className={`${showMobileFilters ? 'flex' : 'hidden'} md:flex items-center gap-3 flex-wrap`}>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40">Filter:</span>

                    {/* Draft Capital */}
                    <div className="flex items-center gap-1">
                        {([['all', 'All Rounds'], ['r1', 'Rd 1'], ['r2plus', 'Rd 2–3'], ['day3', 'Day 3']] as const).map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setDraftCapFilter(val)}
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all duration-150 ${
                                    draftCapFilter === val
                                        ? 'bg-primary/20 text-primary border-primary/50'
                                        : 'text-muted-foreground/50 border-white/[0.06] hover:text-foreground hover:border-white/[0.12]'
                                }`}
                            >{label}</button>
                        ))}
                    </div>

                    <div className="w-px h-4 bg-border/30" />

                    {/* Age */}
                    <div className="flex items-center gap-1">
                        {([['all', 'Any Age'], ['u22', '≤22'], ['u21', '≤21']] as const).map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setAgeFilter(val)}
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all duration-150 ${
                                    ageFilter === val
                                        ? 'bg-primary/20 text-primary border-primary/50'
                                        : 'text-muted-foreground/50 border-white/[0.06] hover:text-foreground hover:border-white/[0.12]'
                                }`}
                            >{label}</button>
                        ))}
                    </div>

                    <div className="w-px h-4 bg-border/30" />

                    {/* RAS */}
                    <div className="flex items-center gap-1">
                        {([['all', 'Any RAS'], ['ras7', 'RAS ≥7'], ['ras8', 'RAS ≥8.5']] as const).map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setRasFilter(val)}
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all duration-150 ${
                                    rasFilter === val
                                        ? 'bg-primary/20 text-primary border-primary/50'
                                        : 'text-muted-foreground/50 border-white/[0.06] hover:text-foreground hover:border-white/[0.12]'
                                }`}
                            >{label}</button>
                        ))}
                    </div>

                    {/* Reset all quick filters */}
                    {(draftCapFilter !== 'all' || ageFilter !== 'all' || rasFilter !== 'all') && (
                        <button
                            onClick={() => { setDraftCapFilter('all'); setAgeFilter('all'); setRasFilter('all'); }}
                            className="text-[11px] text-muted-foreground/50 hover:text-foreground underline decoration-dotted transition-colors ml-1"
                        >reset</button>
                    )}
                </div>{/* end collapsible filter wrapper */}
            </div>

            {/* ── Table View ── */}
            {viewMode === 'table' && (
                <div className="rounded-2xl border border-white/[0.05] overflow-x-clip" style={{ background: 'var(--bg-card)' }}>

                    {/* Column headers — sticky below the app header bar */}
                    <div className="flex items-stretch px-4 py-0 border-b border-white/[0.06] gap-0 min-h-[46px] sticky top-[54px] z-20"
                         style={{ background: 'var(--bg-elevated)', backdropFilter: 'blur(16px)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                        {/* Sticky identity group: star + rank + compare + player */}
                        <div className="sticky left-0 z-10 flex items-center gap-1 sm:gap-2.5 pr-1 sm:pr-2 flex-shrink-0 min-w-0 lg:w-[304px]" style={{ background: 'var(--bg-elevated)' }}>
                        {/* Spacer for watchlist star */}
                        <div className="w-5 flex-shrink-0" />

                        {/* Rank */}
                        <div className="w-7 sm:w-10 flex-shrink-0 flex items-center justify-center">
                            <button
                                onClick={() => handleSort('rank')}
                                className="flex items-center gap-0.5 cursor-pointer group bg-transparent border-0"
                            >
                                <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-0.5 ${sortKey === 'rank' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                    RANK
                                    {sortKey === 'rank'
                                        ? (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)
                                        : <ChevronsUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-50" />}
                                </span>
                            </button>
                        </div>

                        {/* Spacer for compare button column */}
                        <div className="w-5 sm:w-6 flex-shrink-0" />

                        {/* Player */}
                        <div className="flex-1 min-w-0 lg:w-[224px] lg:min-w-[224px] lg:flex-none flex items-center text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Player
                        </div>
                        </div>{/* end sticky identity group */}

                        {/* Dynamic stat columns — CSS grid, same template as PlayerMiniCard */}
                        <div
                            className="hidden lg:grid flex-1 min-w-0"
                            style={{ gridTemplateColumns: gridTemplate }}
                        >
                            {colDefs.map((col, i) => (
                                <Tooltip key={col.key} delayDuration={300}>
                                <TooltipTrigger asChild>
                                <div
                                    className={`flex items-center justify-center text-center min-h-[40px] ${i === 0 ? 'border-l border-border/30' : ''} ${col.key === 'fp' || col.key === 'tier' ? 'border-l border-border/20' : ''}`}
                                >
                                    {col.sortKey ? (
                                        <button
                                            onClick={() => handleSort(col.sortKey!)}
                                            className="flex flex-col items-center justify-center cursor-pointer select-none bg-transparent border-0 p-0 gap-0 group w-full"
                                        >
                                            <div className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider leading-none transition-colors ${sortKey === col.sortKey ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                                {col.label}
                                                {sortKey === col.sortKey
                                                    ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />)
                                                    : <ChevronsUpDown className="w-2.5 h-2.5 text-muted-foreground/50 group-hover:text-muted-foreground" />}
                                            </div>
                                            {col.subLabel && (
                                                <div className={sortKey === col.sortKey ? 'text-[9px] leading-none mt-0.5 text-primary/70' : 'text-[9px] leading-none mt-0.5 text-muted-foreground/50'}>
                                                    {col.key === 'ktc' ? format : col.key === 'fc' ? (format === 'SF' ? 'SF' : 'Rookie') : col.subLabel}
                                                </div>
                                            )}
                                        </button>
                                    ) : (
                                        <div className="flex flex-col items-center gap-0.5 w-full">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-none">{col.label}</span>
                                            {col.subLabel && <span className="text-[9px] text-muted-foreground/50 leading-none">{col.subLabel}</span>}
                                        </div>
                                    )}
                                </div>
                                </TooltipTrigger>
                                {col.tooltip && (
                                    <TooltipContent side="bottom" className="max-w-[240px] text-xs leading-snug">
                                        {col.tooltip}
                                    </TooltipContent>
                                )}
                                </Tooltip>
                            ))}
                        </div>
                    </div>

                    {filteredPlayers.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground text-sm">
                            {favoritesOnly && watchlist.length === 0 ? 'No favorites yet — click the ⭐ on any player to add them.' : searchQuery.trim() ? 'No players match your search — try a shorter name.' : 'No players match your current filters.'}
                        </div>
                    ) : (
                        (() => {
                            let lastTierLabel = '';
                            const tierBounds: Record<string, { first: number; last: number }> = {};
                            const tierCounts: Record<string, Record<string, number>> = {};
                            const rankField = format === '1QB' ? 'rank_1qb' : 'rank_sf';
                            filteredPlayers.forEach((p, i) => {
                                const r = (p as any)[rankField] ?? (i + 1);
                                const t = getTierForRank(r);
                                if (!tierBounds[t.label]) tierBounds[t.label] = { first: r, last: r };
                                else tierBounds[t.label].last = r;
                                if (!tierCounts[t.label]) tierCounts[t.label] = { QB: 0, RB: 0, WR: 0, TE: 0 };
                                tierCounts[t.label][p.position] = (tierCounts[t.label][p.position] || 0) + 1;
                            });
                            return filteredPlayers.map((player, index) => {
                                const rank = (player as any)[rankField] ?? (index + 1);
                                const tier = getTierForRank(rank);
                                const showTierHeader = showTiers && tier.label !== lastTierLabel;
                                if (showTierHeader) lastTierLabel = tier.label;
                                const bounds = tierBounds[tier.label];
                                return (
                                    <div key={player.id}>
                                        {showTierHeader && (
                                            <div
                                                className="relative flex items-center gap-3 px-5 py-3 mt-2 first:mt-0 overflow-hidden"
                                                style={{
                                                    background: `linear-gradient(90deg, ${tier.accent}15, ${tier.accent}06 40%, transparent 70%)`,
                                                    borderLeft: `3px solid ${tier.accent}`,
                                                    borderTop: `1px solid ${tier.accent}20`,
                                                    borderBottom: `1px solid ${tier.accent}10`,
                                                }}
                                            >
                                                {/* Decorative large tier label in background */}
                                                <span
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 font-black uppercase tracking-widest select-none pointer-events-none hidden sm:block"
                                                    style={{ fontSize: 48, color: tier.accent, opacity: 0.04 }}
                                                >{tier.label}</span>

                                                <span className="text-sm font-black uppercase tracking-[0.16em]" style={{ color: tier.accent }}>
                                                    {tier.label}
                                                </span>
                                                <div className="h-3 w-px" style={{ backgroundColor: tier.accent, opacity: 0.25 }} />
                                                <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: tier.accent, opacity: 0.45 }}>
                                                    {positionFilter === 'ALL'
                                                        ? (tier.maxRank < 9999 ? `Ranks ${tier.minRank}–${tier.maxRank}` : `Ranks ${tier.minRank}+`)
                                                        : bounds && bounds.first === bounds.last
                                                            ? `Rank ${bounds.first}`
                                                            : `Ranks ${bounds?.first ?? tier.minRank}–${bounds?.last ?? tier.maxRank}`
                                                    }
                                                </span>
                                                <span className="flex-1" />
                                                {tierCounts[tier.label] && (
                                                    <span className="font-semibold tracking-normal text-[10px] hidden sm:inline-flex items-center gap-2" style={{ color: tier.accent, opacity: 0.5 }}>
                                                        {Object.entries(tierCounts[tier.label]).filter(([_, c]) => c > 0).map(([pos, c]) => (
                                                            <span key={pos}>{pos}<span className="opacity-60">×</span>{c}</span>
                                                        ))}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <PlayerMiniCard
                                            player={player}
                                            ranking={rankingMap.get(player.id)!}
                                            period="1d"
                                            index={index}
                                            positionFilter={positionFilter}
                                            format={format}
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
