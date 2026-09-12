'use client';

import React from 'react';
import { Outcome, ScoreHistogram } from '@/lib/startSit';
import { CHART_INK, DIVERGING, SERIES } from '@/lib/vizTokens';
import { MatchupChart } from './MatchupChart';

/**
 * What starting this player instead would actually do.
 *
 * The candidate list ranks options and stops there: a number beside a name
 * says which is better and nothing about why, or about what the week looks
 * like if you take it. So picking one opens it up — the same decomposition
 * and the same usage the starter gets, and then the consequence, which is
 * never about one player. Swapping a flex changes the whole lineup's
 * distribution, and the reason to do it is sometimes that it widens the
 * distribution rather than that it raises the mean.
 *
 * Both figures are drawn from one simulation seed, so the difference between
 * them is the swap and not the dice.
 */

export interface SwapPreviewProps {
    inName: string;
    outName: string | null;
    /** The matchup as it stands. */
    before: { winProb: number; pointsFor: number; hist?: ScoreHistogram };
    /** The matchup with this player in the slot. */
    after: { winProb: number; pointsFor: number; hist?: ScoreHistogram };
    mineLabel: string;
    theirsLabel: string;
    /** The candidate's own reasoning and role, rendered by the owner. */
    children?: React.ReactNode;
    onFullCompare?: () => void;
}

function Delta({ before, after, unit, places = 1 }: {
    before: number; after: number; unit: string; places?: number;
}) {
    const d = after - before;
    const up = d > 0;
    const flat = Math.abs(d) < (unit === '%' ? 0.05 : 0.05);
    return (
        <span className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-muted-foreground/45 text-[11px]">
                {before.toFixed(places)}{unit}
            </span>
            <span className="text-muted-foreground/30 text-[10px]">→</span>
            <span className="text-[13px] font-bold">
                {after.toFixed(places)}{unit}
            </span>
            <span className="text-[11px] font-semibold"
                style={{
                    color: flat ? 'rgba(255,255,255,0.35)'
                        : up ? '#93C5FD' : '#FCA5A5',
                }}>
                {flat ? 'no change'
                    : `${up ? '+' : ''}${d.toFixed(places)}${unit}`}
            </span>
        </span>
    );
}

export function SwapPreview({
    inName, outName, before, after, mineLabel, theirsLabel, children, onFullCompare,
}: SwapPreviewProps) {
    const swing = after.winProb - before.winProb;

    return (
        <div className="rounded-lg border p-3 space-y-3"
            style={{
                borderColor: 'rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.02)',
            }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h4 className="text-[12px] font-semibold">
                    <span style={{ color: SERIES.b }}>{inName}</span>
                    <span className="text-muted-foreground/50 font-normal">
                        {outName ? ` instead of ${outName}` : ' in this slot'}
                    </span>
                </h4>
                {onFullCompare && (
                    <button type="button" onClick={onFullCompare}
                        className="text-[10px] text-muted-foreground/50 hover:text-foreground/80
                                   underline underline-offset-2">
                        Full head-to-head
                    </button>
                )}
            </div>

            {/* The candidate's own week, at the depth the starter gets. */}
            {children}

            <div className="pt-1 border-t space-y-1.5"
                style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                <h5 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    What it changes
                </h5>
                <dl className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <dt className="text-[11px] text-muted-foreground/60">
                            Chance you win
                        </dt>
                        <dd><Delta before={before.winProb * 100}
                            after={after.winProb * 100} unit="%" /></dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <dt className="text-[11px] text-muted-foreground/60">
                            Your expected points
                        </dt>
                        <dd><Delta before={before.pointsFor}
                            after={after.pointsFor} unit="" /></dd>
                    </div>
                </dl>

                {/* The distribution, because the mean is not the decision.
                    A swap that costs a point of expectation and widens the
                    right tail is the right move against a lineup you cannot
                    out-score on average, and only the shape says so. */}
                {after.hist && (
                    <div className="pt-1">
                        <MatchupChart hist={after.hist} winProb={after.winProb}
                            mineLabel={`${mineLabel} with ${inName}`}
                            theirsLabel={theirsLabel} />
                    </div>
                )}

                <p className="text-[10px] text-muted-foreground/45 leading-snug">
                    {Math.abs(swing) < 0.005
                        ? 'Effectively a coin flip between the two — whichever you '
                          + 'believe in is fine, and neither is a mistake.'
                        : swing > 0
                            ? `Starting ${inName} raises your chances by `
                              + `${(swing * 100).toFixed(1)} points. `
                            : `Starting ${inName} costs you `
                              + `${Math.abs(swing * 100).toFixed(1)} points of win probability. `}
                    {Math.abs(swing) >= 0.005 && (
                        'Both lineups were simulated against the same 20,000 weeks '
                        + 'from the same seed, so the difference is the swap.'
                    )}
                </p>
            </div>
        </div>
    );
}
