'use client';

import Link from 'next/link';
import { Player } from '@/lib/types';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface BoxViewProps {
    players: Player[];
    period: '1d' | '7d' | '30d';
}

function getDraftSlot(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick = rank - (round - 1) * 12;
    return `${round}.${String(pick).padStart(2, '0')}`;
}

function getTierStyle(rank: number) {
    if (rank <= 5) return { label: 'S Tier', bg: 'bg-[#FF6B00]/10 border-[#FF6B00]/30', text: 'text-[#FF9A50]' };
    if (rank <= 12) return { label: 'A Tier', bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300' };
    if (rank <= 24) return { label: 'B Tier', bg: 'bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-300' };
    if (rank <= 48) return { label: 'C Tier', bg: 'bg-violet-500/10 border-violet-500/30', text: 'text-violet-300' };
    return { label: 'Depth', bg: 'bg-gray-500/10 border-gray-500/30', text: 'text-gray-400' };
}

function formatHeight(inches?: number | null) {
    if (!inches) return null;
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

// Divergence badge: shows buy/sell signal when KTC and FantasyPros diverge >15 spots
function DivergenceBadge({ ktc, fp }: { ktc: number | null | undefined; fp: number | null | undefined }) {
    if (!ktc || !fp) return null;
    const gap = fp - ktc; // positive = KTC ranks higher than FP (buy), negative = sell
    if (Math.abs(gap) < 15) return null;
    const isBuy = gap > 0;
    return (
        <span
            title={isBuy ? `KTC ranks ${gap} spots higher than FP — dynasty buy signal` : `FP is ${Math.abs(gap)} spots ahead of KTC — possible sell`}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 5px', borderRadius: 9999, fontSize: 9, fontWeight: 800, lineHeight: 1, marginLeft: 3 }}
            className={isBuy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'}
        >
            {isBuy ? '▲BUY' : '▼SELL'}
        </span>
    );
}

export function BoxView({ players, period }: BoxViewProps) {
    if (players.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                No players found matching your criteria.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {players.map((player, index) => {
                const rank = player.consensus?.rank_overall ?? (index + 1);
                const tier = getTierStyle(rank);
                const posColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
                const draftSlot = getDraftSlot(rank);
                const ktcRank = (player as any).ktc_rank;
                const fpRank = (player as any).fantasypros_rank;
                const school = (player as any).school || player.nfl_team || '—';
                const fortyYard = (player as any).forty_yard as number | null | undefined;
                const ht = formatHeight(player.height_inches);
                const wt = player.weight_lbs ? `${player.weight_lbs}lb` : null;
                const speedScore = (player as any).speed_score as number | null | undefined;

                const htWt = ht && wt ? `${ht}/${wt}` : ht || wt || '—';
                const fortyDisplay = fortyYard ? `${fortyYard.toFixed(2)}s` : '—';
                const speedDisplay = speedScore ? speedScore.toFixed(1) : '—';

                return (
                    <Link
                        key={player.id}
                        href={`/players/${player.slug}`}
                        className={cn(
                            'group flex flex-col bg-card border rounded-xl overflow-hidden',
                            'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200',
                            tier.bg
                        )}
                    >
                        {/* Card header — rank + position */}
                        <div className="flex items-center justify-between px-3 pt-3 pb-2">
                            <span className={cn('text-xs font-extrabold font-mono', tier.text)}>#{rank}</span>
                            <span
                                style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 800, lineHeight: 1 }}
                                className={cn('border', posColor)}
                            >
                                {player.position}
                            </span>
                        </div>

                        {/* Player name */}
                        <div className="px-3 pb-2">
                            <div className="font-bold text-[15px] text-foreground group-hover:text-primary transition-colors leading-snug truncate" title={player.full_name}>
                                {player.full_name}
                            </div>
                            <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5" title={school}>{school}</div>
                        </div>

                        <div className="border-t border-border/30 mx-3" />

                        {/* Stat grid — 2×3 */}
                        <div className="grid grid-cols-3 gap-px bg-border/10 mt-0">
                            <StatCell label="KTC" value={ktcRank ?? '—'} extra={<DivergenceBadge ktc={ktcRank} fp={fpRank} />} />
                            <StatCell label="Proj" value={draftSlot} />
                            <StatCell label="FP" value={fpRank ?? '—'} />
                            {fortyYard || speedScore ? (
                                <>
                                    <StatCell label="HT/WT" value={htWt} />
                                    <StatCell label="40yd" value={fortyDisplay} />
                                    <StatCell label="Spd Sc" value={speedDisplay} />
                                </>
                            ) : (
                                <div className="col-span-3 py-2 text-center text-[10px] text-muted-foreground/40 italic">
                                    No Combine Data
                                </div>
                            )}
                        </div>

                        {/* Tier badge footer */}
                        <div className={cn('px-3 py-2 text-center text-[10px] font-bold tracking-wide mt-auto', tier.text)}>
                            {tier.label}
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}

function StatCell({ label, value, highlight, extra, span }: {
    label: string; value: string | number; highlight?: boolean;
    extra?: React.ReactNode; span?: number;
}) {
    return (
        <div className={cn(
            'bg-card/60 flex flex-col items-center justify-center py-2 px-1',
            span ? `col-span-${span}` : ''
        )}>
            <div className="text-[9px] text-muted-foreground/60 uppercase font-bold tracking-wider mb-0.5">{label}</div>
            <div className={cn('text-[12px] font-bold font-mono flex items-center', highlight ? 'text-primary' : 'text-foreground/80')}>
                {value}{extra}
            </div>
        </div>
    );
}
