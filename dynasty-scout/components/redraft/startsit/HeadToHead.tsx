'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { Outcome } from '@/lib/startSit';
import { SERIES } from '@/lib/vizTokens';
import { OutcomeAxis, OutcomeStrip, SampleGame } from './OutcomeStrip';
import { Metric, UsageDumbbell } from './UsageDumbbell';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';

/**
 * Two players, side by side, with the reasons underneath.
 *
 * The distributions come first because they answer the question being asked —
 * which of these two is the better start — and the decomposition follows
 * because the answer is worth nothing if you cannot see where it came from.
 * A tool that only says "start him" has to be believed; one that shows the
 * target share and the game total behind it can be argued with.
 */

const SEASON = 2026;

function usage(p: RedraftPlayer, d: StartSitPlayer | undefined, key: keyof StartSitPlayer) {
    const v = d?.[key];
    return typeof v === 'number' ? v : null;
}

/** Averages of a player's most recent season of logs, for the comparison. */
function recent(d: StartSitPlayer | undefined) {
    const logs = (d?.logs ?? []).filter(l => l.season === SEASON - 1);
    if (logs.length === 0) return { games: 0, ppg: null as number | null };
    return {
        games: logs.length,
        ppg: logs.reduce((s, l) => s + l.points, 0) / logs.length,
    };
}

