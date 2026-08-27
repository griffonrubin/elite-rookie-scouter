'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SourceRank {
    source: string;
    rank_overall: number;
    rank_positional: number | null;
    tier: number | null;
}

interface Props {
    sourceRanks: SourceRank[];
    consensusRank: number | null;
    avgRank: number | null;
    bestRank: number | null;
    worstRank: number | null;
    stdDev: number | null;
}

/** Only redraft sources belong here — a player may also carry dynasty ranks. */
const REDRAFT_SOURCE_STYLE: Record<string, { short: string; color: string }> = {
    'FantasyPros PPR':      { short: 'FantasyPros',  color: '#38bdf8' },
    'ESPN Redraft':         { short: 'ESPN',         color: '#ef4444' },
    'KeepTradeCut Redraft': { short: 'KeepTradeCut', color: '#a78bfa' },
    'CBS Redraft':          { short: 'CBS',          color: '#f59e0b' },
    'Yahoo Redraft':        { short: 'Yahoo',        color: '#8b5cf6' },
    'Sleeper Redraft':      { short: 'Sleeper',      color: '#22d3ee' },
    'FantasyCalc Redraft':  { short: 'FantasyCalc',  color: '#34d399' },
    'Flock Redraft':        { short: 'Flock',        color: '#fb923c' },
    'Underdog Redraft':     { short: 'Underdog',     color: '#f472b6' },
    'FFPC Redraft':         { short: 'FFPC',         color: '#64748b' },
};

export function RedraftSourceRankings({
    sourceRanks, consensusRank, avgRank, bestRank, worstRank, stdDev,
}: Props) {
    const rows = sourceRanks.filter(r => REDRAFT_SOURCE_STYLE[r.source]);

    if (rows.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                No redraft source has ranked this player yet.
            </div>
        );
    }

    // Scale the bars across the observed range, padded so the extremes aren't flush.
    const ranks = rows.map(r => r.rank_overall);
    const lo = Math.min(...ranks, consensusRank ?? Infinity);
    const hi = Math.max(...ranks, consensusRank ?? 0);
    const span = Math.max(hi - lo, 1);
    const pct = (rank: number) => ((rank - lo) / span) * 100;

    const contested = stdDev != null && stdDev >= 15;

    return (
        <div className="rounded-2xl border border-white/[0.05] p-4 sm:p-5 space-y-4"
            style={{ background: 'var(--bg-card)' }}>

            {/* Summary strip */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
                <div>
                    <span className="text-muted-foreground/60">Consensus </span>
                    <span className="font-bold font-[var(--font-jetbrains),monospace]">
                        {consensusRank != null ? `#${consensusRank}` : '—'}
                    </span>
                </div>
                <div>
                    <span className="text-muted-foreground/60">Average </span>
                    <span className="font-bold font-[var(--font-jetbrains),monospace]">
                        {avgRank != null ? avgRank.toFixed(1) : '—'}
                    </span>
                </div>
                <div>
                    <span className="text-muted-foreground/60">Range </span>
                    <span className="font-bold font-[var(--font-jetbrains),monospace]">
                        {bestRank ?? '—'}–{worstRank ?? '—'}
                    </span>
                </div>
                <div>
                    <span className="text-muted-foreground/60">Spread </span>
                    <span className={cn(
                        'font-bold font-[var(--font-jetbrains),monospace]',
                        contested ? 'text-amber-400' : '',
                    )}>
                        {stdDev != null ? stdDev.toFixed(1) : '—'}
                    </span>
                </div>
                {contested && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Contested
                    </span>
                )}
            </div>

            {/* Per-source bars — position on the line IS the rank */}
            <div className="space-y-2">
                {rows.map(r => {
                    const style = REDRAFT_SOURCE_STYLE[r.source];
                    const isHigh = bestRank != null && r.rank_overall === bestRank;
                    const isLow = worstRank != null && r.rank_overall === worstRank;
                    return (
                        <div key={r.source} className="flex items-center gap-3">
                            <div className="w-24 sm:w-28 flex-shrink-0 text-[11px] font-semibold truncate"
                                style={{ color: style.color }}>
                                {style.short}
                            </div>

                            <div className="flex-1 relative h-6 min-w-0">
                                <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-white/[0.07]" />
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center rounded-full px-1.5 h-5 text-[10px] font-bold font-[var(--font-jetbrains),monospace] whitespace-nowrap"
                                    style={{
                                        left: `${Math.min(Math.max(pct(r.rank_overall), 2), 98)}%`,
                                        background: `${style.color}22`,
                                        border: `1px solid ${style.color}66`,
                                        color: style.color,
                                    }}
                                >
                                    {r.rank_overall}
                                </div>
                            </div>

                            <div className="w-16 flex-shrink-0 text-right text-[10px]">
                                {isHigh && <span className="text-emerald-400 font-semibold">highest</span>}
                                {isLow && rows.length > 1 && <span className="text-red-400/80 font-semibold">lowest</span>}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="text-[10px] text-muted-foreground/50 pt-1 border-t border-white/[0.04]">
                Bar position maps to overall rank — further left is a higher ranking.
                {contested && ' A wide spread means the market disagrees, which is where draft-day value lives.'}
            </div>
        </div>
    );
}
