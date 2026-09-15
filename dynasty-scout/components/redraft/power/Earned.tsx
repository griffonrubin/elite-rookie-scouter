'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CHART_INK, DIVERGING, MARK, SERIES } from '@/lib/vizTokens';
import type { AllPlay } from '@/lib/leagueSchedule';

/**
 * Whether a record was earned, which the standings cannot say.
 *
 * A standings table reports one number per team and hides the thing that
 * decides how the rest of the season goes: five-and-three having been
 * outscored by the league most weeks is three-and-five that has not been
 * found out yet, and every November sell-off is somebody discovering that
 * in week eleven.
 *
 * The measure is the all-play record — what each week's score was worth
 * against the whole league rather than against the one opponent drawn. It
 * is not a model and it has no parameters: it is the same scores, counted
 * against more opponents. Where it agrees with the record there is nothing
 * to see, which is why most rows here are meant to be quiet.
 *
 * The gap is drawn against its own noise rather than on its own. Eight
 * weeks of even matchups swing a win and a half by luck alone, so a
 * one-win gap is arithmetic rather than evidence, and a page that colours
 * it in is inventing a story out of a coin. Only gaps clearing 1.28
 * standard deviations — the eighty per cent convention used everywhere
 * else here — are drawn in full.
 */

/** Wins to a record, halves included: 5.5 all-play wins of 11 reads 5-5-1. */
function asRecord(wins: number, games: number): string {
    const w = Math.floor(wins);
    const half = wins - w >= 0.5;
    const l = Math.floor(games - wins);
    return half ? `${w}-${l}-1` : `${w}-${Math.round(games - wins)}`;
}

