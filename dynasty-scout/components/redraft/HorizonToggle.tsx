'use client';

import React from 'react';
import type { Horizon } from '@/lib/simInput';

/**
 * Which question the page beneath is answering.
 *
 * Not a filter and not a preference — the two settings produce genuinely
 * different numbers from the same rosters, and a reader who cannot see
 * which one they are looking at will read a bye week as a weak team. So it
 * is stated in words above the table rather than tucked into a settings
 * menu, and the sentence under it says what changes.
 */
export function HorizonToggle({ value, onChange, remaining }: {
    value: Horizon;
    onChange: (h: Horizon) => void;
    /** Regular-season weeks left, so "rest of season" is a length. */
    remaining: number;
}) {
    const OPTIONS: { id: Horizon; label: string }[] = [
        { id: 'season', label: remaining > 0 ? `Rest of season · ${remaining} wk` : 'Rest of season' },
        { id: 'week', label: 'This week' },
    ];
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="inline-flex items-center gap-1 rounded-lg p-0.5"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {OPTIONS.map(o => (
                    <button key={o.id} type="button" onClick={() => onChange(o.id)}
                        aria-pressed={value === o.id}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold
                                    transition-colors ${value === o.id
                            ? 'bg-white/[0.12] text-foreground'
                            : 'text-muted-foreground/55 hover:text-foreground/80'}`}>
                        {o.label}
                    </button>
                ))}
            </div>
            <p className="text-[10px] text-muted-foreground/45 leading-snug max-w-[620px]">
                {value === 'season'
                    ? 'Every player at his own level — no opponent, no game line, no bye, '
                      + 'no injury report. What a roster is worth from here, rather than '
                      + 'which rosters drew a bad Sunday.'
                    : 'This Sunday only: the opponent’s defence, the books’ total for '
                      + 'each offence, the spread, byes and the injury report. Right for '
                      + 'setting a lineup, wrong for judging a roster.'}
            </p>
        </div>
    );
}
