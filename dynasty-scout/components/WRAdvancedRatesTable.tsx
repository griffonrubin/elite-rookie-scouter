'use client';
import React from 'react';
import { cn } from '@/lib/utils';

interface Props {
    wrAdvanced: any;
    peerWrAdv: any[];
}

function pctRank(val: number, arr: number[]): number {
    const valid = arr.filter(v => v != null && !isNaN(v));
    if (valid.length === 0) return 50;
    const below = valid.filter(v => v < val).length;
    return Math.round((below / valid.length) * 100);
}

function cellBg(pct: number): string {
    if (pct >= 85) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
    if (pct >= 65) return 'bg-green-500/20 border-green-500/35 text-green-300';
    if (pct >= 45) return 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300';
    if (pct >= 25) return 'bg-orange-500/15 border-orange-500/30 text-orange-300';
    return 'bg-red-500/15 border-red-500/30 text-red-300';
}

const METRICS = [
    { abbr: 'YPRR',   key: 'yprr',              fmt: (v: number) => v.toFixed(2),   invert: false, tooltip: 'Yards per route run' },
    { abbr: 'ADOT',   key: 'adot',              fmt: (v: number) => v.toFixed(1),   invert: false, tooltip: 'Avg depth of target (yds)' },
    { abbr: 'YAC',    key: 'yac_per_rec',       fmt: (v: number) => v.toFixed(1),   invert: false, tooltip: 'Yards after catch per reception' },
    { abbr: 'MTF%',   key: 'forced_mtf_pct',    fmt: (v: number) => v.toFixed(1) + '%', invert: false, tooltip: 'Missed tackles forced rate' },
    { abbr: 'DROP%',  key: 'drop_rate',         fmt: (v: number) => v.toFixed(1) + '%', invert: true,  tooltip: 'Career drop rate (lower is better)' },
    { abbr: 'TPRR',   key: 'target_rate',       fmt: (v: number) => v.toFixed(1) + '%', invert: false, tooltip: 'Targets per route run' },
    { abbr: 'RTG',    key: 'qbr_when_targeted', fmt: (v: number) => v.toFixed(1),   invert: false, tooltip: 'Passer rating when targeted' },
    { abbr: 'WIDE%',  key: 'wide_rate',         fmt: (v: number) => v.toFixed(0) + '%', invert: false, neutral: true, tooltip: '% of snaps aligned wide — archetype, not quality' },
    { abbr: 'SLOT%',  key: 'slot_rate',         fmt: (v: number) => v.toFixed(0) + '%', invert: false, neutral: true, tooltip: '% of snaps in slot — archetype, not quality' },
    { abbr: 'SCREEN', key: 'screen_target_pct', fmt: (v: number) => (v * 100).toFixed(0) + 'th', invert: false, neutral: true, tooltip: 'Screen target rate percentile vs drafted WRs since 2018 (PFF)' },
] as const;

export function WRAdvancedRatesTable({ wrAdvanced, peerWrAdv }: Props) {
    if (!wrAdvanced) return null;
    const hasAny = METRICS.some(m => wrAdvanced[m.key] != null);
    if (!hasAny) return null;

    return (
        <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
                Career Production Metrics
            </h4>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                {METRICS.map(m => {
                    const val = wrAdvanced[m.key];
                    if (val == null) {
                        return (
                            <div key={m.abbr}
                                className="rounded-lg border border-white/[0.06] p-2.5 text-center"
                                style={{ background: 'var(--bg-elevated)' }}
                                title={m.tooltip}
                            >
                                <div className="text-base font-black font-[var(--font-jetbrains),monospace] text-muted-foreground/30 leading-none">—</div>
                                <div className="text-[9px] uppercase tracking-widest text-muted-foreground/30 font-bold mt-1">{m.abbr}</div>
                            </div>
                        );
                    }

                    const peerVals = peerWrAdv.map((p: any) => p[m.key]).filter((v: any) => v != null) as number[];
                    let displayPct: number;
                    let colorClass: string;
                    if ((m as any).neutral) {
                        // neutral: use a flat mid-tone, no directional color
                        colorClass = 'bg-white/[0.04] border-white/[0.08] text-foreground/70';
                        displayPct = pctRank(val, peerVals);
                    } else if (m.invert) {
                        displayPct = 100 - pctRank(val, peerVals);
                        colorClass = cellBg(displayPct);
                    } else {
                        displayPct = pctRank(val, peerVals);
                        colorClass = cellBg(displayPct);
                    }

                    return (
                        <div key={m.abbr}
                            className={cn('rounded-lg border p-2.5 text-center', colorClass)}
                            title={m.tooltip}
                        >
                            <div className="text-base font-black font-[var(--font-jetbrains),monospace] leading-none">
                                {m.fmt(val)}
                            </div>
                            <div className="text-[9px] uppercase tracking-widest font-bold mt-1 opacity-70">{m.abbr}</div>
                            {!(m as any).neutral && (
                                <div className="text-[9px] opacity-50 mt-0.5">{displayPct}th</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
