'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Gavel } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { POSITION_COLORS, POSITION_RAW, REDRAFT_POSITIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useDrafted, REDRAFT_DRAFTED_KEY } from '@/lib/useDrafted';


interface Props {
    players: RedraftPlayer[];
}

/** Redraft leagues are usually 10 or 12 teams; 14 shows up in deeper formats. */
const LEAGUE_SIZES = [8, 10, 12, 14, 16] as const;
const DEFAULT_SIZE = 12;

type BoardSort = 'consensus' | 'mine' | keyof RedraftPlayer;

/**
 * What the board can be ordered by. 'consensus' keeps the order it was handed
 * (the weighted consensus, or whatever the list view was sorted by); 'mine'
 * flattens the redraft tier builder into a personal 1..N ranking.
 */
const SORT_OPTIONS: { key: BoardSort; label: string }[] = [
    { key: 'consensus', label: 'Consensus' },
    { key: 'mine', label: 'My Tiers' },
    { key: 'fp_rank', label: 'FantasyPros' },
    { key: 'espn_rank', label: 'ESPN' },
    { key: 'flock_rank', label: 'Flock' },
    { key: 'cbs_rank', label: 'CBS' },
    { key: 'sleeper_rank', label: 'Sleeper ADP' },
    { key: 'yahoo_rank', label: 'Yahoo' },
    { key: 'underdog_rank', label: 'Underdog' },
    { key: 'ffpc_rank', label: 'FFPC' },
    { key: 'ktc_rank', label: 'KeepTradeCut' },
    { key: 'fc_rank', label: 'FantasyCalc' },
];

interface TierApiRow {
    id: number;
    tier_name: string;
    tier_order: number;
    players?: { id: number }[];
}

/** Cells are tinted by position — the convention on every draft board, and
 *  it makes positional runs visible at a glance as the draft unfolds. */
function positionStyle(pos: string) {
    const c = POSITION_RAW[pos] || '#64748b';
    return {
        borderColor: `${c}66`,
        background: `linear-gradient(160deg, ${c}1f 0%, ${c}0a 60%, transparent 100%)`,
        accent: c,
    };
}