export function Earned({ rows, myKey }: {
    rows: { key: string; name: string; play: AllPlay }[];
    myKey: string | null;
}) {
    const played = rows.filter(r => r.play.played > 0);
    if (played.length < 2) return null;

    // The track is scaled to this league's own widest gap, floored at a win
    // and a half so a league where nobody has been robbed does not get a
    // chart magnifying half a win into daylight.
    const span = Math.max(1.5, ...played.map(r => Math.abs(r.play.luck)));
    const sorted = played.slice().sort((a, b) => b.play.luck - a.play.luck);
    const weeks = Math.max(...played.map(r => r.play.played));

    return (
        <section className="space-y-2">
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-[12px] font-semibold tracking-tight">
                    Earned, or not
                </h3>
                <p className="text-[10px] text-muted-foreground/45">
                    Wins banked against wins the same scores were worth
                    against the whole league, over {weeks} week{weeks === 1 ? '' : 's'}
                </p>
            </header>

            {/* Two hues and a signed label, never colour alone. */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/45">
                <span className="inline-flex items-center gap-1">
                    <i className="inline-block w-2.5 h-2.5 rounded-[2px]"
                        style={{ background: DIVERGING.positive }} />
                    record flatters the scores
                </span>
                <span className="inline-flex items-center gap-1">
                    <i className="inline-block w-2.5 h-2.5 rounded-[2px]"
                        style={{ background: DIVERGING.negative }} />
                    scores deserved better
                </span>
            </div>

            <ul className="space-y-px">
                {sorted.map(({ key, name, play }) => {
                    const isMe = key === myKey;
                    const off = Math.max(-1, Math.min(1, play.luck / span));
                    const w = Math.abs(off) * 50;
                    const up = off >= 0;
                    const ink = isMe ? SERIES.a
                        : up ? DIVERGING.positive : DIVERGING.negative;
                    const sign = play.luck >= 0 ? '+' : '−';
                    const said = `${sign}${Math.abs(play.luck).toFixed(1)}`;
                    return (
                        <li key={key}
                            className={cn(`grid items-center gap-x-2 gap-y-1 px-2 py-1
                                           rounded-md`,
                                // Two rows on a phone: everything that is
                                // words on the first, the bar owning the
                                // second outright. It used to let the record
                                // auto-place, which put it on a row of its
                                // own beside the bar's right end — three
                                // rows a team, and a number next to a mark
                                // it was not measuring.
                                'grid-cols-[minmax(0,1fr)_auto]',
                                `sm:grid-cols-[minmax(90px,1.3fr)_66px_minmax(0,2fr)_72px]
                                 sm:gap-y-0`,
                                isMe && 'bg-white/[0.04]')}
                            title={`${name}: ${play.actualWins} banked from `
                                + `${play.played} weeks, ${play.deservedWins.toFixed(1)} `
                                + `deserved on an all-play record of `
                                + `${asRecord(play.allPlayWins, play.allPlayGames)}. `
                                + `One standard deviation is ${play.sd.toFixed(1)} wins, `
                                + `so this gap is ${play.notable ? '' : 'not '}`
                                + `outside what chance does. `
                                + `${play.pointsFor.toFixed(0)} scored a week, `
                                + `${play.pointsAgainst.toFixed(0)} allowed.`}>
                            <span className="col-start-1 row-start-1 min-w-0 flex
                                             items-baseline gap-1.5">
                                <span data-team className="text-[11px] font-medium truncate">
                                    {name}{isMe && (
                                        <span className="text-muted-foreground/50">
                                            {' '}— you</span>
                                    )}
                                </span>
                                {/* The two records side by side, which is the
                                    whole claim: same scores, more opponents.
                                    Beside the name rather than in a column of
                                    its own, so a phone spends its width on
                                    the chart. */}
                                <span className="text-[10px] tabular-nums shrink-0
                                                 text-muted-foreground/55 sm:hidden">
                                    {asRecord(play.actualWins, play.played)}
                                    <span className="text-muted-foreground/30">
                                        {' · '}{Math.round(play.rate * 100)}%
                                    </span>
                                </span>
                            </span>

                            <span className="hidden sm:block sm:col-start-2 sm:row-start-1
                                             text-[10px] tabular-nums
                                             text-muted-foreground/55">
                                {asRecord(play.actualWins, play.played)}
                                <span className="text-muted-foreground/30">
                                    {' · '}{Math.round(play.rate * 100)}%
                                </span>
                            </span>

                            <span className="col-span-2 col-start-1 row-start-2
                                             sm:col-span-1 sm:col-start-3 sm:row-start-1"
                                role="img"
                                aria-label={`${said} wins against the all-play record`}>
                                <span className="relative block w-full" style={{ height: 7 }}>
                                    <span className="absolute" style={{
                                        left: '50%', top: -2, bottom: -2, width: 1,
                                        background: CHART_INK.axis,
                                    }} />
                                    <span className="absolute" style={{
                                        top: 0, height: 7,
                                        left: up ? '50%' : `${50 - w}%`,
                                        width: `${w}%`, minWidth: 2,
                                        background: ink,
                                        // A gap inside the noise is drawn
                                        // faintly rather than left out: the
                                        // arithmetic is real, the story is
                                        // not, and hiding it would make the
                                        // chart look tidier than the league.
                                        opacity: play.notable ? 1 : 0.32,
                                        borderRadius: MARK.barRadius,
                                    }} />
                                </span>
                            </span>

                            <span className={cn(`col-start-2 row-start-1 text-[10px]
                                                 tabular-nums text-right shrink-0
                                                 sm:col-start-4 sm:row-start-1`,
                                play.notable ? 'font-semibold' : 'text-muted-foreground/40')}
                                style={play.notable ? { color: ink } : undefined}>
                                {said} <span className="text-muted-foreground/35">w</span>
                            </span>
                        </li>
                    );
                })}
            </ul>

            <p className="text-[10px] text-muted-foreground/40 leading-relaxed
                          max-w-[660px]">
                A gap under about {(1.28 * (played[0]?.play.sd ?? 1)).toFixed(1)} wins
                is drawn faintly because it is inside what a coin does over
                {' '}{weeks} weeks — real arithmetic, not evidence. The ones drawn
                in full are the teams whose record and whose scoring are telling
                you different things, which is the point at which it is worth
                deciding which one you believe.
            </p>
        </section>
    );
}
