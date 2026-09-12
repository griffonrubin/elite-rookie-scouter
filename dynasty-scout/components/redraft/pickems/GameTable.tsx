'use client';

import React from 'react';
import { cn, ordinal } from '@/lib/utils';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import type { PickemGame } from '@/app/api/redraft/pickems/route';

/**
 * The week's card.
 *
 * Every row carries two probabilities that a reader should be comparing: the
 * market's, de-vigged from the moneylines this morning, and the historical
 * rate for a line of this size across twenty-seven seasons. When the two
 * agree — and on most games they agree within a point or two — that is worth
 * seeing, because it means the price is the forecast and there is nothing
 * cleverer to do than take it.
 *
 * The confidence column is the actionable part. A confidence pool asks for
 * an ordering, and the optimal ordering is by win probability, which is
 * exactly what the de-vigged moneyline is. That is a real answer and it is
 * free, so it is given rather than hinted at.
 */

/** A probability as a bar from zero, since a win chance has a real zero. */
function ProbBar({ p, colour, width = 74 }: {
    p: number; colour: string; width?: number;
}) {
    return (
        <span className="relative block h-[6px]" style={{ maxWidth: width }}>
            <span className="absolute inset-0 rounded-full"
                style={{ background: CHART_INK.grid }} />
            <span className="absolute inset-y-0 left-0" style={{
                width: `${Math.max(2, p * 100)}%`,
                background: colour,
                borderRadius: MARK.barRadius,
            }} />
        </span>
    );
}

const pct = (p: number | null) => (p == null ? '—' : `${Math.round(p * 100)}%`);

