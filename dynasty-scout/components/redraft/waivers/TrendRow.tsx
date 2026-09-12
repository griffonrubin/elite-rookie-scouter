'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CHART_INK, MARK, SERIES } from '@/lib/vizTokens';
import type { WaiverRow } from '@/app/api/redraft/waivers/route';

/**
 * One free agent, and the change that makes him worth a claim.
 *
 * Two bars per measure — before and after — on a shared scale, because the
 * decision is not "how many snaps" but "how many more". A single number with
 * an arrow hides the base it rose from, and a rise from two touches to five
 * is a different claim from six to fifteen even though both are "+3" and
 * "tripled".
 *
 * The scale is shared across every row in the table, not fitted per row, so
 * a reader comparing two players is comparing lengths rather than being
 * quietly re-normalised between them.
 */

/** Ceilings for the shared scale: a full snap share, and a workhorse's day. */
const SNAP_MAX = 1;
const TOUCH_MAX = 22;

function Pair({ before, after, max, format }: {
    before: number | null; after: number | null; max: number;
    format: (v: number) => string;
}) {
    if (after == null) {
        return <span className="text-[10px] text-muted-foreground/30">no games</span>;
    }
    const w = (v: number) => `${Math.min(100, Math.max(1.5, (v / max) * 100))}%`;
    const up = before == null ? true : after > before;
    return (
        <span className="block">
            {/* Before, recessive: it is the thing being departed from. */}
            <span className="relative block h-[5px] mb-[3px]">
                {before != null && (
                    <span className="absolute inset-y-0 left-0 rounded"
                        style={{ width: w(before), background: CHART_INK.context }} />
                )}
            </span>
            <span className="relative block h-[7px]">
                <span className="absolute inset-y-0 left-0"
                    style={{
                        width: w(after),
                        background: up ? SERIES.a : CHART_INK.context,
                        borderRadius: MARK.barRadius,
                    }} />
            </span>
            <span className="block text-[10px] tabular-nums text-muted-foreground/60 mt-0.5">
                {before == null ? '—' : format(before)}
                <span className="text-muted-foreground/30"> → </span>
                <span className="text-foreground font-semibold">{format(after)}</span>
            </span>
        </span>
    );
}

export function TrendRow({ row, isOpen, onToggle }: {
    row: WaiverRow; isOpen: boolean; onToggle: () => void;
}) {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const one = (v: number) => v.toFixed(1);

    return (
        <button type="button" onClick={onToggle} aria-expanded={isOpen}
            className={cn(`w-full grid items-center gap-x-3 gap-y-1 px-1 py-1.5 rounded-lg
                           text-left transition-colors hover:bg-white/[0.05]
                           grid-cols-[minmax(0,1fr)_auto]
                           sm:grid-cols-[168px_minmax(0,1fr)_minmax(0,1fr)_92px_20px]`,
                isOpen && 'bg-white/[0.04]')}>
            <span className="col-start-1 row-start-1 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: POSITION_RAW[(row.position ?? '').toUpperCase()]
                            ?? '#64748b' }} />
                    <span className="text-[12px] font-semibold truncate">{row.full_name}</span>
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                    {row.position} · {row.nfl_team ?? '—'} · {row.games}g
                </span>
            </span>

            <span className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <Pair before={row.snap_before} after={row.snap_now}
                    max={SNAP_MAX} format={pct} />
            </span>
            <span className="col-span-2 row-start-3 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                <Pair before={row.touches_before} after={row.touches_now}
                    max={TOUCH_MAX} format={one} />
            </span>

            <span className="col-start-2 row-start-1 sm:col-start-4 text-right">
                {row.on_bye ? (
                    <span className="text-[10px] text-muted-foreground/45">bye</span>
                ) : (
                    <>
                        <span className="block text-[11px] tabular-nums font-semibold">
                            {row.implied_team_total != null
                                ? `${row.implied_team_total}` : '—'}
                        </span>
                        <span className="block text-[9px] text-muted-foreground/45">
                            {row.opponent ? `vs ${row.opponent}` : 'no line'}
                            {row.spread != null && ` ${row.spread > 0 ? '+' : ''}${row.spread}`}
                        </span>
                    </>
                )}
                {/* Why the door opened, when the report says so. A claim on a
                    back-up whose starter is out is a different bet from a
                    claim on somebody quietly earning the work. */}
                {row.teammate_out && (
                    <span className="block text-[9px] truncate"
                        style={{ color: '#FDBA74' }}
                        title={`${row.teammate_out} is out or doubtful this week`}>
                        {row.teammate_out.split(' ').slice(-1)[0]} out
                    </span>
                )}
            </span>

            <span className="hidden sm:flex col-start-5 justify-end">
                <ChevronDown className={cn('w-3 h-3 text-muted-foreground/30 transition-transform',
                    isOpen && 'rotate-180')} aria-hidden="true" />
            </span>
        </button>
    );
}
