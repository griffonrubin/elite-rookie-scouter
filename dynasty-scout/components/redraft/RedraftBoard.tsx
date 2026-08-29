'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Fuse from 'fuse.js';
import { Search, X, Star, Gavel, ChevronUp, ChevronDown, ChevronsUpDown, ArrowUpNarrowWide, ArrowDownWideNarrow, LayoutList, LayoutGrid, LayoutPanelTop } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { POSITION_PILL_ACTIVE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { useDrafted, REDRAFT_DRAFTED_KEY } from '@/lib/useDrafted';
import { REDRAFT_WATCHLIST_KEY } from '@/components/WatchlistButton';
import { RedraftMiniCard } from './RedraftMiniCard';
import { RedraftBoxView } from './RedraftBoxView';
import { RedraftDraftBoard } from './RedraftDraftBoard';
import {
    getRedraftColDefs, getRedraftGridTemplate,
    RedraftDataset, RedraftSortKey, REDRAFT_POSITION_FILTERS,
    REDRAFT_SORT_GROUPS, REDRAFT_SORT_LABELS,
} from '@/lib/redraftColumns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const DATASETS: { value: RedraftDataset; label: string; hint: string }[] = [
    { value: 'snapshot',    label: 'Snapshot',    hint: 'Recent production plus where the market has them' },
    { value: 'sources',     label: 'Sources',     hint: 'Every source rank side by side, with the spread' },
    { value: 'production',  label: 'Production',  hint: 'Full 2025 counting-stat line' },
    { value: 'advanced',    label: 'Advanced',    hint: 'Efficiency and opportunity rates behind the 2025 box score' },
    { value: 'vegas',       label: 'Vegas',       hint: 'The 2026 betting market around each player: implied totals, spreads, win rate' },
    { value: 'seasons',     label: 'Seasons',     hint: 'Points and finish for each season, 2021-2025' },
    { value: 'projections', label: 'Projections', hint: '2026 projections vs last season' },
];

