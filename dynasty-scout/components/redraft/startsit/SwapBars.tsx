'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { DIVERGING, MARK } from '@/lib/vizTokens';

/**
 * What a swap does to your chances, against what it does to your points.
 *
 * Both are shown because the disagreement is the finding. A swap that gains
 * half a point and costs two points of win probability is a bad swap, and a
 * points column on its own will never say so.
 *
 * Bars diverge from a zero line because the quantity is signed. Every bar
 * carries an arrow and a signed number as well as a colour: blue and red
 * separate cleanly for every kind of colour vision, but a chart that needs
 * hue to be read at all is one a reader can be locked out of.
 */

export interface SwapRow {
    inId: number;
    outId: number;
    inName: string;
    outName: string;
    deltaWinProb: number;
    deltaPoints: number;
}

export function SwapBars({ rows, onPick }: {
    rows: SwapRow[];
    onPick?: (r: SwapRow) => void;
}) {
    if (rows.length === 0) {
        return (
            <p className="text-[12px] text-muted-foreground/60 py-6 text-center">
                No eligible swaps — every bench player is either on a bye or cannot fill
                one of your slots.
            </p>
        );
    }
    const span = Math.max(1, ...rows.map(r => Math.abs(r.deltaWinProb)));

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50 font-semibold pb-1">
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ background: DIVERGING.positive }} /> raises win chance
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ background: DIVERGING.negative }} /> lowers it
                </span>
            </div>

            {rows.map(r => {
                const up = r.deltaWinProb > 0.05;
                const down = r.deltaWinProb < -0.05;
                const colour = up ? DIVERGING.positive : down ? DIVERGING.negative : DIVERGING.zero;
                const w = `${(Math.abs(r.deltaWinProb) / span) * 50}%`;
                const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
                return (
                    <button
                        key={`${r.inId}-${r.outId}`}
                        type="button"
                        onClick={() => onPick?.(r)}
                        title={`Start ${r.inName} over ${r.outName}: `
                            + `${r.deltaWinProb >= 0 ? '+' : ''}${r.deltaWinProb} points of win probability, `
                            + `${r.deltaPoints >= 0 ? '+' : ''}${r.deltaPoints} projected points`}
                        // Both the label and the track are capped, and the row is
                        // left-aligned, so spare width collects to the right of the
                        // numbers instead of between a name and its own bar. An
                        // elastic label column pushes the zero line most of a screen
                        // away from the name it belongs to, and a track that absorbs
                        // the slack does the same thing by moving its own midpoint.
                        className="w-full grid items-center gap-3 justify-start
                                   grid-cols-[minmax(0,1fr)_120px_96px]
                                   sm:grid-cols-[minmax(0,300px)_260px_104px]
                                   px-2 py-1.5 rounded-lg hover:bg-white/[0.04] text-left transition-colors"
                    >
                        {/* Right-aligned at width, the way a population pyramid
                            labels its axis: every name then ends flush against
                            the track, so no row's label is further from its own
                            bar than any other's. */}
                        <span className="min-w-0 text-[12px] sm:text-right">
                            <span className="font-semibold text-foreground truncate">{r.inName}</span>
                            <span className="text-muted-foreground/50"> over </span>
                            <span className="text-muted-foreground truncate">{r.outName}</span>
                        </span>

                        {/* diverging bar, zero in the middle */}
                        <span className="relative h-3.5 block" aria-hidden="true">
                            <span className="absolute inset-y-0 left-1/2 w-px"
                                style={{ background: 'rgba(255,255,255,0.18)' }} />
                            <span className="absolute top-1/2 -translate-y-1/2 h-2"
                                style={{
                                    background: colour,
                                    borderRadius: MARK.barRadius,
                                    width: w,
                                    left: up ? '50%' : undefined,
                                    right: down ? '50%' : undefined,
                                    ...(up || down ? {} : { left: 'calc(50% - 1px)', width: 2 }),
                                }} />
                        </span>

                        <span className="flex items-center justify-end gap-1.5 tabular-nums">
                            <Icon className="w-3 h-3" style={{ color: colour }} aria-hidden="true" />
                            <span className="text-[12px] font-bold" style={{ color: colour }}>
                                {r.deltaWinProb >= 0 ? '+' : ''}{r.deltaWinProb.toFixed(1)}
                            </span>
                            <span className="text-[10px] text-muted-foreground/45 w-10 text-right">
                                {r.deltaPoints >= 0 ? '+' : ''}{r.deltaPoints.toFixed(1)}p
                            </span>
                        </span>
                    </button>
                );
            })}
            <p className="text-[10px] text-muted-foreground/40 pt-1 px-2">
                Win probability in percentage points; projected points beside it. When they
                disagree, the swap changes how you win rather than how much you score.
            </p>
        </div>
    );
}
