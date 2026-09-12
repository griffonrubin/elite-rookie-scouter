'use client';

import React from 'react';
import type { GameLog } from '@/app/api/redraft/startsit/route';

/**
 * The box scores the projection was built from.
 *
 * Every summary on this page compresses these rows — a mean, a floor, a
 * ceiling, a dot on a strip. Compression is the point right up until you
 * disagree with it, and then the only useful thing is the games themselves.
 * Fourteen points can be six catches for sixty and a touchdown, or two
 * catches and a long one that will not happen again, and no distribution
 * tells those apart.
 *
 * Which columns matter depends on the position, and the seasons are labelled
 * rather than merged: early in a year most of this is last season, and a
 * table that hides the join invites reading old usage as current.
 */

interface Col {
    key: keyof GameLog;
    label: string;
    /** Yardage and attempts read as whole numbers; points take a decimal. */
    places?: number;
}

const C = (key: keyof GameLog, label: string, places = 0): Col => ({ key, label, places });

const BY_POSITION: Record<string, Col[]> = {
    QB: [C('pass_attempts', 'Att'), C('pass_yards', 'PaYd'), C('pass_tds', 'PaTD'),
         C('interceptions', 'Int'), C('carries', 'Car'), C('rush_yards', 'RuYd'),
         C('rush_tds', 'RuTD')],
    RB: [C('carries', 'Car'), C('rush_yards', 'RuYd'), C('rush_tds', 'RuTD'),
         C('targets', 'Tgt'), C('receptions', 'Rec'), C('rec_yards', 'ReYd'),
         C('rec_tds', 'ReTD')],
    WR: [C('targets', 'Tgt'), C('receptions', 'Rec'), C('rec_yards', 'ReYd'),
         C('rec_tds', 'ReTD'), C('carries', 'Car'), C('rush_yards', 'RuYd')],
};
BY_POSITION.TE = BY_POSITION.WR;
BY_POSITION.FB = BY_POSITION.RB;

export function GameLogTable({ logs, position }: {
    logs: GameLog[]; position: string | null | undefined;
}) {
    const pos = (position ?? '').toUpperCase();
    const cols = BY_POSITION[pos];
    if (!cols || logs.length === 0) return null;

    // Most recent first: the question is almost always about now, and a
    // table that opens on a game from two Septembers ago answers it last.
    const rows = [...logs].sort((a, b) =>
        b.season - a.season || b.week - a.week);
    const seasons = [...new Set(rows.map(r => r.season))];
    const best = Math.max(...rows.map(r => r.points));

    return (
        <details className="group">
            <summary className="cursor-pointer list-none text-[10px] uppercase
                                tracking-widest font-bold text-muted-foreground/45
                                hover:text-muted-foreground/70 transition-colors
                                inline-flex items-center gap-1.5">
                <span className="inline-block transition-transform
                                 group-open:rotate-90">›</span>
                Game log · {rows.length} games
                <span className="font-normal normal-case tracking-normal
                                 text-muted-foreground/35">
                    {seasons.join(', ')}
                </span>
            </summary>

            {/* Its own scroll box, in both directions.
                Wide, because a box score is the one thing on this page allowed
                to be wider than the panel — and capped in height, because
                thirty-four games at full stretch buried the candidates the
                reader opened the row to see. The table sizes to its content
                rather than to the panel: stretched across a desktop column,
                seven numeric columns end up a hand's width apart and the eye
                loses the row it is on. */}
            <div className="mt-1.5 overflow-auto max-h-[320px]
                            rounded border border-white/[0.05]">
                <table className="text-[11px] tabular-nums border-collapse w-auto">
                    <thead className="sticky top-0 z-10"
                        style={{ background: '#0c1520' }}>
                        <tr className="text-muted-foreground/45">
                            <th className="text-left font-semibold py-1 pl-2 pr-2 whitespace-nowrap">
                                Wk
                            </th>
                            <th className="text-left font-semibold py-1 pr-2">Opp</th>
                            {cols.map(c => (
                                <th key={String(c.key)}
                                    className="text-right font-semibold py-1 px-2.5 whitespace-nowrap">
                                    {c.label}
                                </th>
                            ))}
                            <th className="text-right font-semibold py-1 pl-2.5 pr-2 whitespace-nowrap">
                                PPR
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const newSeason = i === 0 || r.season !== rows[i - 1].season;
                            return (
                                <React.Fragment key={`${r.season}-${r.week}`}>
                                    {newSeason && seasons.length > 1 && (
                                        <tr>
                                            <td colSpan={cols.length + 3}
                                                className="pt-2 pb-0.5 pl-2 text-[9px] uppercase
                                                           tracking-widest font-bold
                                                           text-muted-foreground/35">
                                                {r.season}
                                            </td>
                                        </tr>
                                    )}
                                    <tr className="hover:bg-white/[0.05] transition-colors
                                                   border-t border-white/[0.04]">
                                        <td className="py-0.5 pl-2 pr-2 text-muted-foreground/55">
                                            {r.week}
                                        </td>
                                        <td className="py-0.5 pr-2 text-muted-foreground/70">
                                            {r.opponent?.toUpperCase() ?? '—'}
                                        </td>
                                        {cols.map(c => {
                                            const v = r[c.key] as number | null;
                                            return (
                                                <td key={String(c.key)}
                                                    className="py-0.5 px-2.5 text-right">
                                                    {v == null ? (
                                                        <span className="text-muted-foreground/25">
                                                            —
                                                        </span>
                                                    ) : v === 0 ? (
                                                        <span className="text-muted-foreground/30">
                                                            0
                                                        </span>
                                                    ) : v.toFixed(c.places)}
                                                </td>
                                            );
                                        })}
                                        {/* The one column worth finding at a
                                            glance, so his best week is bold. */}
                                        <td className="py-0.5 pl-2.5 pr-2 text-right font-semibold"
                                            style={r.points === best
                                                ? { color: '#93C5FD' } : undefined}
                                            title={r.points === best
                                                ? 'His best week in this window' : undefined}>
                                            {r.points.toFixed(1)}
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </details>
    );
}