export function HeadToHead({ a, b, data, outcomeFor, onClose }: {
    a: RedraftPlayer | null;
    b: RedraftPlayer | null;
    data: Map<number, StartSitPlayer>;
    outcomeFor: (p: RedraftPlayer) => { outcome: Outcome; sample: SampleGame[] };
    onClose: () => void;
}) {
    const metrics: Metric[] = useMemo(() => {
        if (!a || !b) return [];
        const da = data.get(a.id), db = data.get(b.id);
        const ua = da?.usage ?? null, ub = db?.usage ?? null;
        const pos = (p: RedraftPlayer) => (p.position ?? '').toUpperCase();
        const pass = pos(a) === 'QB' || pos(b) === 'QB';
        const ra = recent(da), rb = recent(db);

        const m: Metric[] = [
            { key: 'ppg', label: 'Points / game', group: 'opportunity', a: ra.ppg, b: rb.ppg },
            { key: 'games', label: 'Games played', group: 'opportunity', a: ra.games, b: rb.games },
        ];
        // Volume is position-shaped: asking a quarterback for a target share
        // is noise, and so is asking a receiver for carries.
        if (!pass) {
            m.push(
                { key: 'tgt', label: 'Targets / game', group: 'opportunity',
                  a: ua?.targets_per_game ?? null, b: ub?.targets_per_game ?? null },
                { key: 'tshare', label: 'Target share', group: 'opportunity', format: 'percent',
                  a: ua?.target_share ?? null, b: ub?.target_share ?? null },
                { key: 'wopr', label: 'WOPR', group: 'opportunity',
                  a: ua?.wopr ?? null, b: ub?.wopr ?? null },
            );
            if ((ua?.carries_per_game ?? 0) > 1 || (ub?.carries_per_game ?? 0) > 1) {
                m.push({ key: 'car', label: 'Carries / game', group: 'opportunity',
                    a: ua?.carries_per_game ?? null, b: ub?.carries_per_game ?? null });
            }
            m.push({ key: 'ypt', label: 'Yards / touch', group: 'efficiency',
                a: ua?.yards_per_touch ?? null, b: ub?.yards_per_touch ?? null });
        }
        m.push({ key: 'epa', label: 'EPA / game', group: 'efficiency',
            a: ua?.epa_per_play ?? null, b: ub?.epa_per_play ?? null });

        const spreadA = usage(a, da, 'spread'), spreadB = usage(b, db, 'spread');
        m.push(
            { key: 'total', label: 'Team total', group: 'environment',
              a: usage(a, da, 'implied_team_total'), b: usage(b, db, 'implied_team_total') },
            {
                // Symmetric around zero, because a spread is signed and a
                // favoured team's negative number would otherwise clamp to the
                // left edge and read the same as a pick-em.
                key: 'spread', label: 'Spread', group: 'environment',
                a: spreadA, b: spreadB, lowerIsBetter: true,
                domain: [
                    -Math.max(7, Math.abs(spreadA ?? 0), Math.abs(spreadB ?? 0)),
                    Math.max(7, Math.abs(spreadA ?? 0), Math.abs(spreadB ?? 0)),
                ],
            },
        );
        return m;
    }, [a, b, data]);

    if (!a || !b) return null;
    const oa = outcomeFor(a), ob = outcomeFor(b);
    const max = Math.max(24, Math.ceil(Math.max(oa.outcome.ceiling, ob.outcome.ceiling,
        ...oa.sample.map(g => g.points), ...ob.sample.map(g => g.points)) / 5) * 5);

    const Row = ({ p, o, series }: {
        p: RedraftPlayer; o: { outcome: Outcome; sample: SampleGame[] }; series: 'a' | 'b';
    }) => (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="inline-block rounded-full shrink-0"
                        style={{ width: 9, height: 9, background: SERIES[series] }} />
                    <span className="text-[13px] font-bold truncate">{p.full_name}</span>
                    <span className="text-[11px] text-muted-foreground/50">
                        {p.position} · {p.nfl_team ?? '—'}
                    </span>
                </span>
                <span className="text-[11px] tabular-nums whitespace-nowrap">
                    <span className="text-muted-foreground/45">{o.outcome.floor}</span>
                    <span className="text-foreground font-bold mx-1.5">{o.outcome.mean}</span>
                    <span className="text-muted-foreground/45">{o.outcome.ceiling}</span>
                </span>
            </div>
            <OutcomeStrip outcome={o.outcome} sample={o.sample} max={max}
                series={series} label={p.full_name} />
        </div>
    );

    return (
        <section className="rounded-xl border border-white/[0.07] p-4 space-y-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/45">
                        Head to head
                    </h2>
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                        Each dot is one recent game — hover for the week. The bar is floor to ceiling, the line
                        is the expected week.
                    </p>
                </div>
                <button onClick={onClose} aria-label="Close the comparison"
                    className="text-muted-foreground/60 hover:text-foreground">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-3">
                <OutcomeAxis max={max} />
                <Row p={a} o={oa} series="a" />
                <Row p={b} o={ob} series="b" />
            </div>

            <div className="pt-2 border-t border-white/[0.06]">
                <UsageDumbbell metrics={metrics} nameA={a.full_name} nameB={b.full_name} />
            </div>

            {/* the same numbers as text, for anyone the chart does not reach */}
            <details className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground/50 hover:text-foreground">
                    Show as a table
                </summary>
                <table className="mt-2 w-full text-left tabular-nums">
                    <thead className="text-muted-foreground/45">
                        <tr><th className="font-semibold py-1">Metric</th>
                            <th className="font-semibold">{a.full_name}</th>
                            <th className="font-semibold">{b.full_name}</th></tr>
                    </thead>
                    <tbody className="text-muted-foreground/80">
                        <tr><td className="py-0.5">Floor</td><td>{oa.outcome.floor}</td><td>{ob.outcome.floor}</td></tr>
                        <tr><td className="py-0.5">Expected</td><td>{oa.outcome.mean}</td><td>{ob.outcome.mean}</td></tr>
                        <tr><td className="py-0.5">Ceiling</td><td>{oa.outcome.ceiling}</td><td>{ob.outcome.ceiling}</td></tr>
                        {metrics.map(m => (
                            <tr key={m.key}><td className="py-0.5">{m.label}</td>
                                <td>{m.a?.toFixed(1) ?? '—'}</td><td>{m.b?.toFixed(1) ?? '—'}</td></tr>
                        ))}
                    </tbody>
                </table>
            </details>
        </section>
    );
}
