'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import type { ContingencyOut, SuccessorOut } from '@/app/api/redraft/successors/route';

/**
 * If he goes down, who takes the work — and can you have him.
 *
 * The table above prices what losing a man costs *your lineup*, which is a
 * fact about your bench. This is the other half and the one that is
 * actionable before the injury: who picks the work up in the NFL, and
 * whether he is sitting on waivers right now.
 *
 * Every site publishes a handcuff chart and every one of them is a depth
 * chart with a draft position bolted on — a claim about who a coach says is
 * second. This is a measurement of who actually got the ball, taken from the
 * weeks the starter did not dress, and the two disagree often enough to be
 * worth the trouble: across Bucky Irving's seven absences the listed backup
 * gained a point a game and Sean Tucker, listed nowhere, gained six and a
 * half.
 *
 * The sample sizes are small and are printed rather than hidden, because
 * "eleven points across seven games" and "eleven points across two" are
 * different claims and the reader is the one who should be discounting them.
 */

/** How the work redistributed, as a share of the starter's own touches. */
function AbsorbBar({ successors }: { successors: SuccessorOut[] }) {
    const named = successors.slice(0, 2);
    const shares = named.map(s => Math.max(0, Math.min(1, s.absorbed ?? 0)));
    const claimed = shares.reduce((a, b) => a + b, 0);
    /**
     * What is left is not an error term to be normalised away.
     *
     * An offence does not run the same number of plays without its starter,
     * and work leaves the position entirely — to a receiver, to a quarterback
     * keeping it, or to nobody because the team fell behind and stopped
     * running. A bar forced to a hundred per cent would be asserting that the
     * touches went somewhere it has not measured.
     */
    const rest = Math.max(0, 1 - claimed);
    const cells: { w: number; fill: string; key: string }[] = [
        ...named.map((s, i) => ({
            w: shares[i], fill: i === 0 ? SERIES.a : SERIES.b, key: s.name,
        })),
        { w: rest, fill: 'rgba(255,255,255,0.07)', key: 'rest' },
    ].filter(c => c.w > 0.005);

    return (
        <span className="flex h-[7px] w-full rounded-full overflow-hidden"
            style={{ background: CHART_INK.grid, gap: MARK.gap }}
            aria-hidden>
            {cells.map(c => (
                <span key={c.key} style={{
                    flexGrow: c.w, background: c.fill,
                    borderRadius: MARK.barRadius,
                }} />
            ))}
        </span>
    );
}

/** Where a successor is, in the reader's league rather than in the NFL. */
type Where =
    | { kind: 'mine' }
    | { kind: 'taken'; team: string }
    | { kind: 'free' };

function WhereChip({ where }: { where: Where }) {
    // Text first, colour second: the state has to survive a reader who
    // cannot tell the two greens apart, and a chip that is only a colour
    // does not.
    const [label, tone] =
        where.kind === 'free' ? ['on waivers', '#4ADE80'] :
        where.kind === 'mine' ? ['yours already', CHART_INK.context] :
        [`rostered · ${where.team}`, CHART_INK.context];
    return (
        <span className="text-[10px] font-semibold whitespace-nowrap"
            style={{ color: tone }}>
            {label}
        </span>
    );
}

function SuccessorLine({ s, where, rank }: {
    s: SuccessorOut; where: Where; rank: number;
}) {
    const swing = s.lift;
    /*
        Two rows on a phone and one on a desktop, placed explicitly rather
        than left to flow.
        The first version put the name and the numbers in adjacent columns of
        one row, which reads correctly at any width the author happens to
        have open and falls apart at 390px: the numbers are an `auto` column
        and take what they need, the name is the flexible one and takes what
        is left, and what was left was nothing. Every successor rendered as a
        coloured dot and a row of statistics about nobody — no overflow, no
        error, and the one fact a reader needs gone.
    */
    return (
        <li className="grid items-baseline gap-x-2 gap-y-0.5
                       grid-cols-[8px_minmax(0,1fr)_auto]
                       sm:grid-cols-[8px_minmax(0,1.1fr)_auto_auto]">
            <span className="h-[7px] w-[7px] rounded-full self-center
                             col-start-1 row-start-1"
                style={{ background: rank === 0 ? SERIES.a : SERIES.b }} aria-hidden />
            <span className="min-w-0 text-[11.5px] font-semibold truncate
                             col-start-2 row-start-1">
                {s.slug
                    ? <Link href={`/redraft/players/${s.slug}`}
                        className="hover:underline underline-offset-2">{s.name}</Link>
                    : s.name}
            </span>
            <span className="text-[10.5px] tabular-nums
                             col-start-2 row-start-2 sm:whitespace-nowrap
                             sm:col-start-3 sm:row-start-1"
                style={{ color: CHART_INK.context }}>
                {s.pointsOut.toFixed(1)}
                <span className="opacity-55"> a game over {s.games}</span>
                {swing != null && (
                    <>
                        <span className="opacity-40"> · </span>
                        <span style={{ color: swing > 0 ? '#4ADE80' : CHART_INK.context }}>
                            {swing > 0 ? '+' : ''}{swing.toFixed(1)}
                        </span>
                        <span className="opacity-55"> on his own average</span>
                    </>
                )}
                {s.absorbed != null && s.absorbed > 0.02 && (
                    <>
                        <span className="opacity-40"> · </span>
                        <span className="opacity-70">
                            {(s.absorbed * 100).toFixed(0)}% of the touches
                        </span>
                    </>
                )}
            </span>
            <span className="col-start-3 row-start-1 text-right
                             sm:col-start-4">
                <WhereChip where={where} />
            </span>
        </li>
    );
}

