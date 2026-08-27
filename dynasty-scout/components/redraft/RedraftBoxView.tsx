'use client';

import React from 'react';
import Link from 'next/link';
import { GraduationCap, Scale } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { POSITION_COLORS, POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { WatchlistButton, REDRAFT_WATCHLIST_KEY } from '@/components/WatchlistButton';
import { DraftedButton } from '@/components/DraftedButton';
import { REDRAFT_DRAFTED_KEY } from '@/lib/useDrafted';

interface Props {
    players: RedraftPlayer[];
    drafted: Set<string>;
    onToggleDrafted?: (slug: string) => void;
}

/** Four seasons of PPG as a tiny inline sparkline — shape over precision. */
function Sparkline({ player, accent }: { player: RedraftPlayer; accent: string }) {
    const pts = [player.pts22, player.pts23, player.pts24, player.pts25];
    const known = pts.filter(p => p != null) as number[];
    if (known.length < 2) return null;

    const W = 96, H = 24;
    const max = Math.max(...known), min = Math.min(...known);
    const span = Math.max(max - min, 1);
    const step = W / Math.max(pts.length - 1, 1);

    // Gaps (a missed season) break the line rather than interpolating through.
    const segments: string[] = [];
    let current: string[] = [];
    pts.forEach((p, i) => {
        if (p == null) {
            if (current.length > 1) segments.push(current.join(' '));
            current = [];
            return;
        }
        const x = i * step;
        const y = H - ((p - min) / span) * (H - 4) - 2;
        current.push(`${current.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    if (current.length > 1) segments.push(current.join(' '));
    if (segments.length === 0) return null;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible" aria-hidden="true">
            {segments.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={accent} strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
            ))}
        </svg>
    );
}

function fmt(v: number | null | undefined, digits = 0): string {
    if (v == null) return '—';
    return digits > 0 ? Number(v).toFixed(digits) : Math.round(Number(v)).toLocaleString();
}

export function RedraftBoxView({ players, drafted, onToggleDrafted }: Props) {
    return (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((p, i) => {
                const pos = (p.position || '').toUpperCase();
                const accent = POSITION_RAW[pos] || '#38bdf8';
                const rank = p.board_rank ?? i + 1;
                const headshot = p.nfl_headshot_url || p.headshot_url;
                const isDrafted = drafted.has(p.slug);
                const isRookie = p.draft_year === 2026;
                const isTop = rank <= 12;

                const sources = ([
                    ['FP', p.fp_rank], ['ESPN', p.espn_rank], ['KTC', p.ktc_rank],
                    ['CBS', p.cbs_rank], ['YHO', p.yahoo_rank], ['SLP', p.sleeper_rank],
                    ['FC', p.fc_rank], ['FLK', p.flock_rank],
                    ['UD', p.underdog_rank], ['FFPC', p.ffpc_rank],
                ] as [string, number | null][]).filter(([, v]) => v != null);

                return (
                    <Link
                        key={p.id}
                        href={`/redraft/players/${p.slug}`}
                        className={cn(
                            'group relative rounded-2xl border p-3.5 transition-all duration-200 animate-stagger-in',
                            'border-white/[0.06] hover:border-white/20 hover:-translate-y-0.5',
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
                        {/* Position accent stripe */}
                        <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
                            style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />

                        {/* Header: rank + actions */}
                        <div className="flex items-start justify-between mb-2.5">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold font-[var(--font-jetbrains),monospace] leading-none"
                                    style={{ color: isTop ? accent : undefined }}>
                                    {rank}
                                </span>
                                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', POSITION_COLORS[pos])}>
                                    {pos}{p.rank_positional ?? ''}
                                </span>
                            </div>
                            <div className="flex items-center gap-0.5" onClick={e => e.preventDefault()}>
                                <WatchlistButton playerSlug={p.slug} storageKey={REDRAFT_WATCHLIST_KEY} />
                                <DraftedButton playerSlug={p.slug} storageKey={REDRAFT_DRAFTED_KEY} className="w-5 h-5" />
                            </div>
                        </div>

                        {/* Identity */}
                        <div className="flex items-center gap-2.5 mb-3">
                            {headshot && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={headshot} alt="" loading="lazy"
                                    className="w-11 h-11 rounded-lg object-cover bg-white/5 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                    <span className={cn(
                                        'text-[13px] font-bold truncate group-hover:text-sky-400 transition-colors',
                                        isDrafted && 'line-through decoration-2 decoration-emerald-400/60',
                                    )}>
                                        {p.full_name}
                                    </span>
                                    {isRookie && <GraduationCap className="w-3 h-3 text-primary/70 flex-shrink-0" />}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    {p.team_logo && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={p.team_logo} alt="" className="w-3.5 h-3.5 object-contain" loading="lazy" />
                                    )}
                                    <span className="truncate">{p.nfl_team || 'FA'}</span>
                                    {p.years_exp === 0 && <span className="text-emerald-400/80 font-semibold">R</span>}
                                </div>
                            </div>
                        </div>

                        {/* KPI row */}
                        <div className="grid grid-cols-3 gap-1 mb-2.5">
                            {[
                                { label: "'25 Pts", val: fmt(p.pts25, 1) },
                                { label: 'PPG', val: fmt(p.ppg25, 1) },
                                { label: 'Finish', val: p.fin25 != null ? `${pos}${p.fin25}` : '—' },
                            ].map(k => (
                                <div key={k.label} className="rounded-lg bg-white/[0.03] px-1.5 py-1.5 text-center">
                                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground/50">{k.label}</div>
                                    <div className="text-[12px] font-bold font-[var(--font-jetbrains),monospace] leading-tight">
                                        {k.val}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Sparkline + projection */}
                        <div className="flex items-center justify-between gap-2 mb-2.5 min-h-[26px]">
                            <Sparkline player={p} accent={accent} />
                            <div className="text-right flex-shrink-0">
                                <div className="text-[9px] uppercase tracking-wide text-muted-foreground/50">Proj '26</div>
                                <div className="text-[12px] font-bold font-[var(--font-jetbrains),monospace] text-sky-300">
                                    {fmt(p.proj_points)}
                                </div>
                            </div>
                        </div>

                        {/* Source chips */}
                        {sources.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-2 border-t border-white/[0.05]">
                                {sources.slice(0, 5).map(([label, v]) => (
                                    <span key={label} className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[9px]">
                                        <span className="text-muted-foreground/60">{label}</span>{' '}
                                        <span className="font-semibold font-[var(--font-jetbrains),monospace]">{v}</span>
                                    </span>
                                ))}
                                {p.std_deviation != null && p.std_deviation >= 15 && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold">
                                        contested
                                    </span>
                                )}
                            </div>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}
