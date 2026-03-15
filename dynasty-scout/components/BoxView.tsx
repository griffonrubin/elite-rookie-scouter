'use client';

import Link from 'next/link';
import { Player } from '@/lib/types';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

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
    if (rank <= 5)  return { label: 'S Tier', bg: 'bg-[#FF6B00]/10 border-[#FF6B00]/30',    text: 'text-[#FF9A50]',   leftBorder: '#FF6B00'   };
    if (rank <= 12) return { label: 'A Tier', bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300', leftBorder: '#22c55e'   };
    if (rank <= 24) return { label: 'B Tier', bg: 'bg-cyan-500/10 border-cyan-500/30',       text: 'text-cyan-300',    leftBorder: '#00b4d8'   };
    if (rank <= 48) return { label: 'C Tier', bg: 'bg-violet-500/10 border-violet-500/30',   text: 'text-violet-300',  leftBorder: '#a78bfa'   };
    if (rank <= 80) return { label: 'D Tier', bg: 'bg-amber-500/10 border-amber-500/30',     text: 'text-amber-300',   leftBorder: '#f59e0b'   };
    return                 { label: 'Depth',  bg: 'bg-gray-500/10 border-gray-500/30',       text: 'text-gray-400',    leftBorder: '#6b7280'   };
}

function formatHeight(inches?: number | null) {
    if (!inches) return null;
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function getFortyColor(v: number, pos: string): string {
    const p = pos.toUpperCase();
    if (p === 'RB') return v < 4.40 ? 'text-emerald-400' : v < 4.50 ? 'text-yellow-400' : v < 4.60 ? 'text-orange-400' : 'text-red-400';
    if (p === 'WR') return v < 4.38 ? 'text-emerald-400' : v < 4.47 ? 'text-yellow-400' : v < 4.56 ? 'text-orange-400' : 'text-red-400';
    if (p === 'TE') return v < 4.50 ? 'text-emerald-400' : v < 4.62 ? 'text-yellow-400' : v < 4.75 ? 'text-orange-400' : 'text-red-400';
    return v < 4.65 ? 'text-emerald-400' : v < 4.78 ? 'text-yellow-400' : 'text-orange-400';
}

function RasBar({ ras }: { ras: number }) {
    const pct = Math.min(100, (ras / 10) * 100);
    const color = ras >= 9 ? 'bg-emerald-400' : ras >= 7 ? 'bg-violet-400' : ras >= 5 ? 'bg-cyan-400' : 'bg-muted-foreground/40';
    return (
        <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-[9px] font-black font-mono ${ras >= 9 ? 'text-emerald-400' : ras >= 7 ? 'text-violet-400' : 'text-cyan-400/80'}`}>
                {ras.toFixed(1)}
            </span>
        </div>
    );
}

function RecruitStars({ stars }: { stars: number }) {
    const color = stars >= 5 ? 'text-yellow-400' : stars >= 4 ? 'text-yellow-400/70' : 'text-muted-foreground/40';
    return <span className={`text-[10px] font-bold leading-none ${color}`}>{'★'.repeat(Math.min(stars, 5))}</span>;
}

function DivergenceBadge({ ktc, fp }: { ktc: number | null | undefined; fp: number | null | undefined }) {
    if (!ktc || !fp) return null;
    const gap = fp - ktc;
    if (Math.abs(gap) < 15) return null;
    const isBuy = gap > 0;
    return (
        <span
            title={isBuy ? `KTC ranks ${gap} spots higher than FP — dynasty buy signal` : `FP is ${Math.abs(gap)} spots ahead of KTC — possible sell`}
            style={{ padding: '1px 5px', borderRadius: 9999, fontSize: 9, fontWeight: 800, lineHeight: 1 }}
            className={cn('inline-flex items-center border', isBuy
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-red-500/20 text-red-400 border-red-500/40'
            )}
        >
            {isBuy ? '▲BUY' : '▼SELL'}
        </span>
    );
}

function TopStat({ player }: { player: any }) {
    const pos = player.position?.toUpperCase();
    if (pos === 'QB' && player.best_pass_ypg) {
        return (
            <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/50 uppercase tracking-wide font-bold">Pass/G</span>
                <span className="font-black font-mono text-cyan-400">{Number(player.best_pass_ypg).toFixed(0)}</span>
            </div>
        );
    }
    if (pos === 'RB' && player.best_ypc) {
        return (
            <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/50 uppercase tracking-wide font-bold">YPC</span>
                <span className={`font-black font-mono ${player.best_ypc >= 6.5 ? 'text-emerald-400' : player.best_ypc >= 5.5 ? 'text-cyan-400' : 'text-foreground/70'}`}>
                    {Number(player.best_ypc).toFixed(2)}
                </span>
            </div>
        );
    }
    if ((pos === 'WR' || pos === 'TE') && player.best_ypr) {
        return (
            <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/50 uppercase tracking-wide font-bold">Yds/Rec</span>
                <span className={`font-black font-mono ${player.best_ypr >= 16 ? 'text-emerald-400' : player.best_ypr >= 12 ? 'text-cyan-400' : 'text-foreground/70'}`}>
                    {Number(player.best_ypr).toFixed(1)}
                </span>
            </div>
        );
    }
    if (player.best_dominator) {
        return (
            <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/50 uppercase tracking-wide font-bold">Dom%</span>
                <span className={`font-black font-mono ${player.best_dominator >= 25 ? 'text-emerald-400' : player.best_dominator >= 15 ? 'text-cyan-400' : 'text-foreground/70'}`}>
                    {Number(player.best_dominator).toFixed(1)}%
                </span>
            </div>
        );
    }
    return null;
}

export function BoxView({ players, period }: BoxViewProps) {
    if (players.length === 0) {
        return <div className="p-12 text-center text-muted-foreground">No players found.</div>;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {players.map((player, index) => {
                const p = player as any;
                const rank = p.consensus_rank ?? (index + 1);
                const tier = getTierStyle(rank);
                const posColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
                const draftSlot = getDraftSlot(rank);
                const school = p.school || player.nfl_team || '—';
                const fortyYard = p.forty_yard as number | null | undefined;
                const ras = p.ras as number | null | undefined;
                const stars = p.recruiting_stars as number | null | undefined;
                const ht = formatHeight(player.height_inches);
                const wt = player.weight_lbs ? `${player.weight_lbs}` : null;
                const hasAthleticData = fortyYard || ras;

                return (
                    <Link
                        key={player.id}
                        href={`/players/${player.slug}`}
                        className={cn(
                            'group flex flex-col bg-card border rounded-xl overflow-hidden',
                            'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200',
                            tier.bg
                        )}
                        style={{ borderLeft: `3px solid ${tier.leftBorder}80` }}
                    >
                        {/* Card header */}
                        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                            <div className="flex items-center gap-1.5">
                                <span className={cn('text-xs font-extrabold font-mono', tier.text)}>#{rank}</span>
                                <span className={cn('text-[10px] font-bold font-mono text-muted-foreground/50')}>{draftSlot}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {stars && <RecruitStars stars={stars} />}
                                <span
                                    style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 800, lineHeight: 1 }}
                                    className={cn('border inline-flex items-center', posColor)}
                                >
                                    {player.position}
                                </span>
                            </div>
                        </div>

                        {/* Player name + school */}
                        <div className="px-3 pb-2">
                            <div className="font-bold text-[14px] text-foreground group-hover:text-primary transition-colors leading-snug truncate" title={player.full_name}>
                                {player.full_name}
                            </div>
                            <div className="text-[11px] text-muted-foreground/60 truncate">{school}</div>
                        </div>

                        <div className="border-t border-border/20 mx-3" />

                        {/* Rankings row */}
                        <div className="grid grid-cols-3 gap-px bg-border/10 mx-0">
                            <StatCell label="KTC" value={p.ktc_rank ?? '—'} extra={<DivergenceBadge ktc={p.ktc_rank} fp={p.fantasypros_rank} />} />
                            <StatCell label="FP" value={p.fantasypros_rank ?? '—'} />
                            <StatCell label="DN" value={p.dynasty_nerds_rank ?? '—'} />
                        </div>

                        <div className="border-t border-border/20 mx-0" />

                        {/* Athletic data */}
                        <div className="px-3 py-2 space-y-1.5">
                            {/* Size */}
                            {(ht || wt) && (
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground/50 uppercase tracking-wide font-bold">Size</span>
                                    <span className="font-mono font-bold text-foreground/70">
                                        {ht}{ht && wt ? ' / ' : ''}{wt ? `${wt}lb` : ''}
                                    </span>
                                </div>
                            )}

                            {/* 40yd */}
                            {fortyYard && (
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground/50 uppercase tracking-wide font-bold">40yd</span>
                                    <span className={`font-black font-mono ${getFortyColor(fortyYard, player.position)}`}>
                                        {fortyYard.toFixed(2)}s
                                    </span>
                                </div>
                            )}

                            {/* RAS bar */}
                            {ras != null && (
                                <div className="space-y-0.5">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-muted-foreground/50 uppercase tracking-wide font-bold">RAS</span>
                                    </div>
                                    <RasBar ras={Number(ras)} />
                                </div>
                            )}

                            {!hasAthleticData && (
                                <div className="text-center text-[10px] text-muted-foreground/30 italic py-1">No combine data yet</div>
                            )}
                        </div>

                        {/* Production stat */}
                        <div className="border-t border-border/20 mx-3" />
                        <div className="px-3 py-2">
                            <TopStat player={p} />
                            {!p.best_pass_ypg && !p.best_ypc && !p.best_ypr && !p.best_dominator && (
                                <div className="text-center text-[10px] text-muted-foreground/30 italic">No production data</div>
                            )}
                        </div>

                        {/* Tier footer */}
                        <div className={cn('px-3 py-1.5 text-center text-[9px] font-bold tracking-widest uppercase mt-auto border-t border-border/20', tier.text)}>
                            {tier.label}
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}

function StatCell({ label, value, extra }: {
    label: string;
    value: string | number;
    extra?: React.ReactNode;
}) {
    return (
        <div className="bg-card/60 flex flex-col items-center justify-center py-2 px-1">
            <div className="text-[9px] text-muted-foreground/50 uppercase font-bold tracking-wider mb-0.5">{label}</div>
            <div className="text-[11px] font-bold font-mono text-foreground/80 flex items-center gap-0.5">
                {value}{extra}
            </div>
        </div>
    );
}
