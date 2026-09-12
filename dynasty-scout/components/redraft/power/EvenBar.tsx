'use client';

import React from 'react';
import { CHART_INK, DIVERGING, MARK, SERIES } from '@/lib/vizTokens';

/**
 * A win rate, drawn against even odds rather than against zero.
 *
 * Twelve teams playing a round robin span roughly 38% to 62%, and a bar
 * grown from zero across that range is all bar: every team's mark is between
 * 60% and 100% of the track, so the best roster in the league and the worst
 * look about the same. Three quarters of the ink carries no information and
 * the quarter that does is squeezed.
 *
 * Fifty per cent is the real zero here. It is the rate of a team exactly as
 * good as its league, so a mark either side says which side of average a
 * roster is on — and the spread that mattered now uses the whole track.
 *
 * `span` is how far either way fills a half, and callers set it from their
 * own data with `spanFor` — a fixed range wastes the track when a league is
 * close and clips it when one team is running away. Whatever span is chosen
 * has to be stated beside the chart, or a mark's length means nothing.
 */

/**
 * The span that fits a set of rates.
 *
 * Rounded out to the next five points so the axis is a number a reader can
 * hold, and floored at five so a league of near-identical rosters does not
 * get a chart magnifying noise into daylight.
 */
export function spanFor(rates: number[]): number {
    const widest = Math.max(0, ...rates.map(p => Math.abs(p - 0.5)));
    return Math.max(0.05, Math.ceil(widest * 20) / 20);
}
export function EvenBar({ p, height = 7, span = 0.25, mine = false }: {
    /** The rate, 0..1. */
    p: number;
    height?: number;
    span?: number;
    /** Draw in the reader's own colour — this is their team. */
    mine?: boolean;
}) {
    const off = Math.max(-1, Math.min(1, (p - 0.5) / span));
    // Sized in per cent of whatever column it is dropped into, so the same
    // mark can be 190px beside a twelve-team table and as wide as a phone
    // will allow inside an opened row.
    const w = Math.abs(off) * 50;
    const positive = off >= 0;
    return (
        <span className="relative block w-full" style={{ height }}
            role="img" aria-label={`${(p * 100).toFixed(1)} per cent`}>
            {/* Even odds. Recessive, but it has to be findable — it is what
                every mark on the page is measured from. */}
            <span className="absolute" style={{
                left: '50%', top: -2, bottom: -2, width: 1,
                background: CHART_INK.axis,
            }} />
            {/* A mark that rounds to nothing reads as missing data rather
                than as a team that is exactly average, so it keeps a
                visible minimum. */}
            <span className="absolute" style={{
                top: 0, height,
                left: positive ? '50%' : `${50 - w}%`,
                width: `${w}%`,
                minWidth: 2,
                background: mine
                    ? SERIES.a
                    : (positive ? DIVERGING.positive : DIVERGING.negative),
                borderRadius: MARK.barRadius,
            }} />
        </span>
    );
}