/** "A. St. Brown" — keeps two-word surnames intact in a narrow cell. */
function shortName(p: RedraftPlayer): string {
    if (p.position === 'DST') {
        // "Seattle Seahawks D/ST" -> "Seahawks"
        return p.full_name.replace(/\s*D\/ST$/i, '').split(' ').slice(-1)[0];
    }
    const parts = p.full_name.trim().split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

export function RedraftDraftBoard({ players }: Props) {
    const [perRound, setPerRound] = useState<number>(DEFAULT_SIZE);
    const [sortBy, setSortBy] = useState<BoardSort>('consensus');
    const [myRanks, setMyRanks] = useState<Map<number, number>>(new Map());
    const [tierNames, setTierNames] = useState<Map<number, string>>(new Map());
    const { drafted, toggle } = useDrafted(REDRAFT_DRAFTED_KEY);

    // Flatten the redraft tiers into a personal ranking: every player in tier 1
    // in their saved order, then tier 2, and so on.
    useEffect(() => {
        let cancelled = false;
        fetch('/api/tiers?mode=redraft')
            .then(r => r.json())
            .then((tiers: TierApiRow[]) => {
                if (cancelled || !Array.isArray(tiers)) return;
                const ranks = new Map<number, number>();
                const names = new Map<number, string>();
                let n = 0;
                [...tiers]
                    .sort((a, b) => (a.tier_order ?? 0) - (b.tier_order ?? 0))
                    .forEach(t => {
                        (t.players || []).forEach(pl => {
                            if (!ranks.has(pl.id)) {
                                ranks.set(pl.id, ++n);
                                names.set(pl.id, t.tier_name);
                            }
                        });
                    });
                setMyRanks(ranks);
                setTierNames(names);
            })
            .catch(() => { /* tiers are optional — the board still works without them */ });
        return () => { cancelled = true; };
    }, []);

    const ordered = useMemo(() => {
        if (sortBy === 'consensus') return players;

        const rankOf = (p: RedraftPlayer): number | null =>
            sortBy === 'mine'
                ? myRanks.get(p.id) ?? null
                : (p[sortBy as keyof RedraftPlayer] as number | null) ?? null;

        // Keep the incoming order as the tiebreak so players this source didn't
        // rank still fall in a sensible sequence behind the ones it did.
        const original = new Map(players.map((p, i) => [p.id, i]));
        return [...players].sort((a, b) => {
            const av = rankOf(a);
            const bv = rankOf(b);
            if (av == null && bv == null) return original.get(a.id)! - original.get(b.id)!;
            if (av == null) return 1;
            if (bv == null) return -1;
            return av - bv || original.get(a.id)! - original.get(b.id)!;
        });
    }, [players, sortBy, myRanks]);

    if (players.length === 0) {
        return <div className="p-12 text-center text-muted-foreground text-sm">No players match these filters.</div>;
    }

    const rankedBySort = sortBy === 'consensus'
        ? players.length
        : ordered.filter(p => (sortBy === 'mine'
            ? myRanks.get(p.id)
            : (p[sortBy as keyof RedraftPlayer] as number | null)) != null).length;

    const rounds: RedraftPlayer[][] = [];
    for (let i = 0; i < ordered.length; i += perRound) {
        rounds.push(ordered.slice(i, i + perRound));
    }
    // A full 1332-player board would be 111 rounds of noise; 20 covers any draft.
    const shown = rounds.slice(0, 20);

    return (
        <div className="space-y-2">
            {/* Legend + league size */}
            <div className="flex items-center gap-4 px-2 pb-1 flex-wrap">
                <span className="text-muted-foreground/40 uppercase tracking-widest text-[9px] font-bold">Position</span>
                {REDRAFT_POSITIONS.map(pos => (
                    <span key={pos} className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-semibold">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: POSITION_RAW[pos] }} />
                        {pos === 'DST' ? 'D/ST' : pos}
                    </span>
                ))}

                <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground/60 font-semibold">Order by</span>
                        <select
                            value={String(sortBy)}
                            onChange={e => setSortBy(e.target.value as BoardSort)}
                            aria-label="Order the board by"
                            className="h-7 rounded-lg bg-card border border-border/60 px-2 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                        >
                            {SORT_OPTIONS.map(o => (
                                <option
                                    key={String(o.key)}
                                    value={String(o.key)}
                                    disabled={o.key === 'mine' && myRanks.size === 0}
                                >
                                    {o.label}
                                    {o.key === 'mine' && myRanks.size > 0 ? ` (${myRanks.size})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground/60 font-semibold">League size</span>
                    <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1">
                        {LEAGUE_SIZES.map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setPerRound(n)}
                                className={cn(
                                    'px-2 h-6 rounded-md text-[11px] font-bold transition-all',
                                    perRound === n
                                        ? 'bg-sky-500/20 text-sky-400'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                                )}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    </div>
                </div>
            </div>

            {sortBy !== 'consensus' && (
                <div className="px-2 text-[11px] text-muted-foreground/60">
                    Ordered by{' '}
                    <span className="text-sky-400 font-semibold">
                        {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
                    </span>
                    {' — '}{rankedBySort.toLocaleString()} ranked
                    {sortBy === 'mine'
                        ? '; everyone you have not tiered follows in consensus order.'
                        : '; players this source did not rank follow in consensus order.'}
                </div>
            )}

            {/* Board — scrolls horizontally on narrow screens */}
            <div className="overflow-x-auto">
                <div style={{ minWidth: `${52 + perRound * 96}px` }}>
                    {shown.map((roundPlayers, roundIdx) => {
                        const roundNum = roundIdx + 1;
                        return (
                            <div key={roundIdx} className="flex items-stretch gap-1 mb-1">
                                {/* Round label */}
                                <div className="w-10 flex-shrink-0 flex items-center justify-center border-r border-border/20 mr-1">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/40">
                                        Rd {roundNum}
                                    </span>
                                </div>

                                {Array.from({ length: perRound }).map((_, pickIdx) => {
                                    const player = roundPlayers[pickIdx];
                                    const pickLabel = `${roundNum}.${String(pickIdx + 1).padStart(2, '0')}`;

                                    if (!player) {
                                        return (
                                            <div
                                                key={pickIdx}
                                                className="flex-1 min-w-[90px] rounded border border-border/10 bg-muted/[0.03]"
                                                style={{ minHeight: '62px' }}
                                            />
                                        );
                                    }

                                    const pos = (player.position || '').toUpperCase();
                                    const style = positionStyle(pos);
                                    const isDrafted = drafted.has(player.slug);

                                    return (
                                        <Link
                                            key={player.id}
                                            href={`/redraft/players/${player.slug}`}
                                            className={cn(
                                                'group relative flex-1 min-w-[90px] flex flex-col rounded border px-2 py-1.5 cursor-pointer overflow-hidden',
                                                'transition-all duration-150 hover:scale-[1.04] hover:z-10 hover:shadow-lg hover:shadow-black/40',
                                                isDrafted && 'opacity-40 grayscale',
                                            )}
                                            style={{
                                                minHeight: '62px',
                                                borderColor: style.borderColor,
                                                background: style.background,
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggle(player.slug);
                                            }}
                                            title={[
                                                player.full_name,
                                                sortBy === 'mine' && tierNames.get(player.id)
                                                    ? `(${tierNames.get(player.id)})`
                                                    : '',
                                                `— right-click to ${isDrafted ? 'put back on the board' : 'mark drafted'}`,
                                            ].filter(Boolean).join(' ')}
                                        >
                                            {/* Mark drafted — hover only, so the grid stays clean */}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(player.slug); }}
                                                title={isDrafted ? 'Mark as available' : 'Mark as drafted'}
                                                aria-label={isDrafted ? 'Mark as available' : 'Mark as drafted'}
                                                className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded bg-card/90 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Gavel className={cn('w-3 h-3', isDrafted ? 'text-emerald-400' : 'text-muted-foreground')} />
                                            </button>

                                            {/* Pick slot + position */}
                                            <div className="flex items-center justify-between gap-1">
                                                <span
                                                    className="text-[9px] font-black font-[var(--font-jetbrains),monospace] leading-none"
                                                    style={{ color: style.accent }}
                                                >
                                                    {pickLabel}
                                                </span>
                                                <span
                                                    style={{ padding: '1px 5px', borderRadius: 9999, fontSize: 7, fontWeight: 800, lineHeight: 1.4, whiteSpace: 'nowrap' }}
                                                    className={cn('border inline-flex items-center flex-shrink-0', POSITION_COLORS[pos])}
                                                >
                                                    {pos === 'DST' ? 'DST' : pos}{player.rank_positional ?? ''}
                                                </span>
                                            </div>

                                            {/* Name */}
                                            <div
                                                className={cn(
                                                    'text-[11px] font-bold text-foreground leading-snug mt-1 group-hover:text-sky-400 transition-colors',
                                                    isDrafted && 'line-through decoration-2 decoration-emerald-400/60',
                                                )}
                                                title={player.full_name}
                                                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                            >
                                                {shortName(player)}
                                            </div>

                                            {/* Team + last season's finish — the draft-day context that matters */}
                                            <div className="flex items-center gap-1 mt-auto pt-0.5">
                                                <span className="text-[8px] font-semibold text-muted-foreground/60 truncate">
                                                    {player.nfl_team || 'FA'}
                                                </span>
                                                {player.fin25 != null && (
                                                    <span className={cn(
                                                        'text-[8px] font-bold ml-auto',
                                                        player.fin25 <= 12 ? 'text-emerald-400/80' : 'text-muted-foreground/40',
                                                    )}>
                                                        {pos}{player.fin25}
                                                    </span>
                                                )}
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {rounds.length > shown.length && (
                <div className="text-[11px] text-muted-foreground/50 px-2 pt-1">
                    Showing the first {shown.length} rounds ({shown.length * perRound} players) of{' '}
                    {players.length.toLocaleString()}. Filter or search to reach the rest.
                </div>
            )}
        </div>
    );
}
