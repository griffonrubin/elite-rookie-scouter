'use client';

import React from 'react';
import { NflSeasonStat } from '@/lib/types';

interface Props {
    seasons: NflSeasonStat[];
    position: string;
    accent: string;
}

/**
 * Points-per-game by season as an area chart, with the positional finish
 * called out under each point. PPG is used rather than season totals so an
 * injury-shortened year doesn't read as a collapse in production.
 *
 * Pure inline SVG — same approach as the rookie board's StatTrendChart.
 */
export function SeasonTrendChart({ seasons, position, accent }: Props) {
    // Chronological left-to-right; the query returns newest first.
    const data = [...seasons].reverse().filter(s => s.ppg_ppr != null);
    if (data.length < 2) return null;

    const W = 720, H = 220;
    const PAD = { top: 20, right: 20, bottom: 44, left: 40 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const values = data.map(d => d.ppg_ppr as number);
    const maxV = Math.max(...values) * 1.15;
    const minV = 0;

    const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - ((v - minV) / (maxV - minV)) * plotH;

    const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.ppg_ppr as number)}`).join(' ');
    const areaPath = `${linePath} L ${x(data.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;

    const gradId = `trend-${position}-${data[0].player_id}`;

    // Horizontal gridlines at quarter intervals.
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => minV + (maxV - minV) * f);

    return (
        <div className="rounded-2xl border border-white/[0.05] p-4" style={{ background: 'var(--bg-card)' }}>
            <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ height: 'auto' }}
                    role="img" aria-label={`${position} points per game by season`}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
                        </linearGradient>
                    </defs>

                    {ticks.map((t, i) => (
                        <g key={i}>
                            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                            <text x={PAD.left - 8} y={y(t) + 3} textAnchor="end"
                                fill="rgba(255,255,255,0.35)" fontSize="10"
                                fontFamily="var(--font-jetbrains), monospace">
                                {t.toFixed(0)}
                            </text>
                        </g>
                    ))}

                    <path d={areaPath} fill={`url(#${gradId})`} />
                    <path d={linePath} fill="none" stroke={accent} strokeWidth="2.5"
                        strokeLinejoin="round" strokeLinecap="round" />

                    {data.map((d, i) => {
                        const cx = x(i), cy = y(d.ppg_ppr as number);
                        return (
                            <g key={d.season}>
                                <circle cx={cx} cy={cy} r="4.5" fill="var(--bg-card)" stroke={accent} strokeWidth="2.5" />
                                <text x={cx} y={cy - 12} textAnchor="middle" fill="#fff" fontSize="11"
                                    fontWeight="700" fontFamily="var(--font-jetbrains), monospace">
                                    {(d.ppg_ppr as number).toFixed(1)}
                                </text>
                                <text x={cx} y={PAD.top + plotH + 18} textAnchor="middle"
                                    fill="rgba(255,255,255,0.55)" fontSize="11" fontWeight="600">
                                    {d.season}
                                </text>
                                {d.finish_positional != null && (
                                    <text x={cx} y={PAD.top + plotH + 33} textAnchor="middle"
                                        fill={d.finish_positional <= 12 ? '#34d399' : 'rgba(255,255,255,0.3)'}
                                        fontSize="10" fontWeight="600">
                                        {position}{d.finish_positional}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>
            <div className="text-[10px] text-muted-foreground/50 mt-1">
                PPR points per game. Per-game rather than season totals, so a short season reads as
                missed time instead of lost production. Positional finish shown beneath each year.
            </div>
        </div>
    );
}
