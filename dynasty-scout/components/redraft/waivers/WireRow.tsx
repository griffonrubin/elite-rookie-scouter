'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { DIVERGING, MARK } from '@/lib/vizTokens';
import { SEASON_GAMES, type WaiverRow } from '@/lib/waiverRank';
import type { AddDrop } from '@/lib/waiverPlan';
import { MatchupChip } from '@/components/redraft/startsit/DefenceProfile';
import { SchedChip } from '@/components/redraft/SchedChip';
import type { DefenceCell } from '@/lib/defence';
import type { SosRow } from '@/lib/schedule';
import type { InheritanceOut } from '@/app/api/redraft/successors/route';

/**
 * One free agent, priced the way the claim is actually decided.
 *
 * Three numbers, in the order a manager reaches for them: what he does this
 * Sunday, where he sits for the rest of the year, and — the one no other
 * waiver page gives you — what claiming him would do to your own lineup,
 * naming the player who would have to go.
 *
 * The usage trend that used to rank this page is still here, one click down,
 * as the evidence behind the first two rather than as a substitute for them.
 */

export interface WireRowData {
    row: WaiverRow;
    /** This week's projection, from the same model the lineup board uses. */
    week: number | null;
    plan: AddDrop | null;
    /**
     * What his own position faces for the rest of the year, and across the
     * fantasy playoff weeks.
     *
     * A claim is a roster spot held for months, so the schedule behind it is
     * part of the decision and not a footnote — and the playoff window is
     * the half that decides a season.
     */
    rest: SosRow | null;
    playoffs: SosRow | null;
    /**
     * Whose absence this man was measured covering, where he was.
     *
     * The case for a stash, and the one a projection cannot make: a back
     * projecting four points a week is not worth a bench spot, and a back
     * projecting four points who took half the work and scored twelve the
     * last time the starter sat is worth one. On the projection alone the two
     * are the same row.
     *
     * Additional information, deliberately — it sits in the rest-of-season
     * column rather than in the ranking, because a claim is decided on what a
     * man does and this is what he would do if something else happened.
     */
    inherits: InheritanceOut['from'];
}

/**
 * The opening behind a stash, in one line.
 *
 * Three facts, in the order they are worth: whose job it is, what this man
 * did the last time it opened, and how often it opens. The third is the one
 * every handcuff list leaves out and the one that decides whether the other
 * two matter — a perfect successor to a man who has never missed a game is
 * a roster spot spent on nothing.
 */
function InheritChip({ from }: { from: InheritanceOut['from'] }) {
    const best = from[0];
    if (!best) return null;
    const games = best.missed + best.played;
    const surname = best.name.split(' ').slice(-1)[0];
    return (
        <span className="block text-[9px] tabular-nums"
            style={{ color: 'rgba(253,186,116,0.85)' }}>
            covers {surname} · {best.pointsOut.toFixed(1)} a game over {best.games}
            {best.absorbed != null && ` on ${(best.absorbed * 100).toFixed(0)}% of the work`}
            {games > 0 && ` · out ${best.missed} of ${games}`}
        </span>
    );
}

function Net({ plan }: { plan: AddDrop }) {
    const good = plan.net > 0.05;
    return (
        <span className="block text-right">
            <span className="block text-[11px] font-bold tabular-nums"
                style={{ color: good ? DIVERGING.positive : 'rgba(255,255,255,0.35)' }}>
                {good ? `+${plan.net.toFixed(1)}` : plan.net <= 0 ? '—' : `+${plan.net.toFixed(1)}`}
            </span>
            <span className="block text-[9px] text-muted-foreground/45 truncate">
                {!good
                    ? 'no upgrade'
                    : plan.freeSpot
                        ? 'open spot'
                        : `drop ${plan.dropName ?? 'somebody'}`}
            </span>
        </span>
    );
}

