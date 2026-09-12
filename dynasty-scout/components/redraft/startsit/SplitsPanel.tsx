'use client';

import React from 'react';
import type { GameLog } from '@/app/api/redraft/startsit/route';
import { DIVERGING } from '@/lib/vizTokens';

/**
 * The averages a reader would work out by hand from the game log.
 *
 * The log is the evidence and the distribution is the summary, and between
 * them sits the arithmetic everybody actually does: what has he done lately,
 * what did he do last year, and what happened the last time he played these
 * people. Leaving that to be counted off a table of thirty-four rows is
 * leaving the reader to do the one part a computer is better at.
 *
 * Deliberately not a chart. These are five scalars and a date; a bar per
 * split would dress up a comparison that reads faster as numbers, and the
 * only thing worth encoding twice is whether a split sits above or below the
 * player's own baseline — which gets a colour on top of a signed number,
 * never instead of one.
 *
 * Every figure carries the games behind it. A 24-point average over one game
 * is not a rate, and a split that hides its sample invites reading it as one.
 */

export interface SplitsPanelProps {
    logs: GameLog[];
    /** This week's opponent, for the head-to-head history. */
    opponent?: string | null;
    /** Where "this season" starts. */
    season: number;
}

interface Split {
    key: string;
    label: string;
    games: GameLog[];
    /** Extra line under the number, for the things an average cannot say. */
    note?: string;
}

const mean = (xs: GameLog[]) =>
    xs.reduce((t, g) => t + g.points, 0) / (xs.length || 1);

export function SplitsPanel({ logs, opponent, season }: SplitsPanelProps) {
    if (logs.length === 0) return null;

    // Newest last, which is how the logs arrive; take from the end.
    const chron = [...logs].sort((a, b) => a.season - b.season || a.week - b.week);
    const baseline = mean(chron);

    const opp = opponent?.toUpperCase() ?? null;
    const vsOpp = opp
        ? chron.filter(g => (g.opponent ?? '').toUpperCase() === opp) : [];
    const lastMeeting = vsOpp[vsOpp.length - 1];

    const splits: Split[] = [
        { key: 'l3', label: 'Last 3', games: chron.slice(-3) },
        { key: 'l5', label: 'Last 5', games: chron.slice(-5) },
        { key: 'cur', label: `${season}`, games: chron.filter(g => g.season === season) },
        { key: 'prev', label: `${season - 1}`, games: chron.filter(g => g.season === season - 1) },
    ];
    if (opp) {
        splits.push({
            key: 'vs', label: `vs ${opp}`, games: vsOpp,
            note: lastMeeting
                ? `${lastMeeting.points.toFixed(1)} in `
                  + `${lastMeeting.season} week ${lastMeeting.week}`
                : 'never faced them in this window',
        });
    }

    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Splits
                </h4>
                <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                    {baseline.toFixed(1)} across all {chron.length}
                </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
                {splits.map(s => {
                    const n = s.games.length;
                    const avg = n ? mean(s.games) : null;
                    const delta = avg == null ? null : avg - baseline;
                    // One game is a game, not an average, and a tenth of a
                    // point either side of the baseline is not a split.
                    const meaningful = delta != null && n >= 2 && Math.abs(delta) >= 0.5;
                    return (
                        <div key={s.key} className="min-w-0">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[10px] text-muted-foreground/60
                                                 truncate">
                                    {s.label}
                                </span>
                                <span className="text-[9px] text-muted-foreground/35
                                                 tabular-nums shrink-0">
                                    {n === 0 ? '—' : `${n}g`}
                                </span>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[14px] font-bold tabular-nums">
                                    {avg == null ? (
                                        <span className="text-muted-foreground/30">—</span>
                                    ) : avg.toFixed(1)}
                                </span>
                                {meaningful && (
                                    <span className="text-[10px] font-semibold tabular-nums"
                                        style={{
                                            color: delta! > 0
                                                ? '#93C5FD' : '#FCA5A5',
                                        }}
                                        title={`${Math.abs(delta!).toFixed(1)} `
                                            + `${delta! > 0 ? 'above' : 'below'} his `
                                            + `${baseline.toFixed(1)} baseline`}>
                                        {delta! > 0 ? '+' : '−'}{Math.abs(delta!).toFixed(1)}
                                    </span>
                                )}
                                {n === 1 && (
                                    <span className="text-[9px] text-muted-foreground/40">
                                        one game
                                    </span>
                                )}
                            </div>
                            {s.note && (
                                <p className="text-[9px] text-muted-foreground/45 leading-tight">
                                    {s.note}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
