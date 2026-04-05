'use client';
import { useState } from 'react';

import { Ranking, ConsensusRanking } from "@/lib/types";
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";

interface SourceRankingsProps {
    rankings: Ranking[];
    consensus?: ConsensusRanking | null;
    consensusRank?: number | null;
    consensusRankSf?: number | null;
    consensusRank1qb?: number | null;
}

// 'SF' = Superflex/2QB; '1QB' = 1QB only; 'both' = draft boards (show in both)
const SOURCE_FORMAT: Record<string, 'SF' | '1QB' | 'both'> = {
    'KeepTradeCut':         'SF',
    'KeepTradeCut 1QB':     '1QB',
    'FantasyCalc':          '1QB',
    'FantasyCalc SF':       'SF',
    'DynastyNerds':         '1QB',
    'DynastyNerds SF':      'SF',
    'FantasyPros':          '1QB',
    'TankAthlete':          'both',
    'Pro Football Network': 'both',
    'The Draft Network':    'both',
    'Matt Brugler':         'both',
    'Daniel Jeremiah':      'both',
};

// Clean display names for sources with format-suffix variants
const SOURCE_LABEL: Record<string, string> = {
    'KeepTradeCut 1QB': 'KeepTradeCut',
    'FantasyCalc SF':   'FantasyCalc',
    'DynastyNerds SF':  'DynastyNerds',
};

const SOURCE_COLORS: Record<string, string> = {
    'FantasyPros':          '#f97316',
    'KeepTradeCut':         '#38bdf8',
    'KeepTradeCut 1QB':     '#38bdf8',
    'DynastyNerds':         '#34d399',
    'DynastyNerds SF':      '#34d399',
    'DynastyProcess':       '#a78bfa',
    'FantasyCalc':          '#f472b6',
    'FantasyCalc SF':       '#f472b6',
    'TankAthlete':          '#94a3b8',
    'Pro Football Network': '#94a3b8',
    'The Draft Network':    '#94a3b8',
    'Matt Brugler':         '#94a3b8',
    'Daniel Jeremiah':      '#94a3b8',
};

const MAX_RANK = 80; // bar scale max

function getBarWidth(rank: number): number {
    // Invert: rank 1 = full bar, rank 80 = tiny bar
    return Math.max(5, Math.round(((MAX_RANK - rank + 1) / MAX_RANK) * 100));
}

function getBullishLevel(rank: number, consensus: number): { icon: typeof TrendingUp; label: string; color: string } | null {
    const diff = consensus - rank; // positive = source is higher (more bullish)
    if (Math.abs(diff) < 3) return null;
    if (diff >= 8) return { icon: TrendingUp, label: 'Very Bullish', color: 'text-emerald-400' };
    if (diff >= 3) return { icon: TrendingUp, label: 'Bullish', color: 'text-emerald-400/70' };
    if (diff <= -8) return { icon: TrendingDown, label: 'Very Bearish', color: 'text-red-400' };
    if (diff <= -3) return { icon: TrendingDown, label: 'Bearish', color: 'text-red-400/70' };
    return null;
}

