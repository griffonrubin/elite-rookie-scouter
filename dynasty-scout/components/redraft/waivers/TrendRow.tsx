'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CHART_INK, DIVERGING, MARK, SERIES } from '@/lib/vizTokens';
import { SEASON_GAMES, type WaiverMode, type WaiverRow } from '@/lib/waiverRank';

/**
 * One free agent, and whichever evidence the list was actually ordered on.
 *
 * In trend mode that is two bars per measure — before and after — on a
 * shared scale, because the decision is not "how many snaps" but "how many
 * more". A single number with an arrow hides the base it rose from, and a
 * rise from two touches to five is a different claim from six to fifteen
 * even though both are "+3" and "tripled".
 *
 * In projection mode there is no before, and drawing one would be a lie
 * about what the page knows. What it shows instead is the number it sorted
 * on: the gap between his projection and the last player at his position
 * anybody starts. That gap is usually negative, and showing it negative is
 * the point — "the best free-agent tight end in your league is eleven points
 * of season behind a startable one" is a real answer to "should I claim
 * somebody", and a ranked list on its own quietly implies the opposite.
 *
 * The scale is shared across every row in the table, not fitted per row, so
 * a reader comparing two players is comparing lengths rather than being
 * quietly re-normalised between them.
 */

/** Ceilings for the shared trend scale: a full snap share, a workhorse's day. */
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

/**
 * The span that fits a set of gaps, rounded out to a number a reader can hold.
 *
 * Floored at twenty points of season so a list of near-identical free agents
 * does not get a chart magnifying two points into half the track.
 */
export function gapSpan(values: number[]): number {
    const widest = Math.max(0, ...values.map(v => Math.abs(v)));
    return Math.max(20, Math.ceil(widest / 10) * 10);
}

/**
 * A signed gap, drawn either side of zero.
 *
 * Zero here is a real quantity rather than a convenience: it is the last
 * player at this position that anybody in the league starts. Left of it
 * means claiming this man does not give you a starter, which is most of the
 * waiver wire most weeks and is worth being able to see at a glance.
 */
function GapBar({ v, span }: { v: number; span: number }) {
    const off = Math.max(-1, Math.min(1, v / span));
    const w = Math.abs(off) * 50;
    const positive = off >= 0;
    return (
        <span className="relative block w-full h-[7px]"
            role="img"
            aria-label={`${v > 0 ? '+' : ''}${v.toFixed(1)} points against replacement`}>
            {/* The track, so the axis reads as an axis. Without it the
                unused half is invisible and the line looks like the end of
                the chart rather than the middle of it — which matters here,
                because the empty half is the answer: nothing available is
                above the line. */}
            <span className="absolute inset-0 rounded"
                style={{ background: CHART_INK.grid }} />
            {/* And the line itself is the whole chart: every bar in a
                September list stops short of it, and "nobody available would
                start for you" is the finding. Drawn brighter than ordinary
                furniture because it is a quantity, not furniture. */}
            <span className="absolute" style={{
                left: '50%', top: -3, bottom: -3, width: 1,
                background: 'rgba(255,255,255,0.3)',
            }} />
            <span className="absolute" style={{
                top: 0, height: 7,
                left: positive ? '50%' : `${50 - w}%`,
                width: `${w}%`,
                minWidth: 2,
                background: positive ? DIVERGING.positive : DIVERGING.negative,
                borderRadius: MARK.barRadius,
            }} />
        </span>
    );
}

export function TrendRow({ row, mode, span, isOpen, onToggle }: {
    row: WaiverRow;
    mode: WaiverMode;
    /** Half-width of the gap axis, in points of season. Projection mode only. */
    span: number;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const one = (v: number) => v.toFixed(1);
    const gap = row.over_replacement;

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
                    {row.position} · {row.nfl_team ?? '—'}
                    {/* A game count is only worth the space when games are
                        what ordered the list. In projection mode it is zero
                        for everybody and reads as a defect. */}
                    {mode === 'trend' && ` · ${row.games}g`}
                </span>
            </span>

            {mode === 'trend' ? (
                <>
                    <span className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                        <Pair before={row.snap_before} after={row.snap_now}
                            max={SNAP_MAX} format={pct} />
                    </span>
                    <span className="col-span-2 row-start-3 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                        <Pair before={row.touches_before} after={row.touches_now}
                            max={TOUCH_MAX} format={one} />
                    </span>
                </>
            ) : (
                /* One wide column rather than two narrow ones: there is a
                   single number here and splitting it into "his projection"
                   and "the gap" would show the same fact twice. */
                <span className="col-span-2 row-start-2 sm:col-span-2 sm:col-start-2 sm:row-start-1">
                    {gap == null ? (
                        <span className="text-[10px] text-muted-foreground/30">
                            no projection
                        </span>
                    ) : (
                        <>
                            <span className="flex items-center gap-3 min-w-0">
                            <span className="block shrink-0 text-[10px] tabular-nums
                                             text-muted-foreground/60"
                                title={`${Math.round(row.proj_points ?? 0)} projected `
                                    + `over a ${SEASON_GAMES}-game season`}>
                                {/* A week throughout, both halves. A season
                                    total beside a weekly gap makes the gap
                                    look like a rounding error next to it, and
                                    a manager decides a week at a time
                                    anyway. */}
                                <span className="text-foreground font-semibold">
                                    {((row.proj_points ?? 0) / SEASON_GAMES).toFixed(1)}
                                </span>
                                {' a week'}
                                <span className="text-muted-foreground/30"> · </span>
                                {/* Said in words, not just as a sign. A minus
                                    in front of a number on a "who should I
                                    claim" list is read as a rank far more
                                    often than as a deficit. */}
                                <span style={{
                                    color: gap >= 0 ? DIVERGING.positive : undefined,
                                }} className={gap >= 0 ? 'font-semibold' : ''}>
                                    {Math.abs(gap / SEASON_GAMES).toFixed(1)}
                                    {gap >= 0 ? ' above' : ' below'}
                                </span>
                                {' a startable '}
                                {row.position ?? 'starter'}
                            </span>
                            <span className="hidden sm:block flex-1 min-w-[90px]">
                                <GapBar v={gap} span={span} />
                            </span>
                            </span>
                        </>
                    )}
                </span>
            )}

            <span className="col-start-2 row-start-1 sm:col-start-4 text-right">
                {row.on_bye ? (
                    <span className="text-[10px] text-muted-foreground/45">bye</span>
                ) : (
                    <>
                        {/* Named on a phone, where the column header is
                            hidden. "21.25" beside a player's name reads as
                            his own projection, and it is his team's implied
                            total — which is the difference between claiming
                            a man you think scores twenty-one and claiming
                            one whose offence is expected to. */}
                        <span className="block text-[11px] tabular-nums font-semibold">
                            <span className="sm:hidden font-normal text-[9px] uppercase
                                             tracking-widest text-muted-foreground/40 mr-1">
                                team total
                            </span>
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
