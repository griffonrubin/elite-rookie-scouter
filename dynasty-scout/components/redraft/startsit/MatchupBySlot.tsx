'use client';

import React from 'react';
import { Outcome } from '@/lib/startSit';
import { RedraftPlayer } from '@/lib/types';
import { CHART_INK, DIVERGING, MARK, SERIES } from '@/lib/vizTokens';

/**
 * Where the week is actually won or lost.
 *
 * The opponent was a flat list of eleven names with distributions beside
 * them, which says what they might score and nothing about where you are in
 * trouble. But the lineups pair: same league, same roster_positions, so
 * their third slot is the same slot as your third, and the matchup is nine
 * small contests rather than one large one.
 *
 * That pairing is what makes the rest of this page usable. The model's whole
 * argument is that variance is worth different amounts depending on whether
 * you are ahead — and you cannot judge that from one aggregate number. Five
 * slots you win comfortably and two you cannot possibly win is a different
 * week from nine coin flips, and it is the case where taking the boom-bust
 * flex is obviously right.
 *
 * Each row shows the points gap and, next to it, the share of weeks your
 * player outscores theirs. A gap of four points between two steady players
 * is nearly settled; the same gap between two spiky ones is not, and only
 * the second number tells them apart.
 */

export interface SlotPair {
    slot: string;
    mine: { player: RedraftPlayer | null; outcome: Outcome | null };
    theirs: { player: RedraftPlayer | null; outcome: Outcome | null };
    /** Share of simulated weeks your player outscores theirs. */
    beats: number | null;
}

const name = (p: RedraftPlayer | null) => p?.full_name ?? 'empty';

export function MatchupBySlot({ pairs, onPick }: {
    pairs: SlotPair[];
    onPick?: (a: number, b: number) => void;
}) {
    const live = pairs.filter(p => p.mine.outcome && p.theirs.outcome);
    if (live.length === 0) return null;

    const edges = live.map(p => (p.mine.outcome!.mean - p.theirs.outcome!.mean));
    const span = Math.max(3, ...edges.map(Math.abs));
    const ahead = live.filter((p, i) => edges[i] > 0).length;
    // A slot nobody would call either way, so "5 of 9" does not imply a
    // 51/49 edge is the same kind of thing as a 90/10 one.
    const tossups = live.filter(p => p.beats != null
        && Math.abs(p.beats - 0.5) < 0.08).length;

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Slot by slot, against theirs
                </h2>
                <span className="text-[10px] text-muted-foreground/50">
                    Ahead in {ahead} of {live.length}
                    {tossups > 0 && `, ${tossups} too close to call`}
                </span>
            </div>

            <ul className="space-y-0.5">
                {live.map(p => {
                    const mine = p.mine.outcome!, theirs = p.theirs.outcome!;
                    const edge = mine.mean - theirs.mean;
                    const up = edge > 0;
                    const frac = Math.min(1, Math.abs(edge) / span);
                    const clickable = onPick && p.mine.player && p.theirs.player;
                    const Row = clickable ? 'button' : 'div';
                    return (
                        <li key={p.slot + name(p.mine.player)}>
                            <Row
                                {...(clickable ? {
                                    type: 'button' as const,
                                    onClick: () => onPick!(p.mine.player!.id, p.theirs.player!.id),
                                } : {})}
                                className={`w-full grid items-center gap-x-2 px-1 py-1 rounded-md
                                    text-left grid-cols-[34px_minmax(0,1fr)_84px_minmax(0,1fr)_58px]
                                    ${clickable ? 'hover:bg-white/[0.05] transition-colors' : ''}`}
                                title={clickable
                                    ? `Compare ${name(p.mine.player)} with `
                                      + `${name(p.theirs.player)}`
                                    : undefined}>
                                <span className="text-[10px] font-bold text-muted-foreground/55">
                                    {p.slot}
                                </span>

                                {/* Yours on the left, reading inward toward the
                                    gap, so the two names frame the number that
                                    separates them. */}
                                <span className="min-w-0 text-right">
                                    <span className="text-[11px] font-semibold truncate block">
                                        {name(p.mine.player)}
                                    </span>
                                    <span className="text-[10px] tabular-nums"
                                        style={{ color: SERIES.a }}>
                                        {mine.mean.toFixed(1)}
                                    </span>
                                </span>

                                <span className="relative h-[7px] self-center block">
                                    <span className="absolute inset-y-[-3px] left-1/2 w-px"
                                        style={{ background: CHART_INK.axis }} />
                                    <span className="absolute top-0 bottom-0"
                                        style={{
                                            background: up
                                                ? DIVERGING.positive : DIVERGING.negative,
                                            left: up ? '50%' : `${50 - frac * 50}%`,
                                            width: `${Math.max(frac * 50, 1.5)}%`,
                                            borderRadius: MARK.barRadius,
                                        }} />
                                </span>

                                <span className="min-w-0">
                                    <span className="text-[11px] truncate block
                                                     text-muted-foreground/75">
                                        {name(p.theirs.player)}
                                    </span>
                                    <span className="text-[10px] tabular-nums"
                                        style={{ color: CHART_INK.context }}>
                                        {theirs.mean.toFixed(1)}
                                    </span>
                                </span>

                                {/* The number that says how settled the gap is.
                                    Four points between two steady players is
                                    nearly decided; the same four between two
                                    spiky ones is not. */}
                                <span className="text-right">
                                    <span className="text-[11px] font-bold tabular-nums block"
                                        style={{
                                            color: up ? '#93C5FD' : '#FCA5A5',
                                        }}>
                                        {up ? '+' : ''}{edge.toFixed(1)}
                                    </span>
                                    {p.beats != null && (
                                        <span className="text-[9px] tabular-nums
                                                         text-muted-foreground/55">
                                            {Math.round(p.beats * 100)}% win
                                        </span>
                                    )}
                                </span>
                            </Row>
                        </li>
                    );
                })}
            </ul>

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug">
                Expected points either side of the gap, and the share of simulated
                weeks your player outscores theirs. The two disagree when one of
                them is spiky — which is exactly when the gap is not the answer.
                {onPick && ' Pick a row for the full comparison.'}
            </p>
        </section>
    );
}
