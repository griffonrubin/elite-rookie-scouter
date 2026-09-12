'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvenBar, spanFor } from './EvenBar';
import { POWER_NOISE, type PowerGap, type PowerRow } from '@/lib/power';

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

const ord = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th';
    return `${n}${s}`;
};

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
            title={`${ord(row.rank)}-best roster, ${ord(row.recordRank)} in the standings`}>
            {lucky
                ? `${Math.abs(gap)} better off than the roster`
                : `${Math.abs(gap)} worse off than the roster`}
        </span>
    );
}

export function PowerTable({ rows, unranked, myKey, trials }: {
    rows: PowerRow[]; unranked?: PowerGap[]; myKey: string | null; trials: number;
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

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Every roster against every other
                </h2>
                <span className="text-[10px] text-muted-foreground/45">
                    {rows.length} teams · {(rows.length * (rows.length - 1)) / 2} pairings
                </span>
            </div>

            <div className="grid items-end gap-x-3 px-1 pb-1 text-[10px] uppercase
                            tracking-widest font-bold text-muted-foreground/45
                            grid-cols-[22px_minmax(0,1fr)_auto]
                            sm:grid-cols-[22px_150px_190px_52px_56px_minmax(0,1fr)_20px]">
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
                                    rounded-lg text-left transition-colors hover:bg-white/[0.05]
                                    grid-cols-[22px_minmax(0,1fr)_auto]
                                    sm:grid-cols-[22px_150px_190px_52px_56px_minmax(0,1fr)_20px]`)}>
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

                                <span className="col-span-3 row-start-2 sm:col-span-1
                                                 sm:col-start-3 sm:row-start-1"
                                    title={`Beats the other ${rows.length - 1} rosters `
                                        + `${(r.winRate * 100).toFixed(1)}% of the time. `
                                        + 'The line is even odds — a team exactly as good '
                                        + 'as its league.'}>
                                    <EvenBar p={r.winRate} span={fieldSpan} mine={isMe} />
                                </span>

                                <span className="col-start-3 row-start-2 sm:col-start-4
                                                 sm:row-start-1 text-[11px] tabular-nums
                                                 text-right text-muted-foreground/70">
                                    {(r.winRate * 100).toFixed(1)}%
                                </span>

                                <span className="col-start-3 row-start-1 sm:col-start-5
                                                 text-[11px] tabular-nums text-right
                                                 font-semibold"
                                    title="Mean simulated score for this lineup">
                                    {r.expected}
                                </span>

                                <span className="col-span-3 row-start-3 sm:col-span-1
                                                 sm:col-start-6 sm:row-start-1">
                                    <LuckNote row={r} />
                                </span>

                                <span className="hidden sm:flex col-start-7 justify-end">
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
