'use client';

import React, { useState } from 'react';
import { ChevronDown, Check, Equal, ArrowUpRight } from 'lucide-react';
import { Outcome } from '@/lib/startSit';
import { RedraftPlayer } from '@/lib/types';
import { SlotDecision } from '@/lib/lineup';
import { POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CHART_INK, DIVERGING, MARK, SERIES } from '@/lib/vizTokens';
import { OutcomeAxis, OutcomeStrip, SampleGame } from './OutcomeStrip';

/**
 * One row per decision, not one row per pairing.
 *
 * A lineup is filled slot by slot, and every slot is its own question with
 * its own small set of answers. Ranking swaps instead produced a flat list
 * where "Gibbs over McBride" sat beside "Gibbs over Chase" as if those were
 * alternatives to each other; they are not, and nobody sets a lineup that
 * way. Here each slot states its own verdict and opens to show the
 * candidates that were considered for it.
 *
 * Most slots most weeks are already right. Saying so plainly — and quietly —
 * is what makes the two or three that are not stand out.
 */

/**
 * Most slots most weeks are already right, and the board has to say so without
 * shouting it. A settled slot gets a tick and nothing else; the two that need
 * a decision get the colour. Six identical badges competing with the one row
 * that matters is how a page stops being read.
 */
const VERDICT: Record<SlotDecision['verdict'], {
    label: string; colour: string; bg: string; Icon: typeof Check;
}> = {
    set: { label: 'Set', colour: 'rgba(255,255,255,0.28)', bg: 'transparent', Icon: Check },
    close: { label: 'Close', colour: '#FDBA74', bg: 'rgba(234,88,12,0.16)', Icon: Equal },
    change: { label: 'Change', colour: '#93C5FD', bg: 'rgba(37,99,235,0.2)', Icon: ArrowUpRight },
};

export interface SlotBoardProps {
    decisions: SlotDecision[];
    playerOf: (id: number) => RedraftPlayer | undefined;
    outcomeOf: (id: number) => { outcome: Outcome; sample: SampleGame[] };
    max: number;
    onCompare?: (a: number, b: number) => void;
}

