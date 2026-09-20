'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn, ordinal } from '@/lib/utils';
import { EvenBar, spanFor } from './EvenBar';
import { POWER_NOISE, seasonOutlook,
    type PlayoffOdds, type PowerGap, type PowerRow } from '@/lib/power';
import type { Horizon } from '@/lib/simInput';
import { DIVERGING } from '@/lib/vizTokens';

/**
 * Strength, and how far results have run ahead of it.
 *
 * The ranking is a bar per team, measured from even odds rather than from
 * zero — see EvenBar for why a zero-based track makes the best and worst
 * rosters in a league look alike. The interesting column is the one beside
 * it: how many places a team sits above or below where its record puts it.
 * Signed, diverging, and worded, because "+3" against a rank means nothing
 * without saying which direction is lucky.
 *
 * A row opens to that team's head-to-head rates against everyone else,
 * which is where a ranking stops being a league-wide abstraction: fourth
 * overall matters less than being the one team you cannot beat.
 */

function LuckNote({ row }: { row: PowerRow }) {
    // Null means the standings cannot say — week one, or a league still
    // level. The gap is the only honest thing to withhold there.
    if (row.luckGap == null || row.recordRank == null) return null;
    const gap = row.luckGap;
    if (Math.abs(gap) < 2) {
        return (
            <span className="text-[10px] text-muted-foreground/45">
                record matches the roster
            </span>
        );
    }
    // Positive means the record flatters the roster.
    const lucky = gap > 0;
    return (
        <span className="text-[10px] font-semibold"
            style={{ color: lucky ? '#FDBA74' : '#93C5FD' }}
            title={`${ordinal(row.rank)}-best roster, ${ordinal(row.recordRank)} in the standings`}>
            {lucky
                ? `${Math.abs(gap)} better off than the roster`
                : `${Math.abs(gap)} worse off than the roster`}
        </span>
    );
}

