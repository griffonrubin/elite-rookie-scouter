'use client';

import React, { useState } from 'react';
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

/** One real game: the point, and enough to say which game it was. */
export interface SampleGame {
    points: number;
    week?: number;
    season?: number;
    opponent?: string | null;
}

export interface OutcomeStripProps {
    outcome: Outcome;
    /** The player's actual weekly points, drawn as evidence behind the summary. */
    sample?: SampleGame[];
    /** Shared across every strip in a view, so bars are comparable. */
    max: number;
    /** 'context' draws the opponent, who is not a choice you get to make. */
    series?: 'a' | 'b' | 'context';
    label?: string;
    compact?: boolean;
}

export function OutcomeStrip({
    outcome, sample = [], max, series = 'a', label, compact = false,
}: OutcomeStripProps) {
    // A native title takes about a second to appear and arrives in the OS's
    // own styling, which on a cloud of twenty dots means nobody ever reads
    // one. The dots are the evidence behind every number on the page, so
    // they get a real tooltip that shows up when the pointer does.
    const [hover, setHover] = useState<number | null>(null);
    const colour = series === 'context' ? CHART_INK.context : SERIES[series];
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

    // A player who has been ruled out is a decision already made, not a
    // distribution to weigh. Saying "Out · ankle" is the whole answer; drawing
    // a floor and ceiling underneath it would invite reading a number that
    // cannot happen.
    if (outcome.playProbability === 0) {
        return (
            <div className="flex items-center text-[11px] text-muted-foreground/55"
                style={{ height: h }}
                role="img"
                aria-label={`${label ?? 'Player'} is ruled out and will not play`}>
                ruled out &mdash; no distribution to weigh
            </div>
        );
    }

    return (
        <div className="relative w-full" style={{ height: h }}
            role="img"
            aria-label={`${label ?? 'Player'}: expected ${outcome.mean} points, `
                + `floor ${outcome.floor}, ceiling ${outcome.ceiling}`
                + (sample.length ? `, from ${sample.length} games` : '')
                + (outcome.playProbability < 1
                    ? `, ${Math.round(outcome.playProbability * 100)}% chance of playing`
                    + (outcome.availability ? ` (${outcome.availability})` : '')
                    : '')}>
            {/* floor–ceiling span */}
            <div className="absolute top-1/2 -translate-y-1/2 h-2"
                style={{
                    left: pct(outcome.floor),
                    width: pct(Math.max(0, outcome.ceiling - outcome.floor)),
                    background: colour,
                    opacity: 0.22,
                    borderRadius: MARK.barRadius,
                }} />
            {/* the games themselves.
                Each dot names its own game on hover. A dot at 28 is worth far
                more to a reader who can see it was week 4 against a defence
                they are about to play again than it is as an anonymous point
                in a cloud. */}
            {sample.map((g, i) => (
                <span key={i}
                    className="absolute top-1/2 rounded-full cursor-help"
                    title={gameLabel(g)}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(h => (h === i ? null : h))}
                    style={{
                        left: pct(g.points),
                        width: MARK.dotRadius * 2,
                        height: MARK.dotRadius * 2,
                        marginLeft: -MARK.dotRadius,
                        marginTop: -MARK.dotRadius,
                        background: colour,
                        // A ring in the surface colour keeps overlapping dots
                        // countable instead of merging into one blob.
                        boxShadow: `0 0 0 ${MARK.gap}px ${CHART_INK.surface}`,
                        // The hovered dot lifts out of the cloud so it is
                        // obvious which game the tooltip belongs to.
                        opacity: hover === i ? 1 : 0.55,
                        zIndex: hover === i ? 2 : undefined,
                    }} />
            ))}
            {hover != null && sample[hover] && (
                <span className="absolute z-10 px-1.5 py-1 rounded-md text-[10px]
                                 whitespace-nowrap pointer-events-none font-semibold"
                    style={{
                        left: pct(sample[hover].points),
                        bottom: '100%',
                        transform: 'translateX(-50%)',
                        marginBottom: 4,
                        background: 'rgba(8,14,22,0.96)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.86)',
                    }}>
                    {gameLabel(sample[hover])}
                </span>
            )}
            {/* Doubt drawn as doubt.
                A questionable starter is not a smaller player — he is this
                player most weeks and an empty slot the rest. The bar is
                hatched across the share of weeks he does not suit up, so the
                risk reads as the coin flip it is rather than as a quietly
                lower projection. */}
            {outcome.playProbability < 1 && outcome.playProbability > 0 && (
                <div className="absolute top-1/2 -translate-y-1/2 h-2 pointer-events-none"
                    style={{
                        left: pct(outcome.floor),
                        width: pct(Math.max(0, outcome.ceiling - outcome.floor)),
                        borderRadius: MARK.barRadius,
                        opacity: 1 - outcome.playProbability,
                        backgroundImage: 'repeating-linear-gradient(135deg,'
                            + 'rgba(255,255,255,0.55) 0 1.5px, transparent 1.5px 4px)',
                    }} />
            )}
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

function gameLabel(g: SampleGame): string {
    const when = g.week != null
        ? `${g.season != null ? `${g.season} ` : ''}week ${g.week}`
        : null;
    const who = g.opponent ? `vs ${g.opponent.toUpperCase()}` : null;
    return [`${g.points.toFixed(1)} pts`, when, who].filter(Boolean).join(' · ');
}

/** Shared x-axis for a column of strips, so the scale is legible once. */
export function OutcomeAxis({ max, className }: { max: number; className?: string }) {
    const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
    return (
        <div className={cn('relative w-full h-4', className)} aria-hidden="true">
            {ticks.map((t, i) => (
                <span key={i}
                    className="absolute text-[10px] text-muted-foreground/55 font-semibold tabular-nums"
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
