'use client';

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { POSITION_RAW } from '@/lib/constants';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';
import type { SosRow } from '@/lib/schedule';
import type { TradeRosterPlayer } from '@/lib/trade';

/**
 * How hard the rest of the year is, for each player rather than each team.
 *
 * Every site ships a strength of schedule and nearly all of them rank
 * opponents by how good those teams are, which is the wrong question. A
 * defence that cannot be run on and gives up everything through the air is a
 * brutal schedule for your back and a gift for your receiver, and one number
 * for both cannot say so — Seattle last season were last in the league in
 * yards a carry allowed and first in catches allowed to backs.
 *
 * So each player is measured against what his own remaining opponents
 * concede to his own position. And the playoff weeks are shown apart from
 * the rest, because a schedule that is brutal in September and kind in
 * December is a good schedule, and an average over both says the opposite.
 */

function Bar({ v, span }: { v: number; span: number }) {
    const off = span > 0 ? Math.max(-1, Math.min(1, v / span)) : 0;
    const w = Math.abs(off) * 50;
    return (
        <span className="relative block w-full h-[7px]">
            <span className="absolute inset-0 rounded"
                style={{ background: CHART_INK.grid }} />
            {/* A league-average schedule, which is what the number is from. */}
            <span className="absolute" style={{
                left: '50%', top: -2, bottom: -2, width: 1,
                background: 'rgba(255,255,255,0.28)',
            }} />
            <span className="absolute" style={{
                top: 0, height: 7,
                left: off >= 0 ? '50%' : `${50 - w}%`,
                width: `${w}%`, minWidth: Math.abs(off) > 0.01 ? 2 : 0,
                background: off >= 0 ? DIVERGING.positive : DIVERGING.negative,
                borderRadius: MARK.barRadius,
            }} />
        </span>
    );
}

