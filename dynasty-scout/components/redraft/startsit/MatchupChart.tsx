'use client';

import React, { useState } from 'react';
import { ScoreHistogram } from '@/lib/startSit';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';

/**
 * Both score distributions, and the overlap that decides the week.
 *
 * "You 131.7, them 102" is two averages standing in for forty thousand
 * simulated scores, and it hides the only thing worth knowing: how the game
 * is lost. A thirty-point favourite still loses when their week lands high
 * and yours lands low, and the size of that region — not the gap between the
 * means — is the win probability.
 *
 * Drawn as two areas on one axis because both measure the same quantity in
 * the same units. This is emphatically not a place for a second y-axis: the
 * shapes are directly comparable and comparing them is the entire point.
 */

export function MatchupChart({ hist, winProb, mineLabel, theirsLabel }: {
    hist: ScoreHistogram;
    winProb: number;
    mineLabel: string;
    theirsLabel: string;
}) {
    const [hover, setHover] = useState<number | null>(null);
    const W = 100, H = 46;

    const peak = Math.max(...hist.mine, ...hist.theirs) || 1;
    const n = hist.edges.length;
    const x = (i: number) => (i / (n - 1)) * W;
    const y = (v: number) => H - (v / peak) * H;

    // An area per series, closed along the baseline.
    const area = (vals: number[]) =>
        `M 0 ${H} ` + vals.map((v, i) => `L ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')
        + ` L ${W} ${H} Z`;

    const lo = hist.edges[0];
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
        const i = Math.round(f * (n - 1));
        return { left: (i / (n - 1)) * 100, value: Math.round(lo + i * hist.width) };
    });

    const at = hover != null ? hover : null;

    return (
        <figure className="m-0">
            {/* Identity is never colour alone: both series are named. */}
            <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5
                                   text-[10px] font-semibold">
                {([[SERIES.a, mineLabel], [SERIES.b, theirsLabel]] as const).map(([c, label]) => (
                    <span key={label} className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block rounded-full"
                            style={{ width: 9, height: 9, background: c }} />
                        {label}
                    </span>
                ))}
                <span className="ml-auto text-muted-foreground/50">
                    {Math.round(winProb * 100)}% of weeks fall your way
                </span>
            </figcaption>

            <div className="relative" onMouseLeave={() => setHover(null)}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                    className="w-full block" style={{ height: 92 }}
                    role="img"
                    aria-label={`Simulated scores. Your lineup averages around `
                        + `${Math.round(lo + hist.mine.indexOf(Math.max(...hist.mine)) * hist.width)}, `
                        + `theirs around `
                        + `${Math.round(lo + hist.theirs.indexOf(Math.max(...hist.theirs)) * hist.width)}. `
                        + `You win ${Math.round(winProb * 100)} percent of simulated weeks.`}>
                    <path d={area(hist.theirs)} fill={SERIES.b} opacity={0.34} />
                    <path d={area(hist.mine)} fill={SERIES.a} opacity={0.34} />
                    <path d={area(hist.theirs).replace(/^M 0 46 /, 'M 0 46 ').replace(/ L 100 46 Z$/, '')}
                        fill="none" stroke={SERIES.b} strokeWidth={MARK.lineWidth / 4} vectorEffect="non-scaling-stroke" />
                    <path d={area(hist.mine).replace(/ L 100 46 Z$/, '')}
                        fill="none" stroke={SERIES.a} strokeWidth={MARK.lineWidth / 4} vectorEffect="non-scaling-stroke" />
                    {at != null && (
                        <line x1={x(at)} x2={x(at)} y1={0} y2={H}
                            stroke={CHART_INK.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    )}
                </svg>

                {/* Hit targets wider than the marks they select. */}
                <div className="absolute inset-0 flex">
                    {hist.edges.map((_, i) => (
                        <button key={i} type="button" tabIndex={-1} aria-hidden="true"
                            className="flex-1 h-full"
                            onMouseEnter={() => setHover(i)} />
                    ))}
                </div>

                {at != null && (
                    <div className="absolute -top-1 px-1.5 py-1 rounded pointer-events-none
                                    text-[10px] whitespace-nowrap z-10"
                        style={{
                            left: `${(at / (n - 1)) * 100}%`,
                            transform: at > n / 2 ? 'translateX(-100%)' : 'none',
                            background: 'rgba(12,21,32,0.95)',
                            border: '1px solid rgba(255,255,255,0.12)',
                        }}>
                        <div className="font-bold tabular-nums mb-0.5">
                            {Math.round(lo + at * hist.width)}–{Math.round(lo + (at + 1) * hist.width)} pts
                        </div>
                        <div style={{ color: SERIES.a }} className="tabular-nums">
                            you {(hist.mine[at] * 100).toFixed(1)}%
                        </div>
                        <div style={{ color: SERIES.b }} className="tabular-nums">
                            them {(hist.theirs[at] * 100).toFixed(1)}%
                        </div>
                    </div>
                )}
            </div>

            <div className="relative h-3.5 mt-0.5">
                {ticks.map((t, i) => (
                    <span key={i} className="absolute text-[9px] text-muted-foreground/45
                                             font-semibold tabular-nums"
                        style={{
                            left: `${t.left}%`,
                            transform: i === 0 ? 'none'
                                : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                        }}>
                        {t.value}
                    </span>
                ))}
            </div>

            {/* The table the chart is drawn from, for anyone the chart fails. */}
            <details className="mt-1">
                <summary className="text-[10px] text-muted-foreground/45 cursor-pointer
                                    hover:text-muted-foreground">
                    Show as a table
                </summary>
                <table className="mt-1 w-full text-[10px] tabular-nums">
                    <thead className="text-muted-foreground/50">
                        <tr><th className="text-left font-semibold">Points</th>
                            <th className="text-right font-semibold">You</th>
                            <th className="text-right font-semibold">Them</th></tr>
                    </thead>
                    <tbody>
                        {hist.edges.map((e, i) => (
                            (hist.mine[i] > 0.002 || hist.theirs[i] > 0.002) && (
                                <tr key={i} className="text-muted-foreground/70">
                                    <td>{Math.round(e)}–{Math.round(e + hist.width)}</td>
                                    <td className="text-right">{(hist.mine[i] * 100).toFixed(1)}%</td>
                                    <td className="text-right">{(hist.theirs[i] * 100).toFixed(1)}%</td>
                                </tr>
                            )
                        ))}
                    </tbody>
                </table>
            </details>
        </figure>
    );
}