export function WireRow({ data, cells, of, isOpen, onToggle }: {
    data: WireRowData;
    cells: DefenceCell[];
    of: number;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const { row: r, week, plan, rest, playoffs, inherits } = data;
    const perWeek = r.proj_points != null ? r.proj_points / SEASON_GAMES : null;
    const gap = r.over_replacement;

    return (
        <button type="button" onClick={onToggle} aria-expanded={isOpen}
            className={cn(`w-full grid items-center gap-x-3 gap-y-1 px-1 py-1.5 rounded-lg
                           text-left transition-colors hover:bg-white/[0.05]
                           grid-cols-[minmax(0,1fr)_auto]
                           sm:grid-cols-[190px_84px_minmax(0,1fr)_116px_92px_20px]`,
                isOpen && 'bg-white/[0.04]')}>

            <span className="col-start-1 row-start-1 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: POSITION_RAW[(r.position ?? '').toUpperCase()]
                            ?? '#64748b' }} />
                    <span className="text-[12px] font-semibold truncate">{r.full_name}</span>
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                    {r.position} · {r.nfl_team ?? '—'}
                    {r.teammate_out && (
                        <span style={{ color: '#FDBA74' }}>
                            {' · '}{r.teammate_out.split(' ').slice(-1)[0]} out
                        </span>
                    )}
                </span>
            </span>

            {/* This Sunday. The number a manager is deciding on when the
                claim is for a starting spot this week. */}
            <span className="col-start-2 row-start-1 sm:col-start-2 text-right">
                <span className="block text-[13px] font-bold tabular-nums">
                    {r.on_bye ? <span className="text-[10px] font-normal
                                                 text-muted-foreground/45">bye</span>
                        : week != null ? week.toFixed(1)
                        : <span className="text-muted-foreground/30">—</span>}
                </span>
                <span className="block text-[9px] text-muted-foreground/40">
                    {r.on_bye ? '' : 'this week'}
                </span>
            </span>

            {/* The rest of the year, which is what a roster spot is for. */}
            <span className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1
                             min-w-0">
                <span className="text-[11px] tabular-nums">
                    {r.pos_rank != null ? (
                        <span className="font-semibold">
                            {(r.position ?? '').toUpperCase()}{r.pos_rank}
                        </span>
                    ) : <span className="text-muted-foreground/30">unranked</span>}
                    {perWeek != null && (
                        <span className="text-muted-foreground/50">
                            {' · '}{perWeek.toFixed(1)} a week
                        </span>
                    )}
                </span>
                {gap != null && (
                    <span className="block text-[9px] text-muted-foreground/40">
                        {Math.abs(gap / SEASON_GAMES).toFixed(1)} a week{' '}
                        {gap >= 0 ? 'above' : 'below'} a startable{' '}
                        {(r.position ?? '').toUpperCase()}
                    </span>
                )}
                {/* The schedule he is being claimed into. A roster spot is
                    held for months, so who he plays is part of the decision
                    rather than a footnote to it — and the playoff weeks are
                    the half that decides a season. */}
                {(rest || playoffs) && (
                    <span className="flex gap-2">
                        <SchedChip sos={rest} label="sched" />
                        <SchedChip sos={playoffs} label="playoffs" />
                    </span>
                )}
                {inherits.length > 0 && <InheritChip from={inherits} />}
            </span>

            {/* What it does to you. The only column that knows your roster. */}
            <span className="col-span-2 row-start-3 sm:col-span-1 sm:col-start-4 sm:row-start-1">
                {plan ? <Net plan={plan} /> : (
                    <span className="block text-[9px] text-muted-foreground/30 text-right">
                        connect a team
                    </span>
                )}
            </span>

            <span className="hidden sm:block sm:col-start-5 text-right">
                <MatchupChip cells={cells} of={of}
                    defense={r.opponent ?? null} position={r.position ?? null} />
                {r.implied_team_total != null && (
                    <span className="block text-[9px] text-muted-foreground/35 tabular-nums">
                        team total {r.implied_team_total}
                    </span>
                )}
            </span>

            <span className="hidden sm:flex sm:col-start-6 justify-end">
                <ChevronDown className={cn('w-3 h-3 text-muted-foreground/30 transition-transform',
                    isOpen && 'rotate-180')} aria-hidden="true" />
            </span>
        </button>
    );
}

