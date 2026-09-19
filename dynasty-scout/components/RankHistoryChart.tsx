'use client';

import React from 'react';
import {
    Area, CartesianGrid, ComposedChart, Line, ReferenceDot,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';

export interface RankPoint {
    /** ISO date the rank was computed or scraped. */
    date: string;
    rank: number;
    /** Best and worst rank across the sources that day, where known. */
    best?: number | null;
    worst?: number | null;
    sources?: number | null;
}

/**
 * How a player's ranking has moved, and how much the sources disagreed.
 *
 * One line, not ten. A line per source is the obvious way to draw this and it
 * is unreadable by about the fourth one — a redraft player carries ten, and
 * a categorical palette that large is one the eye cannot separate even when
 * it passes a contrast check. So the consensus is the series and the spread
 * between the most and least bullish source is a band behind it, which says
 * the same thing in less ink: a wide band is a player nobody agrees about.
 *
 * The rank axis is inverted, because rank 1 is the top of a board and drawing
 * it at the bottom of a chart inverts the meaning of every slope on it.
 *
 * Because there is one series, there is no legend — the heading names it, and
 * the band is labelled where it is explained rather than in a box of swatches.
 */
export function RankHistoryChart({ points, label, height = 150 }: {
    points: RankPoint[];
    /** What the line is, e.g. "consensus rank". Named instead of a legend. */
    label: string;
    height?: number;
}) {
    // Recharts draws an Area from zero, so the band is drawn as a floor plus a
    // height stacked on it — the floor is made invisible and only the span
    // between best and worst is painted.
    const data = points.map(p => ({
        ...p,
        floor: p.best ?? null,
        span: p.best != null && p.worst != null ? p.worst - p.best : null,
    }));
    const hasBand = data.some(d => d.span != null);

    const ranks = points.flatMap(p =>
        [p.rank, p.best ?? p.rank, p.worst ?? p.rank]);
    const lo = Math.max(1, Math.min(...ranks) - 2);
    const hi = Math.max(...ranks) + 2;

    const first = points[0];
    const last = points[points.length - 1];
    const moved = last.rank - first.rank;

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
                <h3 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    {label} over time
                </h3>
                <span className="text-[9px] text-muted-foreground/35">
                    {hasBand ? 'band is the best and worst source that day · ' : ''}
                    lower is better
                </span>
            </div>

            {points.length < 2 ? (
                /* One reading is not a trend, and a line drawn through a
                   single point implies a history that is not there yet. */
                <p className="text-[11px] text-muted-foreground/45 py-3">
                    Ranked {last.rank} on {last.date}. Only one reading so far — the
                    line starts once this has been scraped on more than one day.
                </p>
            ) : (
                <>
                    <ResponsiveContainer width="100%" height={height}>
                        <ComposedChart data={data}
                            /* No negative left margin. It buys a few pixels
                               of plot and clips every tick label by six of
                               them — a rank runs to four digits here, so the
                               axis needs its full width. */
                            margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)' }}
                                tickLine={false} axisLine={{ stroke: CHART_INK.axis }}
                                tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                            <YAxis reversed domain={[lo, hi]} allowDecimals={false}
                                width={42}
                                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)' }}
                                tickLine={false} axisLine={false} />
                            {hasBand && (
                                <>
                                    <Area dataKey="floor" stackId="band" stroke="none"
                                        fill="transparent" isAnimationActive={false} />
                                    <Area dataKey="span" stackId="band" stroke="none"
                                        fill={SERIES.a} fillOpacity={0.14}
                                        isAnimationActive={false} />
                                </>
                            )}
                            <Line type="monotone" dataKey="rank" stroke={SERIES.a}
                                strokeWidth={MARK.lineWidth} dot={false}
                                activeDot={{ r: MARK.dotRadius, strokeWidth: 2,
                                    stroke: CHART_INK.surface }}
                                isAnimationActive={false} />
                            {/* Where it stands now, labelled rather than left to
                                the reader to find at the end of the line. */}
                            <ReferenceDot x={last.date} y={last.rank} r={MARK.dotRadius}
                                fill={SERIES.a} stroke={CHART_INK.surface} strokeWidth={2} />
                            <Tooltip
                                cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }}
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const p = payload[0].payload as RankPoint;
                                    return (
                                        <div className="rounded-lg px-2.5 py-1.5 text-[11px]
                                                        border border-white/10 shadow-xl"
                                            style={{ background: 'rgba(12,21,32,0.96)' }}>
                                            <div className="font-semibold">{p.date}</div>
                                            <div className="tabular-nums">
                                                rank {p.rank}
                                            </div>
                                            {p.best != null && p.worst != null && (
                                                <div className="text-muted-foreground/55
                                                                tabular-nums text-[10px]">
                                                    sources ranged {p.best}–{p.worst}
                                                    {p.sources ? ` (${p.sources})` : ''}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] text-muted-foreground/45 tabular-nums mt-0.5">
                        {first.date} → {last.date}:{' '}
                        {moved === 0
                            ? 'unmoved'
                            : `${moved < 0 ? 'up' : 'down'} ${Math.abs(moved)} `
                              + `(${first.rank} → ${last.rank})`}
                    </p>
                </>
            )}
        </div>
    );
}
