'use client';

import React from 'react';
import { CHART_INK, MARK } from '@/lib/vizTokens';
import { ODDS_NOISE } from '@/lib/trade';
import type { PlayoffOdds } from '@/lib/power';
import { leverageOf, oddsGivenWinProb } from '@/lib/seasonOdds';

/**
 * What this week is worth, beside the lineup it is worth it for.
 *
 * Everything else on this page optimises one Sunday and none of it says
 * whether the Sunday matters. Those are different questions and they have
 * different answers: a fifty-four per cent week is a fifty-four per cent
 * week whether it decides your season or decides nothing, and an owner
 * agonising over a flex deserves to know which one they are in.
 *
 * The two conditionals come from the same run the Power page shows, so the
 * pages cannot disagree. What changes here is the weight between them:
 * this page simulates the week from the two actual lineups, against this
 * week's opponents, lines, byes and injury reports, which is a better
 * estimate of one Sunday than the round-robin rate a season is built on.
 * So the odds as things stand are the season's conditionals weighted by
 * this page's win probability — each half computed where it is known best.
 *
 * And it gives the lineup gain somewhere to land. Two points of win
 * probability is an abstraction; two points of win probability in a week
 * worth thirty points of playoff odds is six tenths of a point of season,
 * and in a week worth four it is not worth the click.
 */

const LOSE = '#7DD3FC';
const WIN = '#0284C7';

export function WeekStakes({ odds, winProb, bestGain, week }: {
    odds: PlayoffOdds | null | undefined;
    /** This page's own win probability for the week, 0..1. */
    winProb: number;
    /** Percentage points of win probability the best lineup would add. */
    bestGain?: number | null;
    week: number | null;
}) {
    const swing = leverageOf(odds);
    if (swing == null || !odds || odds.oddsIfWin == null || odds.oddsIfLose == null) {
        return null;
    }
    const lose = odds.oddsIfLose * 100;
    const win = odds.oddsIfWin * 100;
    const now = (oddsGivenWinProb(odds, winProb) ?? 0) * 100;
    const pts = swing * 100;
    /**
     * The lineup gain converted into season. A change worth `g` points of
     * win probability moves the season by `g × swing`, because the swing
     * is exactly what a win is worth — the first-order term, and the only
     * one a reader would recognise.
     */
    const gainPts = bestGain != null ? (bestGain / 100) * pts : null;

    return (
        <div className="mt-3 pt-3 border-t border-white/[0.07]">
            <p className="text-[12px]">
                <span className="text-muted-foreground/60">
                    {week ? `Week ${week}` : 'This week'} is worth{' '}
                </span>
                <span className="font-bold tabular-nums" style={{ color: '#93C5FD' }}>
                    {pts >= 1 ? Math.round(pts) : '<1'} pts
                </span>
                <span className="text-muted-foreground/60"> of playoff odds.</span>
            </p>

            {/* The same dumbbell the Power page uses for this, so a reader
                moving between them is reading one mark and not two. */}
            <span className="relative block w-full h-[11px] rounded-[3px] mt-2"
                style={{ background: 'rgba(255,255,255,0.045)' }}
                role="img"
                aria-label={`${Math.round(lose)} per cent to make the playoffs if you `
                    + `lose, ${Math.round(win)} if you win`}>
                <span className="absolute top-[4px] h-[3px]" style={{
                    left: `${lose}%`, width: `${Math.max(win - lose, 0.4)}%`,
                    background: CHART_INK.context, opacity: 0.55,
                }} />
                {([[lose, LOSE, 'lose'], [win, WIN, 'win']] as const).map(([x, ink, which]) => (
                    <span key={which} data-end={which} className="absolute" style={{
                        left: `calc(${x}% - 4px)`, top: 1.5, width: 8, height: 8,
                        borderRadius: 999, background: ink,
                        boxShadow: `0 0 0 ${MARK.gap}px ${CHART_INK.surface}`,
                    }} />
                ))}
                {/* Where you actually stand, given how likely you are to win
                    it. Between the two ends by construction, and the only
                    one of the three that is not conditional on anything. */}
                <span className="absolute" style={{
                    left: `calc(${now}% - 1px)`, top: -2, bottom: -2, width: 2,
                    background: 'rgba(255,255,255,0.75)',
                }} />
            </span>

            <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground/55">If you win</dt>
                    <dd className="tabular-nums font-semibold" style={{ color: WIN }}>
                        {Math.round(win)}%
                    </dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground/55">If you lose</dt>
                    <dd className="tabular-nums font-semibold" style={{ color: LOSE }}>
                        {Math.round(lose)}%
                    </dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground/55">
                        As things stand
                        <span className="text-muted-foreground/35">
                            {' '}· {Math.round(winProb * 100)}% to win
                        </span>
                    </dt>
                    <dd className="tabular-nums font-semibold">{Math.round(now)}%</dd>
                </div>
            </dl>

            {gainPts != null && Math.abs(bestGain ?? 0) > 0 && (
                <p className="text-[11px] mt-2 text-muted-foreground/60">
                    {Math.abs(gainPts) < ODDS_NOISE * 100 ? (
                        <>
                            The best lineup available is worth under a point of
                            playoff odds this week. Worth setting, not worth
                            agonising over.
                        </>
                    ) : (
                        <>
                            The best lineup available is worth{' '}
                            <span className="font-bold tabular-nums"
                                style={{ color: '#93C5FD' }}>
                                {gainPts >= 1 ? `+${gainPts.toFixed(1)}` : '<1'}
                            </span>{' '}
                            {gainPts >= 1 ? 'points' : 'of a point'} of playoff odds,
                            which is what those {bestGain?.toFixed(1)} points of win
                            probability are actually worth to your season.
                        </>
                    )}
                </p>
            )}

            <p className="text-[10px] text-muted-foreground/35 mt-2 leading-relaxed">
                The two ends are your league&rsquo;s season played out ten thousand
                times either side of this week, from the Power Rankings run — so the
                two pages cannot disagree about them. The mark between them is those
                two weighted by the win probability above, which this page simulates
                from both lineups rather than from a season-long rate.
            </p>
        </div>
    );
}
