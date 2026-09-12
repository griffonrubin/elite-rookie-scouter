'use client';

import React, { useState } from 'react';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import type { CalibrationBucket } from '@/app/api/redraft/pickems/route';

/**
 * The one chart a pick'em page owes its reader.
 *
 * Two rates against the same x axis, and the whole argument is the shape of
 * them. How often a favourite *wins* climbs from a coin flip to near
 * certainty as the line grows — a spread is an excellent forecast. How often
 * a favourite *covers* does not move at all: it sits on fifty in every
 * bucket, across twenty-seven seasons, because that is precisely what a
 * spread is for.
 *
 * Two series on one axis and not two charts, because the comparison is the
 * point: separated, a reader sees two unremarkable lines instead of one that
 * rises beside one that does not.
 *
 * The x axis is ordinal. The buckets are not evenly spaced in points — three
 * and seven get their own, because that is where NFL margins pile up — so
 * spacing them numerically would stretch the middle and squash the ends of a
 * scale whose whole job is to be read across.
 */

const W = 760;
const H = 260;
const PAD = { top: 16, right: 92, bottom: 34, left: 34 };

export function CoverChart({ rows }: { rows: CalibrationBucket[] }) {
    const [hover, setHover] = useState<number | null>(null);
    if (rows.length < 2) return null;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (innerW * (i + 0.5)) / rows.length;
    const y = (p: number) => PAD.top + innerH * (1 - p);

    const series = [
        { key: 'win', label: 'favourite wins', colour: SERIES.b,
            at: (r: CalibrationBucket) => r.favWinRate },
        { key: 'cover', label: 'favourite covers', colour: SERIES.a,
            at: (r: CalibrationBucket) => r.favCoverRate },
    ];
    const path = (at: (r: CalibrationBucket) => number) =>
        rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(at(r)).toFixed(1)}`).join(' ');

    const hovered = hover == null ? null : rows[hover];

    return (
        // A viewBox scales its type with its frame, so this chart has a
        // useful width in both directions. Capped at 960 because stretching
        // it across a 1500px column doubles everything and clarifies
        // nothing; floored at 640 inside a scroller because below that the
        // axis labels render at five pixels, and unreadable text is worse
        // than text a reader has to swipe to.
        <figure className="m-0 max-w-[960px]">
            <div className="overflow-x-auto [scrollbar-width:thin]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block min-w-[640px]"
                role="img"
                aria-label={'Favourites win more often as the spread grows, from about half '
                    + 'at a pick to over nine in ten at two touchdowns, while the share that '
                    + 'cover the spread stays near half in every bucket.'}>
                {/* Gridlines at the quarters, and the fifty line heavier
                    because it is what one of the two series is pinned to. */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                    <g key={p}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y(p)} y2={y(p)}
                            stroke={p === 0.5 ? CHART_INK.axis : CHART_INK.grid}
                            strokeWidth={1} />
                        <text x={PAD.left - 6} y={y(p) + 3} textAnchor="end"
                            fontSize={10} fill="rgba(255,255,255,0.4)">
                            {p * 100}%
                        </text>
                    </g>
                ))}

                {series.map(s => (
                    <path key={s.key} d={path(s.at)} fill="none" stroke={s.colour}
                        strokeWidth={MARK.lineWidth} strokeLinecap="round"
                        strokeLinejoin="round" />
                ))}

                {/* One hit target per bucket, spanning the plot height, so a
                    reader does not have to find a 9px dot. */}
                {rows.map((r, i) => (
                    <rect key={r.bucket} x={x(i) - innerW / rows.length / 2} y={PAD.top}
                        width={innerW / rows.length} height={innerH}
                        fill={hover === i ? 'rgba(255,255,255,0.04)' : 'transparent'}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(h => (h === i ? null : h))} />
                ))}

                {series.map(s => rows.map((r, i) => (
                    <circle key={s.key + r.bucket} cx={x(i)} cy={y(s.at(r))}
                        r={hover === i ? 5.5 : 4.5}
                        fill={s.colour} stroke={CHART_INK.surface} strokeWidth={2}
                        pointerEvents="none">
                        <title>{`${r.label}: ${s.label} ${(s.at(r) * 100).toFixed(1)}% `
                            + `of ${r.games} games`}</title>
                    </circle>
                )))}

                {/* Direct labels rather than a legend box: two series, and the
                    lines end far enough apart to name where they finish. */}
                {series.map(s => {
                    const last = rows[rows.length - 1];
                    return (
                        <text key={s.key} x={W - PAD.right + 8} y={y(s.at(last)) + 3}
                            fontSize={10} fontWeight={700} fill={s.colour}>
                            {s.label}
                        </text>
                    );
                })}

                {rows.map((r, i) => (
                    <text key={r.bucket} x={x(i)} y={H - 12} textAnchor="middle"
                        fontSize={10}
                        fill={hover === i ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}>
                        {r.label}
                    </text>
                ))}
                <text x={PAD.left + innerW / 2} y={H - 1} textAnchor="middle"
                    fontSize={10} fill="rgba(255,255,255,0.3)">
                    points the favourite is giving
                </text>
            </svg>
            </div>

            <figcaption className="text-[10px] text-muted-foreground/55 mt-1 min-h-[16px]
                                   tabular-nums">
                {hovered ? (
                    <>
                        <span className="font-semibold text-foreground/80">
                            {hovered.label}
                        </span>
                        {' · '}{hovered.games.toLocaleString()} games ·{' '}
                        <span style={{ color: SERIES.b }}>
                            won {(hovered.favWinRate * 100).toFixed(1)}%
                        </span>
                        {' · '}
                        <span style={{ color: SERIES.a }}>
                            covered {(hovered.favCoverRate * 100).toFixed(1)}%
                        </span>
                        {hovered.overRate != null
                            && ` · went over ${(hovered.overRate * 100).toFixed(1)}%`}
                    </>
                ) : (
                    'Hover a bucket for its counts.'
                )}
            </figcaption>
        </figure>
    );
}