/** Maps a sort key to the value it reads off a player row. */
function sortValue(p: RedraftPlayer, key: RedraftSortKey): number | null {
    switch (key) {
        case 'rank':      return p.board_rank ?? null;
        case 'pos_rank':  return p.rank_positional;
        case 'avg_rank':  return p.avg_rank;
        case 'best':      return p.best_rank;
        case 'worst':     return p.worst_rank;
        case 'sd':        return p.std_deviation;
        case 'sources':   return p.num_sources;
        case 'my_rank':   return p.my_rank;
        case 'fp':        return p.fp_rank;
        case 'espn':      return p.espn_rank;
        case 'ktc':       return p.ktc_rank;
        case 'cbs':       return p.cbs_rank;
        case 'yahoo':     return p.yahoo_rank;
        case 'sleeper':   return p.sleeper_rank;
        case 'fc':        return p.fc_rank;
        case 'flock':     return p.flock_rank;
        case 'underdog':  return p.underdog_rank;
        case 'ffpc':      return p.ffpc_rank;
        case 'proj':      return p.proj_points;
        case 'proj_ppg':  return p.proj_ppg;
        case 'pts25':     return p.pts25;
        case 'ppg25':     return p.ppg25;
        case 'fin25':     return p.fin25;
        case 'fin25_ov':  return p.fin25_ov;
        case 'pts24':     return p.pts24;
        case 'pts23':     return p.pts23;
        case 'pts22':     return p.pts22;
        case 'pts21':     return p.pts21;
        case 'games':     return p.games25;
        case 'exp':       return p.years_exp;
        case 'age':       return p.dob ? Date.parse(p.dob) : null;
        case 'pass_yds':  return p.pass_yards;
        case 'pass_td':   return p.pass_tds;
        case 'ints':      return p.interceptions;
        case 'carries':   return p.carries;
        case 'rush_yds':  return p.rush_yards;
        case 'rush_td':   return p.rush_tds;
        case 'targets':   return p.targets;
        case 'rec':       return p.receptions;
        case 'rec_yds':   return p.rec_yards;
        case 'rec_td':    return p.rec_tds;
        case 'fgm':       return p.fg_made;
        case 'fga':       return p.fg_att;
        case 'fg_pct':    return p.fg_pct;
        case 'fg50':      return p.fg_made_50plus;
        case 'xp':        return p.xp_made;
        case 'dst_sacks': return p.dst_sacks;
        case 'dst_ints':  return p.dst_ints;
        case 'dst_td':    return p.dst_tds;
        case 'dst_pa':    return p.dst_points_allowed;

        // advanced rates (2025)
        case 'snap_share':  return p.adv_snap_share;
        case 'touches':     return p.adv_touches_per_game;
        case 'y_per_touch': return p.adv_yards_per_touch;
        case 'epa_db':      return p.adv_epa_per_dropback;
        case 'cpoe':        return p.adv_cpoe;
        case 'ypa':         return p.adv_yards_per_attempt;
        case 'pass_td_rate':return p.adv_pass_td_rate;
        case 'int_rate':    return p.adv_int_rate;
        case 'pressure':    return p.adv_pressure_pct;
        case 'sack_rate':   return p.adv_sack_rate;
        case 'att_g':       return p.adv_carries_per_game;
        case 'ypc':         return p.adv_yards_per_carry;
        case 'yaco':        return p.adv_yards_after_contact_att;
        case 'rush_mtf':    return p.adv_rush_mtf_rate;
        case 'breakaway':   return p.adv_breakaway_rush_rate;
        case 'epa_rush':    return p.adv_epa_per_rush;
        case 'tgt_share':   return p.adv_target_share;
        case 'ay_share':    return p.adv_air_yards_share;
        case 'wopr':        return p.adv_wopr;
        case 'tgt_g':       return p.adv_targets_per_game;
        case 'y_snap':      return p.adv_yards_per_snap;
        case 'y_tgt':       return p.adv_yards_per_target;
        case 'adot':        return p.adv_adot;
        case 'yac_rec':     return p.adv_yards_after_catch_rec;
        case 'catch_rate':  return p.adv_catch_rate;
        case 'epa_tgt':     return p.adv_epa_per_target;
        case 'fga_g':       return p.adv_fg_att_per_game;
        case 'fg_pct_adv':  return p.adv_fg_pct;
        case 'fg40':        return p.adv_fg_pct_40plus;
        case 'fg_dist':     return p.adv_avg_fg_distance;
        case 'fg50_att':    return p.adv_fg_50plus_att;
        case 'xp_pct':      return p.adv_xp_pct;
        case 'dsack_g':     return p.adv_dst_sacks_per_game;
        case 'dto_g':       return p.adv_dst_takeaways_per_game;
        case 'dpa_g':       return p.adv_dst_points_allowed_per_game;

        // Vegas (2026)
        case 'veg_implied': return p.vegas_implied_total;
        case 'veg_rank':    return p.vegas_implied_rank;
        case 'veg_total':   return p.vegas_total;
        case 'veg_spread':  return p.vegas_spread;
        case 'veg_win':     return p.vegas_win_pct;
        default:          return null;
    }
}

/** Ranks read best ascending; production reads best descending. */
const ASCENDING_KEYS = new Set<RedraftSortKey>([
    'rank', 'pos_rank', 'avg_rank', 'best', 'worst', 'my_rank', 'fp', 'espn', 'ktc', 'cbs',
    'yahoo', 'sleeper', 'fc', 'flock', 'underdog', 'ffpc',
    'fin25', 'fin25_ov', 'age', 'ints', 'dst_pa',
    // lower is better here too: mistakes, pressure taken, points conceded,
    // and a spread where negative means favoured.
    'int_rate', 'pressure', 'sack_rate', 'dpa_g', 'veg_rank', 'veg_spread',
]);

