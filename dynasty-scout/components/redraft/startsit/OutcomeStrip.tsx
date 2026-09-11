'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import { Outcome } from '@/lib/startSit';

/**
 * A player's week, drawn as what it is: a spread of outcomes.
 *
 * The real games are plotted as dots rather than smoothed into a curve.
 * Sixteen points do not support a density estimate, and a smooth shape would
 * claim precision the sample cannot carry — where a reader can see three
 * dots at 30 and nine below 10, they can judge the risk themselves.
 *
 * The bar behind them is the middle of the distribution, floor to ceiling,
 * with the expected week marked. That is the summary; the dots are evidence.
 */

export interface OutcomeStripProps {
    outcome: Outcome;
    /** The player's actual weekly points, drawn as evidence behind the summary. */
    sample?: number[];
    /** Shared across every strip in a view, so bars are comparable. */
    max: number;
    series?: 'a' | 'b';
    label?: string;
    compact?: boolean;
}

export function OutcomeStrip({
    outcome, sample = [], max, series = 'a', label, compact = false,
}: OutcomeStripProps) {
    const colour = SERIES[series];
    const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    const h = compact ? 26 : 34;

    if (outcome.onBye) {
        return (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60"
                style={{ height: h }}>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.06] font-bold">BYE</span>
                <span>no game this week</span>
            </div>
        );
    }

    return (
        <div className="relative w-full" style={{ height: h }}
            role="img"
            aria-label={`${label ?? 'Player'}: expected ${outcome.mean} points, `
                + `floor ${outcome.floor}, ceiling ${outcome.ceiling}`
                + (sample.length ? `, from ${sample.length} games` : '')}>
            {/* floor–ceiling span */}
            <div className="absolute top-1/2 -translate-y-1/2 h-2"
                style={{
                    left: pct(outcome.floor),
                    width: pct(Math.max(0, outcome.ceiling - outcome.floor)),
                    background: colour,
                    opacity: 0.22,
                    borderRadius: MARK.barRadius,
                }} />
            {/* the games themselves */}
            {sample.map((v, i) => (
                <span key={i}
                    className="absolute top-1/2 rounded-full"
                    title={`${v.toFixed(1)} pts`}
                    style={{
                        left: pct(v),
                        width: MARK.dotRadius * 2,
                        height: MARK.dotRadius * 2,
                        marginLeft: -MARK.dotRadius,
                        marginTop: -MARK.dotRadius,
                        background: colour,
                        opacity: 0.55,
                        // A ring in the surface colour keeps overlapping dots
                        // countable instead of merging into one blob.
                        boxShadow: `0 0 0 ${MARK.gap}px ${CHART_INK.surface}`,
                    }} />
            ))}
            {/* the expected week */}
            <div className="absolute top-1/2 -translate-y-1/2"
                style={{
                    left: pct(outcome.mean),
                    width: MARK.lineWidth + 1,
                    height: compact ? 16 : 20,
                    marginLeft: -(MARK.lineWidth + 1) / 2,
                    background: colour,
                    borderRadius: 1,
                    boxShadow: `0 0 0 ${MARK.gap}px ${CHART_INK.surface}`,
                }} />
        </div>
    );
}

/** Shared x-axis for a column of strips, so the scale is legible once. */
export function OutcomeAxis({ max, className }: { max: number; className?: string }) {
    const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
    return (
        <div className={cn('relative w-full h-4', className)} aria-hidden="true">
            {ticks.map((t, i) => (
                <span key={i}
                    className="absolute text-[9px] text-muted-foreground/40 font-semibold tabular-nums"
                    style={{
                        left: `${(t / max) * 100}%`,
                        transform: i === 0 ? 'none'
                            : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                    }}>
                    {Math.round(t)}
                </span>
            ))}
        </div>
    );
}
