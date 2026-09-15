'use client';

import React from 'react';
import { cn, ordinal } from '@/lib/utils';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import type { ScheduleStrength } from '@/lib/leagueSchedule';

/**
 * The fixtures still to come, which exist nowhere but the league's platform.
 *
 * Every ranking on this page refuses to know the schedule on purpose — whose
 * opponents are soft is what "rank the rosters" is trying not to measure. That
 * makes this its necessary other half rather than a decoration: the ranking
 * says how good you are, this says what is left in front of you, and an owner
 * deciding whether to buy or sell needs both. Six weeks against the top three
 * rosters is a different season from six weeks against the bottom three, and
 * the difference is larger than most trades.
 *
 * Opponent strength is expected points rather than opponent record, for the
 * same reason the ranking exists: a record is partly its own schedule, so
 * ranking your schedule by your opponents' records measures their schedules
 * too.
 *
 * The strip is one cell per week, shaded by how strong that opponent is. It
 * is a sequential scale — one hue, light to dark — because the quantity has
 * no natural middle: there is no "zero" opponent to diverge around, only
 * more and less.
 */

/** Where a value sits in a range, 0..1, flat when the range is a point. */
function unit(v: number, lo: number, hi: number): number {
    return hi - lo < 1e-9 ? 0.5 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export function RunHome({ rows, myKey, weeks }: {
    rows: { key: string; name: string; sos: ScheduleStrength }[];
    myKey: string | null;
    /** The week numbers the strip covers, so the columns line up. */
    weeks: number[];
}) {
    const withGames = rows.filter(r => r.sos.opponents.length > 0);
    if (withGames.length < 2 || weeks.length === 0) return null;

    const all = withGames.flatMap(r => r.sos.opponents.map(o => o.expected));
    const lo = Math.min(...all), hi = Math.max(...all);
    const sorted = withGames.slice().sort((a, b) => a.sos.rank - b.sos.rank);
    const nameOf = new Map(rows.map(r => [r.key, r.name]));
    const short = shortLabels(rows);

    return (
        <section className="space-y-2">
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-[12px] font-semibold tracking-tight">
                    The run home
                </h3>
                <p className="text-[10px] text-muted-foreground/45">
                    Hardest first, by the expected score of the rosters left to play
                </p>
            </header>

            {/* A sequential ramp needs its ends named or a cell's shade
                means nothing. */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/45">
                <span>{lo.toFixed(0)} pts</span>
                <span className="inline-flex rounded-[3px] overflow-hidden">
                    {[0, 0.25, 0.5, 0.75, 1].map(t => (
                        <i key={t} className="inline-block w-5 h-2.5"
                            style={{ background: RAMP[stepFor(t)] }} />
                    ))}
                </span>
                <span>{hi.toFixed(0)} pts — a harder opponent</span>
            </div>

            <ul className="space-y-px">
                {sorted.map(({ key, name, sos }) => {
                    const isMe = key === myKey;
                    const byWeek = new Map(sos.opponents.map(o => [o.week, o]));
                    return (
                        <li key={key}
                            className={cn(`grid items-center gap-x-2 gap-y-1 px-2 py-1.5
                                           rounded-md grid-cols-[minmax(0,1fr)_auto]`,
                                'sm:grid-cols-[minmax(90px,1.4fr)_60px_minmax(0,2fr)]',
                                isMe && 'bg-white/[0.04]')}>
                            <span className="text-[11px] font-medium truncate">
                                <span data-rank
                                    className="text-muted-foreground/35 tabular-nums">
                                    {sos.rank}.{' '}
                                </span>
                                <span data-team>{name}</span>{isMe && <span className="text-muted-foreground/50">
                                    {' '}— you</span>}
                            </span>

                            <span className="text-[10px] tabular-nums text-right
                                             sm:text-left sm:col-start-2"
                                style={isMe ? { color: SERIES.a } : undefined}
                                title={`Opponents average ${sos.meanOpponent.toFixed(1)} `
                                    + `expected points over ${sos.opponents.length} weeks`
                                    + (sos.playedRank
                                        ? `. The weeks already played were the `
                                          + `${ordinal(sos.playedRank)} hardest, at `
                                          + `${sos.playedMeanOpponent?.toFixed(1)}.`
                                        : '.')}>
                                {sos.meanOpponent.toFixed(1)}
                            </span>

                            {/* One cell per week, in week order, so a column
                                is the same week on every row and a reader can
                                read down it as well as across. */}
                            <span className="col-span-2 sm:col-span-1 sm:col-start-3
                                             flex gap-[2px]">
                                {weeks.map(w => {
                                    const o = byWeek.get(w);
                                    if (!o) {
                                        return (
                                            <span key={w}
                                                className="flex-1 min-w-0 h-[18px]
                                                           rounded-[3px]"
                                                style={{ background: CHART_INK.grid }}
                                                title={`Week ${w}: no fixture`} />
                                        );
                                    }
                                    const step = stepFor(unit(o.expected, lo, hi));
                                    return (
                                        <span key={w}
                                            className="flex-1 min-w-0 h-[18px] rounded-[3px]
                                                       grid place-items-center
                                                       text-[9px] font-semibold tabular-nums"
                                            style={{
                                                background: RAMP[step],
                                                // Ink, never the series colour, and
                                                // flipped on the step rather than on
                                                // the value: reading the flip off the
                                                // unscaled number puts white on the
                                                // pale middle of the ramp at under
                                                // 2:1, which is a label nobody can
                                                // read. Measured on the steps
                                                // themselves — 9.6:1 dark on #38BDF8,
                                                // 4.4:1 white on #0284C7.
                                                color: step >= 3
                                                    ? 'rgba(255,255,255,0.94)'
                                                    : 'rgba(9,20,32,0.88)',
                                                borderRadius: MARK.barRadius - 1,
                                            }}
                                            title={`Week ${w}: ${nameOf.get(o.key) ?? o.key}`
                                                + `, ${o.expected.toFixed(1)} expected`}>
                                            {short.get(o.key) ?? o.key}
                                        </span>
                                    );
                                })}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/**
 * The sequential ramp: one hue, light to dark, on this app's chart blue.
 *
 * Stepped through lightness at a constant hue rather than interpolated
 * between two colours, which is how a ramp acquires a second hue in its
 * middle and stops reading as one quantity. Five steps because a reader
 * counting shades stops at about five, and because a cell carries its
 * opponent's initials on top: a continuous ramp would put a label on a
 * different background in every cell and there would be no ink that works
 * on all of them.
 */
const RAMP = ['#BAE6FD', '#7DD3FC', '#38BDF8', '#0284C7', '#075985'] as const;

function stepFor(t: number): number {
    return Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))));
}

/**
 * Two or three letters per team, guaranteed to be different from each
 * other's.
 *
 * Two letters off the front of the name is the obvious thing and it is
 * wrong in exactly the leagues people have: "Certified Dumpster" and
 * "CeeDee Islanders" both come back CE, so two cells in the same column
 * say the same thing about different opponents and a reader has no way to
 * know. So the label grows a letter at a time until nothing collides, and
 * where a name still cannot be told apart from another it falls back to
 * its own key — ugly, and honest, which is the right way round.
 */
function shortLabels(rows: { key: string; name: string }[]): Map<string, string> {
    const out = new Map<string, string>();
    const clean = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    for (let len = 2; len <= 4; len++) {
        const taken = new Map<string, string[]>();
        for (const r of rows) {
            const label = clean(r.name).slice(0, len) || r.key;
            const list = taken.get(label);
            if (list) list.push(r.key); else taken.set(label, [r.key]);
        }
        out.clear();
        let clash = false;
        for (const [label, keys] of taken) {
            if (keys.length > 1) clash = true;
            for (const k of keys) out.set(k, label);
        }
        if (!clash) return out;
    }
    // Four letters and still level: the names are the same, so say the key.
    for (const r of rows) {
        const label = clean(r.name).slice(0, 4);
        if ([...out.values()].filter(v => v === label).length > 1) out.set(r.key, r.key);
    }
    return out;
}
