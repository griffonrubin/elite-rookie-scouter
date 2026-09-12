'use client';

import React, { useState } from 'react';
import type { GameLog } from '@/app/api/redraft/startsit/route';
import { CHART_INK, DIVERGING, MARK, SERIES } from '@/lib/vizTokens';

/**
 * The opportunity behind the points, and which way it is moving.
 *
 * Everything else on this page is built from fantasy points, which are a
 * record of what already happened. Usage is the part that leads: a back who
 * has quietly gone from nineteen carries to eleven has the same scoring
 * history as one going the other way, right up to the week it costs you.
 * Points say what he did; snaps and targets say what he is being asked to
 * do next.
 *
 * Which metrics matter depends on the position, so the strip is not one
 * fixed set of columns. A receiver lives on target share; a back lives on
 * carries and snaps; a quarterback's volume is barely a question and his
 * attempts are shown for completeness rather than as a decision.
 *
 * Each metric shows its recent level, the direction against the weeks before
 * it, and a sparkline of the window — because a number plus an arrow hides
 * whether the move was a trend or one loud game.
 */

/** Games in the recent bucket, and in the window overall. */
const RECENT = 3;
const WINDOW = 8;

type Key = 'snap_share' | 'target_share' | 'targets' | 'carries'
    | 'wopr' | 'receptions' | 'pass_attempts';

interface Metric {
    key: Key;
    label: string;
    /** How to render a level: a share reads as a percentage, a count does not. */
    kind: 'share' | 'count' | 'index';
    /** What the number means, for the title. */
    note: string;
}

const SHARE = (key: Key, label: string, note: string): Metric =>
    ({ key, label, kind: 'share', note });
const COUNT = (key: Key, label: string, note: string): Metric =>
    ({ key, label, kind: 'count', note });