const kickoff = (day: string | null) => {
    if (!day) return '';
    const d = new Date(`${day}T12:00:00Z`);
    return Number.isNaN(d.getTime())
        ? day
        : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export function GameTable({ games, sort, onSort }: {
    games: PickemGame[];
    sort: 'kickoff' | 'confidence';
    onSort: (s: 'kickoff' | 'confidence') => void;
}) {
    // Confidence order is by market probability, highest first, and the
    // points a pool asks for run from the number of games down to one.
    const ranked = [...games]
        .sort((a, b) => (b.favWinProb ?? 0) - (a.favWinProb ?? 0));
    const confidenceOf = new Map(ranked.map((g, i) => [g.gameId, games.length - i]));
    const shown = sort === 'confidence' ? ranked : games;

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    This week&rsquo;s card
                </h2>
                <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-muted-foreground/40">order by</span>
                    {(['kickoff', 'confidence'] as const).map(s => (
                        <button key={s} type="button" onClick={() => onSort(s)}
                            aria-pressed={sort === s}
                            className={cn('px-1.5 py-0.5 rounded font-semibold transition-colors',
                                sort === s
                                    ? 'bg-white/[0.10] text-foreground'
                                    : 'text-muted-foreground/50 hover:text-foreground/80')}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid items-end gap-x-3 px-1 pb-1 text-[10px] uppercase
                            tracking-widest font-bold text-muted-foreground/45
                            grid-cols-[minmax(0,1fr)_auto]
                            sm:grid-cols-[26px_minmax(0,1.4fr)_74px_86px_86px_minmax(0,1fr)]">
                <span className="hidden sm:block" title="Points to assign in a confidence pool">
                    Pts
                </span>
                <span>Game</span>
                <span className="hidden sm:block">Line</span>
                <span className="hidden sm:block">Market</span>
                <span className="hidden sm:block">Since 1999</span>
                <span className="hidden sm:block">Total</span>
            </div>

            <ul className="divide-y divide-white/[0.04]">
                {shown.map(g => {
                    const conf = confidenceOf.get(g.gameId) ?? 0;
                    const gap = g.favWinProb != null && g.history
                        ? g.favWinProb - g.history.favWinRate
                        : null;
                    const dog = g.favourite === g.home ? g.away : g.home;
                    return (
                        <li key={g.gameId}
                            className="grid items-center gap-x-3 gap-y-1 px-1 py-2
                                       grid-cols-[minmax(0,1fr)_auto]
                                       sm:grid-cols-[26px_minmax(0,1.4fr)_74px_86px_86px_minmax(0,1fr)]">
                            <span className="hidden sm:block text-[12px] font-bold tabular-nums
                                             text-muted-foreground/55"
                                title={`Your ${ordinal(games.length - conf + 1)}-most confident `
                                    + 'pick, so worth this many points in a confidence pool'}>
                                {conf}
                            </span>

                            <span className="min-w-0">
                                <span className="text-[12px] block truncate">
                                    <span className="text-muted-foreground/60">{g.away}</span>
                                    <span className="text-muted-foreground/30"> at </span>
                                    <span className="text-muted-foreground/60">{g.home}</span>
                                </span>
                                <span className="text-[10px] text-muted-foreground/40">
                                    {kickoff(g.gameday)}
                                </span>
                            </span>

                            <span className="col-start-2 row-start-1 text-right sm:text-left
                                             sm:col-start-3 sm:row-start-1 text-[12px]
                                             tabular-nums font-semibold whitespace-nowrap">
                                {g.favourite == null || g.laying == null
                                    ? <span className="text-muted-foreground/40">no line</span>
                                    : <>{g.favourite}{' '}
                                        <span className="text-muted-foreground/50">
                                            −{g.laying}
                                        </span></>}
                            </span>

                            <span className="col-span-2 row-start-2 sm:col-span-1
                                             sm:col-start-4 sm:row-start-1"
                                title={g.favourite
                                    ? `The de-vigged moneyline gives ${g.favourite} `
                                      + `${pct(g.favWinProb)} against ${dog}`
                                    : 'No moneyline posted'}>
                                <span className="text-[11px] tabular-nums font-semibold block">
                                    {pct(g.favWinProb)}
                                    <span className="sm:hidden font-normal text-[9px]
                                                     uppercase tracking-widest
                                                     text-muted-foreground/40 ml-1.5">
                                        market
                                    </span>
                                </span>
                                {g.favWinProb != null
                                    && <ProbBar p={g.favWinProb} colour={SERIES.b} />}
                            </span>

                            <span className="col-span-2 row-start-3 sm:col-span-1
                                             sm:col-start-5 sm:row-start-1"
                                title={g.history
                                    ? `Favourites of ${g.history.label} have won `
                                      + `${(g.history.favWinRate * 100).toFixed(1)}% and covered `
                                      + `${(g.history.favCoverRate * 100).toFixed(1)}% of `
                                      + `${g.history.games.toLocaleString()} games`
                                    : 'No historical bucket for this line'}>
                                <span className="text-[11px] tabular-nums block
                                                 text-muted-foreground/70">
                                    {g.history ? pct(g.history.favWinRate) : '—'}
                                    <span className="sm:hidden font-normal text-[9px]
                                                     uppercase tracking-widest
                                                     text-muted-foreground/40 ml-1.5">
                                        since 1999
                                    </span>
                                    {gap != null && Math.abs(gap) >= 0.05 && (
                                        <span className="text-[9px] font-semibold ml-1"
                                            style={{ color: gap > 0 ? '#FDBA74' : '#93C5FD' }}>
                                            {gap > 0 ? 'market higher' : 'market lower'}
                                        </span>
                                    )}
                                </span>
                                {g.history
                                    && <ProbBar p={g.history.favWinRate} colour={SERIES.a} />}
                            </span>

                            <span className="col-span-2 row-start-4 sm:col-span-1
                                             sm:col-start-6 sm:row-start-1
                                             text-[10px] tabular-nums
                                             text-muted-foreground/50">
                                {g.totalLine == null ? '—' : (
                                    <>
                                        <span className="text-[11px] font-semibold
                                                         text-muted-foreground/70">
                                            {g.totalLine}
                                        </span>
                                        {g.homeTotal != null && g.awayTotal != null && (
                                            <span>
                                                {' '}· {g.away} {g.awayTotal} · {g.home}{' '}
                                                {g.homeTotal}
                                            </span>
                                        )}
                                    </>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug">
                <span className="font-semibold text-muted-foreground/55">Market</span> is the
                moneyline with the bookmaker&rsquo;s margin divided out, so the two sides of a
                game add to one hundred rather than to a hundred and five.{' '}
                <span className="font-semibold text-muted-foreground/55">Since 1999</span> is
                how often a favourite giving this many points has actually won. The two
                usually agree within a point or two, which is the finding rather than a
                coincidence — and the reason to reach for something other than the price is
                that you know something it does not.{' '}
                <span className="font-semibold text-muted-foreground/55">Pts</span> is the
                confidence-pool ordering: a pool scoring {games.length} down to 1 is
                maximised by ranking on win probability, and that is this column.
            </p>
        </section>
    );
}