/**
 * The usage behind the projection, where it belongs.
 *
 * This used to be the ranking, on the argument that a snap count is evidence
 * of a decision a coach made rather than a lucky Sunday — which
 * scripts/formweight_check confirms and which is still why it is worth
 * showing. What it is not is the number to claim on: a role that has grown
 * from nothing is still nothing, and a page ranked on change puts a back
 * averaging two points above a startable tight end.
 */
export function UsageTrend({ row }: { row: WaiverRow }) {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const one = (v: number) => v.toFixed(1);
    const rows: { label: string; before: number | null; after: number | null;
        max: number; fmt: (v: number) => string }[] = [
        { label: 'snap share', before: row.snap_before, after: row.snap_now,
            max: 1, fmt: pct },
        { label: 'touches a game', before: row.touches_before, after: row.touches_now,
            max: 22, fmt: one },
        { label: 'points a game', before: row.points_before, after: row.points_now,
            max: 25, fmt: one },
    ];
    if (row.games === 0) {
        return (
            <p className="text-[11px] text-muted-foreground/45">
                No games logged this season, so there is no change in role to read —
                which is why the list above is ranked on projections.
            </p>
        );
    }
    /**
     * Below six games the two halves are not a comparison.
     *
     * Three recent against three before is the least that compares anything,
     * and drawing a one-game season as a rising bar is a claim the data
     * cannot support — a blue bar climbing off a single Sunday is exactly
     * the kind of thing that got this page ranked on garbage time.
     */
    const comparable = row.games >= 6 && row.snap_before != null;
    return (
        <div>
            <h4 className="text-[10px] uppercase tracking-widest font-bold
                           text-muted-foreground/45 mb-1">
                {comparable
                    ? `How his role has moved · ${row.games} games`
                    : `His role so far · ${row.games} game${row.games === 1 ? '' : 's'}`}
            </h4>
            <ul className="space-y-1">
                {rows.map(m => {
                    if (m.after == null) return null;
                    const w = (v: number) =>
                        `${Math.min(100, Math.max(1.5, (v / m.max) * 100))}%`;
                    const up = m.before == null ? true : m.after > m.before;
                    return (
                        <li key={m.label}
                            className="grid items-center gap-x-2
                                       grid-cols-[96px_minmax(0,1fr)_104px]">
                            <span className="text-[10px] text-muted-foreground/55">
                                {m.label}
                            </span>
                            <span className="block">
                                <span className="relative block h-[4px] mb-[3px]">
                                    {m.before != null && (
                                        <span className="absolute inset-y-0 left-0 rounded"
                                            style={{ width: w(m.before),
                                                background: 'rgba(255,255,255,0.22)' }} />
                                    )}
                                </span>
                                <span className="relative block h-[6px]">
                                    <span className="absolute inset-y-0 left-0"
                                        style={{ width: w(m.after),
                                            background: !comparable
                                                ? 'rgba(255,255,255,0.45)'
                                                : up ? DIVERGING.positive
                                                : DIVERGING.negative,
                                            borderRadius: MARK.barRadius }} />
                                </span>
                            </span>
                            <span className="text-[10px] tabular-nums
                                             text-muted-foreground/60">
                                {m.before == null ? '—' : m.fmt(m.before)}
                                <span className="text-muted-foreground/30"> → </span>
                                <span className="text-foreground font-semibold">
                                    {m.fmt(m.after)}
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>
            <p className="text-[9px] text-muted-foreground/35 mt-1 leading-snug">
                {comparable
                    ? 'The last three games against the five before them. A rising '
                      + 'snap share predicts a player beating his own season average '
                      + 'by about a point, where a falling one falls nearly a point '
                      + 'short — so this leads the projection above rather than '
                      + 'restating it.'
                    : 'Too few games to compare a recent stretch against an earlier '
                      + 'one, so these are just his season so far, uncoloured. A '
                      + 'trend drawn off one or two Sundays is how a waiver page ends '
                      + 'up ranking garbage time.'}
            </p>
        </div>
    );
}