function RedraftBoardContent({ players }: { players: RedraftPlayer[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const [positionFilter, setPositionFilter] = useState(searchParams.get('position') || 'ALL');
    const [dataset, setDataset] = useState<RedraftDataset>(
        (searchParams.get('view') as RedraftDataset) || 'snapshot'
    );
    const [viewMode, setViewMode] = useState<'table' | 'box' | 'board'>('table');
    const [sortKey, setSortKey] = useState<RedraftSortKey>('rank');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [availableOnly, setAvailableOnly] = useState(false);
    const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

    const { drafted, toggle: toggleDrafted, reset: resetDrafted } = useDrafted(REDRAFT_DRAFTED_KEY);
    const debouncedQuery = useDebounce(searchQuery, 300);

    // The stat table needs horizontal room; below `md` cards read far better.
    useEffect(() => {
        const apply = () => { if (window.innerWidth < 768) setViewMode('box'); };
        apply();
        window.addEventListener('resize', apply);
        return () => window.removeEventListener('resize', apply);
    }, []);

    // Watchlist lives in localStorage; mirror it so the filter can read it.
    useEffect(() => {
        const read = () => {
            try {
                const v = JSON.parse(localStorage.getItem(REDRAFT_WATCHLIST_KEY) || '[]');
                setWatchlist(new Set(Array.isArray(v) ? v : []));
            } catch { setWatchlist(new Set()); }
        };
        read();
        window.addEventListener('watchlist-updated', read);
        window.addEventListener('storage', read);
        return () => {
            window.removeEventListener('watchlist-updated', read);
            window.removeEventListener('storage', read);
        };
    }, []);

    // Keep the URL shareable.
    useEffect(() => {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (positionFilter !== 'ALL') params.set('position', positionFilter);
        if (dataset !== 'snapshot') params.set('view', dataset);
        const qs = params.toString();
        router.replace(qs ? `/redraft?${qs}` : '/redraft', { scroll: false });
    }, [debouncedQuery, positionFilter, dataset, router]);

    const fuse = useMemo(
        () => new Fuse(players, {
            keys: ['full_name', 'position', 'nfl_team'],
            threshold: 0.3,
            ignoreLocation: true,
        }),
        [players]
    );

    const visible = useMemo(() => {
        let list = players;

        if (debouncedQuery.trim()) {
            list = fuse.search(debouncedQuery.trim()).map(r => r.item);
        }
        if (positionFilter !== 'ALL') {
            list = list.filter(p => (p.position || '').toUpperCase() === positionFilter);
        }
        if (favoritesOnly) {
            list = list.filter(p => watchlist.has(p.slug));
        }
        if (availableOnly) {
            list = list.filter(p => !drafted.has(p.slug));
        }

        if (sortKey !== 'rank' || sortDir !== 'asc') {
            const ascByNature = ASCENDING_KEYS.has(sortKey);
            list = [...list].sort((a, b) => {
                const av = sortValue(a, sortKey);
                const bv = sortValue(b, sortKey);
                if (av == null && bv == null) return 0;
                if (av == null) return 1;   // missing data always sorts last
                if (bv == null) return -1;
                const diff = ascByNature ? av - bv : bv - av;
                return sortDir === 'asc' ? diff : -diff;
            });
        }
        return list;
    }, [players, fuse, debouncedQuery, positionFilter, favoritesOnly, availableOnly,
        watchlist, drafted, sortKey, sortDir]);

    /**
     * The dropdown picks the metric and always starts it best-first.
     *
     * 'asc' here means the metric's own natural order, not a numeric direction:
     * the comparator above already flips ranks against rates via ASCENDING_KEYS,
     * so rank 1 and the highest target share both lead under 'asc'. Setting the
     * direction per metric here would flip it a second time.
     */
    function chooseSort(key: RedraftSortKey) {
        setSortKey(key);
        setSortDir('asc');
    }

    function handleSort(key: RedraftSortKey) {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }

    const cols = getRedraftColDefs(dataset, positionFilter);
    const grid = getRedraftGridTemplate(dataset, positionFilter);
    const draftedCount = drafted.size;

    return (
        <div className="space-y-3">
            {/* ── Controls ── */}
            <div className="space-y-2.5 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search players, teams…"
                            className="w-full h-9 pl-9 pr-8 rounded-lg bg-card border border-border/60 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Position pills */}
                    <div className="flex items-center gap-1">
                        {REDRAFT_POSITION_FILTERS.map(pos => {
                            const active = positionFilter === pos;
                            const style = POSITION_PILL_ACTIVE[pos] || POSITION_PILL_ACTIVE.ALL;
                            return (
                                <button
                                    key={pos}
                                    onClick={() => setPositionFilter(pos)}
                                    className={cn(
                                        'px-2.5 h-8 rounded-lg border text-[12px] font-bold transition-all',
                                        active ? style.active : style.inactive,
                                    )}
                                >
                                    {pos === 'DST' ? 'D/ST' : pos}
                                </button>
                            );
                        })}
                    </div>

                    {/* Sort by any metric, whether or not the current lens shows it */}
                    <div className="flex items-center gap-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40 hidden lg:inline">
                            Sort
                        </span>
                        <Select value={sortKey} onValueChange={(v) => chooseSort(v as RedraftSortKey)}>
                            <SelectTrigger
                                aria-label="Sort players by"
                                className="h-8 w-[150px] sm:w-[190px] bg-card border-border/60 text-[12px]"
                            >
                                <SelectValue>{REDRAFT_SORT_LABELS[sortKey] ?? 'Consensus rank'}</SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-[60vh]">
                                {REDRAFT_SORT_GROUPS.map(g => (
                                    <SelectGroup key={g.group}>
                                        <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50">
                                            {g.group}
                                        </SelectLabel>
                                        {g.options.map(o => (
                                            <SelectItem key={o.key} value={o.key} className="text-[12px]">
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                ))}
                            </SelectContent>
                        </Select>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                                    aria-label={sortDir === 'asc' ? 'Best first — click to reverse' : 'Reversed — click for best first'}
                                    className="h-8 w-8 grid place-items-center rounded-lg bg-card border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {sortDir === 'asc'
                                        ? <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                                        : <ArrowDownWideNarrow className="w-3.5 h-3.5" />}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {sortDir === 'asc' ? 'Best first' : 'Reversed — worst first'}
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    {/* Toggles */}
                    <div className="flex items-center gap-1 ml-auto">
                        <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1 mr-1">
                            {([
                                ['table', LayoutList, 'List view'],
                                ['box', LayoutGrid, 'Card view'],
                                ['board', LayoutPanelTop, 'Draft board'],
                            ] as const).map(([mode, Icon, label]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    aria-label={label}
                                    onClick={() => setViewMode(mode)}
                                    className={cn(
                                        'flex h-6 w-6 items-center justify-center rounded-md transition-all',
                                        viewMode === mode
                                            ? 'bg-sky-500/20 text-sky-400'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setFavoritesOnly(v => !v)}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[12px] font-semibold transition-all',
                                favoritesOnly
                                    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40'
                                    : 'text-muted-foreground border-white/10 hover:text-foreground',
                            )}
                        >
                            <Star className={cn('w-3.5 h-3.5', favoritesOnly && 'fill-yellow-400')} />
                            Watchlist
                        </button>
                        <button
                            onClick={() => setAvailableOnly(v => !v)}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[12px] font-semibold transition-all',
                                availableOnly
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                                    : 'text-muted-foreground border-white/10 hover:text-foreground',
                            )}
                        >
                            <Gavel className="w-3.5 h-3.5" />
                            Available
                        </button>
                        {draftedCount > 0 && (
                            <button
                                onClick={resetDrafted}
                                className="px-2.5 h-8 rounded-lg border border-white/10 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-all"
                                title="Clear every player marked drafted"
                            >
                                Reset {draftedCount}
                            </button>
                        )}
                    </div>
                </div>

                {/* Dataset lens picker — table view only; cards have a fixed layout */}
                {viewMode === 'table' ? (
                <div className="flex items-center gap-1 pt-1 border-t border-white/[0.05] overflow-x-auto">
                    {DATASETS.map(d => (
                        <Tooltip key={d.value} delayDuration={400}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setDataset(d.value)}
                                    className={cn(
                                        'px-3 h-8 rounded-lg text-[12px] font-semibold transition-all whitespace-nowrap',
                                        dataset === d.value
                                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
                                            : 'text-muted-foreground border border-transparent hover:text-foreground hover:bg-white/[0.03]',
                                    )}
                                >
                                    {d.label}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">{d.hint}</TooltipContent>
                        </Tooltip>
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground/60 whitespace-nowrap pl-3">
                        <span className="hidden lg:inline text-muted-foreground/40 mr-3">
                            Right-click a player to mark them drafted
                        </span>
                        {visible.length} shown
                    </span>
                </div>
                ) : (
                    <div className="flex items-center pt-1 border-t border-white/[0.05]">
                        <span className="ml-auto text-[11px] text-muted-foreground/60">
                            <span className="hidden lg:inline text-muted-foreground/40 mr-3">
                                Right-click a player to mark them drafted
                            </span>
                            {visible.length} shown
                        </span>
                    </div>
                )}
            </div>

            {/* ── Table ── */}
            {viewMode === 'table' ? (
            <div className="rounded-2xl border border-white/[0.05] overflow-x-clip" style={{ background: 'var(--bg-card)' }}>
                {/* Header row — mirrors RedraftMiniCard's identity + grid split */}
                <div
                    className="flex items-stretch px-4 py-0 border-b border-white/[0.06] min-h-[46px] sticky top-[54px] z-20"
                    style={{ background: 'var(--bg-elevated)', backdropFilter: 'blur(16px)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                >
                    <div className="sticky left-0 z-10 flex items-center gap-1 sm:gap-2.5 pr-1 sm:pr-2 flex-shrink-0 min-w-0 lg:w-[340px]"
                        style={{ background: 'var(--bg-elevated)' }}>
                        <div className="w-5 flex-shrink-0" />
                        <div className="w-7 sm:w-10 flex-shrink-0 flex items-center justify-center">
                            <button onClick={() => handleSort('rank')} className="flex items-center gap-0.5 group bg-transparent border-0">
                                <span className={cn(
                                    'text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-0.5',
                                    sortKey === 'rank' ? 'text-sky-400' : 'text-muted-foreground group-hover:text-foreground',
                                )}>
                                    RANK
                                    {sortKey === 'rank'
                                        ? (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)
                                        : <ChevronsUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-50" />}
                                </span>
                            </button>
                        </div>
                        <div className="w-5 sm:w-6 flex-shrink-0" />
                        <div className="w-5 sm:w-6 flex-shrink-0" />
                        <div className="flex-1 min-w-0 lg:w-[224px] lg:min-w-[224px] lg:flex-none flex items-center text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Player
                        </div>
                    </div>

                    <div className="grid flex-1 items-center gap-1 sm:gap-2 min-w-0" style={{ gridTemplateColumns: grid }}>
                        {cols.map(col => {
                            const active = col.sortKey && sortKey === col.sortKey;
                            const header = (
                                <button
                                    type="button"
                                    onClick={() => col.sortKey && handleSort(col.sortKey)}
                                    disabled={!col.sortKey}
                                    className="flex flex-col items-center justify-center leading-tight group bg-transparent border-0 w-full min-w-0 disabled:cursor-default"
                                >
                                    <span className={cn(
                                        'text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-0.5 truncate max-w-full',
                                        active ? 'text-sky-400' : 'text-muted-foreground group-hover:text-foreground',
                                    )}>
                                        {col.label}
                                        {col.sortKey && (active
                                            ? (sortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5 flex-shrink-0" /> : <ChevronDown className="w-2.5 h-2.5 flex-shrink-0" />)
                                            : <ChevronsUpDown className="w-2.5 h-2.5 opacity-25 group-hover:opacity-50 flex-shrink-0" />)}
                                    </span>
                                    {col.subLabel && (
                                        <span className="text-[9px] text-muted-foreground/45 truncate max-w-full">{col.subLabel}</span>
                                    )}
                                </button>
                            );
                            return (
                                <div key={col.key} className="flex items-center justify-center min-w-0">
                                    {col.tooltip ? (
                                        <Tooltip delayDuration={300}>
                                            <TooltipTrigger asChild>{header}</TooltipTrigger>
                                            <TooltipContent side="bottom" className="max-w-xs">{col.tooltip}</TooltipContent>
                                        </Tooltip>
                                    ) : header}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Rows */}
                {visible.length === 0 ? (
                    <div className="p-16 text-center text-muted-foreground text-sm">
                        No players match these filters.
                    </div>
                ) : (
                    visible.map((p, i) => (
                        <RedraftMiniCard
                            key={p.id}
                            player={p}
                            index={i}
                            rank={p.board_rank ?? i + 1}
                            positionFilter={positionFilter}
                            dataset={dataset}
                            isDrafted={drafted.has(p.slug)}
                            onToggleDrafted={toggleDrafted}
                        />
                    ))
                )}
            </div>
            ) : viewMode === 'board' ? (
                <RedraftDraftBoard players={visible} />
            ) : (
                visible.length === 0 ? (
                    <div className="p-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-2xl">
                        No players match these filters.
                    </div>
                ) : (
                    <RedraftBoxView players={visible} drafted={drafted} onToggleDrafted={toggleDrafted} />
                )
            )}
        </div>
    );
}

export function RedraftBoard({ players }: { players: RedraftPlayer[] }) {
    return (
        <Suspense fallback={<div className="py-16 text-center text-muted-foreground text-sm animate-pulse">Loading board…</div>}>
            <RedraftBoardContent players={players} />
        </Suspense>
    );
}
