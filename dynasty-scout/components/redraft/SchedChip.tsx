'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DIVERGING } from '@/lib/vizTokens';
import type { SosRow } from '@/lib/schedule';

/**
 * A player's remaining schedule, small enough to sit inside a crowded row.
 *
 * The same number the schedule panel draws, said in one line, so a reader
 * deciding whether to claim somebody or hand him over does not have to open
 * another page to find out he plays four of the league's five hardest
 * defences for his position between now and December.
 *
 * Against his own position, never against the opponents' overall quality: a
 * defence that cannot be run on and is thrown past all day is a brutal
 * schedule for a back and a gift for a receiver, and one number for both
 * cannot say so.
 */
export function schedFor(
    rows: SosRow[], team: string | null, position: string | null,
): SosRow | null {
    if (!team || !position) return null;
    const pos = position.toUpperCase();
    return rows.find(r => r.team === team && r.position === pos) ?? null;
}

export function SchedChip({ sos, label, className }: {
    sos: SosRow | null;
    /** Which window this is — the reader must never have to guess. */
    label: string;
    className?: string;
}) {
    if (!sos) return null;
    const easy = sos.ease > 0.5;
    const hard = sos.ease < -0.5;
    return (
        <span className={cn('text-[9px] whitespace-nowrap', className)}
            title={`Over ${label}, ${sos.team}'s opponents give up `
                + `${sos.ease > 0 ? '+' : ''}${sos.ease.toFixed(1)}% against an average `
                + `defence to ${sos.position}s — ${sos.rank} easiest of ${sos.of}`
                + (sos.byes ? `, with ${sos.byes} bye left out` : '')}>
            <span className="text-muted-foreground/40">{label} </span>
            <span className="font-bold tabular-nums"
                style={{ color: easy ? DIVERGING.positive
                    : hard ? DIVERGING.negative : 'rgba(255,255,255,0.45)' }}>
                {sos.rank}
            </span>
            <span className="text-muted-foreground/40">/{sos.of}</span>
        </span>
    );
}
