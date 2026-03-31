'use client';

import { Ranking, ConsensusRanking } from "@/lib/types";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SourceRankingsProps {
    rankings: Ranking[];
    consensus?: ConsensusRanking | null;
    consensusRank?: number | null;
}

const SOURCE_COLORS: Record<string, string> = {
    'FantasyPros':  '#f97316',
    'KTC':          '#38bdf8',
    'DynastyNerds': '#34d399',
    'DynastyProcess': '#a78bfa',
    'FantasyCalc':  '#f472b6',
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

export function SourceRankings({ rankings, consensus, consensusRank }: SourceRankingsProps) {
    const effectiveRank = consensusRank ?? consensus?.rank_overall ?? null;

    if (rankings.length === 0 && effectiveRank == null) {
        return (
            <div className="rounded-xl border border-border/40 bg-card/40 p-8 text-center text-muted-foreground/50 text-sm">
                No ranking sources scraped yet for this player.
            </div>
        );
    }

    // Sort rankings by rank (lowest/best first)
    const sorted = [...rankings]
        .filter(r => r.rank_overall != null)
        .sort((a, b) => (a.rank_overall ?? 999) - (b.rank_overall ?? 999));

    // Calculate spread
    const ranks = sorted.map(r => r.rank_overall!);
    const spread = ranks.length >= 2 ? Math.max(...ranks) - Math.min(...ranks) : 0;

    return (
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border/30 bg-muted/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                    Expert Rankings
                </span>
                {spread > 0 && (
                    <span className="text-[10px] text-muted-foreground/40 font-mono">
                        spread: {spread} ranks
                    </span>
                )}
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
                {sorted.map((r) => {
                    const color = SOURCE_COLORS[r.source] || '#94a3b8';
                    const rank = r.rank_overall!;
                    const barW = getBarWidth(rank);
                    const sentiment = effectiveRank != null ? getBullishLevel(rank, effectiveRank) : null;

                    return (
                        <div key={r.id} className="group">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-foreground/80">{r.source}</span>
                                    {r.source_url && (
                                        <a
                                            href={r.source_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-muted-foreground/30 hover:text-primary transition-colors"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                    {r.tier && (
                                        <span className="text-[9px] text-muted-foreground/40 font-mono">
                                            {r.tier}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {sentiment && (
                                        <div className={'flex items-center gap-0.5 ' + sentiment.color}>
                                            <sentiment.icon className="w-3 h-3" />
                                            <span className="text-[9px] font-medium">{sentiment.label}</span>
                                        </div>
                                    )}
                                    <span className="text-sm font-bold font-mono" style={{ color }}>
                                        #{rank}
                                    </span>
                                </div>
                            </div>
                            <div className="relative h-2 bg-border/20 rounded-full overflow-hidden">
                                <div
                                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 opacity-70 group-hover:opacity-100"
                                    style={{ width: barW + '%', backgroundColor: color }}
                                />
                                {/* R1/R2 cutoff markers */}
                                <div
                                    className="absolute top-0 h-full w-px bg-white/10"
                                    style={{ left: getBarWidth(12) + '%' }}
                                />
                                <div
                                    className="absolute top-0 h-full w-px bg-white/8"
                                    style={{ left: getBarWidth(24) + '%' }}
                                />
                            </div>
                            <div className="flex justify-end mt-0.5">
                                <span className="text-[9px] text-muted-foreground/25">{r.scraped_at}</span>
                            </div>
                        </div>
                    );
                })}

                {/* Unranked sources */}
                {rankings.filter(r => r.rank_overall == null).map(r => (
                    <div key={r.id} className="flex items-center justify-between py-1 opacity-40">
                        <span className="text-xs text-muted-foreground">{r.source}</span>
                        <span className="text-xs text-muted-foreground italic">Not ranked</span>
                    </div>
                ))}
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
                {effectiveRank != null && spread >= 6 && (
                    <span className="text-[9px] text-muted-foreground/25 ml-auto">
                        High variance — sources disagree
                    </span>
                )}
            </div>
        </div>
    );
}
