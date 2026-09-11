'use client';

import React from 'react';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';

/**
 * Why one player is ahead of the other, not just that he is.
 *
 * A dumbbell per metric: one dot each, joined by the gap between them. For
 * exactly two entities this beats paired bars — the gap is the comparison,
 * and here it is drawn rather than left for the reader to measure.
 *
 * The metrics are grouped by what they actually are, because they are not
 * equally trustworthy. Opportunity is the stable half of a player's profile
 * and mostly carries forward; efficiency swings hard week to week and
 * regresses; environment is the market's view and belongs to the team rather
 * than the player. A reader who knows which is which reads the chart
 * correctly, and one who does not will over-weight a hot efficiency number.
 */

export type MetricGroup = 'opportunity' | 'efficiency' | 'environment';

export interface Metric {
    key: string;
    label: string;
    group: MetricGroup;
    a: number | null;
    b: number | null;
    /** Rendering hint: share metrics read as percentages. */
    format?: 'number' | 'percent';
    /**
     * Explicit domain. Without one the row frames the pair it is showing
     * rather than starting at zero — a dumbbell encodes position, not length,
     * so a zero baseline buys nothing and costs the whole comparison: two
     * values 21.6 and 18.6 on a 0..21.6 scale put both dots in the last
     * fifth of the row with the gap, which IS the finding, squeezed to
     * nothing.
     */
    domain?: [number, number];
    /** True when a lower number is the better one. */
    lowerIsBetter?: boolean;
}

const GROUP_NOTE: Record<MetricGroup, string> = {
    opportunity: 'Volume. The stable half — mostly carries week to week.',
    efficiency: 'Rate. Swings hard and regresses; treat a hot number carefully.',
    environment: "The market's view of the game. Belongs to the team, not the player.",
};

function fmt(v: number | null, f: Metric['format']): string {
    if (v == null) return '—';
    return f === 'percent' ? `${(v * 100).toFixed(0)}%` : v.toFixed(1);
}

export function UsageDumbbell({ metrics, nameA, nameB }: {
    metrics: Metric[];
    nameA: string;
    nameB: string;
}) {
    const groups: MetricGroup[] = ['opportunity', 'efficiency', 'environment'];
    return (
        <div className="space-y-4">
            {/* identity is never colour alone: the legend names both series */}
            <div className="flex items-center gap-4 text-[11px] font-semibold">
                {([['a', nameA], ['b', nameB]] as const).map(([k, n]) => (
                    <span key={k} className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block rounded-full"
                            style={{ width: 9, height: 9, background: SERIES[k] }} />
                        {n}
                    </span>
                ))}
            </div>

            {groups.map(g => {
                const rows = metrics.filter(m => m.group === g);
                if (rows.length === 0) return null;
                return (
                    <section key={g}>
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/45">
                            {g}
                        </h4>
                        <p className="text-[10px] text-muted-foreground/35 mb-1.5">{GROUP_NOTE[g]}</p>
                        <div className="space-y-1">
                            {rows.map(m => {
                                const vals = [m.a, m.b].filter((v): v is number => v != null);
                                let [lo, hi] = m.domain ?? [Math.min(...vals), Math.max(...vals)];
                                // Pad so the dots never sit on the row's edge,
                                // and give an identical pair a visible middle
                                // rather than a divide by zero.
                                const pad = Math.max((hi - lo) * 0.25, Math.abs(hi) * 0.08, 0.5);
                                lo -= pad; hi += pad;
                                const pos = (v: number | null) =>
                                    v == null || hi === lo ? null
                                        : `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
                                const pa = pos(m.a), pb = pos(m.b);
                                const lead = m.a == null || m.b == null ? null
                                    : (m.lowerIsBetter ? m.a < m.b : m.a > m.b) ? 'a' : 'b';
                                return (
                                    <div key={m.key}
                                        className="grid grid-cols-[104px_minmax(0,1fr)_112px] items-center gap-2"
                                        title={`${m.label}: ${nameA} ${fmt(m.a, m.format)}, `
                                            + `${nameB} ${fmt(m.b, m.format)}`}>
                                        <span className="text-[11px] text-muted-foreground/70 truncate">
                                            {m.label}
                                        </span>
                                        <span className="relative h-5 block">
                                            <span className="absolute inset-x-0 top-1/2 h-px"
                                                style={{ background: CHART_INK.grid }} />
                                            {pa && pb && (
                                                <span className="absolute top-1/2 -translate-y-1/2 h-0.5"
                                                    style={{
                                                        left: `min(${pa}, ${pb})`,
                                                        width: `calc(max(${pa}, ${pb}) - min(${pa}, ${pb}))`,
                                                        background: 'rgba(255,255,255,0.22)',
                                                    }} />
                                            )}
                                            {([['a', pa], ['b', pb]] as const).map(([k, p]) => p && (
                                                <span key={k} className="absolute top-1/2 rounded-full"
                                                    style={{
                                                        left: p,
                                                        width: MARK.dotRadius * 2,
                                                        height: MARK.dotRadius * 2,
                                                        marginLeft: -MARK.dotRadius,
                                                        marginTop: -MARK.dotRadius,
                                                        background: SERIES[k],
                                                        boxShadow: `0 0 0 ${MARK.gap}px ${CHART_INK.surface}`,
                                                    }} />
                                            ))}
                                        </span>
                                        <span className="flex items-center justify-end gap-2 tabular-nums text-[11px]">
                                            <span className={lead === 'a' ? 'text-foreground font-bold' : 'text-muted-foreground/55'}>
                                                {fmt(m.a, m.format)}
                                            </span>
                                            <span className="text-muted-foreground/25">/</span>
                                            <span className={lead === 'b' ? 'text-foreground font-bold' : 'text-muted-foreground/55'}>
                                                {fmt(m.b, m.format)}
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