export function SlotBoard({ decisions, playerOf, outcomeOf, max, onCompare }: SlotBoardProps) {
    const [open, setOpen] = useState<number | null>(null);

    return (
        <div className="space-y-1">
            <div className="grid items-end gap-2 px-2 pb-1
                            grid-cols-[40px_minmax(0,1fr)] sm:grid-cols-[40px_150px_minmax(0,560px)_128px]">
                <span className="text-[10px] uppercase tracking-widest font-bold
                                 text-muted-foreground/45">Slot</span>
                <span className="hidden sm:block" />
                <OutcomeAxis max={max} />
                <span className="hidden sm:block text-[10px] text-right uppercase tracking-widest
                                 font-bold text-muted-foreground/45">Call</span>
            </div>

            {decisions.map(d => {
                const cur = d.currentId != null ? playerOf(d.currentId) : undefined;
                const best = d.candidates[0];
                const alt = best && !best.current ? playerOf(best.playerId) : undefined;
                const v = VERDICT[d.verdict];
                const isOpen = open === d.index;
                const o = d.currentId != null ? outcomeOf(d.currentId) : null;

                return (
                    <div key={d.index} className="rounded-lg"
                        style={{ background: isOpen ? 'rgba(255,255,255,0.03)' : undefined }}>
                        <button type="button"
                            onClick={() => setOpen(isOpen ? null : d.index)}
                            aria-expanded={isOpen}
                            className="w-full grid items-center gap-x-2 gap-y-1 px-2 py-1.5 rounded-lg
                                       grid-cols-[40px_minmax(0,1fr)_auto]
                                       sm:grid-cols-[40px_150px_minmax(0,560px)_128px]
                                       hover:bg-white/[0.05] text-left transition-colors">
                            <span className="text-[11px] font-bold text-muted-foreground/60
                                             col-start-1 row-start-1">
                                {d.slot}
                            </span>

                            <span className="col-start-2 row-start-1 flex items-center gap-1.5 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: POSITION_RAW[(cur?.position ?? '').toUpperCase()] ?? '#64748b' }} />
                                <span className="text-[12px] font-semibold truncate">
                                    {cur?.full_name ?? <span className="text-muted-foreground/50">empty</span>}
                                </span>
                                {o?.outcome.availability && (
                                    <span className="shrink-0 px-1 rounded text-[9px] font-bold"
                                        style={o.outcome.playProbability === 0
                                            ? { background: 'rgba(220,38,38,0.16)', color: '#FCA5A5' }
                                            : { background: 'rgba(234,88,12,0.16)', color: '#FDBA74' }}>
                                        {o.outcome.availability === 'Questionable' ? 'Q'
                                            : o.outcome.availability === 'Out' ? 'OUT'
                                            : o.outcome.availability === 'No practice' ? 'DNP'
                                            : o.outcome.availability}
                                    </span>
                                )}
                            </span>

                            {/* Full width on a phone, its own column at size. */}
                            <span className="col-span-3 row-start-2 sm:col-span-1
                                             sm:col-start-3 sm:row-start-1">
                                {o && <OutcomeStrip outcome={o.outcome} sample={o.sample}
                                    max={max} series="a" label={cur?.full_name} compact />}
                            </span>

                            <span className="col-start-3 row-start-1 sm:col-start-4
                                             flex items-center justify-end gap-1.5">
                                {alt && (
                                    <span className="text-[10px] text-muted-foreground/70 truncate hidden sm:inline"
                                        title={`${alt.full_name} is ${d.gain} points of win probability better`}>
                                        {alt.full_name.split(' ').slice(-1)[0]}
                                    </span>
                                )}
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                                                 text-[10px] font-bold tracking-wide shrink-0"
                                    style={{ color: v.colour, background: v.bg }}>
                                    <v.Icon className="w-3 h-3" aria-hidden="true" />
                                    {d.verdict === 'set' ? '' : `+${d.gain}`}
                                    {d.verdict === 'set' && <span className="sr-only">{v.label}</span>}
                                </span>
                                <ChevronDown className={cn(
                                    'w-3 h-3 shrink-0 text-muted-foreground/30 transition-transform',
                                    isOpen && 'rotate-180')} aria-hidden="true" />
                            </span>
                        </button>

                        {isOpen && (
                            <Candidates d={d} playerOf={playerOf} outcomeOf={outcomeOf}
                                max={max} onCompare={onCompare} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Everyone eligible for one slot, on one axis.
 *
 * Put on a shared scale their distributions overlap, and the overlap is the
 * answer to "how close is this" in a way no single number is: two players
 * whose spreads sit on top of each other are a coin flip whatever their
 * projections say, and two that barely touch are not a decision at all.
 */
function Candidates({ d, playerOf, outcomeOf, max, onCompare }: {
    d: SlotDecision;
    playerOf: SlotBoardProps['playerOf'];
    outcomeOf: SlotBoardProps['outcomeOf'];
    max: number;
    onCompare?: (a: number, b: number) => void;
}) {
    if (d.candidates.length <= 1) {
        return (
            <p className="px-2 pb-2 text-[11px] text-muted-foreground/50">
                Nobody else on your bench can fill this slot.
            </p>
        );
    }
    return (
        <div className="px-2 pb-2 space-y-1">
            {d.candidates.map(c => {
                const p = playerOf(c.playerId);
                const { outcome, sample } = outcomeOf(c.playerId);
                const delta = c.deltaWinProb;
                return (
                    <button key={c.playerId} type="button"
                        onClick={() => d.currentId != null && c.playerId !== d.currentId
                            && onCompare?.(c.playerId, d.currentId)}
                        className="w-full grid grid-cols-[56px_minmax(0,1fr)_92px] items-center gap-2
                                   px-0 py-0.5 rounded hover:bg-white/[0.04] text-left">
                        <span className="text-[10px] text-right pr-1 truncate"
                            style={{ color: c.current ? '#7DD3FC' : 'rgba(255,255,255,0.45)' }}>
                            {c.current ? 'now' : ''}
                        </span>
                        <span className="min-w-0">
                            <span className="text-[11px] truncate block mb-0.5">
                                {p?.full_name ?? c.playerId}
                            </span>
                            <OutcomeStrip outcome={outcome} sample={sample} max={max}
                                series={c.current ? 'a' : 'b'} label={p?.full_name} compact />
                        </span>
                        <span className="text-right text-[11px] tabular-nums font-bold"
                            style={{
                                color: c.current ? 'rgba(255,255,255,0.4)'
                                    : delta > 0 ? DIVERGING.positive : DIVERGING.negative,
                            }}>
                            {c.current ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}
                        </span>
                    </button>
                );
            })}
            <p className="text-[10px] text-muted-foreground/40 pt-0.5">
                Percentage points of win probability against whoever is in the slot now.
                Click a name to compare head to head.
            </p>
        </div>
    );
}
