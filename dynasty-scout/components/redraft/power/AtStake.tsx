'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import type { PlayoffOdds } from '@/lib/power';

/**
 * What this Sunday is worth, which a start/sit page cannot tell you.
 *
 * Every lineup tool optimises one week and none of them says how much that
 * week matters, and the two cases feel identical while you are setting it:
 * four points of playoff odds means the decision barely registers and you
 * should spend the afternoon on something else, twenty means it is the week
 * the season turns on. The same agonising over a flex either way.
 *
 * The number is the season played out conditional on winning this week
 * against the season played out conditional on losing it, read off the same
 * run the playoff odds come from — so it cannot disagree with them. The
 * headline above is these two weighted by how often each happens.
 *
 * It is a dumbbell rather than a bar because the quantity is two futures
 * rather than a magnitude: the distance between the ends is the whole
 * point, and where that distance sits on the track is the rest of it. Two
 * shades of one hue, light for the loss and dark for the win, because this
 * is the same quantity twice and not two opposed things.
 *
 * Sorted by that distance, so the league reads top to bottom as who has
 * most riding on the week — which is also the list of who will answer a
 * trade offer on Tuesday.
 */

/** The loss end and the win end: one hue, two shades, validated as ordinal. */
const LOSS = '#7DD3FC';
const WIN = '#0284C7';

