'use client';

import React from 'react';
import { POSITION_RAW } from '@/lib/constants';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';
import { SEASON_GAMES, type PositionShape } from '@/lib/waiverRank';

/**
 * Where the value on this wire actually is, position by position.
 *
 * The combined list is ranked across positions, so it comes out lopsided
 * whenever a league's rosters are — and a lopsided list reads as a broken
 * one. Eleven of a league's twenty best available being tight ends is not a
 * glitch: it means its twelve teams roster one tight end each, so the
 * thirteenth-best tight end in the game is sitting there while every useful
 * back is owned. That is the most actionable thing on the page and it was
 * previously only inferable from a column of names.
 *
 * One bar per position, all on one axis, all measured from the same place:
 * the last player at that position anybody in the league starts. A bar to
 * the right of the line means there is a starter available. To the left
 * means the best you can do at that position is worse than what a team
 * already has, and how far left says how much worse.
 */
export function WireDepth({ shape, onPick }: {
    shape: Record<string, PositionShape>;
    onPick: (pos: string) => void;
}) {
    const ORDER = ['RB', 'WR', 'TE', 'QB', 'K', 'DST'];
    const shown = ORDER.filter(p => shape[p]);
    if (shown.length < 2) return null;

    // One axis for every bar, fitted to the widest of them. Per-week, because
    // a decision is made a week at a time and "eleven points" over a season
    // is two thirds of a point on a Sunday — which is the difference between
    // a gap worth acting on and one that is noise.
    const perWeek = (v: number) => v / SEASON_GAMES;
    const span = Math.max(1, ...shown.map(p => Math.abs(perWeek(shape[p].best))));

    return (
        <div className="mb-3">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <h3 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Where the value is
                </h3>
                <span className="text-[9px] text-muted-foreground/40">
                    best available, a week, against a startable one
                </span>
            </div>
            <div className="space-y-[3px]">
                {shown.map(p => {
                    const s = shape[p];
                    const v = perWeek(s.best);
                    const off = Math.max(-1, Math.min(1, v / span));
                    const w = Math.abs(off) * 50;
                    const positive = off >= 0;
                    return (
                        <button key={p} type="button" onClick={() => onPick(p)}
                            className="w-full grid items-center gap-x-2 text-left
                                       rounded px-1 py-[3px] transition-colors
                                       hover:bg-white/[0.05]
                                       grid-cols-[34px_minmax(0,1fr)_auto]">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: POSITION_RAW[p] ?? '#64748b' }} />
                                <span className="text-[10px] font-bold
                                                 text-muted-foreground/70">{p}</span>
                            </span>
                            <span className="relative block w-full h-[7px]">
                                <span className="absolute" style={{
                                    left: '50%', top: -2, bottom: -2, width: 1,
                                    background: CHART_INK.axis,
                                }} />
                                <span className="absolute" style={{
                                    top: 0, height: 7,
                                    left: positive ? '50%' : `${50 - w}%`,
                                    width: `${w}%`, minWidth: 2,
                                    background: positive
                                        ? DIVERGING.positive : DIVERGING.negative,
                                    borderRadius: MARK.barRadius,
                                }} />
                            </span>
                            <span className="text-[10px] tabular-nums
                                             text-muted-foreground/60 text-right
                                             whitespace-nowrap">
                                {v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(1)}
                                {/* How many are genuinely startable, which is
                                    the part that decides whether to look. */}
                                <span className="text-muted-foreground/35">
                                    {' '}· {s.startable === 0
                                        ? 'none startable'
                                        : `${s.startable} startable`}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {/* Why two of those bars have no names under them.
                Nearly every startable kicker and defence is unrostered, so
                value over replacement likes them far more than a manager
                should — thirty points across a season at a position whose
                week-to-week swing is larger than that. They are shown here
                because "the only startable free agents in your league are
                kickers" is worth knowing, and kept out of the list because
                acting on it is not. */}
            <p className="text-[9px] text-muted-foreground/35 mt-1.5 leading-snug
                          max-w-[560px]">
                Kickers and defences are counted here and left out of the list —
                almost every startable one is free, so they top a value-over-
                replacement ranking every week and are worth about two points a
                game at positions that swing further than that. Open one to see
                them ranked against each other.
            </p>
        </div>
    );
}