export function SourceRankings({ rankings, consensus, consensusRank, consensusRankSf, consensusRank1qb }: SourceRankingsProps) {
    const [format, setFormat] = useState<'SF' | '1QB'>('SF');
    const effectiveRank = format === '1QB'
        ? (consensusRank1qb ?? consensusRankSf ?? consensusRank ?? consensus?.rank_overall ?? null)
        : (consensusRankSf ?? consensusRank ?? consensus?.rank_overall ?? null);


    if (rankings.length === 0 && effectiveRank == null) {
        return (
            <div className="rounded-xl border border-border/40 bg-card/40 p-8 text-center text-muted-foreground/50 text-sm">
                No ranking sources scraped yet for this player.
            </div>
        );
    }

    // Deduplicate: keep only the latest entry per source
    const latestBySource = new Map<string, Ranking>();
    for (const r of rankings) {
        const existing = latestBySource.get(r.source);
        if (!existing || r.scraped_at > existing.scraped_at) {
            latestBySource.set(r.source, r);
        }
    }

    const sourceKeys = [...latestBySource.keys()];
    const hasSF  = sourceKeys.some(s => SOURCE_FORMAT[s] === 'SF');
    const has1QB = sourceKeys.some(s => SOURCE_FORMAT[s] === '1QB');

    // Filter to current format (plus draft boards which always appear)
    const filtered = [...latestBySource.values()]
        .filter(r => r.rank_overall != null)
        .filter(r => {
            const fmt = SOURCE_FORMAT[r.source] ?? '1QB';
            return fmt === 'both' || fmt === format;
        })
        .sort((a, b) => (a.rank_overall ?? 999) - (b.rank_overall ?? 999));

    const ranks  = filtered.map(r => r.rank_overall!);
    const spread = ranks.length >= 2 ? Math.max(...ranks) - Math.min(...ranks) : 0;

    return (
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border/30 bg-muted/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                    Expert Rankings
                </span>
                <div className="flex items-center gap-3">
                    {spread > 0 && (
                        <span className="text-[10px] text-muted-foreground/40 font-mono">spread: {spread}</span>
                    )}
                    {(hasSF || has1QB) && (
                        <div className="flex items-center rounded-md border border-border/40 overflow-hidden text-[10px] font-bold uppercase tracking-widest">
                            <button onClick={() => setFormat('SF')} className={`px-2.5 py-1 transition-colors ${format === 'SF' ? 'bg-sky-500/20 text-sky-400' : 'text-muted-foreground/40 hover:text-muted-foreground/60'}`}>
                                SF
                            </button>
                            <div className="w-px h-4 bg-border/40" />
                            <button onClick={() => setFormat('1QB')} className={`px-2.5 py-1 transition-colors ${format === '1QB' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground/40 hover:text-muted-foreground/60'}`}>
                                1QB
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-5 space-y-3">
                {/* Consensus bar */}
                {effectiveRank != null && (
                    <div className="pb-3 mb-1 border-b border-border/20">
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                    Consensus
                                </span>
                                <span className="text-[9px] text-muted-foreground/40">
                                    {consensus?.calculated_at ? consensus.calculated_at : ''}
                                </span>
                            </div>
                            <span className="text-lg font-black font-mono text-primary">
                                #{effectiveRank}
                            </span>
                        </div>
                        <div className="relative h-3 bg-border/20 rounded-full overflow-hidden">
                            <div
                                className="absolute left-0 top-0 h-full rounded-full bg-primary/80 transition-all duration-700"
                                style={{ width: getBarWidth(effectiveRank) + '%' }}
                            />
                            {/* R1 cutoff marker at rank 12 */}
                            <div
                                className="absolute top-0 h-full w-px bg-white/20"
                                style={{ left: getBarWidth(12) + '%' }}
                            />
                            {/* R2 cutoff marker at rank 24 */}
                            <div
                                className="absolute top-0 h-full w-px bg-white/10"
                                style={{ left: getBarWidth(24) + '%' }}
                            />
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-muted-foreground/30">Rookie-only ranking</span>
                            <div className="flex gap-3">
                                <span className="text-[8px] text-muted-foreground/25" style={{ marginRight: (100 - getBarWidth(12)) + '%' }}>R1</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Individual source bars */}
                {/* Individual source bars */}
                {filtered.map((r) => {
                    const color        = SOURCE_COLORS[r.source] || '#94a3b8';
                    const rank         = r.rank_overall!;
                    const barW         = getBarWidth(rank);
                    const sentiment    = effectiveRank != null ? getBullishLevel(rank, effectiveRank) : null;
                    const displayLabel = SOURCE_LABEL[r.source] ?? r.source;
                    const isDraftBoard = (SOURCE_FORMAT[r.source] ?? 'both') === 'both';

                    return (
                        <div key={r.id} className="group">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-foreground/80">{displayLabel}</span>
                                    {isDraftBoard && (
                                        <span className="text-[8px] uppercase tracking-widest text-muted-foreground/30 border border-border/20 rounded px-1">draft</span>
                                    )}
                                    {r.source_url && (
                                        <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/30 hover:text-primary transition-colors">
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                    {r.tier != null && (
                                        <span className="text-[9px] text-muted-foreground/40 font-mono">T{r.tier}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {sentiment && (
                                        <div className={'flex items-center gap-0.5 ' + sentiment.color}>
                                            <sentiment.icon className="w-3 h-3" />
                                            <span className="text-[9px] font-medium">{sentiment.label}</span>
                                        </div>
                                    )}
                                    <span className="text-sm font-bold font-mono" style={{ color }}>#{rank}</span>
                                </div>
                            </div>
                            <div className="relative h-2 bg-border/20 rounded-full overflow-hidden">
                                <div
                                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 opacity-70 group-hover:opacity-100"
                                    style={{ width: barW + '%', backgroundColor: color }}
                                />
                                <div className="absolute top-0 h-full w-px bg-white/10" style={{ left: getBarWidth(12) + '%' }} />
                                <div className="absolute top-0 h-full w-px bg-white/8"  style={{ left: getBarWidth(24) + '%' }} />
                            </div>
                            <div className="flex justify-end mt-0.5">
                                <span className="text-[9px] text-muted-foreground/25">{r.scraped_at}</span>
                            </div>
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <p className="text-xs text-muted-foreground/40 text-center py-2">
                        No {format} rankings yet — try the other format.
                    </p>
                )}
            </div>

            {/* Legend footer */}
            <div className="px-5 py-3 border-t border-border/20 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                    <span className="text-[9px] text-muted-foreground/45">R1 pick 12</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-white/10" />
                    <span className="text-[9px] text-muted-foreground/45">R2 pick 24</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[8px] uppercase tracking-widest text-muted-foreground/20 border border-border/20 rounded px-1">draft</span>
                    <span className="text-[9px] text-muted-foreground/30">= draft board (skill positions re-ranked 1..N)</span>
                </div>
                {effectiveRank != null && spread >= 6 && (
                    <span className="text-[9px] text-muted-foreground/25 ml-auto">
                        High variance — sources disagree
                    </span>
                )}
            </div>
        </div>
    );
}