export function AtStake({ rows, odds, myKey, opponentOf, week, realSchedule }: {
    rows: { key: string; name: string }[];
    odds: Map<string, PlayoffOdds>;
    myKey: string | null;
    /** Who each team plays this week, where the fixture list is known. */
    opponentOf?: Map<string, string> | null;
    week: number | null;
    /** True when the fixtures are the league's own rather than drawn. */
    realSchedule: boolean;
}) {
    const priced = rows
        .map(r => ({ row: r, o: odds.get(r.key) }))
        .filter((x): x is { row: { key: string; name: string }; o: PlayoffOdds } =>
            x.o != null && x.o.oddsIfWin != null && x.o.oddsIfLose != null);
    if (priced.length < 2) return null;

    const nameOf = new Map(rows.map(r => [r.key, r.name]));
    const swingOf = (o: PlayoffOdds) => (o.oddsIfWin ?? 0) - (o.oddsIfLose ?? 0);
    const sorted = priced.slice().sort((a, b) => swingOf(b.o) - swingOf(a.o));
    const idle = rows.filter(r => odds.get(r.key)?.winsThisWeek == null);

    return (
        <section data-panel="at-stake" className="space-y-2">
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-[12px] font-semibold tracking-tight">
                    What {week ? `week ${week}` : 'this week'} is worth
                </h3>
                <p className="text-[10px] text-muted-foreground/45">
                    Playoff odds if the week is won against if it is lost —
                    most riding on it first
                </p>
            </header>

            {/* Two ends of one quantity, named. A dumbbell is unreadable
                without saying which end is which. */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/45
                            flex-wrap">
                <span className="inline-flex items-center gap-1">
                    <i className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: LOSS }} />
                    if they lose
                </span>
                <span className="inline-flex items-center gap-1">
                    <i className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: WIN }} />
                    if they win
                </span>
                {/* Position carries the identity as well as the shade does,
                    and says so: a win is never worth less than a loss, so
                    the right-hand end is always the win. Two 8px dots a
                    shade apart is not something to make a reader rely on. */}
                <span className="text-muted-foreground/30">
                    0% to 100% across · the right end is always the win
                </span>
            </div>

            <ul className="space-y-px">
                {sorted.map(({ row, o }) => {
                    const isMe = row.key === myKey;
                    const lose = (o.oddsIfLose ?? 0) * 100;
                    const win = (o.oddsIfWin ?? 0) * 100;
                    const swing = win - lose;
                    const opp = opponentOf?.get(row.key);
                    return (
                        <li key={row.key}
                            className={cn(`grid items-center gap-x-2 gap-y-1 px-2 py-1.5
                                           rounded-md grid-cols-[minmax(0,1fr)_auto]`,
                                'sm:grid-cols-[minmax(90px,1.3fr)_minmax(0,2fr)_58px]',
                                isMe && 'bg-white/[0.04]')}
                            title={`${row.name}: ${Math.round(lose)}% to make the `
                                + `playoffs if this week is lost, ${Math.round(win)}% `
                                + `if it is won`
                                + (o.winsThisWeek != null
                                    ? `, and they win it ${Math.round(o.winsThisWeek * 100)}%`
                                      + ' of the time'
                                    : '')
                                + (opp ? ` — against ${nameOf.get(opp) ?? opp}.` : '.')}>
                            <span className="col-start-1 row-start-1 min-w-0 flex
                                             items-baseline gap-1.5">
                                <span data-team className="text-[11px] font-medium truncate">
                                    {row.name}{isMe && (
                                        <span className="text-muted-foreground/50">
                                            {' '}— you</span>
                                    )}
                                </span>
                                {opp && (
                                    <span className="text-[10px] text-muted-foreground/35
                                                     truncate shrink min-w-0">
                                        v {nameOf.get(opp) ?? opp}
                                    </span>
                                )}
                            </span>

                            <span className="col-span-2 col-start-1 row-start-2
                                             sm:col-span-1 sm:col-start-2 sm:row-start-1"
                                role="img"
                                aria-label={`${Math.round(lose)} per cent if they lose, `
                                    + `${Math.round(win)} if they win`}>
                                <span className="relative block w-full h-[11px] rounded-[3px]"
                                    style={{ background: 'rgba(255,255,255,0.045)' }}>
                                    {/* The gap itself, which is the reading. */}
                                    <span className="absolute top-[4px] h-[3px]" style={{
                                        left: `${lose}%`,
                                        width: `${Math.max(win - lose, 0.4)}%`,
                                        background: CHART_INK.context,
                                        opacity: 0.55,
                                    }} />
                                    {([[lose, LOSS, 'lose'], [win, WIN, 'win']] as const)
                                        .map(([x, ink, which]) => (
                                        <span key={which} data-end={which}
                                            className="absolute"
                                            style={{
                                                left: `calc(${x}% - 4px)`,
                                                top: 1.5, width: 8, height: 8,
                                                borderRadius: 999,
                                                background: ink,
                                                // A ring in the surface colour so
                                                // the two ends stay countable when
                                                // a week is worth almost nothing
                                                // and they overlap.
                                                boxShadow:
                                                    `0 0 0 ${MARK.gap}px ${CHART_INK.surface}`,
                                            }} />
                                    ))}
                                </span>
                            </span>

                            <span className="col-start-2 row-start-1 text-[10px]
                                             tabular-nums text-right shrink-0
                                             sm:col-start-3 sm:row-start-1 font-semibold"
                                style={{ color: isMe ? SERIES.a : undefined }}>
                                {swing >= 1 ? `+${Math.round(swing)}` : '<1'}
                                <span className="text-muted-foreground/35 font-normal">
                                    {' '}pts
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>

            <p className="text-[10px] text-muted-foreground/40 leading-relaxed
                          max-w-[660px]">
                A team already through and a team already out both have almost
                nothing riding on a Sunday, and they are the two teams most likely
                to trade you something. The teams at the top of this list are the
                ones who cannot afford to.
                {realSchedule
                    ? ' The opponents are your league’s own, read from your platform.'
                    : ' Your platform would not give a fixture list, so “this week” '
                      + 'is a week against a team drawn at random rather than against '
                      + 'the one you actually play.'}
                {' '}The win share behind these is the round-robin rate this whole
                table is built on, not the lineup-by-lineup simulation on Start/Sit —
                that one knows about byes, injuries and this week’s lines, and is
                the better estimate of this Sunday. This one has to be the table’s own
                rate, or the three numbers in a row would stop adding up.
                {idle.length > 0 && (
                    <>
                        {' '}{idle.map(r => r.name).join(', ')}
                        {idle.length === 1 ? ' has' : ' have'} no fixture this week,
                        so there is nothing to weigh.
                    </>
                )}
            </p>
        </section>
    );
}
