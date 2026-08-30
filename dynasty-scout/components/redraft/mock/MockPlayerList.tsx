'use client';

import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { formatOdds, oddsTone, PlayerOdds } from '@/lib/draftOdds';
import { POSITION_COLORS, POSITION_PILL_ACTIVE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
    EligibilityCtx, Pos, RANK_SOURCES, RankSourceKey, canDraft, rankUnder, sortBySource,
} from '@/lib/mockDraft';

interface Props {
    available: RedraftPlayer[];
    /** Chance each player lasts to your next turn, weighted for this room. */
    odds?: Map<string, PlayerOdds> | null;
    sortSource: RankSourceKey;
    onSortChange: (s: RankSourceKey) => void;
    myRanks?: Map<number, number>;
    /** Null when it isn't the user's turn — rows render but can't be drafted. */
    eligibility: EligibilityCtx | null;
    onDraft: (player: RedraftPlayer) => void;
    myTurn: boolean;
}

const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;

export function MockPlayerList({
    available, odds, sortSource, onSortChange, myRanks, eligibility, onDraft, myTurn,
}: Props) {
    const [query, setQuery] = useState('');
    const [pos, setPos] = useState<string>('ALL');

    const rows = useMemo(() => {
        let list = sortBySource(available, sortSource, myRanks);
        if (pos !== 'ALL') list = list.filter(p => (p.position || '').toUpperCase() === pos);
        const q = query.trim().toLowerCase();
        if (q) {
            list = list.filter(p =>
                p.full_name.toLowerCase().includes(q) ||
                (p.nfl_team || '').toLowerCase().includes(q));
        }
        return list.slice(0, 200);
    }, [available, sortSource, myRanks, pos, query]);

    return (
        <div className="flex flex-col min-h-0 h-full">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 pb-2">
                <div className="relative flex-1 min-w-[150px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search available…"
                        aria-label="Search available players"
                        className="w-full h-8 pl-8 pr-7 rounded-lg bg-card border border-border/60 text-[12px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                    />
                    {query && (
                        <button onClick={() => setQuery('')} aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <select
                    aria-label="Sort players by"
                    value={sortSource}
                    onChange={e => onSortChange(e.target.value as RankSourceKey)}
                    className="h-8 rounded-lg bg-card border border-border/60 px-2 text-[11px] font-semibold"
                >
                    {RANK_SOURCES.map(src => (
                        <option key={src.key} value={src.key}
                            disabled={src.key === 'mine' && !myRanks?.size}>
                            {src.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex items-center gap-1 pb-2 flex-wrap">
                {POS_FILTERS.map(p => {
                    const active = pos === p;
                    const style = POSITION_PILL_ACTIVE[p] || POSITION_PILL_ACTIVE.ALL;
                    return (
                        <button
                            key={p}
                            onClick={() => setPos(p)}
                            className={cn('px-2 h-7 rounded-lg border text-[11px] font-bold transition-all',
                                active ? style.active : style.inactive)}
                        >
                            {p === 'DST' ? 'D/ST' : p}
                        </button>
                    );
                })}
                <span className="ml-auto text-[11px] text-muted-foreground/50">
                    {rows.length} shown
                </span>
            </div>

            {/* Rows */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/[0.05]"
                style={{ background: 'var(--bg-card)' }}>
                {rows.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        No available players match.
                    </div>
                ) : rows.map((p, i) => {
                    const pp = (p.position || '').toUpperCase() as Pos;
                    const rank = rankUnder(p, sortSource, myRanks);
                    const allowed = eligibility ? canDraft(pp, eligibility) : false;
                    return (
                        <div
                            key={p.id}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 border-b border-white/[0.03] last:border-0',
                                i % 2 ? 'bg-white/[0.015]' : '',
                                myTurn && !allowed && 'opacity-40',
                            )}
                        >
                            <span className="w-8 text-center text-[11px] font-bold font-[var(--font-jetbrains),monospace] text-muted-foreground/70">
                                {rank ?? '—'}
                            </span>
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0', POSITION_COLORS[pp])}>
                                {pp}{p.rank_positional ?? ''}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-semibold truncate">{p.full_name}</div>
                                <div className="text-[10px] text-muted-foreground/60">
                                    {p.nfl_team || 'FA'}
                                    {p.fin25 != null && ` · ${pp}${p.fin25} in 2025`}
                                    {p.proj_points != null && ` · ${Math.round(p.proj_points)} proj`}
                                    {odds?.get(p.slug) && (
                                        <>
                                            {' · '}
                                            <span
                                                className={cn('font-bold tabular-nums',
                                                    oddsTone(odds.get(p.slug)!.next))}
                                                title="Chance he is still on the board at your next pick, weighted for the boards this room drafts off"
                                            >
                                                {formatOdds(odds.get(p.slug)!.next)} back
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={!myTurn || !allowed}
                                onClick={() => onDraft(p)}
                                title={!myTurn ? 'Not your pick'
                                    : !allowed ? 'Your roster has no room for this position yet'
                                        : `Draft ${p.full_name}`}
                                className={cn(
                                    'px-2.5 h-7 rounded-lg text-[11px] font-bold transition-all shrink-0',
                                    myTurn && allowed
                                        ? 'bg-sky-500 text-white hover:bg-sky-600'
                                        : 'border border-border/50 text-muted-foreground/40 cursor-not-allowed',
                                )}
                            >
                                Draft
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