export function SchedulePanel({
    roster, rest, playoffs, restWeeks, playoffWeeks, loading, teamOf,
}: {
    roster: TradeRosterPlayer[];
    rest: SosRow[];
    playoffs: SosRow[];
    restWeeks: number[];
    playoffWeeks: number[];
    loading?: boolean;
    /** The NFL team a player plays for. */
    teamOf: (id: number) => string | null;
}) {
    const [window, setWindow] = useState<'rest' | 'playoffs'>('rest');
    const [open, setOpen] = useState<number | null>(null);
    const rows = window === 'rest' ? rest : playoffs;
    const weeks = window === 'rest' ? restWeeks : playoffWeeks;

    const shown = useMemo(() => {
        const by = new Map(rows.map(r => [`${r.team}|${r.position}`, r]));
        return roster
            .map(p => {
                const team = teamOf(p.id);
                const position = (p.position ?? '').toUpperCase();
                const sos = team ? by.get(`${team}|${position}`) ?? null : null;
                return { player: p, team, sos };
            })
            .filter(r => r.sos != null)
            .sort((a, b) => (b.sos!.ease) - (a.sos!.ease));
    }, [roster, rows, teamOf]);

    if (shown.length === 0) {
        return loading ? (
            <p className="text-[11px] text-muted-foreground/45">Reading the schedule…</p>
        ) : null;
    }
    const span = Math.max(4, ...shown.map(r => Math.abs(r.sos!.ease)));
    const of = shown[0].sos!.of;

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    The schedule ahead, position by position
                </h2>
                <div className="inline-flex items-center gap-1 rounded-lg p-0.5"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {([
                        ['rest', `Weeks ${restWeeks[0] ?? '?'}–${restWeeks[restWeeks.length - 1] ?? '?'}`],
                        ['playoffs', `Playoffs · ${playoffWeeks.join(', ')}`],
                    ] as const).map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setWindow(k)}
                            aria-pressed={window === k}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold
                                        transition-colors ${window === k
                                ? 'bg-white/[0.12] text-foreground'
                                : 'text-muted-foreground/55 hover:text-foreground/80'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <p className="text-[11px] text-muted-foreground/55 max-w-[820px] mb-2">
                What each player&rsquo;s remaining opponents give up{' '}
                <em>to his position</em>, against a league-average defence. Not how good
                those teams are: a defence that cannot be run on and is thrown past all
                day is a brutal schedule for your back and a gift for your receiver, and
                one number for both cannot say so.
                {window === 'playoffs' && (
                    <> These three weeks are the ones worth trading against — a schedule
                    that is brutal now and kind in December is a good schedule, and an
                    average over both hides it.</>
                )}
            </p>

            <div className="grid items-end gap-x-3 px-1 pb-1 text-[10px] uppercase
                            tracking-widest font-bold text-muted-foreground/45
                            grid-cols-[minmax(0,1fr)_auto]
                            sm:grid-cols-[168px_minmax(0,420px)_62px_104px_minmax(0,1fr)]">
                <span>Player</span>
                <span className="hidden sm:block">Easier ▸</span>
                <span className="hidden sm:block text-right">Ease</span>
                <span className="hidden sm:block text-right">Rank</span>
                <span className="hidden sm:block" />
            </div>

            <ul className="space-y-0.5">
                {shown.map(({ player, team, sos }) => {
                    const isOpen = open === player.id;
                    return (
                        <li key={player.id}>
                            <button type="button" aria-expanded={isOpen}
                                onClick={() => setOpen(isOpen ? null : player.id)}
                                className={cn(`w-full grid items-center gap-x-3 gap-y-1
                                    px-1 py-1.5 rounded-lg text-left transition-colors
                                    hover:bg-white/[0.05]
                                    grid-cols-[minmax(0,1fr)_auto]
                                    sm:grid-cols-[168px_minmax(0,420px)_62px_104px_minmax(0,1fr)]`,
                                    isOpen && 'bg-white/[0.04]')}>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{ background: POSITION_RAW[
                                                (player.position ?? '').toUpperCase()]
                                                ?? '#64748b' }} />
                                        <span className="text-[12px] font-semibold truncate">
                                            {player.name}
                                        </span>
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/50">
                                        {player.position} · {team}
                                        {sos!.byes > 0 && (
                                            <span className="text-muted-foreground/35">
                                                {' · '}{sos!.byes} bye
                                            </span>
                                        )}
                                    </span>
                                </span>
                                <span className="col-span-2 row-start-2 sm:col-span-1
                                                 sm:col-start-2 sm:row-start-1">
                                    <Bar v={sos!.ease} span={span} />
                                </span>
                                <span className="col-start-2 row-start-1 sm:col-start-3
                                                 text-[11px] tabular-nums font-bold text-right"
                                    style={{ color: sos!.ease >= 0 ? DIVERGING.positive
                                        : DIVERGING.negative }}>
                                    {sos!.ease > 0 ? '+' : ''}{sos!.ease.toFixed(1)}%
                                </span>
                                <span className="hidden sm:block sm:col-start-4 text-right
                                                 text-[10px] text-muted-foreground/50
                                                 tabular-nums">
                                    {sos!.rank} of {of} easiest
                                    <span className="block text-[9px]
                                                     text-muted-foreground/35">
                                        for {player.position}s
                                    </span>
                                </span>
                                <span className="hidden sm:block sm:col-start-5" />
                            </button>

                            {/* The weeks themselves, because an average over
                                thirteen games can hide a December nobody
                                would want. */}
                            {isOpen && (
                                <div className="ml-3 sm:ml-6 pl-3 pb-2 pt-1
                                                border-l border-white/[0.08]">
                                    <ul className="flex flex-wrap gap-x-3 gap-y-1">
                                        {sos!.weeks.map(w => (
                                            <li key={w.week}
                                                className="text-[10px] tabular-nums
                                                           whitespace-nowrap"
                                                title={w.ease != null
                                                    ? `${w.opponent} give up `
                                                      + `${w.ease > 0 ? '+' : ''}`
                                                      + `${w.ease.toFixed(1)}% against an `
                                                      + `average defence to ${player.position}s`
                                                    : 'no record for this defence'}>
                                                <span className="text-muted-foreground/35">
                                                    w{w.week}{' '}
                                                </span>
                                                <span className="text-muted-foreground/70">
                                                    {w.opponent}
                                                </span>
                                                {w.ease != null && (
                                                    <span className="font-semibold"
                                                        style={{ color: w.ease >= 0
                                                            ? DIVERGING.positive
                                                            : DIVERGING.negative }}>
                                                        {' '}{w.ease > 0 ? '+' : ''}
                                                        {w.ease.toFixed(0)}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    {sos!.byes > 0 && (
                                        <p className="text-[9px] text-muted-foreground/35 mt-1">
                                            {sos!.byes} bye inside this window, left out of
                                            the average — a bye is not an easy game, it is
                                            no game.
                                        </p>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug
                          max-w-[840px]">
                Measured per team-game against the same defence profiles Start/Sit uses,
                so a schedule and a matchup cannot disagree. {weeks.length} weeks in this
                window. The rank is against all {of} teams at that position, easiest
                first — a reader looking for somewhere to attack wants rank one.
            </p>
        </section>
    );
}
