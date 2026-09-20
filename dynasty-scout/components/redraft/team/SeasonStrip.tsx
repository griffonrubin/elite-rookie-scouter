'use client';

import React from 'react';
import { cn, ordinal } from '@/lib/utils';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';
import type { PlayoffOdds } from '@/lib/power';
import type { AllPlay, ScheduleStrength } from '@/lib/leagueSchedule';
import { leverageOf } from '@/lib/seasonOdds';

/**
 * Your season, in four numbers, on the page that is about your team.
 *
 * Everything here exists elsewhere — the Power page computes all of it, for
 * every team in the league. That page answers "who is good". This one is
 * asked a different question, by somebody who already knows which team is
 * theirs, and making them read their own row out of a table of twelve to
 * answer it is making them do the work.
 *
 * Four rather than a chart, because four headline numbers are a row of
 * stat tiles: there is no shape to see, only values to read, and a chart
 * of four numbers is decoration with axes.
 *
 * Read off the shared run, so none of these can disagree with the page
 * that produced them.
 */

function Tile({ label, value, sub, ink, title, ...rest }: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    ink?: string;
    title?: string;
    /** Data attributes a check can anchor to, passed straight through. */
    [key: `data-${string}`]: string | number | undefined;
}) {
    return (
        <div className="min-w-0" title={title} {...rest}>
            <div className="text-[9px] uppercase tracking-widest font-bold
                            text-muted-foreground/40 truncate">
                {label}
            </div>
            <div className="text-[20px] font-bold tabular-nums leading-tight mt-0.5"
                style={ink ? { color: ink } : undefined}>
                {value}
            </div>
            {sub && (
                <div className="text-[10px] text-muted-foreground/50 leading-snug mt-0.5">
                    {sub}
                </div>
            )}
        </div>
    );
}

/** Wins to a record, halves included: 5.5 of 11 reads 5-5-1. */
function asRecord(wins: number, games: number): string {
    const w = Math.floor(wins);
    const half = wins - w >= 0.5;
    const l = Math.floor(games - wins);
    return half ? `${w}-${l}-1` : `${w}-${Math.round(games - wins)}`;
}

