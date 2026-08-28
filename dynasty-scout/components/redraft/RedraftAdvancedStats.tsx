'use client';

import React, { useMemo, useState } from 'react';
import { NflAdvancedSeason } from '@/lib/types';
import {
    AdvancedMetric, NEUTRAL_TILE, getAdvancedGroups, percentileColors, percentileOf,
} from '@/lib/redraftAdvanced';
import { cn } from '@/lib/utils';

interface Props {
    /** The player's advanced seasons, newest first. */
    seasons: NflAdvancedSeason[];
    /** Same-position, same-season rows used as the percentile field. */
    peersBySeason: Record<number, NflAdvancedSeason[]>;
    position: string;
    accent: string;
}

function Tile({ metric, row, peers }: {
    metric: AdvancedMetric;
    row: NflAdvancedSeason;
    peers: NflAdvancedSeason[];
}) {
    const raw = row[metric.key];
    const value = typeof raw === 'number' ? raw : null;

    if (value == null) {
        return (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-3 text-center flex flex-col justify-center gap-1"
                title={`${metric.label} — not charted for this season`}>
                <div className="text-sm font-black font-[var(--font-jetbrains),monospace] text-muted-foreground/25 leading-none">—</div>
                <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/25 leading-tight">
                    {metric.abbr}
                </div>
            </div>
        );
    }

    const field = peers
        .map(p => p[metric.key])
        .filter((v): v is number => typeof v === 'number');
    const pct = metric.neutral
        ? null
        : percentileOf(value, field, metric.higherBetter !== false);
    const colors = pct == null ? NEUTRAL_TILE : percentileColors(pct);

    const title = [
        `${metric.label}: ${metric.fmt(value)}`,
        pct != null ? `${pct}th percentile vs ${row.position}s in ${row.season}` : null,
        metric.tooltip,
    ].filter(Boolean).join(' · ');

    return (
        <div className={cn('rounded-lg border px-2 py-3 text-center flex flex-col justify-center gap-1', colors.bg)}
            title={title}>
            <div className={cn('text-sm font-black font-[var(--font-jetbrains),monospace] leading-none', colors.text)}>
                {metric.fmt(value)}
            </div>
            <div className={cn('text-[8px] font-bold uppercase tracking-wider leading-tight opacity-75', colors.text)}>
                {metric.abbr}
            </div>
            {pct != null ? (
                <div className="mt-1 h-0.5 bg-black/25 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full opacity-70', colors.bar)} style={{ width: `${pct}%` }} />
                </div>
            ) : (
                <div className="mt-1 h-0.5" />
            )}
        </div>
    );
}

export function RedraftAdvancedStats({ seasons, peersBySeason, position, accent }: Props) {
    const [selected, setSelected] = useState<number | null>(seasons[0]?.season ?? null);
    const groups = useMemo(() => getAdvancedGroups(position), [position]);

    const row = seasons.find(s => s.season === selected) ?? seasons[0];
    if (!row) return null;

    const peers = peersBySeason[row.season] ?? [];
    const graded = peers.length >= 8;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                    {seasons.map(s => (
                        <button key={s.season} onClick={() => setSelected(s.season)}
                            className={cn(
                                'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors',
                                s.season === row.season
                                    ? 'text-background'
                                    : 'text-muted-foreground border-white/10 hover:text-foreground',
                            )}
                            style={s.season === row.season
                                ? { background: accent, borderColor: accent }
                                : undefined}>
                            {s.season}
                        </button>
                    ))}
                </div>
                <span className="text-[11px] text-muted-foreground">
                    {row.team ?? '—'} · {row.games ?? '—'} games
                    {graded
                        ? ` · graded against ${peers.length} ${position}s`
                        : ' · too few qualifiers to grade'}
                </span>
            </div>

            {groups.map(group => (
                <div key={group.title}>
                    <div className="flex items-baseline gap-2 mb-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                            {group.title}
                        </h4>
                        {group.note && (
                            <span className="text-[10px] text-muted-foreground/40">{group.note}</span>
                        )}
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
                        {group.metrics.map(m => (
                            <Tile key={m.key} metric={m} row={row} peers={peers} />
                        ))}
                    </div>
                </div>
            ))}

            <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
                Colour is the percentile against every {position} with a qualifying season in{' '}
                {row.season} — green is good, red is not. Grey tiles are descriptive
                (alignment, depth, leverage), where a high number is a role rather than a verdict.
                Source: nflverse play-by-play, Pro-Football-Reference charting and snap counts.
            </p>
        </div>
    );
}
