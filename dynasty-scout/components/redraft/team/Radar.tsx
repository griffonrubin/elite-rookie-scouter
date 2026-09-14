'use client';

import React from 'react';
import { CHART_INK, SERIES } from '@/lib/vizTokens';

/**
 * A roster's shape against the league it plays in.
 *
 * Radar charts deserve most of the bad reputation they have: arbitrary axis
 * order, arbitrary scales, and an enclosed area that looks like a quantity
 * and is not one. Every one of those objections is about putting unlike
 * numbers on unlike axes.
 *
 * These axes are percentiles against the same eleven opponents, so they are
 * the same unit with the same range and the same midpoint, and the ring at
 * fifty is a real line: a team on it is exactly league average at that
 * measure. That is the one case where the shape means what it appears to
 * mean, and it is the case this page is in.
 *
 * The raw number is always printed beside the axis label, because a
 * percentile hides how close the league was — best of twelve by four points
 * a week and best of twelve by a quarter of a point draw identically.
 */

export interface RadarAxis {
    key: string;
    /** Short enough for the chart. */
    label: string;
    /** The full name, for the table, where there is room. */
    full?: string;
    /** 0..100 against the league. */
    value: number;
    /** The measurement behind it, already formatted. */
    raw: string;
    rank: number;
    of: number;
    note?: string;
}

export interface RadarSeries {
    key: string;
    name: string;
    colour: string;
    values: Record<string, number>;
}

/**
 * Room for the labels, which is most of the box.
 *
 * The plot is eighty-six across and the frame is three hundred and twenty,
 * because "Rest of season" sits outside the widest ring and an SVG clips
 * rather than wraps — the first version cut it to "Rest of sea:". Axis names
 * are shortened here too and given in full in the table beneath.
 */
const W = 320;
const H = 250;
const R = 86;
const CX = W / 2;
const CY = H / 2 + 4;

export function Radar({ axes, series, title, subtitle }: {
    axes: RadarAxis[];
    /** One or two rosters. Three would be a mess and is not offered. */
    series: RadarSeries[];
    title: string;
    subtitle?: string;
}) {
    if (axes.length < 3) return null;
    const n = axes.length;
    const angle = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
    const at = (i: number, v: number) => {
        const r = (Math.max(0, Math.min(100, v)) / 100) * R;
        return [CX + Math.cos(angle(i)) * r, CY + Math.sin(angle(i)) * r] as const;
    };
    const ring = (v: number) => axes
        .map((_, i) => at(i, v).join(','))
        .join(' ');

    return (
        <figure className="m-0">
            <figcaption className="mb-1">
                <h3 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">{title}</h3>
                {subtitle && (
                    <p className="text-[9px] text-muted-foreground/35">{subtitle}</p>
                )}
            </figcaption>
            {/* A minimum width inside a scroller: an SVG viewBox scales its
                text with the frame, so a phone would otherwise render these
                labels at five pixels. */}
            <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H}`} width="100%"
                    className="min-w-[300px] max-w-[360px]"
                    role="img"
                    aria-label={`${title}: ${axes.map(a =>
                        `${a.label} ${a.rank} of ${a.of}`).join(', ')}`}>
                    {/* Rings at every quarter, and the one at the middle drawn
                        brighter — it is league average, which is the only
                        line on the chart that is a fact rather than
                        furniture. */}
                    {[25, 50, 75, 100].map(v => (
                        <polygon key={v} points={ring(v)} fill="none"
                            stroke={v === 50 ? 'rgba(255,255,255,0.22)' : CHART_INK.grid}
                            strokeWidth={v === 50 ? 1 : 1}
                            strokeDasharray={v === 50 ? '3 3' : undefined} />
                    ))}
                    {axes.map((a, i) => {
                        const [x, y] = at(i, 100);
                        return <line key={a.key} x1={CX} y1={CY} x2={x} y2={y}
                            stroke={CHART_INK.grid} strokeWidth={1} />;
                    })}
                    {series.map(s => (
                        <polygon key={s.key}
                            points={axes.map((a, i) =>
                                at(i, s.values[a.key] ?? 0).join(',')).join(' ')}
                            fill={s.colour} fillOpacity={series.length > 1 ? 0.14 : 0.2}
                            stroke={s.colour} strokeWidth={2}
                            strokeLinejoin="round" />
                    ))}
                    {series.map(s => axes.map((a, i) => {
                        const [x, y] = at(i, s.values[a.key] ?? 0);
                        return <circle key={s.key + a.key} cx={x} cy={y} r={3}
                            fill={s.colour} stroke={CHART_INK.surface} strokeWidth={1.5} />;
                    }))}
                    {axes.map((a, i) => {
                        const [x, y] = at(i, 124);
                        const anchor = Math.abs(x - CX) < 6 ? 'middle'
                            : x > CX ? 'start' : 'end';
                        return (
                            <text key={a.key} x={x} y={y + 3} textAnchor={anchor}
                                fontSize="8.5" fontWeight="700"
                                fill="rgba(255,255,255,0.55)">
                                {a.label}
                            </text>
                        );
                    })}
                </svg>
            </div>
        </figure>
    );
}

/**
 * The same numbers as a table, because a shape is not a reading.
 *
 * Required rather than optional: an accessibility fallback that is also the
 * better artefact for anyone comparing two close measures, and the place the
 * raw figures live. A reader who wants to know whether "best in the league"
 * was by four points or by a quarter of one has to be able to find out.
 */
export function RadarTable({ axes, series }: {
    axes: RadarAxis[];
    series: RadarSeries[];
}) {
    // Capped, because a table stretched across a wide screen leaves a
    // thousand pixels between a row's name and its number, and a reader has
    // to trace across the gap to pair them.
    return (
        <table className="w-full max-w-[560px] text-[10px] tabular-nums">
            <thead>
                <tr className="text-muted-foreground/40 uppercase tracking-widest
                               text-[9px]">
                    <th className="text-left font-bold pb-1">Measure</th>
                    {series.map(s => (
                        <th key={s.key} className="text-right font-bold pb-1 pl-2">
                            <span className="inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: s.colour }} />
                                {s.name}
                            </span>
                        </th>
                    ))}
                    <th className="text-right font-bold pb-1 pl-2 hidden sm:table-cell">
                        Measured
                    </th>
                </tr>
            </thead>
            <tbody>
                {axes.map(a => (
                    <tr key={a.key} className="border-t border-white/[0.05]">
                        <th scope="row"
                            className="text-left font-normal text-muted-foreground/60 py-1
                                       align-top">
                            {a.full ?? a.label}
                            {a.note && (
                                <span className="block text-[9px] text-muted-foreground/30
                                                 leading-snug max-w-[280px]">
                                    {a.note}
                                </span>
                            )}
                        </th>
                        {series.map(s => (
                            <td key={s.key} className="text-right py-1 pl-2 align-top">
                                <span className="font-semibold" style={{ color: s.colour }}>
                                    {Math.round(s.values[a.key] ?? 0)}
                                </span>
                                <span className="text-muted-foreground/30">
                                    {s.key === series[0].key && ` · ${a.rank} of ${a.of}`}
                                </span>
                            </td>
                        ))}
                        <td className="text-right py-1 pl-2 text-muted-foreground/45
                                       hidden sm:table-cell align-top">
                            {a.raw}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export const RADAR_COLOURS = { mine: SERIES.a, theirs: SERIES.b };