export function PowerTable({
    rows, unranked, myKey, trials, horizon, remaining, odds, spots, onSpots, spotsKnown,
    realSchedule = false,
}: {
    rows: PowerRow[]; unranked?: PowerGap[]; myKey: string | null; trials: number;
    horizon: Horizon;
    /** Regular-season weeks still to play. */
    remaining: number;
    /** How often each roster is still playing in January. */
    odds: Map<string, PlayoffOdds> | null;
    /** How many teams make the playoffs. */
    spots: number;
    onSpots: (n: number) => void;
    /** True when the platform said, rather than the page assuming. */
    spotsKnown: boolean;
    /**
     * True when the odds played the league's own fixtures rather than a
     * schedule drawn at random.
     *
     * Said on the page rather than kept internal, because the two are
     * different claims and a reader deciding whether to trust a playoff
     * number is entitled to know which one produced it.
     */
    realSchedule?: boolean;
}) {
    const [open, setOpen] = useState<string | null>(null);
    if (rows.length === 0) return null;
    const byKey = new Map(rows.map(r => [r.key, r]));
    // Before anybody has played there is no record to run ahead of the
    // roster, so the column that compares them is not shown empty.
    const hasLuck = rows.some(r => r.luckGap != null);
    // Two different measures, so two scales: beating the whole field is a
    // narrower spread than beating one particular team, and forcing them
    // onto one axis would flatten whichever is tighter.
    const fieldSpan = spanFor(rows.map(r => r.winRate));
    const h2hSpan = spanFor(rows.flatMap(r => Object.values(r.against)));
    const pp = (s: number) => `${Math.round(s * 100)}`;
    /**
     * A rate, said as a record.
     *
     * "Fifty-four per cent" is a fact about a simulated week; "eight and six,
     * and you need nine" is what an owner is deciding against. Only shown on
     * the season horizon and only when there are weeks left to project — a
     * projected finish for this Sunday is not a thing.
     */
    const showFinish = horizon === 'season' && remaining > 0;
    const GRID = showFinish
        ? `grid-cols-[22px_minmax(0,1fr)_auto]
           sm:grid-cols-[22px_150px_178px_50px_74px_50px_minmax(0,1fr)_20px]`
        : `grid-cols-[22px_minmax(0,1fr)_auto]
           sm:grid-cols-[22px_150px_190px_52px_56px_minmax(0,1fr)_20px]`;
    /**
     * A colour for a probability, on the same two hues as everything else.
     *
     * Not a third scale: the diverging pair already means "better or worse
     * than even", and playoff odds are the same claim about a season.
     */
    const oddsInk = (p: number) => (p >= 0.5 ? DIVERGING.positive : DIVERGING.negative);

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    {horizon === 'season'
                        ? 'Every roster against every other, rest of season'
                        : 'Every roster against every other, this week'}
                </h2>
                <span className="flex items-center gap-x-3 gap-y-1 flex-wrap
                                 text-[10px] text-muted-foreground/45">
                    {/* Where the cut is, and who said so.
                        Sleeper does not always report it, and a page that
                        quietly assumes six is giving a confident wrong answer
                        to the only question on it that matters. */}
                    {showFinish && odds && (
                        <label className="flex items-center gap-1.5">
                            <span>{spotsKnown ? 'Top' : 'Assuming top'}</span>
                            <select value={spots}
                                onChange={e => onSpots(Number(e.target.value))}
                                aria-label="How many teams make the playoffs"
                                className="rounded px-1 py-0.5 text-[10px] font-bold
                                           text-foreground border border-white/[0.10]"
                                style={{ background: 'rgba(255,255,255,0.05)' }}>
                                {Array.from({ length: Math.max(1, rows.length - 1) },
                                    (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                            <span>make the playoffs</span>
                        </label>
                    )}
                    <span>
                        {rows.length} teams · {(rows.length * (rows.length - 1)) / 2} pairings
                    </span>
                </span>
            </div>

            <div className={cn(`grid items-end gap-x-3 px-1 pb-1 text-[10px] uppercase
                            tracking-widest font-bold text-muted-foreground/45`, GRID)}>
                <span>#</span>
                <span className="hidden sm:block">Team</span>
                <span className="hidden sm:block normal-case tracking-normal">
                    <span className="uppercase tracking-widest">Beats the field</span>
                    {/* The axis needs naming once, or a reader has to infer
                        what the line in every row is measured from. */}
                    <span className="block font-normal text-muted-foreground/35
                                     text-[9px] leading-tight">
                        line is even odds · ±{pp(fieldSpan)} points fills the track
                    </span>
                </span>
                <span className="hidden sm:block text-right">Rate</span>
                {showFinish && (
                    <span className="hidden sm:block text-right normal-case tracking-normal">
                        <span className="uppercase tracking-widest">
                            {odds ? 'Playoffs' : 'Finish'}
                        </span>
                        <span className="block font-normal text-muted-foreground/35
                                         text-[9px] leading-tight">
                            {odds ? `top ${spots} · ${remaining} wk` : `${remaining} wk left`}
                        </span>
                    </span>
                )}
                <span className="hidden sm:block text-right">Pts</span>
                <span className="hidden sm:block">{hasLuck ? 'Record vs roster' : ''}</span>
                <span className="hidden sm:block" />
            </div>

            <ul className="space-y-0.5">
                {rows.map(r => {
                    const isMe = r.key === myKey;
                    const isOpen = open === r.key;
                    return (
                        <li key={r.key} className="rounded-lg"
                            style={{ background: isMe ? 'rgba(2,132,199,0.08)' : undefined }}>
                            <button type="button" aria-expanded={isOpen}
                                onClick={() => setOpen(isOpen ? null : r.key)}
                                className={cn(`w-full grid items-center gap-x-3 gap-y-1 px-1 py-1.5
                                    rounded-lg text-left transition-colors
                                    hover:bg-white/[0.05]`, GRID)}>
                                {/* A shared rank, because two rosters this
                                    close are not reliably ordered — see
                                    POWER_NOISE. Marking it is the difference
                                    between a ranking and a guess with a
                                    number on it. */}
                                <span className="text-[11px] font-bold tabular-nums
                                                 text-muted-foreground/55"
                                    title={r.tied
                                        ? 'Shares this place: the gap to the other roster '
                                          + 'is inside what the simulation itself moves by'
                                        : undefined}>
                                    {r.tied && <span className="font-normal
                                                                text-muted-foreground/40">=</span>}
                                    {r.rank}
                                </span>
                                <span className="min-w-0">
                                    <span className={cn('text-[12px] truncate block',
                                        isMe ? 'font-bold' : 'font-semibold')}>
                                        {r.name}{isMe && ' — you'}
                                    </span>
                                    {/* Two different shortfalls, and a reader
                                        needs to know which: a slot we could
                                        not price understates the roster, a
                                        slot left empty is the roster. */}
                                    {r.priced < r.filled && (
                                        <span className="text-[10px] font-semibold block"
                                            style={{ color: '#FDBA74' }}
                                            title={`${r.filled - r.priced} of this lineup `
                                                + 'could not be priced, so this row '
                                                + 'understates the roster'}>
                                            {r.priced} of {r.filled} priced
                                        </span>
                                    )}
                                    {r.filled < r.slots && (
                                        <span className="text-[10px] font-semibold block"
                                            style={{ color: '#FDBA74' }}
                                            title={'This team is leaving a starting slot '
                                                + 'empty, which is why its expected score '
                                                + 'is short — not a gap in our data'}>
                                            starting {r.filled} of {r.slots} slots
                                        </span>
                                    )}
                                    {/* "0-0 · 0 pts" twelve times over says
                                        nothing; a record earns its line once
                                        somebody has played. */}
                                    {r.record
                                        && r.record.wins + r.record.losses + r.record.ties > 0 && (
                                        <span className="text-[10px] text-muted-foreground/45
                                                         tabular-nums">
                                            {r.record.wins}-{r.record.losses}
                                            {r.record.ties ? `-${r.record.ties}` : ''}
                                            {' · '}{r.record.pointsFor.toFixed(0)} pts
                                        </span>
                                    )}
                                </span>

                                {/* The bar owns row two outright on a phone.
                                    It used to span all three columns while
                                    the rate claimed the third of them in the
                                    same row, so the two collided and the bar
                                    rendered as an eight-pixel sliver against
                                    the right edge — the whole visualisation,
                                    gone, on the screen most of these
                                    decisions are made on. */}
                                <span className="col-span-3 row-start-2 sm:col-span-1
                                                 sm:col-start-3 sm:row-start-1"
                                    title={`Beats the other ${rows.length - 1} rosters `
                                        + `${(r.winRate * 100).toFixed(1)}% of the time. `
                                        + 'The line is even odds — a team exactly as good '
                                        + 'as its league.'}>
                                    <EvenBar p={r.winRate} span={fieldSpan} mine={isMe} />
                                    <span className="sm:hidden text-[10px] tabular-nums
                                                     text-muted-foreground/60 mt-0.5 block">
                                        {(r.winRate * 100).toFixed(1)}% of simulated games
                                        {showFinish && (() => {
                                            const o = seasonOutlook(r.winRate, remaining,
                                                r.record);
                                            const po = odds?.get(r.key);
                                            return (
                                                <span className="text-muted-foreground/40">
                                                    {` · ${o.projectedWins}–`
                                                        + `${o.projectedLosses}`}
                                                    {po && (
                                                        <span style={{ color: oddsInk(po.odds) }}>
                                                            {` · ${Math.round(po.odds * 100)}% `
                                                                + 'playoffs'}
                                                        </span>
                                                    )}
                                                </span>
                                            );
                                        })()}
                                    </span>
                                </span>

                                <span className="hidden sm:block sm:col-start-4
                                                 sm:row-start-1 text-[11px] tabular-nums
                                                 text-right text-muted-foreground/70">
                                    {(r.winRate * 100).toFixed(1)}%
                                </span>

                                {showFinish && (() => {
                                    const o = seasonOutlook(r.winRate, remaining, r.record);
                                    const po = odds?.get(r.key);
                                    return (
                                        <span className="hidden sm:block sm:col-start-5
                                                         sm:row-start-1 text-right tabular-nums"
                                            title={`${o.wonSoFar} won, ${o.winsToCome} more `
                                                + `expected from ${o.remaining} weeks. Eighty `
                                                + `per cent of seasons finish between ${o.low} `
                                                + `and ${o.high} wins`
                                                + (po
                                                    ? `, and between ${po.seedLow}th and `
                                                      + `${po.seedHigh}th in the league.`
                                                    : '.')}>
                                            {/* The number an owner is
                                                actually asking for. Eight
                                                and six makes the playoffs in
                                                one league and misses in
                                                another, and they already
                                                know which. */}
                                            {po ? (
                                                /* Tagged on my own row only, so a
                                                   check can hold the five pages to
                                                   the one number they all promise
                                                   to be quoting. */
                                                <span className="block text-[11px] font-bold"
                                                    data-my-odds={isMe
                                                        ? Math.round(po.odds * 100) : undefined}
                                                    style={{ color: oddsInk(po.odds) }}>
                                                    {po.odds >= 0.995 ? '>99'
                                                        : po.odds <= 0.005 ? '<1'
                                                        : Math.round(po.odds * 100)}%
                                                </span>
                                            ) : (
                                                <span className="block text-[11px] font-semibold">
                                                    {o.projectedWins}–{o.projectedLosses}
                                                </span>
                                            )}
                                            <span className="block text-[9px]
                                                             text-muted-foreground/40">
                                                {po
                                                    ? `${o.projectedWins}–${o.projectedLosses}`
                                                      + ` · ${ordinal(po.seed)}`
                                                    : `${o.low}–${o.high} wins`}
                                            </span>
                                        </span>
                                    );
                                })()}

                                <span className={cn(`col-start-3 row-start-1 text-[11px]
                                                 tabular-nums text-right font-semibold`,
                                    showFinish ? 'sm:col-start-6' : 'sm:col-start-5')}
                                    title="Mean simulated score for this lineup">
                                    {r.expected}
                                </span>

                                <span className={cn('col-span-3 row-start-3 sm:col-span-1',
                                    showFinish ? 'sm:col-start-7' : 'sm:col-start-6',
                                    'sm:row-start-1')}>
                                    <LuckNote row={r} />
                                </span>

                                <span className={cn('hidden sm:flex justify-end',
                                    showFinish ? 'col-start-8' : 'col-start-7')}>
                                    <ChevronDown className={cn(
                                        'w-3 h-3 text-muted-foreground/30 transition-transform',
                                        isOpen && 'rotate-180')} aria-hidden="true" />
                                </span>
                            </button>

                            {isOpen && (
                                // Indented and ruled, so a panel of eleven
                                // rates reads as belonging to the row above
                                // it rather than as a second table.
                                <div className="ml-3 sm:ml-6 pl-3 pb-2.5 pt-1
                                                border-l border-white/[0.08]">
                                    <h4 className="text-[10px] uppercase tracking-widest
                                                   font-bold text-muted-foreground/45">
                                        {r.name} against each team
                                    </h4>
                                    {/* Its own scale, and said so: a single
                                        matchup swings further than a rate
                                        against eleven teams at once. */}
                                    <p className="text-[9px] text-muted-foreground/35 mb-1">
                                        even odds · ±{pp(h2hSpan)} points fills the track
                                    </p>
                                    <ul className="space-y-0.5">
                                        {Object.entries(r.against)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([k, p]) => (
                                                <li key={k}
                                                    className="grid items-center gap-x-2
                                                               grid-cols-[92px_minmax(0,1fr)_38px]
                                                               sm:grid-cols-[130px_190px_44px_minmax(0,1fr)]"
                                                    title={`${r.name} beats `
                                                        + `${byKey.get(k)?.name ?? k} `
                                                        + `${(p * 100).toFixed(1)}% of the time`}>
                                                    <span className="text-[11px]
                                                                     text-muted-foreground/70
                                                                     truncate">
                                                        {byKey.get(k)?.name ?? k}
                                                    </span>
                                                    <EvenBar p={p} height={5}
                                                        span={h2hSpan} />
                                                    <span className="text-[11px] tabular-nums
                                                                     text-right font-semibold"
                                                        style={{
                                                            color: p >= 0.5
                                                                ? '#93C5FD' : '#FCA5A5',
                                                        }}>
                                                        {Math.round(p * 100)}%
                                                    </span>
                                                    <span />
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            {unranked && unranked.length > 0 && (
                <p className="text-[10px] mt-2 leading-snug" style={{ color: '#FDBA74' }}>
                    Left out of the ranking:{' '}
                    {unranked.map(u => `${u.name} (${u.priced} of ${u.filled} priced)`)
                        .join(', ')}
                    . A roster we could not read is a free win for everybody else, so
                    ranking it would have moved every row and not just its own.
                </p>
            )}

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug">
                Each roster plays every other {trials.toLocaleString()} times from one
                seed, so the order is reproducible and the table is symmetric.
                {horizon === 'season' ? (
                    <>
                        {' '}Every team fields the best lineup its roster can, because
                        over {remaining || 'the remaining'} weeks it will — a slot
                        somebody left empty this Sunday is a fact about one afternoon,
                        not about the team.
                        {showFinish && (odds ? (
                            <>
                                {' '}Playoff odds play the remaining {remaining} weeks
                                out ten thousand times, shuffling the league into pairs
                                each week and settling every pair on the head-to-head
                                rate above. Pairing rather than carrying each team&rsquo;s
                                rate forward on its own is what stops all twelve of them
                                finishing 9&ndash;5: a win here is a loss there, which is
                                the only way a finishing place means anything.
                                {realSchedule ? (
                                    <>
                                        {' '}The weeks played are your league&rsquo;s
                                        own fixtures, read from your platform — so a
                                        hard run home shows up here rather than being
                                        averaged away. Whose schedule is soft is the
                                        one thing the ranking above refuses to know;
                                        this is where it is allowed to matter.
                                    </>
                                ) : (
                                    <>
                                        {' '}Your platform would not give a complete
                                        fixture list for those weeks, so the schedule
                                        is drawn at random instead — which is every
                                        possible schedule averaged, and so understates
                                        both the hardest and the easiest run home.
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                {' '}The projected finish carries that rate forward
                                against an <em>average</em> opponent: the schedule is
                                not modelled, and whose is soft is the thing a power
                                ranking is trying not to measure.
                            </>
                        ))}
                    </>
                ) : (
                    <>
                        {' '}Every team fields the lineup its owner has actually set,
                        against this week&rsquo;s opponents, lines and byes — which
                        makes this a matchup preview rather than a judgement on a
                        roster.
                    </>
                )}
                {rows.some(r => r.tied) && (
                    <>
                        {' '}Places marked <span className="font-semibold">=</span> are
                        shared: those rosters are closer together than{' '}
                        {(POWER_NOISE * 100).toFixed(1)} points, which is how far this
                        simulation moves on its own, so the order between them would
                        not survive a different run.
                    </>
                )} Ranked on how often a
                lineup wins rather than on what it has scored — points scored is a
                fact about the schedule as much as about the team
                {hasLuck
                    ? ', and the column beside it says how far the two have come apart.'
                    : '. Nobody in this league has played yet, so there is no record '
                      + 'to set against the roster; that column appears once the '
                      + 'standings can tell two teams apart.'}
            </p>
        </section>
    );
}
