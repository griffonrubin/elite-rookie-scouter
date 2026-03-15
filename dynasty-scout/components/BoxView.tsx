'use client';

import Link from 'next/link';
import { Player } from '@/lib/types';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface BoxViewProps {
    players: Player[];
    period: '1d' | '7d' | '30d';
}

// ── Grade system (mirrors AthleticsCard) ──────────────────────────────────────
const BENCH: Record<string, Record<string, { poor: number; elite: number; lowerIsBetter?: boolean }>> = {
    QB: {
        forty: { poor: 5.10, elite: 4.52, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 60, elite: 110 }, dom_pct: { poor: 5, elite: 25 },
        comp_pct: { poor: 52, elite: 72 }, ypa: { poor: 5.5, elite: 9.5 }, pass_ypg: { poor: 100, elite: 350 },
    },
    RB: {
        forty: { poor: 4.72, elite: 4.28, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 80, elite: 120 }, dom_pct: { poor: 8, elite: 28 },
        ypc: { poor: 3.5, elite: 6.5 }, scrim_ypg: { poor: 40, elite: 100 },
        breakout_age: { poor: 21, elite: 19, lowerIsBetter: true },
    },
    WR: {
        forty: { poor: 4.70, elite: 4.27, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 80, elite: 115 }, dom_pct: { poor: 8, elite: 28 },
        ypr: { poor: 8, elite: 18 }, scrim_ypg: { poor: 30, elite: 80 },
        breakout_age: { poor: 21, elite: 19, lowerIsBetter: true },
    },
    TE: {
        forty: { poor: 5.00, elite: 4.43, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 65, elite: 103 }, dom_pct: { poor: 6, elite: 20 },
        ypr: { poor: 7, elite: 15 }, scrim_ypg: { poor: 20, elite: 60 },
        breakout_age: { poor: 22, elite: 19, lowerIsBetter: true },
    },
};

function score(val: number, pos: string, key: string): number {
    const b = (BENCH[pos] || BENCH.WR)[key];
    if (!b) return 50;
    const { poor, elite, lowerIsBetter } = b;
    if (lowerIsBetter) {
        if (val <= elite) return 100;
        if (val >= poor)  return 0;
        return Math.round(((poor - val) / (poor - elite)) * 100);
    }
    if (val >= elite) return 100;
    if (val <= poor)  return 0;
    return Math.round(((val - poor) / (elite - poor)) * 100);
}

