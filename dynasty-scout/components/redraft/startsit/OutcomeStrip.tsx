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
    // Pattern ids are global to the document, so each strip needs its own or
    // they all point at whichever definition rendered last.
    const hatchId = React.useId();
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

    const bar = 8;                       // the floor-ceiling band, in px
    const tick = compact ? 16 : 20;      // the expected-week marker
    const ring = MARK.gap;               // surface ring, as a stroke now

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
            {/*
                One SVG rather than a cloud of positioned spans.
                Each strip used to be twenty absolutely-positioned elements,
                every dot carrying a box-shadow for its ring — and there are
                thirty-odd strips on a loaded board, which came to six hundred
                spans the browser had to lay out and paint individually. On a
                mid-range phone that was three and a half seconds of blocked
                main thread.

                The geometry is unchanged: percentage x-coordinates keep the
                marks on the shared axis, and because only cx is a percentage
                the circles stay circular instead of stretching with the
                column. The ring is a stroke in the surface colour, which is
                the same picture and a fraction of the paint.
            */}
            <svg width="100%" height={h} className="block overflow-visible"
                aria-hidden="true"
                onMouseLeave={() => setHover(null)}>
                {/* floor–ceiling span */}
                <rect x={pct(outcome.floor)} y={(h - bar) / 2}
                    width={pct(Math.max(0, outcome.ceiling - outcome.floor))}
                    height={bar} rx={MARK.barRadius}
                    fill={colour} opacity={0.22} />

                {/* Doubt drawn as doubt.
                    A questionable starter is not a smaller player — he is this
                    player most weeks and an empty slot the rest, so the band
                    is hatched across the share of weeks he does not suit up
                    and the risk reads as the coin flip it is. */}
                {outcome.playProbability < 1 && outcome.playProbability > 0 && (<>
                    <defs>
                        <pattern id={hatchId} width="4" height="4"
                            patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                            <rect width="1.5" height="4" fill="rgba(255,255,255,0.55)" />
                        </pattern>
                    </defs>
                    <rect x={pct(outcome.floor)} y={(h - bar) / 2}
                        width={pct(Math.max(0, outcome.ceiling - outcome.floor))}
                        height={bar} rx={MARK.barRadius}
                        fill={`url(#${hatchId})`}
                        opacity={1 - outcome.playProbability} />
                </>)}

                {/* the games themselves — each names its own on hover, because
                    a dot at 28 is worth far more to a reader who can see it
                    was week 4 against a defence they play again. */}
                {sample.map((g, i) => (
                    <circle key={i}
                        cx={pct(g.points)} cy={h / 2} r={MARK.dotRadius}
                        fill={colour}
                        stroke={CHART_INK.surface} strokeWidth={ring}
                        opacity={hover === i ? 1 : 0.55}
                        className="cursor-help"
                        onMouseEnter={() => setHover(i)}>
                        <title>{gameLabel(g)}</title>
                    </circle>
                ))}

                {/* the expected week */}
                <rect x={pct(outcome.mean)} y={(h - tick) / 2}
                    width={MARK.lineWidth + 1} height={tick} rx={1}
                    transform={`translate(${-(MARK.lineWidth + 1) / 2} 0)`}
                    fill={colour}
                    stroke={CHART_INK.surface} strokeWidth={ring} />
            </svg>

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
