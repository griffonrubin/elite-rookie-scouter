'use client';

import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Outcome } from '@/lib/startSit';
import { RedraftPlayer } from '@/lib/types';
import { SwapRow } from './SwapBars';

/**
 * The question someone opens this page to answer on a Sunday morning.
 *
 * Everything else here is for deciding between two players who can both play.
 * This is for the case that outranks all of it: a starter who will not take
 * the field. That is not a judgement call and it should not have to be found
 * by reading down a roster — a bye or a ruled-out player is a hole in the
 * lineup, and the only useful thing to do with it is say so first and name
 * who fills it.
 *
 * Silent when there is nothing wrong. An alert bar that is always present
 * teaches people to stop reading it.
 */

export interface LineupProblem {
    player: RedraftPlayer;
    reason: string;
    /** The best legal replacement, when the swap engine found one. */
    fix?: SwapRow;
}

export function findProblems(
    starters: RedraftPlayer[],
    outcomeOf: (p: RedraftPlayer) => Outcome,
    swaps: SwapRow[],
): LineupProblem[] {
    const out: LineupProblem[] = [];
    for (const p of starters) {
        const o = outcomeOf(p);
        const reason = o.onBye ? 'on bye'
            : o.playProbability === 0 ? `ruled out${o.availability ? '' : ''}`
            : null;
        if (!reason) continue;
        // The best swap that replaces this exact player, which is already
        // ranked by what it does to the win probability.
        const fix = swaps.filter(s => s.outId === p.id)
            .sort((a, b) => b.deltaWinProb - a.deltaWinProb)[0];
        out.push({ player: p, reason, fix });
    }
    return out;
}

export function LineupAlerts({ problems, onPick }: {
    problems: LineupProblem[];
    onPick?: (r: SwapRow) => void;
}) {
    if (problems.length === 0) return null;

    return (
        <section
            className="rounded-xl border p-3"
            style={{
                borderColor: 'rgba(220,38,38,0.32)',
                background: 'rgba(220,38,38,0.07)',
            }}
            aria-label="Lineup problems">
            <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest
                           font-bold mb-2" style={{ color: '#FCA5A5' }}>
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                {problems.length === 1 ? 'A starter cannot play'
                    : `${problems.length} starters cannot play`}
            </h2>
            <ul className="space-y-1">
                {problems.map(({ player, reason, fix }) => (
                    <li key={player.id}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                        <span className="font-semibold">{player.full_name}</span>
                        <span className="text-muted-foreground/70">is {reason}</span>
                        {fix ? (
                            <button type="button" onClick={() => onPick?.(fix)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                                           bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
                                title={`Start ${fix.inName} instead — `
                                    + `${fix.deltaWinProb >= 0 ? '+' : ''}${fix.deltaWinProb} `
                                    + `points of win probability`}>
                                <ArrowRight className="w-3 h-3 text-muted-foreground/60"
                                    aria-hidden="true" />
                                <span className="font-semibold">{fix.inName}</span>
                                <span className="tabular-nums text-muted-foreground/70">
                                    {fix.deltaWinProb >= 0 ? '+' : ''}{fix.deltaWinProb.toFixed(1)}
                                </span>
                            </button>
                        ) : (
                            // No legal replacement is itself the answer, and a
                            // worse one to leave the reader to work out.
                            <span className="text-muted-foreground/50">
                                nobody on your bench can fill the slot
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
