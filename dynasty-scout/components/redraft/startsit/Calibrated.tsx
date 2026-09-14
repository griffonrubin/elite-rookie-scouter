'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';
import { coverageOf, type CalibrationRow } from '@/lib/modelCalibration';
import { useCalibration } from '@/lib/useCalibration';

/**
 * How often this has been right, printed next to the thing making the claim.
 *
 * Everything above this line is a number the reader is asked to believe: a
 * floor, a ceiling, a chance of winning the week. Every site that ships those
 * asks for the same trust and none of them shows its working, which is
 * strange given that the claim is exactly checkable — a range promising to
 * hold three weeks in five either does or does not.
 *
 * It did not. Measured across two seasons the stated interval held 53.5% of
 * the time, and finding that out is what led to the correction now in the
 * model. The number here is what the corrected model scores on the same
 * backtest, so a reader can see both the claim and the audit rather than
 * taking the first on faith.
 *
 * Small, because it is context rather than the answer, and expandable,
 * because the average hides the two things a reader would actually want:
 * whether it holds for the position they are deciding about, and whether it
 * holds for a player they picked up three weeks ago.
 */

/** Measured against claimed, as a bar with the promise marked on it. */
function CoverageBar({ row, claimed }: { row: CalibrationRow; claimed: number }) {
    const got = coverageOf(row);
    // Scaled to twice the claim so sixty per cent sits in the middle and a
    // reader can see which side of the promise the measurement fell on.
    const full = claimed * 2;
    const tone = Math.abs(got - claimed) <= 0.05
        ? DIVERGING.zero
        : got < claimed ? DIVERGING.negative : DIVERGING.positive;
    return (
        <span className="relative block h-[6px] rounded-full overflow-hidden"
            style={{ background: CHART_INK.grid }} aria-hidden>
            <span className="absolute inset-y-0 left-0"
                style={{ width: `${Math.min(100, (got / full) * 100)}%`,
                    background: tone, borderRadius: MARK.barRadius }} />
            <span className="absolute inset-y-0"
                style={{ left: '50%', width: 1, background: 'rgba(255,255,255,0.4)' }} />
        </span>
    );
}

function Row({ row, claimed, label }: {
    row: CalibrationRow; claimed: number; label: string;
}) {
    const got = coverageOf(row);
    return (
        <li className="grid items-center gap-x-3 gap-y-0.5
                       grid-cols-[42px_minmax(0,1fr)_auto]">
            <span className="text-[10px] font-bold uppercase tracking-wider
                             text-muted-foreground/45">{label}</span>
            <CoverageBar row={row} claimed={claimed} />
            <span className="text-[10.5px] tabular-nums whitespace-nowrap"
                style={{ color: CHART_INK.context }}>
                <span className="font-semibold">{(got * 100).toFixed(0)}%</span>
                <span className="opacity-55"> of {row.weeks.toLocaleString()}</span>
            </span>
        </li>
    );
}

export function Calibrated() {
    const c = useCalibration();
    const [open, setOpen] = useState(false);

    // Nothing to say is said as nothing, not as a number. A clone that has
    // not run the backtest has no table, and inventing a figure there would
    // be the exact failure this panel exists to correct.
    if (c.loading || !c.measured || !c.overall) return null;

    const got = coverageOf(c.overall);
    const off = Math.abs(got - c.claimed);

    return (
        <section className="rounded-xl border border-white/[0.07] px-4 py-3"
            style={{ background: 'var(--bg-card)' }}>
            <button type="button" onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="w-full text-left flex flex-wrap items-baseline
                           justify-between gap-x-3 gap-y-1">
                <span className="text-[10px] uppercase tracking-widest font-bold
                                 text-muted-foreground/45">
                    How often this has been right
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="text-[11px] tabular-nums"
                        style={{ color: CHART_INK.context }}>
                        {c.overall.from_season}–{c.overall.to_season} ·{' '}
                        {c.overall.weeks.toLocaleString()} player-weeks
                    </span>
                    <ChevronDown className={cn('w-3 h-3 text-muted-foreground/30 transition-transform',
                        open && 'rotate-180')} aria-hidden="true" />
                </span>
            </button>

            <p className="text-[11.5px] mt-1.5 leading-relaxed">
                The floor and ceiling above promise to contain the week{' '}
                <span className="font-semibold">{(c.claimed * 100).toFixed(0)}%</span>{' '}
                of the time. Replayed across every week a player had four games
                behind him, they held{' '}
                <span className="font-semibold"
                    style={{ color: off <= 0.05 ? undefined : DIVERGING.negative }}>
                    {(got * 100).toFixed(0)}%
                </span>{' '}
                of the time — {off <= 0.02 ? 'which is the promise'
                    : got > c.claimed ? 'a shade wider than promised'
                    : 'a shade narrower than promised'}.
            </p>

            {open && (
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-3">
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest font-bold
                                       text-muted-foreground/40 mb-1">
                            By position
                        </h3>
                        <ul className="space-y-1">
                            {c.byPosition.map(r => (
                                <Row key={r.slice} row={r} claimed={c.claimed}
                                    label={r.slice} />
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-[10px] uppercase tracking-widest font-bold
                                       text-muted-foreground/40 mb-1">
                            By games behind him
                        </h3>
                        <ul className="space-y-1">
                            {c.byHistory.map(r => (
                                <Row key={r.slice} row={r} claimed={c.claimed}
                                    label={r.slice.replace('-99', '+')} />
                            ))}
                        </ul>
                    </div>
                    <p className="text-[10.5px] leading-relaxed"
                        style={{ color: CHART_INK.context }}>
                        {/*
                            The limits, because a measurement presented without
                            them is a marketing claim with a number attached —
                            which is what every "most accurate" badge in this
                            industry is.
                        */}
                        Each week is replayed from the games before it and nothing
                        else, so this measures the shape the model builds from a
                        player&rsquo;s own log. The lines, the market and the injury
                        report move the centre and are not in it — the database holds
                        no odds before this season. The tick on each bar is the
                        promise; the bar is what happened.
                    </p>
                </div>
            )}
        </section>
    );
}