const BY_POSITION: Record<string, Metric[]> = {
    RB: [
        COUNT('carries', 'Carries', 'Rushing attempts per game.'),
        COUNT('targets', 'Targets', 'Passes thrown his way per game.'),
        SHARE('snap_share', 'Snaps', 'Share of the offence he is on the field for.'),
    ],
    WR: [
        SHARE('target_share', 'Target share', 'Share of the team’s targets.'),
        COUNT('targets', 'Targets', 'Passes thrown his way per game.'),
        SHARE('snap_share', 'Snaps', 'Share of the offence he is on the field for.'),
    ],
    TE: [
        SHARE('target_share', 'Target share', 'Share of the team’s targets.'),
        COUNT('targets', 'Targets', 'Passes thrown his way per game.'),
        SHARE('snap_share', 'Snaps', 'Share of the offence he is on the field for.'),
    ],
    QB: [
        COUNT('pass_attempts', 'Attempts', 'Pass attempts per game.'),
        COUNT('carries', 'Rushes', 'Rushing attempts per game — the part of a '
            + 'quarterback’s week that varies most.'),
    ],
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function fmt(v: number, kind: Metric['kind']): string {
    if (kind === 'share') return `${Math.round(v * 100)}%`;
    // The threshold is on the magnitude, not the signed value: a delta of -6
    // carries is not "smaller than ten" in a way that earns a decimal, and
    // "-6.0" beside a clean "17" reads as machine output.
    if (Math.abs(v) >= 10) return v.toFixed(0);
    return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
}

export interface UsageStripProps {
    logs: GameLog[];
    position: string | null | undefined;
}

export function UsageStrip({ logs, position }: UsageStripProps) {
    const pos = (position ?? '').toUpperCase();
    const metrics = BY_POSITION[pos];
    // Kickers and defences have no usage worth the name, and neither does a
    // position we have not thought about. Showing an empty frame would be
    // worse than showing nothing.
    if (!metrics) return null;

    const [hover, setHover] = useState<string | null>(null);
    const window = logs.slice(-WINDOW);
    if (window.length < 3) {
        return (
            <p className="text-[10px] text-muted-foreground/45">
                Not enough games logged to read his usage yet.
            </p>
        );
    }

    // Which seasons the window actually spans, always named.
    //
    // "Last 8 games" in week 1 is eight games of last season, and saying only
    // "last 8 games" is the same lie as a projection pinned to a season that
    // has ended. Naming the span needs no knowledge of what week it is: 2025
    // reads as history and 2025-26 reads as a window that has crossed over.
    const seasons = [...new Set(window.map(l => l.season))].sort();
    const span = seasons.length === 1
        ? String(seasons[0])
        : `${seasons[0]}–${String(seasons[seasons.length - 1]).slice(2)}`;

    const rows = metrics.map(m => {
        const series = window.map(l => l[m.key]).filter((v): v is number => v != null);
        if (series.length < 3) return null;
        // Keep the games beside their values, so a bar can name itself.
        const games = window.filter(l => l[m.key] != null);
        const recent = series.slice(-RECENT);
        const before = series.slice(0, -RECENT);
        const now = mean(recent);
        const prior = before.length >= 2 ? mean(before) : null;
        const delta = prior != null ? now - prior : null;
        // A tenth of a carry is not a trend. The threshold scales with the
        // metric so a 1% snap wobble and a 0.1-target wobble both read flat.
        const floor = m.kind === 'share' ? 0.04 : 0.8;
        const dir = delta == null || Math.abs(delta) < floor
            ? 0 : delta > 0 ? 1 : -1;
        return { m, series, games, now, prior, delta, dir };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) return null;

    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Opportunity
                </h4>
                <span className="text-[10px] text-muted-foreground/40">
                    last {window.length} games · {span}
                </span>
            </div>

            <ul className="space-y-0.5">
                {rows.map(({ m, series, games, now, prior, delta, dir }) => {
                    const top = Math.max(...series, m.kind === 'share' ? 0.5 : 1);
                    return (
                        <li key={m.key}
                            className="grid items-center gap-x-2
                                       grid-cols-[76px_minmax(0,92px)_44px_52px]"
                            title={`${m.note}`
                                + (prior != null
                                    ? ` Last ${RECENT}: ${fmt(now, m.kind)}, `
                                      + `the ${series.length - RECENT} before: `
                                      + `${fmt(prior, m.kind)}.`
                                    : '')}>
                            <span className="text-[11px] text-muted-foreground/65 truncate">
                                {m.label}
                            </span>

                            {/* Per-game bars rather than a line: these are
                                counts and shares for discrete games, and a
                                line between them implies a value in between
                                that never existed. */}
                            <span className="relative flex items-end gap-px h-[14px]">
                                {series.map((v, i) => {
                                    const recent = i >= series.length - RECENT;
                                    const g = games[i];
                                    const key = `${m.key}-${i}`;
                                    return (
                                        <span key={i}
                                            className="flex-1 rounded-t-[1px] cursor-help"
                                            onMouseEnter={() => setHover(key)}
                                            onMouseLeave={() =>
                                                setHover(h => (h === key ? null : h))}
                                            title={`${g ? `Week ${g.week} ` : ''}`
                                                + `${g?.opponent ? `vs ${g.opponent.toUpperCase()} ` : ''}`
                                                + `— ${fmt(v, m.kind)}`}
                                            style={{
                                                height: `${Math.max(8, (v / top) * 100)}%`,
                                                background: recent
                                                    ? SERIES.a : CHART_INK.context,
                                                opacity: hover === key ? 1 : 0.85,
                                                marginRight: i === series.length - RECENT - 1
                                                    ? MARK.gap : undefined,
                                            }} />
                                    );
                                })}
                                {/* Which game, and what it was — a sparkline
                                    that cannot name its own points is a
                                    texture rather than data. */}
                                {hover?.startsWith(`${m.key}-`) && (() => {
                                    const i = Number(hover.split('-').pop());
                                    const g = games[i];
                                    if (series[i] == null) return null;
                                    return (
                                        <span className="absolute z-10 px-1.5 py-1 rounded-md
                                                         text-[10px] whitespace-nowrap
                                                         pointer-events-none font-semibold"
                                            style={{
                                                left: `${((i + 0.5) / series.length) * 100}%`,
                                                bottom: '100%', marginBottom: 4,
                                                transform: 'translateX(-50%)',
                                                background: 'rgba(8,14,22,0.96)',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                color: 'rgba(255,255,255,0.86)',
                                            }}>
                                            {g ? `Wk ${g.week}` : `Game ${i + 1}`}
                                            {g?.opponent ? ` vs ${g.opponent.toUpperCase()}` : ''}
                                            {' · '}{fmt(series[i], m.kind)}
                                        </span>
                                    );
                                })()}
                            </span>

                            <span className="text-[11px] font-semibold tabular-nums text-right">
                                {fmt(now, m.kind)}
                            </span>

                            {/* Signed and worded, so the direction never rests
                                on the colour alone. */}
                            <span className="text-[10px] tabular-nums text-right"
                                style={{
                                    color: dir === 0 ? 'rgba(255,255,255,0.3)'
                                        : dir > 0 ? '#93C5FD' : '#FCA5A5',
                                }}>
                                {delta == null ? ''
                                    : dir === 0 ? 'flat'
                                    : `${delta > 0 ? '+' : ''}${fmt(delta, m.kind)}`}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <p className="text-[10px] text-muted-foreground/40 leading-snug">
                Recent {RECENT} games in blue against the {window.length - RECENT} before
                them, and the change between the two. Points say what he did; this says
                what he is being asked to do.
            </p>
        </div>
    );
}
