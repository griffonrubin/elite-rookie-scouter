'use client';

import Link from 'next/link';
import { Player } from '@/lib/types';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface HexViewProps {
    players: Player[];
    period: '1d' | '7d' | '30d';
}

function getTierAccent(rank: number): string {
    if (rank <= 5) return 'border-[#FF6B00]/60 bg-[#FF6B00]/5';
    if (rank <= 12) return 'border-emerald-500/50 bg-emerald-500/5';
    if (rank <= 24) return 'border-cyan-500/40 bg-cyan-500/5';
    if (rank <= 48) return 'border-violet-500/40 bg-violet-500/5';
    return 'border-border/30 bg-card/60';
}

function getFortyColor(forty: number, pos: string): string {
    const p = pos.toUpperCase();
    if (p === 'RB') return forty < 4.40 ? 'text-emerald-400' : forty < 4.50 ? 'text-yellow-400' : forty < 4.60 ? 'text-orange-400' : 'text-red-400';
    if (p === 'WR') return forty < 4.38 ? 'text-emerald-400' : forty < 4.47 ? 'text-yellow-400' : forty < 4.56 ? 'text-orange-400' : 'text-red-400';
    if (p === 'TE') return forty < 4.50 ? 'text-emerald-400' : forty < 4.62 ? 'text-yellow-400' : forty < 4.75 ? 'text-orange-400' : 'text-red-400';
    return forty < 4.75 ? 'text-emerald-400' : 'text-muted-foreground';
}

export function HexView({ players, period }: HexViewProps) {
    if (players.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                No players found.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10 gap-2 p-3">
            {players.map((player, index) => {
                const rank = player.consensus?.rank_overall ?? (index + 1);
                const posColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
                const tierBorder = getTierAccent(rank);
                const fortyYard = (player as any).forty_yard as number | null | undefined;
                const forty = fortyYard ? fortyYard.toFixed(2) : null;
                const fortyClass = fortyYard ? getFortyColor(fortyYard, player.position) : 'text-muted-foreground/50';
                const ktc = player.consensus?.best_rank;
                const sleeper = (player as any).sleeper_adp as number | null | undefined;
                const hasDivergence = ktc && sleeper && Math.abs((sleeper as number) - ktc) >= 65;
                const isBuy = hasDivergence && ((sleeper as number) - ktc) > 0;

                return (
                    <Link
                        key={player.id}
                        href={`/players/${player.slug}`}
                        className={cn(
                            'group flex flex-col items-start gap-0.5 rounded-lg border p-2 cursor-pointer',
                            'transition-all duration-150 hover:bg-primary/10 hover:border-primary/50 hover:shadow-md hover:shadow-primary/10 hover:-translate-y-px',
                            tierBorder
                        )}
                    >
                        {/* Rank + position */}
                        <div className="flex items-center justify-between w-full gap-1">
                            <span className="text-[10px] font-black font-mono text-muted-foreground/70">#{rank}</span>
                            <span
                                style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 5px', borderRadius: 9999, fontSize: 8, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}
                                className={cn('border', posColor)}
                            >
                                {player.position}
                            </span>
                        </div>

                        {/* Name */}
                        <div className="w-full">
                            <div className="text-[11px] font-bold text-foreground leading-tight truncate group-hover:text-primary transition-colors" title={player.full_name}>
                                {player.first_name?.[0]}. {player.last_name}
                            </div>
                            {forty ? (
                                <div className={`text-[10px] font-mono font-semibold ${fortyClass}`}>{forty}s</div>
                            ) : null}
                        </div>

                        {/* KTC + divergence dot */}
                        <div className="flex items-center gap-1 mt-auto">
                            {ktc ? (
                                <span className="text-[9px] font-bold text-primary font-mono">#{ktc}</span>
                            ) : null}
                            {hasDivergence ? (
                                <span className={`text-[8px] font-black ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isBuy ? '▲' : '▼'}
                                </span>
                            ) : null}
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
