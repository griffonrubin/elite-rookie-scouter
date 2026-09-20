'use client';

import React from 'react';
import { CHART_INK, MARK } from '@/lib/vizTokens';
import Link from 'next/link';
import { ODDS_NOISE } from '@/lib/trade';
import { ROOT_NOISE, type PlayoffOdds } from '@/lib/power';
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

export function WeekStakes({ odds, winProb, bestGain, week, myKey, nameOf }: {
    odds: PlayoffOdds | null | undefined;
    /** This page's own win probability for the week, 0..1. */
    winProb: number;
    /** Percentage points of win probability the best lineup would add. */
    bestGain?: number | null;
    week: number | null;
    /** Mine, so the game I am playing is not offered as one to watch. */
    myKey?: string | null;
    nameOf?: (key: string) => string;
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

    /**
     * The other game worth watching, when there is one.
     *
     * Power Rankings has the whole list; this is the one line that belongs
     * on a Sunday, because Sunday is when somebody is on this page and not
     * that one. Most weeks it is nothing — every other game sits inside
     * the simulation's own noise and there is no result worth wanting —
     * and on the weeks it is not, it is worth knowing before the games
     * start rather than after.
     */
    const elsewhere = (odds.rooting ?? [])
        .filter(g => g.home !== myKey && g.away !== myKey && g.swing != null
            && Math.abs(g.swing) >= ROOT_NOISE)
        .sort((a, b) => Math.abs(b.swing!) - Math.abs(a.swing!))[0] ?? null;
    const want = elsewhere
        ? ((elsewhere.oddsIfHome ?? 0) >= (elsewhere.oddsIfAway ?? 0)
            ? elsewhere.home : elsewhere.away)
        : null;
    const elsewherePts = elsewhere ? Math.abs(Math.round(elsewhere.swing! * 100)) : 0;

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
                    <dd className="tabular-nums font-semibold" style={{ color: WIN }}
                        data-odds-win={Math.round(win)}>
                        {Math.round(win)}%
                    </dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground/55">If you lose</dt>
                    <dd className="tabular-nums font-semibold" style={{ color: LOSE }}
                        data-odds-lose={Math.round(lose)}>
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
                    <dd className="tabular-nums font-semibold"
                        data-my-odds={Math.round(now)}>{Math.round(now)}%</dd>
                </div>
            </dl>

            {/*
                Why this can read a point either side of the Power page.
                The note is not pedantry: a reader who sees 65 here and 64
                there has no way to tell a better estimate from a bug, and
                the whole argument for one shared simulation is that they
                never have to wonder which number to believe. The two
                conditionals above are that simulation's; only the weight
                between them is this page's, and this page knows more about
                this Sunday than a round robin does.
            */}
            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug">
                The two figures above come from the same run Power Rankings
                shows. What is this page&rsquo;s is the weight between them:
                {' '}{Math.round(winProb * 100)}% comes from simulating both
                lineups against this week&rsquo;s opponent, byes and injury
                reports, where the season table uses its own round-robin rate.
                So &ldquo;as things stand&rdquo; can sit a point either side of
                the number on Power, and the better estimate of this Sunday is
                the one here.
            </p>

            {elsewhere && want && (
                <p data-note="elsewhere"
                    className="text-[11px] mt-2 text-muted-foreground/60">
                    {elsewherePts > Math.abs(Math.round(pts)) ? (
                        <>
                            <span className="font-semibold text-foreground">
                                A game you are not playing in matters more than
                                yours this week.
                            </span>{' '}
                        </>
                    ) : null}
                    You want{' '}
                    <span className="font-semibold text-foreground">
                        {nameOf ? nameOf(want) : want}
                    </span>{' '}
                    to beat{' '}
                    {nameOf
                        ? nameOf(want === elsewhere.home ? elsewhere.away : elsewhere.home)
                        : (want === elsewhere.home ? elsewhere.away : elsewhere.home)}
                    {' '}— worth {elsewherePts} points of playoff odds to you,
                    against {Math.abs(Math.round(pts))} for your own game.{' '}
                    <Link href="/in-season/power"
                        className="underline underline-offset-2
                                   hover:text-foreground transition-colors">
                        The rest of the week
                    </Link>.
                </p>
            )}

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
