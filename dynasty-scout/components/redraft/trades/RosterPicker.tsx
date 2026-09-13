'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DIVERGING } from '@/lib/vizTokens';
import type { TradeRosterPlayer } from '@/lib/trade';

/**
 * A roster you pick from, ordered the way you think about it.
 *
 * Alphabetical is useless and platform order is arbitrary, so this groups by
 * position and sorts by expected points inside each group — which is how a
 * roster is actually read when you are deciding what you can spare. The
 * starters are marked, because "who can I afford to lose" is answered by
 * whether he is on the field, not by where he sits in a list.
 */
const GROUPS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];

export function RosterPicker({
    title, subtitle, roster, starting, selected, onToggle, meanOf, disabled,
}: {
    title: string;
    subtitle?: string;
    roster: TradeRosterPlayer[];
    /** Ids in the lineup as the owner has it set. */
    starting: Set<number>;
    selected: Set<number>;
    onToggle: (id: number) => void;
    meanOf: (id: number) => number | null;
    disabled?: boolean;
}) {
    const byGroup = GROUPS.map(g => ({
        group: g,
        players: roster
            .filter(p => (p.position ?? '').toUpperCase() === g)
            .sort((a, b) => (meanOf(b.id) ?? -1) - (meanOf(a.id) ?? -1)),
    })).filter(g => g.players.length > 0);
    const other = roster.filter(p =>
        !GROUPS.includes((p.position ?? '').toUpperCase()));
    if (other.length) byGroup.push({ group: 'Other', players: other });

    return (
        <section className="rounded-xl border border-white/[0.07] p-3 min-w-0"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 mb-2">
                <h3 className="text-[11px] font-bold truncate">{title}</h3>
                <span className="text-[10px] text-muted-foreground/45">
                    {selected.size > 0
                        ? `${selected.size} going the other way`
                        : subtitle ?? 'nobody selected'}
                </span>
            </div>

            {roster.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/45 py-2">
                    Nothing to show — no player on this roster matched our pool.
                </p>
            ) : byGroup.map(({ group, players }) => (
                <div key={group} className="mb-1.5 last:mb-0">
                    <div className="text-[9px] uppercase tracking-widest font-bold
                                    text-muted-foreground/35 mb-0.5">
                        {group}
                    </div>
                    <ul className="space-y-px">
                        {players.map(p => {
                            const on = selected.has(p.id);
                            const mean = meanOf(p.id);
                            return (
                                <li key={p.id}>
                                    <button type="button" disabled={disabled}
                                        aria-pressed={on}
                                        // So a link into this page can be
                                        // checked against the player it
                                        // claims to have put on the table.
                                        data-player-id={p.id}
                                        onClick={() => onToggle(p.id)}
                                        className={cn(`w-full grid items-center gap-x-2
                                            px-1.5 py-1 rounded text-left text-[11px]
                                            grid-cols-[minmax(0,1fr)_22px_38px]
                                            transition-colors
                                            disabled:opacity-40 disabled:cursor-default`,
                                            on ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]')}
                                        style={on
                                            ? { boxShadow: `inset 2px 0 0 ${DIVERGING.positive}` }
                                            : undefined}
                                        title={on
                                            ? 'In the trade — click to keep him'
                                            : 'Click to put him in the trade'}>
                                        <span className={cn('truncate',
                                            on ? 'font-semibold' : '')}>
                                            {p.name}
                                        </span>
                                        <span className="text-[8px] font-bold uppercase
                                                         tracking-wide text-center"
                                            style={{
                                                color: starting.has(p.id)
                                                    ? 'rgba(255,255,255,0.55)'
                                                    : 'rgba(255,255,255,0.2)',
                                            }}
                                            title={starting.has(p.id)
                                                ? 'In the lineup as it is set now'
                                                : 'On the bench'}>
                                            {starting.has(p.id) ? 'ST' : '·'}
                                        </span>
                                        <span className="text-[10px] tabular-nums
                                                         text-right
                                                         text-muted-foreground/50"
                                            title="Expected points this week">
                                            {mean == null ? '—' : mean.toFixed(1)}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
            <p className="text-[9px] text-muted-foreground/30 mt-2">
                ST is in the lineup as the owner has it set now. The number beside
                each name is expected points this week, and it is what sorts every
                group — not a season ranking, because what a trade costs you is
                this Sunday&rsquo;s lineup.
            </p>
        </section>
    );
}