function Row({ c, whereOf }: {
    c: ContingencyOut;
    whereOf: (id: number) => Where;
}) {
    const games = c.missed + c.played;
    return (
        <li className="py-2.5 px-1 border-t border-white/[0.05] first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[12px] font-semibold">
                    {c.name}
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider
                                     text-muted-foreground/40">
                        {c.position}{c.team ? ` · ${c.team}` : ''}
                    </span>
                </span>
                {/*
                    His own attendance, which is the prior the whole row rests
                    on. A man who has missed nothing in three seasons is a
                    different proposition from one who has missed fifteen,
                    and the successor below means less in the first case and
                    more in the second — so it is stated before the successor
                    rather than left to be inferred from him.
                */}
                <span className="text-[10px] tabular-nums"
                    style={{ color: CHART_INK.context }}>
                    {/*
                        A man who has just signed here has no weeks with this
                        team, and "no games logged" beside a three-year
                        starter is the page calling him a rookie. The body
                        text under the row says why; this has to not
                        contradict it.
                    */}
                    {c.newToTeam
                        ? `no weeks with ${c.team ?? 'them'}`
                        : games > 0
                            ? c.missed === 0
                                ? `played all ${games}`
                                : `missed ${c.missed} of ${games}`
                            : 'no games logged'}
                </span>
            </div>

            {c.successors.length > 0 ? (
                <>
                    <div className="mt-1.5 mb-1"><AbsorbBar successors={c.successors} /></div>
                    <ul className="space-y-1">
                        {c.successors.slice(0, 2).map((s, i) => (
                            <SuccessorLine key={s.id} s={s} rank={i} where={whereOf(s.id)} />
                        ))}
                    </ul>
                </>
            ) : (
                <p className="text-[10.5px] mt-0.5" style={{ color: CHART_INK.context }}>
                    {/*
                        Four different silences, and merging them is how a
                        page lies quietly. "He has never been hurt" is the
                        best news on the page; "he just signed here" is a
                        limit of the method; "nobody took the work" is a
                        finding about the offence. Only the fourth is a gap.
                    */}
                    {c.newToTeam
                        ? `New to ${c.team ?? 'the team'} — his record is with somebody `
                          + 'else, and what happened there says nothing about who covers '
                          + 'for him here.'
                        : games === 0
                            ? 'No games logged in the window.'
                            : c.missed === 0
                                ? 'Nothing to measure: he has not missed a game in the window.'
                                : c.measured > 0
                                    ? `The ${c.measured === 1 ? 'man who' : `${c.measured} who`} `
                                      + 'picked the work up ' + (c.measured === 1 ? 'has' : 'have')
                                      + ' since left the team.'
                                    : `${c.missed} missed, and nobody at his position picked `
                                      + 'up enough of the work to name.'}
                </p>
            )}
        </li>
    );
}

export function Contingency({ players, rosteredBy, myKey, fromSeason, season, loading, failed }: {
    players: ContingencyOut[];
    /** Player id → the league team holding him, for anyone who is held. */
    rosteredBy: Map<number, { key: string; name: string }>;
    myKey: string | null;
    fromSeason: number | null;
    season: number;
    loading: boolean;
    failed: boolean;
}) {
    const whereOf = useMemo(() => (id: number): Where => {
        const at = rosteredBy.get(id);
        if (!at) return { kind: 'free' };
        if (myKey && at.key === myKey) return { kind: 'mine' };
        return { kind: 'taken', team: at.name };
    }, [rosteredBy, myKey]);

    /**
     * The men with an answer first, and among those the ones whose successor
     * is claimable.
     *
     * Ordering on the starter's quality would put the same names at the top
     * as every other list on the site. The finding here is a move — a
     * successor sitting on waivers is something to do this afternoon, and
     * one on a rival's bench is something to know before you ask for him.
     */
    const sorted = useMemo(() => {
        const score = (c: ContingencyOut) => {
            if (c.successors.length === 0) return -1;
            const free = c.successors.some(s => !rosteredBy.has(s.id));
            const best = Math.max(...c.successors.map(s => s.pointsOut));
            /**
             * Four points a game, which is a nudge rather than an override.
             *
             * The first version added a hundred, so claimability decided the
             * order outright and a free agent who scored nine tenths of a
             * point across two games sat above the back measured taking half
             * of Alvin Kamara's work. Being available is worth something and
             * it is not worth more than being good; four points is about what
             * separates a startable week from a wasted one, which makes it
             * the honest size for the thumb on the scale.
             */
            return best + (free ? 4 : 0);
        };
        return [...players].sort((a, b) => score(b) - score(a));
    }, [players, rosteredBy]);

    if (failed) return null;

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    If he goes down, who takes the work
                </h2>
                {fromSeason != null && (
                    <span className="text-[10px] tabular-nums"
                        style={{ color: CHART_INK.context }}>
                        measured {fromSeason}–{season}
                    </span>
                )}
            </div>
            <p className="text-[11px] text-muted-foreground/55 max-w-[740px] mb-2">
                Not a depth chart. Every week your man did not dress is found in the game
                logs, and his teammates are measured across those weeks and against the
                weeks they played together — so this is who <em>did</em> take the ball,
                which is not always who the chart says would. The bar is the share of his
                touches each one picked up; the rest left the position or was never run.
                Small samples, printed as samples.
            </p>

            {loading && players.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/55 py-2">
                    Reading the weeks they missed…
                </p>
            ) : sorted.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/55 py-2">
                    Nothing to measure yet — connect a league with a roster in it.
                </p>
            ) : (
                <ul className="mt-1">
                    {sorted.map(c => (
                        <Row key={c.playerId} c={c} whereOf={whereOf} />
                    ))}
                </ul>
            )}
        </section>
    );
}
