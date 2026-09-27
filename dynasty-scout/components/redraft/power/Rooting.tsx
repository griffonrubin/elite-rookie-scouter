'use client';

import React from 'react';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import { ROOT_NOISE, type PlayoffOdds } from '@/lib/power';

/**
 * The other games, and which of them you have a stake in.
 *
 * Every tool in fantasy football stops at the game you are playing. The
 * panel above this one says what winning yours is worth; nothing anywhere
 * says what the other five are worth, and on a Sunday afternoon they are
 * most of what is left once yours is decided. Sometimes they are more than
 * that: two teams tied with you for the last place, playing each other, is
 * a game you cannot lose and cannot win, and it can move your season
 * further than your own result does.
 *
 * It costs nothing to know. The simulation already plays every fixture of
 * every trial to produce the odds above, so this is those same seasons
 * counted a second way — bucketed on who won each game rather than only on
 * who won yours. The two branches of any game, weighted by how often each
 * happens, give back the headline exactly; that identity is checked rather
 * than assumed.
 *
 * A dumbbell, for the same reason the panel above is one: the quantity is
 * two futures rather than a magnitude, and the distance between them is
 * the reading. The ends are labelled with the team whose win puts you
 * there, because here — unlike your own game — neither end is reliably the
 * good one, so position cannot carry it and the names have to.
 *
 * What is *not* shown is the point of the thing. Most weeks most games
 * move a season by less than this simulation's own noise, and the floor
 * that judges that was measured rather than guessed: eight seeds over one
 * league move a single swing by up to 3.9 points. Everything under four
 * points is therefore one honest sentence instead of a row, because a
 * league table of numbers nobody should act on is worse than a sentence
 * saying so.
 */

/** The two futures: one hue, two shades, the same pair the panel above uses. */
const LOW = '#7DD3FC';
const HIGH = '#0284C7';

