'use client';

import React from 'react';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { POSITION_COLORS, POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { WatchlistButton, REDRAFT_WATCHLIST_KEY } from '@/components/WatchlistButton';
import { DraftedButton } from '@/components/DraftedButton';
import { REDRAFT_DRAFTED_KEY } from '@/lib/useDrafted';
import { formatOdds, oddsTone, ordinal, PlayerOdds } from '@/lib/draftOdds';

interface Props {
    players: RedraftPlayer[];
    drafted: Set<string>;
    /** Chance each player lasts to your next pick; null with no live draft. */
    odds?: Map<string, PlayerOdds> | null;
    onToggleDrafted?: (slug: string) => void;
}

function fmt(v: number | null | undefined, digits = 0): string {
    if (v == null) return '—';
    return digits > 0 ? Number(v).toFixed(digits) : Math.round(Number(v)).toLocaleString();
}

/**
 * Compact card: identity on one line, then the four numbers a draft decision
 * actually turns on — last year's per-game scoring and finish, this year's
 * projection, and the offence Vegas expects around him. Everything else
 * lives one tap away on the profile.
 */
export function RedraftBoxView({ players, drafted, odds, onToggleDrafted }: Props) {
    return (
        <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((p, i) => {
                const pos = (p.position || '').toUpperCase();
                const accent = POSITION_RAW[pos] || '#38bdf8';
                const rank = p.board_rank ?? i + 1;
                const headshot = p.nfl_headshot_url || p.headshot_url;
                const isDrafted = drafted.has(p.slug);
                const isRookie = p.draft_year === 2026;
                const isTop = rank <= 12;
                const contested = p.std_deviation != null && p.std_deviation >= 15;
                const odd = odds?.get(p.slug) ?? null;

                // During a live draft the odds displace the least
                // decision-relevant tile — you can read Vegas any time, but
                // "does he come back to me" only matters on the clock.
                const kpis = [
                    { label: 'PPG ’25', val: fmt(p.ppg25, 1) },
                    { label: 'Fin ’25', val: p.fin25 != null ? `${pos}${p.fin25}` : '—' },
                    { label: 'Proj ’26', val: fmt(p.proj_points), accent: 'text-sky-300' },
                    odd
                        ? {
                            label: 'Back to me',
                            val: formatOdds(odd.next),
                            accent: oddsTone(odd.next),
                            title: `${formatOdds(odd.next)} chance he is still there at your next pick`
                                + ` — ${ordinal(odd.rank)} on the board`
                                + ` with ${odd.picksBetween} `
                                + `${odd.picksBetween === 1 ? 'pick' : 'picks'} before your turn`
                                + (odd.following != null ? ` · ${formatOdds(odd.following)} the round after` : '')
                                + (odd.board ? ` · weighted to ${odd.board}` : ''),
                        }
                        : { label: 'Team O/U', val: fmt(p.vegas_implied_total, 1) },
                ];

                return (
                    <Link
                        key={p.id}
                        href={`/redraft/players/${p.slug}`}
                        className={cn(
                            'group relative rounded-xl border py-2.5 pr-3 pl-4 transition-all duration-200 animate-stagger-in',
                            'border-white/[0.06] hover:border-white/20 hover:-translate-y-0.5',
                            'flex flex-col gap-2 overflow-hidden',
                            isTop && 'ring-1 ring-sky-500/20 shadow-lg shadow-sky-500/5',
                            isDrafted && 'opacity-45',
                        )}
                        style={{
                            background: 'var(--bg-card)',
                            animationDelay: `${Math.min(i * 30, 500)}ms`,
                        }}
                        onContextMenu={(e) => {
                            if (!onToggleDrafted) return;
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleDrafted(p.slug);
                        }}
                        title={isDrafted
                            ? 'Right-click to put back on the board'
                            : 'Right-click to mark drafted'}
                    >
                        {/* Position accent bar down the left edge */}
                        <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />

                        {/* Identity line */}
                        <div className="flex items-center gap-2.5">
                            <span
                                className="w-8 flex-shrink-0 text-right text-lg font-bold font-[var(--font-jetbrains),monospace] leading-none tabular-nums"
                                style={{ color: isTop ? accent : undefined }}
                            >
                                {rank}
                            </span>
                            {headshot && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={headshot} alt="" loading="lazy"
                                    className="w-10 h-10 rounded-lg object-cover bg-white/5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className={cn(
                                        'text-[14px] font-bold truncate group-hover:text-sky-400 transition-colors',
                                        isDrafted && 'line-through decoration-2 decoration-emerald-400/60',
                                    )}>
                                        {p.full_name}
                                    </span>
                                    {isRookie && <GraduationCap className="w-3 h-3 text-primary/70 flex-shrink-0" />}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                                    <span className={cn('px-1.5 py-px rounded text-[10px] font-bold', POSITION_COLORS[pos])}>
                                        {pos}{p.rank_positional ?? ''}
                                    </span>
                                    {p.team_logo && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={p.team_logo} alt="" className="w-3.5 h-3.5 object-contain" loading="lazy" />
                                    )}
                                    <span className="truncate">{p.nfl_team || 'FA'}</span>
                                    {contested && (
                                        <span
                                            className="px-1 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold"
                                            title="The sources disagree sharply on this player"
                                        >
                                            ±
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div
                                className="flex flex-col items-center gap-0.5 flex-shrink-0 self-start"
                                onClick={e => e.preventDefault()}
                            >
                                <WatchlistButton playerSlug={p.slug} storageKey={REDRAFT_WATCHLIST_KEY} />
                                <DraftedButton playerSlug={p.slug} storageKey={REDRAFT_DRAFTED_KEY} className="w-5 h-5" />
                            </div>
                        </div>

                        {/* KPI strip */}
                        <div className="grid grid-cols-4 gap-1">
                            {kpis.map(k => (
                                <div key={k.label} title={'title' in k ? k.title : undefined}
                                    className="rounded-md bg-white/[0.03] px-1 py-1 text-center min-w-0">
                                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground/50 truncate">
                                        {k.label}
                                    </div>
                                    <div className={cn(
                                        'text-[12px] font-bold font-[var(--font-jetbrains),monospace] leading-tight tabular-nums',
                                        k.accent,
                                    )}>
                                        {k.val}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
