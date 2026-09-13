'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import type { DepthReport, DepthRow } from '@/lib/depth';
import { POWER_NOISE } from '@/lib/power';

/**
 * What each starter is holding up, and who is behind him.
 *
 * Sorted by cost rather than by projection, because that ordering is the
 * finding. A projection puts your best player at the top; this puts the man
 * you cannot replace there, and those are usually different people. The
 * player a reader should be protecting, handcuffing or refusing to trade is
 * the one at the top of this list, not the one at the top of the other.
 *
 * The bar is from zero: a replacement cost has a real zero — a player with
 * an equal man behind him costs nothing — so a zero-based bar is the honest
 * encoding and a diverging one would be inventing a midpoint.
 */

/**
 * How small a cost is too small to act on.
 *
 * The same floor the power table uses, for the same reason and off the same
 * measurement: these rates come from a simulation that moves by about this
 * much on its own, so a difference under it is not a finding.
 */
const FLOOR = POWER_NOISE;

function Row({ r, top }: { r: DepthRow; top: number }) {
    const real = r.cost >= FLOOR;
    return (
        <li className="grid items-center gap-x-3 gap-y-1 px-1 py-2
                       grid-cols-[minmax(0,1fr)_auto]
                       sm:grid-cols-[44px_minmax(0,1.2fr)_150px_58px_minmax(0,1.3fr)]">
            <span className="hidden sm:block text-[9px] uppercase tracking-wider font-bold
                             text-muted-foreground/40">
                {r.slot}
            </span>

            <span className="min-w-0">
                <span className="text-[12px] font-semibold block truncate">{r.name}</span>
                {/* His projection, which is the number the cost column is
                    arguing with. Printing the whole lineup total here — as
                    the first draft did, identically on all nine rows — said
                    nothing at all. */}
                <span className="text-[10px] text-muted-foreground/40">
                    {r.position}
                    {' · '}
                    {r.points.toFixed(1)} projected
                </span>
            </span>

            <span className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1"
                title={`Without him this roster beats the league `
                    + `${(r.without * 100).toFixed(1)}% of the time instead of `
                    + `${(r.withHim * 100).toFixed(1)}%`}>
                <span className="relative block h-[7px]">
                    <span className="absolute inset-0 rounded-full"
                        style={{ background: CHART_INK.grid }} />
                    <span className="absolute inset-y-0 left-0" style={{
                        width: `${Math.max(1.5, (r.cost / top) * 100)}%`,
                        background: real ? SERIES.b : CHART_INK.context,
                        opacity: real ? 1 : 0.5,
                        borderRadius: MARK.barRadius,
                    }} />
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/60
                                 mt-0.5 block">
                    {real
                        ? `${(r.cost * 100).toFixed(1)} pts of win rate`
                        : 'nothing worth measuring'}
                </span>
            </span>

            <span className="col-start-2 row-start-1 sm:col-start-4 text-[11px]
                             tabular-nums text-right"
                title="Expected lineup score with him, and without">
                <span className={cn('font-semibold',
                    r.pointsWith - r.pointsWithout >= 5 ? 'text-foreground' : '')}>
                    −{(r.pointsWith - r.pointsWithout).toFixed(1)}
                </span>
                <span className="block text-[9px] text-muted-foreground/35">pts</span>
            </span>

            <span className="col-span-2 row-start-3 sm:col-span-1 sm:col-start-5 sm:row-start-1
                             text-[10px] min-w-0">
                {r.uncovered ? (
                    <span className="font-semibold" style={{ color: '#FCA5A5' }}>
                        nobody can fill the slot — you would start eight
                    </span>
                ) : r.replacementSlot && r.replacementSlot !== r.slot ? (
                    // The cascade, named: whoever was in the flex moves up and
                    // the bench fills the flex, so the man who actually comes
                    // into the lineup is often at a different slot entirely.
                    <span className="text-muted-foreground/55 truncate block"
                        title={`The lineup shuffles: ${r.replacementName} comes off the `
                            + `bench into ${r.replacementSlot} and the slots above him `
                            + 'move up'}>
                        <span className="text-muted-foreground/35">lineup shuffles · </span>
                        {r.replacementName} in at {r.replacementSlot}
                    </span>
                ) : (
                    <span className="text-muted-foreground/55 truncate block">
                        <span className="text-muted-foreground/35">covered by </span>
                        {r.replacementName}
                    </span>
                )}
            </span>
        </li>
    );
}

export function DepthTable({ report }: { report: DepthReport }) {
    const { rows } = report;
    if (rows.length === 0) return null;
    const top = Math.max(...rows.map(r => r.cost)) || 1;
    // Named by the structural fact rather than by a threshold: "nobody
    // behind him" is a thing an owner can act on, and a cost cutoff just
    // lists most of the roster.
    const bare = rows.filter(r => r.uncovered);
    const spare = rows.filter(r => r.cost < FLOOR);

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    What each starter is holding up
                </h2>
                <span className="text-[10px] text-muted-foreground/45 tabular-nums">
                    {(report.base * 100).toFixed(1)}% against the league ·{' '}
                    {report.basePoints} expected points
                </span>
            </div>
            <p className="text-[11px] text-muted-foreground/55 max-w-[740px] mb-2">
                Each man is removed in turn and the lineup refilled from your own bench,
                then the roster replays the league. What comes back is not what he is
                worth — it is what he is worth <em>to you</em>, which is the gap between
                him and whoever takes his place.
            </p>

            <div className="grid items-end gap-x-3 px-1 pb-1 text-[10px] uppercase
                            tracking-widest font-bold text-muted-foreground/45
                            grid-cols-[minmax(0,1fr)_auto]
                            sm:grid-cols-[44px_minmax(0,1.2fr)_150px_58px_minmax(0,1.3fr)]">
                <span className="hidden sm:block">Slot</span>
                <span>Starter</span>
                <span className="hidden sm:block">Cost of losing him</span>
                <span className="hidden sm:block text-right">Lineup</span>
                <span className="hidden sm:block">Behind him</span>
            </div>

            <ul className="divide-y divide-white/[0.04]">
                {rows.map(r => <Row key={r.playerId} r={r} top={top} />)}
            </ul>

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug">
                {bare.length > 0 && (
                    <>
                        <span className="font-semibold text-muted-foreground/60">
                            {bare.map(r => r.name).join(', ')}
                        </span>{' '}
                        {bare.length === 1 ? 'has' : 'have'} nobody behind{' '}
                        {bare.length === 1 ? 'him' : 'them'} — lose{' '}
                        {bare.length === 1 ? 'him' : 'one of them'} and you field eight
                        players, which is why {bare.length === 1 ? 'he sits' : 'they sit'}{' '}
                        where {bare.length === 1 ? 'he does' : 'they do'} on this list
                        rather than where a projection would put{' '}
                        {bare.length === 1 ? 'him' : 'them'}.{' '}
                    </>
                )}
                {spare.length > 0 && (
                    <>
                        <span className="font-semibold text-muted-foreground/60">
                            {spare.map(r => r.name).join(', ')}
                        </span>{' '}
                        {spare.length === 1 ? 'is' : 'are'} covered well enough that losing{' '}
                        {spare.length === 1 ? 'him' : 'them'} would not move the number —
                        which is also what makes {spare.length === 1 ? 'him' : 'them'} the
                        easiest thing on this roster to trade.{' '}
                    </>
                )}
                Anything under {(FLOOR * 100).toFixed(1)} points of win rate is inside what
                the simulation moves by on its own and is shown as nothing rather than as a
                small number.
            </p>
        </section>
    );
}