export function Rooting({ mine, nameOf, myKey, week }: {
    /** My own odds row, which carries the whole week's rooting interest. */
    mine: PlayoffOdds;
    nameOf: (key: string) => string;
    myKey: string;
    week: number | null;
}) {
    // My own game belongs to the panel above; this one is about the rest.
    const others = mine.rooting.filter(g => g.home !== myKey && g.away !== myKey);
    if (others.length === 0) return null;

    const priced = others.filter(g => g.swing != null
        && g.oddsIfHome != null && g.oddsIfAway != null);
    const matters = priced
        .filter(g => Math.abs(g.swing!) >= ROOT_NOISE)
        .sort((a, b) => Math.abs(b.swing!) - Math.abs(a.swing!));
    const quiet = priced.length - matters.length;
    const here = Math.round(mine.odds * 100);

    return (
        <section data-panel="rooting" className="space-y-2">
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-[12px] font-semibold tracking-tight">
                    Who to root for in {week ? `week ${week}` : 'the other games'}
                </h3>
                <p className="text-[10px] text-muted-foreground/45">
                    Your playoff odds depending on who wins games you are not in
                </p>
            </header>

            {matters.length === 0 ? (
                <p data-empty className="text-[11px] text-muted-foreground/55
                                         leading-relaxed max-w-[660px]">
                    Nothing this week. All {priced.length} of the other games move
                    your odds by less than {Math.round(ROOT_NOISE * 100)} points,
                    which is inside what this simulation would move on its own
                    between two runs — so there is no result worth wanting.
                    Watch your own game.
                </p>
            ) : (
                <>
                    <div className="flex items-center gap-3 text-[10px]
                                    text-muted-foreground/45 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                            <i className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ background: CHART_INK.context }} />
                            where you are now ({here}%)
                        </span>
                        <span className="text-muted-foreground/30">
                            0% to 100% across · each end is labelled with the winner
                            that puts you there
                        </span>
                    </div>

                    <ul className="space-y-px">
                        {matters.map(g => {
                            const h = g.oddsIfHome! * 100;
                            const a = g.oddsIfAway! * 100;
                            // Whoever you want to win, and by how much.
                            const wantHome = h >= a;
                            const want = wantHome ? g.home : g.away;
                            const lowKey = wantHome ? g.away : g.home;
                            const low = Math.min(h, a);
                            const high = Math.max(h, a);
                            const wantOdds = g.homeWins == null ? null
                                : Math.round((wantHome ? g.homeWins : 1 - g.homeWins) * 100);
                            return (
                                <li key={`${g.home}v${g.away}`}
                                    className="grid items-center gap-x-2 gap-y-1 px-2 py-1.5
                                               rounded-md grid-cols-[minmax(0,1fr)_auto]
                                               sm:grid-cols-[minmax(110px,1.3fr)_minmax(0,2fr)_64px]"
                                    title={`${nameOf(g.home)} v ${nameOf(g.away)}: you `
                                        + `finish inside the cut ${Math.round(h)}% of the `
                                        + `time when ${nameOf(g.home)} wins and `
                                        + `${Math.round(a)}% when ${nameOf(g.away)} does`
                                        + (wantOdds != null
                                            ? `, and ${nameOf(want)} wins it ${wantOdds}% `
                                              + 'of the time.'
                                            : '.')}>
                                    <span className="col-start-1 row-start-1 min-w-0
                                                     flex items-baseline gap-1.5">
                                        <span data-game
                                            className="text-[11px] font-medium truncate">
                                            {nameOf(g.home)}
                                            <span className="text-muted-foreground/35">
                                                {' '}v{' '}
                                            </span>
                                            {nameOf(g.away)}
                                        </span>
                                    </span>

                                    <span className="col-span-2 col-start-1 row-start-2
                                                     sm:col-span-1 sm:col-start-2
                                                     sm:row-start-1"
                                        role="img"
                                        aria-label={`${Math.round(low)} per cent if `
                                            + `${nameOf(lowKey)} wins, ${Math.round(high)} `
                                            + `if ${nameOf(want)} does`}>
                                        <span className="relative block w-full h-[11px]
                                                         rounded-[3px]"
                                            style={{ background: 'rgba(255,255,255,0.045)' }}>
                                            {/* The gap, which is the reading. */}
                                            <span className="absolute top-[4px] h-[3px]"
                                                style={{
                                                    left: `${low}%`,
                                                    width: `${Math.max(high - low, 0.4)}%`,
                                                    background: CHART_INK.context,
                                                    opacity: 0.55,
                                                }} />
                                            {/* Where the season stands before the
                                                game is played, so the two ends read
                                                as a move rather than as two numbers. */}
                                            <span className="absolute"
                                                style={{
                                                    left: `calc(${here}% - 1px)`,
                                                    top: 0, width: 2, height: 11,
                                                    background: CHART_INK.axis,
                                                }} />
                                            {([[low, LOW, lowKey, 'low'],
                                               [high, HIGH, want, 'high']] as const)
                                                .map(([x, ink, , which]) => (
                                                <span key={which} data-end={which}
                                                    className="absolute"
                                                    style={{
                                                        left: `calc(${x}% - 4px)`,
                                                        top: 1.5, width: 8, height: 8,
                                                        borderRadius: 999,
                                                        background: ink,
                                                        boxShadow: `0 0 0 ${MARK.gap}px `
                                                            + CHART_INK.surface,
                                                    }} />
                                            ))}
                                        </span>
                                        <span className="mt-0.5 flex justify-between
                                                         text-[9px]
                                                         text-muted-foreground/40 gap-2">
                                            <span className="truncate">
                                                {nameOf(lowKey)} wins → {Math.round(low)}%
                                            </span>
                                            <span className="truncate text-right">
                                                {nameOf(want)} wins → {Math.round(high)}%
                                            </span>
                                        </span>
                                    </span>

                                    <span className="col-start-2 row-start-1 text-[10px]
                                                     tabular-nums text-right shrink-0
                                                     sm:col-start-3 sm:row-start-1
                                                     font-semibold"
                                        style={{ color: SERIES.a }}>
                                        {Math.round(high - low)}
                                        <span className="text-muted-foreground/35
                                                         font-normal"> pts</span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            <p className="text-[10px] text-muted-foreground/40 leading-relaxed
                          max-w-[660px]">
                {matters.length > 0 && quiet > 0 && (
                    <>
                        The other {quiet} {quiet === 1 ? 'game moves' : 'games move'} your
                        odds by less than {Math.round(ROOT_NOISE * 100)} points, which is
                        inside this simulation&rsquo;s own run-to-run noise — they are not
                        listed because there is nothing in them to want.{' '}
                    </>
                )}
                A game you are not playing in changes your season only through the
                standings: somebody you are racing wins or does not. That is why the
                games worth watching are nearly always between teams level with you,
                and why a team already through or already out has nothing to root for
                at all.
            </p>
        </section>
    );
}