function grade(pct: number) {
    if (pct >= 90) return { label: 'S+', text: 'text-yellow-400',   badge: 'bg-yellow-400/15  text-yellow-400  border-yellow-400/40'  };
    if (pct >= 80) return { label: 'S',  text: 'text-yellow-300',   badge: 'bg-yellow-300/15  text-yellow-300  border-yellow-300/40'  };
    if (pct >= 70) return { label: 'A',  text: 'text-emerald-400',  badge: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/40' };
    if (pct >= 58) return { label: 'B+', text: 'text-cyan-400',     badge: 'bg-cyan-400/15    text-cyan-400    border-cyan-400/40'    };
    if (pct >= 45) return { label: 'B',  text: 'text-cyan-500',     badge: 'bg-cyan-500/15    text-cyan-500    border-cyan-500/40'    };
    if (pct >= 32) return { label: 'C',  text: 'text-yellow-500',   badge: 'bg-yellow-500/15  text-yellow-500  border-yellow-500/40'  };
    if (pct >= 18) return { label: 'D',  text: 'text-orange-400',   badge: 'bg-orange-400/15  text-orange-400  border-orange-400/40'  };
    return           { label: 'F',  text: 'text-red-400',     badge: 'bg-red-400/15    text-red-400    border-red-400/40'    };
}

// ── Tier ──────────────────────────────────────────────────────────────────────
function getTierStyle(rank: number) {
    if (rank <= 5)  return { label: 'S Tier', bg: 'bg-[#FF6B00]/10 border-[#FF6B00]/30',    text: 'text-[#FF9A50]',   border: '#FF6B00' };
    if (rank <= 12) return { label: 'A Tier', bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300', border: '#22c55e' };
    if (rank <= 24) return { label: 'B Tier', bg: 'bg-cyan-500/10 border-cyan-500/30',       text: 'text-cyan-300',    border: '#00b4d8' };
    if (rank <= 48) return { label: 'C Tier', bg: 'bg-violet-500/10 border-violet-500/30',   text: 'text-violet-300',  border: '#a78bfa' };
    if (rank <= 80) return { label: 'D Tier', bg: 'bg-amber-500/10 border-amber-500/30',     text: 'text-amber-300',   border: '#f59e0b' };
    return                 { label: 'Depth',  bg: 'bg-gray-500/10 border-gray-500/30',       text: 'text-gray-400',    border: '#6b7280' };
}

function getDraftSlot(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick = rank - (round - 1) * 12;
    return `${round}.${String(pick).padStart(2, '0')}`;
}

function formatHeight(inches?: number | null) {
    if (!inches) return null;
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GradeBadge({ label, val, pos, benchKey, title }: {
    label: string; val: number | null | undefined; pos: string; benchKey: string; title?: string;
}) {
    if (val == null || val === 0) return null;
    const pct = score(Number(val), pos, benchKey);
    const g = grade(pct);
    return (
        <div className="flex flex-col items-center gap-0.5" title={title}>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border font-mono ${g.badge}`}>{g.label}</span>
            <span className="text-[8px] text-muted-foreground/50 font-bold uppercase tracking-wide leading-none">{label}</span>
        </div>
    );
}

function StatBar({ label, val, pos, benchKey, display }: {
    label: string; val: number | null | undefined; pos: string; benchKey: string; display: string;
}) {
    if (val == null) return null;
    const pct = score(Number(val), pos, benchKey);
    const g = grade(pct);
    const barColors: Record<string, string> = {
        'S+': '#facc15', S: '#fde047', A: '#34d399', 'B+': '#22d3ee',
        B: '#06b6d4', C: '#eab308', D: '#f97316', F: '#f87171',
    };
    const barColor = barColors[g.label] || '#94a3b8';
    return (
        <div className="grid grid-cols-[70px_1fr_32px] items-center gap-2">
            <div>
                <div className="text-[9px] text-muted-foreground/60 leading-none mb-0.5">{label}</div>
                <div className={`text-[11px] font-black font-mono ${g.text}`}>{display}</div>
            </div>
            <div className="relative h-1.5 bg-border/25 rounded-full overflow-hidden">
                <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(3, pct)}%`, backgroundColor: barColor }}
                />
                <div className="absolute top-0 h-full w-px bg-white/10" style={{ left: '50%' }} />
            </div>
            <span className={`text-[9px] font-black text-center py-0.5 rounded border font-mono ${g.badge}`}>{g.label}</span>
        </div>
    );
}

// Mini season bar chart (CSS-only)
interface SeasonBar { yr: number | null; yds: number }
function MiniBarChart({ seasons, color, label }: { seasons: SeasonBar[]; color: string; label: string }) {
    const valid = seasons.filter(s => s.yr != null && s.yds > 0);
    if (valid.length === 0) return null;
    const maxYds = Math.max(...valid.map(s => s.yds));
    return (
        <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-1.5">{label} by Season</div>
            <div className="flex items-end gap-1 h-10">
                {valid.map((s, i) => {
                    const heightPct = Math.max(8, (s.yds / maxYds) * 100);
                    return (
                        <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                            <div className="w-full flex flex-col justify-end" style={{ height: '32px' }}>
                                <div
                                    className="w-full rounded-t-sm"
                                    style={{ height: `${(heightPct / 100) * 32}px`, backgroundColor: color, opacity: 0.85 }}
                                />
                            </div>
                            <span className="text-[7px] text-muted-foreground/50 font-mono">{s.yr ? String(s.yr).slice(2) : '?'}</span>
                        </div>
                    );
                })}
            </div>
            <div className="text-right text-[8px] text-muted-foreground/30 font-mono mt-0.5">
                peak {maxYds.toLocaleString()} yds
            </div>
        </div>
    );
}

function DivergenceBadge({ ktc, fp }: { ktc: number | null | undefined; fp: number | null | undefined }) {
    if (!ktc || !fp) return null;
    const gap = fp - ktc;
    if (Math.abs(gap) < 15) return null;
    const isBuy = gap > 0;
    return (
        <span
            title={isBuy ? `KTC ranks ${gap} spots higher than FP` : `FP ranks ${Math.abs(gap)} spots higher than KTC`}
            style={{ padding: '1px 5px', borderRadius: 9999, fontSize: 9, fontWeight: 800, lineHeight: 1 }}
            className={cn('inline-flex items-center border ml-1', isBuy
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-red-500/20 text-red-400 border-red-500/40'
            )}
        >
            {isBuy ? '▲BUY' : '▼SELL'}
        </span>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BoxView({ players, period }: BoxViewProps) {
    if (players.length === 0) {
        return <div className="p-12 text-center text-muted-foreground">No players found.</div>;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {players.map((player, index) => {
                const p = player as any;
                const pos = player.position.toUpperCase();
                const rank = p.consensus_rank ?? (index + 1);
                const tier = getTierStyle(rank);
                const posColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
                const draftSlot = getDraftSlot(rank);
                const school = p.school || player.nfl_team || '—';
                const ht = formatHeight(player.height_inches);
                const wt = player.weight_lbs ? `${player.weight_lbs}lb` : null;

                // Compute derived stats
                const compPct = p.career_pass_att > 0
                    ? (p.career_completions / p.career_pass_att * 100)
                    : null;
                const ypa = p.career_pass_att > 0
                    ? (p.career_pass_yards / p.career_pass_att)
                    : null;
                const scrimYpg = p.career_games_cs > 0
                    ? (p.career_scrim_yards / p.career_games_cs)
                    : null;

                // Season bar data (reversed so oldest→newest = left→right)
                const seasons: SeasonBar[] = [
                    { yr: p.s4_yr, yds: pos === 'QB' ? (p.s4_pass ?? 0) : (p.s4_scrim ?? 0) },
                    { yr: p.s3_yr, yds: pos === 'QB' ? (p.s3_pass ?? 0) : (p.s3_scrim ?? 0) },
                    { yr: p.s2_yr, yds: pos === 'QB' ? (p.s2_pass ?? 0) : (p.s2_scrim ?? 0) },
                    { yr: p.s1_yr, yds: pos === 'QB' ? (p.s1_pass ?? 0) : (p.s1_scrim ?? 0) },
                ].filter(s => s.yr != null);
                const barColor = pos === 'QB' ? '#22d3ee' : pos === 'RB' ? '#34d399' : pos === 'WR' ? '#e879f9' : '#a78bfa';
                const barLabel = pos === 'QB' ? 'Pass Yds' : pos === 'RB' ? 'Scrim Yds' : 'Rec Yds';

                return (
                    <Link
                        key={player.id}
                        href={`/players/${player.slug}`}
                        className={cn(
                            'group flex flex-col bg-card border rounded-xl overflow-hidden',
                            'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200',
                            tier.bg
                        )}
                        style={{ borderLeft: `3px solid ${tier.border}70` }}
                    >
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                            <div className="flex items-center gap-2">
                                <span className={cn('text-sm font-extrabold font-mono', tier.text)}>#{rank}</span>
                                <span className="text-[10px] font-bold font-mono text-muted-foreground/40">{draftSlot}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {p.recruiting_stars >= 4 && (
                                    <span className={`text-[10px] font-bold ${p.recruiting_stars >= 5 ? 'text-yellow-400' : 'text-yellow-400/60'}`}>
                                        {'★'.repeat(p.recruiting_stars)}
                                    </span>
                                )}
                                <span
                                    style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 800, lineHeight: 1 }}
                                    className={cn('border inline-flex items-center', posColor)}
                                >{player.position}</span>
                            </div>
                        </div>

                        {/* ── Name + school ── */}
                        <div className="px-3 pb-2">
                            <div className="font-bold text-[14px] text-foreground group-hover:text-primary transition-colors leading-snug truncate" title={player.full_name}>
                                {player.full_name}
                            </div>
                            <div className="text-[11px] text-muted-foreground/60 truncate">{school}</div>
                            {(ht || wt) && (
                                <div className="text-[10px] text-muted-foreground/40 font-mono mt-0.5">
                                    {ht}{ht && wt ? ' / ' : ''}{wt}
                                    {p.breakout_age && (
                                        <span className={`ml-2 font-bold ${p.breakout_age <= 19 ? 'text-emerald-400' : p.breakout_age <= 20 ? 'text-cyan-400' : 'text-muted-foreground/50'}`}>
                                            · BO age {Number(p.breakout_age).toFixed(1)}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="border-t border-border/20" />

                        {/* ── Season bar chart ── */}
                        <div className="px-3 py-2.5">
                            <MiniBarChart seasons={seasons} color={barColor} label={barLabel} />
                        </div>

                        <div className="border-t border-border/20" />

                        {/* ── Production stat bars ── */}
                        <div className="px-3 py-2.5 space-y-2">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-1">Production</div>
                            {pos === 'QB' && <>
                                <StatBar label="Comp %" val={compPct} pos={pos} benchKey="comp_pct" display={compPct ? `${compPct.toFixed(1)}%` : '—'} />
                                <StatBar label="YPA" val={ypa} pos={pos} benchKey="ypa" display={ypa ? ypa.toFixed(1) : '—'} />
                                <StatBar label="Pass/G" val={p.best_pass_ypg} pos={pos} benchKey="pass_ypg" display={p.best_pass_ypg ? Number(p.best_pass_ypg).toFixed(0) : '—'} />
                                <StatBar label="Dom %" val={p.best_dominator} pos={pos} benchKey="dom_pct" display={p.best_dominator ? `${Number(p.best_dominator).toFixed(1)}%` : '—'} />
                            </>}
                            {pos === 'RB' && <>
                                <StatBar label="Dom %" val={p.best_dominator} pos={pos} benchKey="dom_pct" display={p.best_dominator ? `${Number(p.best_dominator).toFixed(1)}%` : '—'} />
                                <StatBar label="YPC" val={p.best_ypc} pos={pos} benchKey="ypc" display={p.best_ypc ? Number(p.best_ypc).toFixed(2) : '—'} />
                                <StatBar label="Scrim/G" val={scrimYpg} pos={pos} benchKey="scrim_ypg" display={scrimYpg ? scrimYpg.toFixed(1) : '—'} />
                            </>}
                            {(pos === 'WR' || pos === 'TE') && <>
                                <StatBar label="Dom %" val={p.best_dominator} pos={pos} benchKey="dom_pct" display={p.best_dominator ? `${Number(p.best_dominator).toFixed(1)}%` : '—'} />
                                <StatBar label="Yds/Rec" val={p.best_ypr} pos={pos} benchKey="ypr" display={p.best_ypr ? Number(p.best_ypr).toFixed(1) : '—'} />
                                <StatBar label="Scrim/G" val={scrimYpg} pos={pos} benchKey="scrim_ypg" display={scrimYpg ? scrimYpg.toFixed(1) : '—'} />
                            </>}
                        </div>

                        <div className="border-t border-border/20" />

                        {/* ── Athletic grade badges ── */}
                        <div className="px-3 py-2.5">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Athletics</div>
                            <div className="flex items-start gap-2 flex-wrap">
                                <GradeBadge label="40yd" val={p.forty_yard} pos={pos} benchKey="forty" title={p.forty_yard ? `${Number(p.forty_yard).toFixed(2)}s` : undefined} />
                                <GradeBadge label="RAS"  val={p.ras}        pos={pos} benchKey="ras"   title={p.ras ? `RAS ${Number(p.ras).toFixed(1)}/10` : undefined} />
                                <GradeBadge label="Spd"  val={p.speed_score} pos={pos} benchKey="speed_score" title={p.speed_score ? `Speed Score ${Math.round(p.speed_score)}` : undefined} />
                                {!p.forty_yard && !p.ras && !p.speed_score && (
                                    <span className="text-[10px] text-muted-foreground/30 italic">No combine data</span>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-border/20" />

                        {/* ── Rankings ── */}
                        <div className="grid grid-cols-3">
                            {[
                                { label: 'KTC', val: p.ktc_rank, extra: <DivergenceBadge ktc={p.ktc_rank} fp={p.fantasypros_rank} /> },
                                { label: 'FP',  val: p.fantasypros_rank   },
                                { label: 'DN',  val: p.dynasty_nerds_rank },
                            ].map(({ label, val, extra }) => (
                                <div key={label} className="flex flex-col items-center justify-center py-2 border-r border-border/20 last:border-r-0">
                                    <div className="text-[9px] text-muted-foreground/50 uppercase font-bold tracking-wider mb-0.5">{label}</div>
                                    <div className="text-[11px] font-bold font-mono text-foreground/80 flex items-center">
                                        {val ?? '—'}{extra}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── Tier footer ── */}
                        <div className={cn('px-3 py-1.5 text-center text-[9px] font-bold tracking-widest uppercase border-t border-border/20', tier.text)}>
                            {tier.label}
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