export function SeasonStrip({ odds, play, sos, teams, week, remaining, cut, name }: {
    odds: PlayoffOdds | null | undefined;
    play: AllPlay | null | undefined;
    sos: ScheduleStrength | null | undefined;
    /** How many teams are in the league, for the ranks to mean something. */
    teams: number;
    week: number | null;
    remaining: number;
    cut: number;
    name: string | null;
}) {
    if (!odds && !play && !sos) return null;
    const swing = leverageOf(odds);
    const lucky = play && play.notable ? play.luck > 0 : null;

    return (
        <section data-panel="season-strip"
            className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    {name ? `${name}’s season` : 'Your season'}
                </h2>
                <span className="text-[9px] text-muted-foreground/35">
                    {remaining > 0
                        ? `${remaining} week${remaining === 1 ? '' : 's'} left · `
                          + `top ${cut} of ${teams} make the playoffs`
                        : 'the regular season is over'}
                </span>
            </div>

            <div className="grid gap-x-4 gap-y-4 grid-cols-2 lg:grid-cols-4">
                {odds && (
                    <Tile label="Still playing in January"
                        data-my-odds={Math.round(odds.odds * 100)}
                        value={`${Math.round(odds.odds * 100)}%`}
                        ink={odds.odds >= 0.6 ? '#86EFAC'
                            : odds.odds <= 0.25 ? '#FCA5A5' : undefined}
                        sub={<>
                            {ordinal(odds.seed)} most likely finish
                            <span className="text-muted-foreground/30">
                                {' '}· {ordinal(odds.seedLow)}–{ordinal(odds.seedHigh)}
                            </span>
                        </>}
                        title={`The rest of the season played out ten thousand times. `
                            + `Eighty per cent of them finish between `
                            + `${ordinal(odds.seedLow)} and ${ordinal(odds.seedHigh)}.`} />
                )}

                {play && play.played > 0 && (
                    <Tile label="Earned, or not"
                        value={asRecord(play.actualWins, play.played)}
                        ink={lucky === null ? undefined
                            : lucky ? DIVERGING.positive : DIVERGING.negative}
                        sub={<>
                            {asRecord(play.allPlayWins / (play.allPlayGames / play.played),
                                play.played)}
                            {' '}against the whole league
                            {play.notable && (
                                <span style={{ color: lucky
                                    ? DIVERGING.positive : DIVERGING.negative }}>
                                    {' '}· {lucky ? 'flattered' : 'robbed'}
                                </span>
                            )}
                        </>}
                        title={`${play.actualWins} banked from ${play.played} weeks; `
                            + `${play.deservedWins.toFixed(1)} is what those scores were `
                            + `worth against everybody. One standard deviation is `
                            + `${play.sd.toFixed(1)} wins.`} />
                )}

                {swing != null && odds && (
                    <Tile label={week ? `Week ${week} is worth` : 'This week is worth'}
                        value={`${swing * 100 >= 1 ? Math.round(swing * 100) : '<1'} pts`}
                        sub={<>
                            {Math.round((odds.oddsIfLose ?? 0) * 100)}% if you lose,
                            {' '}{Math.round((odds.oddsIfWin ?? 0) * 100)}% if you win
                        </>}
                        title={'The season played out either side of this week, from '
                            + 'the same run as the odds beside it.'} />
                )}

                {sos && sos.opponents.length > 0 && (
                    <Tile label="The run home"
                        value={`${ordinal(sos.rank)} hardest`}
                        sub={<>
                            {sos.meanOpponent.toFixed(0)} a week across
                            {' '}{sos.opponents.length} opponent
                            {sos.opponents.length === 1 ? '' : 's'}
                            {sos.playedRank != null && (
                                <span className="text-muted-foreground/30">
                                    {' '}· {ordinal(sos.playedRank)} so far
                                </span>
                            )}
                        </>}
                        title={`Your remaining opponents average `
                            + `${sos.meanOpponent.toFixed(1)} expected points a week, `
                            + `which is the ${ordinal(sos.rank)} hardest run home in the `
                            + `league.`} />
                )}
            </div>

            {/* The one mark here: where the two conditionals sit against each
                other, which is the only thing in the strip with a shape. */}
            {swing != null && odds?.oddsIfWin != null && odds.oddsIfLose != null && (
                <span className="relative block w-full h-[9px] rounded-[3px] mt-3"
                    style={{ background: 'rgba(255,255,255,0.045)' }}
                    role="img"
                    aria-label={`${Math.round(odds.oddsIfLose * 100)} per cent if you lose `
                        + `this week, ${Math.round(odds.oddsIfWin * 100)} if you win`}>
                    <span className="absolute top-[3px] h-[3px]" style={{
                        left: `${odds.oddsIfLose * 100}%`,
                        width: `${Math.max((odds.oddsIfWin - odds.oddsIfLose) * 100, 0.4)}%`,
                        background: CHART_INK.context, opacity: 0.55,
                    }} />
                    {([['lose', odds.oddsIfLose, '#7DD3FC'],
                       ['win', odds.oddsIfWin, '#0284C7']] as const).map(([w, v, ink]) => (
                        <span key={w} data-end={w} className="absolute" style={{
                            left: `calc(${v * 100}% - 4px)`, top: 0.5,
                            width: 8, height: 8, borderRadius: 999, background: ink,
                            boxShadow: `0 0 0 ${MARK.gap}px ${CHART_INK.surface}`,
                        }} />
                    ))}
                    <span className={cn('absolute')} style={{
                        left: `calc(${odds.odds * 100}% - 1px)`, top: -2, bottom: -2,
                        width: 2, background: 'rgba(255,255,255,0.75)',
                    }} />
                </span>
            )}
        </section>
    );
}
