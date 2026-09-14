'use client';

import React from 'react';
import { POSITION_RAW } from '@/lib/constants';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';
import type { WirePosition } from '@/lib/waiverPlan';

/**
 * Your roster against the wire, position by position.
 *
 * The question underneath every waiver page and the one none of them answer.
 * "Who is available" is a list; "is anything available better than what I am
 * already holding" is a decision, and most weeks the honest answer is no — a
 * page that cannot say no is a page selling churn.
 *
 * Compared against the *weakest* player you hold at each position, because
 * that is the one who would be dropped. Against your best it would tell you
 * that your first-round back is better than the wire, which you knew.
 */
export function RosterVsWire({ rows, onPick }: {
    rows: WirePosition[];
    onPick: (position: string) => void;
}) {
    // A position where nothing is available is shown rather than dropped:
    // "there is no running back worth listing" is an answer, and a row that
    // silently disappears reads as a bug in a page that is meant to be able
    // to say no.
    const live = rows.filter(r => r.mineId != null || r.theirsId != null);
    if (live.length === 0) return null;
    const span = Math.max(2, ...live.map(r => Math.abs(r.gap ?? 0)));
    const wins = live.filter(r => (r.gap ?? 0) > 0.1);

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Your weakest against the best available
                </h2>
                <span className="text-[10px] text-muted-foreground/45">
                    {wins.length === 0
                        ? 'nothing on the wire beats what you hold'
                        : `${wins.length} position${wins.length === 1 ? '' : 's'} `
                          + 'where the wire is better'}
                </span>
            </div>
            <ul className="space-y-0.5">
                {live.map(r => {
                    const gap = r.gap ?? 0;
                    const unknown = r.gap == null;
                    const off = Math.max(-1, Math.min(1, gap / span));
                    const w = Math.abs(off) * 50;
                    const better = gap > 0.1;
                    return (
                        <li key={r.position}>
                            <button type="button" onClick={() => onPick(r.position)}
                                className="w-full grid items-center gap-x-2 text-left
                                           rounded px-1 py-1 transition-colors
                                           hover:bg-white/[0.05]
                                           grid-cols-[30px_minmax(0,1fr)_auto]
                                           sm:grid-cols-[30px_minmax(0,1fr)_150px_minmax(0,1fr)_58px_104px]"
                                title={`Your weakest ${r.position} projects `
                                    + `${r.minePoints} this week; the best available `
                                    + `projects ${r.theirsPoints}`}>
                                <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ background: POSITION_RAW[r.position]
                                            ?? '#64748b' }} />
                                    <span className="text-[10px] font-bold
                                                     text-muted-foreground/70">
                                        {r.position}
                                    </span>
                                </span>
                                {/* Named on both sides, because "RB: +1.2" is a
                                    number and "Chris Rodriguez 6.0 → Justice
                                    Hill 7.2" is a decision you can check. */}
                                <span className="text-[10px] text-muted-foreground/55
                                                 truncate min-w-0">
                                    {r.mineName ?? '—'}
                                    <span className="tabular-nums text-muted-foreground/40">
                                        {r.minePoints != null && ` ${r.minePoints}`}
                                    </span>
                                </span>
                                <span className="hidden sm:block relative h-[7px] w-full">
                                    <span className="absolute inset-0 rounded"
                                        style={{ background: CHART_INK.grid }} />
                                    <span className="absolute" style={{
                                        left: '50%', top: -2, bottom: -2, width: 1,
                                        background: 'rgba(255,255,255,0.3)',
                                    }} />
                                    <span className="absolute" style={{
                                        top: 0, height: 7,
                                        left: off >= 0 ? '50%' : `${50 - w}%`,
                                        width: unknown ? 0 : `${w}%`,
                                        minWidth: unknown ? 0 : 2,
                                        background: better ? DIVERGING.positive
                                            : 'rgba(255,255,255,0.3)',
                                        borderRadius: MARK.barRadius,
                                    }} />
                                </span>
                                <span className="hidden sm:block text-[10px] truncate
                                                 min-w-0"
                                    style={{ color: better ? undefined : 'rgba(255,255,255,0.4)' }}>
                                    {r.theirsName ?? 'nobody in the top sixty'}
                                    <span className="tabular-nums text-muted-foreground/40">
                                        {r.theirsPoints != null && ` ${r.theirsPoints}`}
                                    </span>
                                </span>
                                <span className="text-[11px] tabular-nums font-bold text-right"
                                    style={{ color: better ? DIVERGING.positive
                                        : 'rgba(255,255,255,0.3)' }}>
                                    {unknown ? '—' : better ? `+${gap.toFixed(1)}`
                                        : gap.toFixed(1)}
                                </span>
                                {/* How deep the wire is here, from the whole
                                    pool rather than the rows on screen.
                                    "Nothing better available" and "nothing
                                    better and nobody startable behind it"
                                    are different weeks. */}
                                <span className="hidden sm:block text-[9px]
                                                 text-muted-foreground/40 text-right
                                                 whitespace-nowrap">
                                    {r.available != null && (
                                        r.startable
                                            ? `${r.startable} startable free`
                                            : `${r.available} free, none startable`
                                    )}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <p className="text-[10px] text-muted-foreground/40 mt-1.5 leading-snug
                          max-w-[820px]">
                This Sunday&rsquo;s projection for the weakest player you hold at each
                position against the best one available — the weakest, because he is
                the one who would be dropped. A positive number is not yet a claim:
                what it is worth depends on whether either of them would start, which
                is the column the list below adds. &ldquo;Startable free&rdquo; counts
                every free agent in the league projected above the last player at that
                position anybody starts, not just the ones on this page.
            </p>
        </section>
    );
}
