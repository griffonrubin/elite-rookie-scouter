import Link from 'next/link';
import { TrendingIndicator } from '@/components/TrendingIndicator';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ConsensusRanking, Player } from '@/lib/types';
import { WatchlistButton } from './WatchlistButton';

interface PlayerMiniCardProps {
    player: Player;
    ranking: ConsensusRanking;
    period: '1d' | '7d' | '30d';
    index: number;
}

function getDraftSlot(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick = rank - (round - 1) * 12;
    return `${round}.${String(pick).padStart(2, '0')}`;
}

function getTier(rank: number): { label: string; color: string } {
    if (rank <= 5) return { label: 'S Tier', color: 'bg-[#FF6B00]/20 text-[#FF9A50] border-[#FF6B00]/40' };
    if (rank <= 12) return { label: 'A Tier', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    if (rank <= 24) return { label: 'B Tier', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' };
    if (rank <= 48) return { label: 'C Tier', color: 'bg-violet-500/20 text-violet-300 border-violet-500/40' };
    return { label: 'Depth', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
}

function getRankColor(rank: number): string {
    if (rank <= 12) return 'text-emerald-400 font-extrabold';
    if (rank <= 24) return 'text-[#FF9A50] font-bold';
    if (rank <= 48) return 'text-violet-400 font-bold';
    return 'text-muted-foreground font-semibold';
}

function formatHeight(inches?: number | null) {
    if (!inches) return '—';
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

// Colors the 40-yard time contextually by position and speed tier
function getFortyColor(fortyYard: number, position: string): string {
    const pos = position.toUpperCase();
    if (pos === 'RB') {
        if (fortyYard < 4.40) return 'text-emerald-400 font-bold';  // elite
        if (fortyYard < 4.50) return 'text-yellow-400 font-semibold'; // good
        if (fortyYard < 4.60) return 'text-orange-400 font-semibold'; // average
        return 'text-red-400 font-semibold'; // slow
    }
    if (pos === 'WR') {
        if (fortyYard < 4.38) return 'text-emerald-400 font-bold';
        if (fortyYard < 4.47) return 'text-yellow-400 font-semibold';
        if (fortyYard < 4.56) return 'text-orange-400 font-semibold';
        return 'text-red-400 font-semibold';
    }
    if (pos === 'TE') {
        if (fortyYard < 4.50) return 'text-emerald-400 font-bold';
        if (fortyYard < 4.62) return 'text-yellow-400 font-semibold';
        if (fortyYard < 4.75) return 'text-orange-400 font-semibold';
        return 'text-red-400 font-semibold';
    }
    if (pos === 'QB') {
        if (fortyYard < 4.65) return 'text-emerald-400 font-bold';
        if (fortyYard < 4.78) return 'text-yellow-400 font-semibold';
        return 'text-orange-400 font-semibold';
    }
    return 'text-foreground/70';
}

export function PlayerMiniCard({ player, ranking, period, index }: PlayerMiniCardProps) {
    const positionColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';

    let change = ranking?.rank_change_1d ?? 0;
    if (period === '7d') change = ranking?.rank_change_7d ?? 0;
    if (period === '30d') change = ranking?.rank_change_30d ?? 0;

    const rookieRank = ranking?.rank_overall ?? (index + 1);
    const tier = getTier(rookieRank);
    const draftSlot = getDraftSlot(rookieRank);
    const rankColor = getRankColor(rookieRank);
    const ktcOverallRank = (player as any).ktc_rank;
    const schoolDisplay = (player as any).school || '';

    // Height / Weight on one line
    const ht = player.height_inches ? formatHeight(player.height_inches) : '—';
    const wt = player.weight_lbs ? `${player.weight_lbs}lb` : '—';
    const fortyYard = (player as any).forty_yard as number | null | undefined;

    return (
        <Link href={`/players/${player.slug}`} className="block group">
            <div className="flex items-center px-4 py-2.5 hover:bg-accent/40 transition-all duration-150 border-b border-border/20 gap-3">

                {/* 1. Rank + Watchlist */}
                <div className="w-16 flex-shrink-0 flex flex-col lg:flex-row items-center justify-center lg:gap-2">
                    <span className={`text-sm font-mono leading-none ${rankColor}`}>{rookieRank}</span>
                    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="cursor-pointer lg:mt-0 mt-1 flex items-center">
                        <WatchlistButton playerSlug={player.slug} />
                    </div>
                </div>

                {/* 2. Player info — hard fixed 180px */}
                <div style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }} className="flex-shrink-0">
                    <div className="flex items-center gap-2 mb-0.5 overflow-hidden">
                        <span className="font-bold text-[14px] text-foreground truncate group-hover:text-primary transition-colors leading-snug">
                            {player.full_name}
                        </span>
                        {/* Position badge — pure inline-flex, no fixed height */}
                        <span
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 8px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, flexShrink: 0, fontSize: 10, fontWeight: 800 }}
                            className={cn('border', positionColor)}
                        >
                            {player.position}
                        </span>
                    </div>
                    <div className="flex items-center text-[11px] text-muted-foreground/70 gap-1.5 leading-none">
                        <span className="truncate">{schoolDisplay || 'School TBD'}</span>
                        {player.age_at_draft && (
                            <>
                                <span className="opacity-40">•</span>
                                <span className="whitespace-nowrap">Age {player.age_at_draft}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Right stat columns — flex-1 fills remaining space */}
                <div className="hidden lg:flex flex-1 items-center text-xs">

                    {/* 3. Measurables — HT/WT · 40yd (contextual color) · Speed Score */}
                    <div className="flex-1 flex flex-col justify-center border-l border-border/30 pl-4">
                        <div className="font-mono text-[11px] text-foreground/80 whitespace-nowrap flex items-center gap-1.5">
                            <span>{ht} / {wt}</span>
                            {fortyYard ? (
                                <span className="text-muted-foreground mr-1">
                                    · <span className={getFortyColor(fortyYard, player.position)}>{fortyYard.toFixed(2)}s</span>
                                </span>
                            ) : null}
                            {(player as any).ras ? (
                                <span className="text-muted-foreground ml-1">
                                    · <span className="text-purple-400">RAS: {((player as any).ras as number).toFixed(2)}</span>
                                </span>
                            ) : null}
                            {(player as any).speed_score ? (
                                <span className="text-[9px] text-muted-foreground/50 ml-0.5 font-normal">
                                    · <span className="text-cyan-400/80">Spd:{((player as any).speed_score as number).toFixed(0)}</span>
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* 4. FP Devy */}
                    <div className="flex-1 flex items-center justify-center gap-1">
                        <span className={`font-bold font-mono text-sm ${player.fantasypros_rank != null ? 'text-foreground/90' : 'text-muted-foreground/30'}`}>
                            {player.fantasypros_rank ?? '—'}
                        </span>
                    </div>

                    {/* 6. KTC Dyn — with optional divergence dot */}
                    <div className="flex-1 flex items-center justify-center gap-1">
                        <span className={`font-bold font-mono text-sm ${ktcOverallRank != null ? 'text-foreground/80' : 'text-muted-foreground/30'}`}>
                            {ktcOverallRank ?? '—'}
                        </span>
                        {(() => {
                            const ktc = ktcOverallRank;
                            const fp = player.fantasypros_rank;
                            if (!ktc || !fp) return null;
                            const gap = (fp as number) - ktc;
                            // Threshold for meaningful divergence between KTC and FP
                            if (Math.abs(gap) < 15) return null;
                            return (
                                <span
                                    title={gap > 0 ? `KTC ranks ${gap} spots higher than FP — dynasty buy signal` : `FP ranks ${Math.abs(gap)} spots higher than KTC — possible sell`}
                                    className={`text-[9px] font-black ${gap > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                                >
                                    {gap > 0 ? '▲' : '▼'}
                                </span>
                            );
                        })()}
                    </div>

                    {/* 6. Proj Pick */}
                    <div className="flex-1 flex items-center justify-center" title={`Projected Dynasty Draft Pick (Round.Pick) - e.g. 1.01`}>
                        <span className="font-mono font-bold text-sm text-foreground/80">{draftSlot}</span>
                    </div>

                    {/* 8. Tier badge — inline-flex, padding-only height */}
                    <div className="flex-1 flex items-center justify-center">
                        {(ranking?.num_sources ?? 0) < 2 ? (
                            <span
                                title={`Ranked by ${ranking?.num_sources ?? 0} of 5 sources — consensus rank may be unreliable`}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '3px 10px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}
                                className={cn('border', 'bg-gray-500/10 text-gray-400/80 border-gray-500/30')}
                            >
                                ⚠ Limited Data
                            </span>
                        ) : (
                            <span
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '3px 10px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}
                                className={cn('border', tier.color)}
                            >
                                {tier.label}
                            </span>
                        )}
                    </div>

                </div>
            </div>
        </Link>
    );
}
