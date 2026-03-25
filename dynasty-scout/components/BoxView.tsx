'use client';

import Link from 'next/link';
import { Player } from '@/lib/types';
import { POSITION_COLORS } from '@/lib/constants';
import { WatchlistButton } from './WatchlistButton';
import { cn } from '@/lib/utils';

interface BoxViewProps {
    players: Player[];
    period: '1d' | '7d' | '30d';
}

// ── Grade system ──────────────────────────────────────────────────────────────
const BENCH: Record<string, Record<string, { poor: number; elite: number; lowerIsBetter?: boolean }>> = {
    QB: {
        forty: { poor: 5.10, elite: 4.52, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 60, elite: 110 }, dom_pct: { poor: 5, elite: 25 },
        comp_pct: { poor: 52, elite: 72 }, ypa: { poor: 5.5, elite: 9.5 }, pass_ypg: { poor: 100, elite: 350 },
        arm_length: { poor: 30.0, elite: 33.5 }, hand_size: { poor: 8.5, elite: 10.5 },
        height: { poor: 71, elite: 77 }, weight: { poor: 195, elite: 235 },
    },
    RB: {
        forty: { poor: 4.72, elite: 4.28, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 80, elite: 120 }, dom_pct: { poor: 8, elite: 28 },
        ypc: { poor: 3.5, elite: 6.5 }, scrim_ypg: { poor: 40, elite: 100 },
        breakout_age: { poor: 21, elite: 19, lowerIsBetter: true },
        height: { poor: 66, elite: 72 }, weight: { poor: 180, elite: 220 },
    },
    WR: {
        forty: { poor: 4.70, elite: 4.27, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 80, elite: 115 }, dom_pct: { poor: 8, elite: 28 },
        ypr: { poor: 8, elite: 18 }, scrim_ypg: { poor: 30, elite: 80 },
        breakout_age: { poor: 21, elite: 19, lowerIsBetter: true },
        arm_length: { poor: 30.0, elite: 33.5 }, hand_size: { poor: 8.5, elite: 10.0 },
        height: { poor: 68, elite: 75 }, weight: { poor: 170, elite: 215 },
    },
    TE: {
        forty: { poor: 5.00, elite: 4.43, lowerIsBetter: true }, ras: { poor: 0, elite: 10 },
        speed_score: { poor: 65, elite: 103 }, dom_pct: { poor: 6, elite: 20 },
        ypr: { poor: 7, elite: 15 }, scrim_ypg: { poor: 20, elite: 60 },
        breakout_age: { poor: 22, elite: 19, lowerIsBetter: true },
        arm_length: { poor: 31.0, elite: 35.5 }, hand_size: { poor: 9.0, elite: 11.0 },
        height: { poor: 73, elite: 79 }, weight: { poor: 230, elite: 270 },
    },
};

function scoreMetric(val: number, pos: string, key: string): number {
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

function gradeOf(pct: number) {
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
    if (rank <= 5)  return { label: 'S Tier', bg: 'bg-orange-500/10 border-orange-500/30',   text: 'text-orange-300',  border: '#f97316' };
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

/** Full-width grade badge for the athletics grid */
function GradeCell({ label, val, pos, benchKey, displayVal }: {
    label: string; val: number | null | undefined;
    pos: string; benchKey: string; displayVal?: string;
}) {
    if (val == null || val === 0) return null;
    const pct = scoreMetric(Number(val), pos, benchKey);
    const g = gradeOf(pct);
    const barColors: Record<string, string> = {
        'S+': '#facc15', S: '#fde047', A: '#34d399', 'B+': '#22d3ee',
        B: '#06b6d4', C: '#eab308', D: '#f97316', F: '#f87171',
    };
    return (
        <div className="flex flex-col gap-0.5 sm:gap-1 p-1.5 sm:p-2 rounded-lg bg-muted/[0.07] border border-border/20">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground/50">{label}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 min-w-[30px] inline-flex items-center justify-center rounded border font-mono ${g.badge}`}>{g.label}</span>
            </div>
            <div className={`text-[11px] font-black font-mono ${g.text}`}>
                {displayVal ?? String(val)}
            </div>
            <div className="relative h-1.5 bg-border/20 rounded-full overflow-hidden">
                <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{ width: `${Math.max(3, pct)}%`, backgroundColor: barColors[g.label] || '#94a3b8' }}
                />
                <div className="absolute top-0 h-full w-px bg-white/10" style={{ left: '50%' }} />
            </div>
        </div>
    );
}

/** Compact stat bar for production section */
function StatBar({ label, val, pos, benchKey, display }: {
    label: string; val: number | null | undefined; pos: string; benchKey: string; display: string;
}) {
    if (val == null) return null;
    const pct = scoreMetric(Number(val), pos, benchKey);
    const g = gradeOf(pct);
    const barColors: Record<string, string> = {
        'S+': '#facc15', S: '#fde047', A: '#34d399', 'B+': '#22d3ee',
        B: '#06b6d4', C: '#eab308', D: '#f97316', F: '#f87171',
    };
    return (
        <div className="grid grid-cols-[72px_1fr_30px] items-center gap-2">
            <div>
                <div className="text-[9px] text-muted-foreground/50 leading-none mb-0.5">{label}</div>
                <div className={`text-[11px] font-black font-mono ${g.text}`}>{display}</div>
            </div>
            <div className="relative h-1.5 bg-border/20 rounded-full overflow-hidden">
                <div className="absolute left-0 top-0 h-full rounded-full"
                    style={{ width: `${Math.max(3, pct)}%`, backgroundColor: barColors[g.label] || '#94a3b8' }} />
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
            <div className="flex items-end gap-1.5" style={{ height: '36px' }}>
                {valid.map((s, i) => {
                    const heightPct = Math.max(8, (s.yds / maxYds) * 100);
                    return (
                        <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                            <div className="w-full flex flex-col justify-end" style={{ height: '28px' }}>
                                <div className="w-full rounded-t-sm"
                                    style={{ height: `${(heightPct / 100) * 28}px`, backgroundColor: color, opacity: 0.8 }} />
                            </div>
                            <span className="text-[7px] text-muted-foreground/50 font-mono">{s.yr ? String(s.yr).slice(2) : '?'}</span>
                        </div>
                    );
                })}
            </div>
            <div className="text-right text-[8px] text-muted-foreground/30 font-mono mt-0.5">peak {maxYds.toLocaleString()}</div>
        </div>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BoxView({ players, period }: BoxViewProps) {
    if (players.length === 0) {
        return <div className="p-12 text-center text-muted-foreground">No players found.</div>;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-4">
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

                const compPct = p.career_pass_att > 0 ? (p.career_completions / p.career_pass_att * 100) : null;
                const ypa     = p.career_pass_att > 0 ? (p.career_pass_yards   / p.career_pass_att)       : null;
                const scrimYpg = p.career_games_cs > 0 ? (p.career_scrim_yards / p.career_games_cs)       : null;

                const seasons: SeasonBar[] = [
                    { yr: p.s4_yr, yds: pos === 'QB' ? (p.s4_pass ?? 0) : (p.s4_scrim ?? 0) },
                    { yr: p.s3_yr, yds: pos === 'QB' ? (p.s3_pass ?? 0) : (p.s3_scrim ?? 0) },
                    { yr: p.s2_yr, yds: pos === 'QB' ? (p.s2_pass ?? 0) : (p.s2_scrim ?? 0) },
                    { yr: p.s1_yr, yds: pos === 'QB' ? (p.s1_pass ?? 0) : (p.s1_scrim ?? 0) },
                ].filter(s => s.yr != null);
                const barColor = pos === 'QB' ? '#22d3ee' : pos === 'RB' ? '#34d399' : pos === 'WR' ? '#34d399' : '#a78bfa';
                const barLabel = pos === 'QB' ? 'Pass Yds' : pos === 'RB' ? 'Scrim Yds' : 'Rec Yds';

                // Build athletics grade cells — show all available, fill full row
                type GradeSpec = { label: string; val: number | null | undefined; key: string; display: string };
                const athleteGrades: GradeSpec[] = [
                    player.height_inches && { label: 'Ht',   val: player.height_inches, key: 'height',      display: ht ?? `${player.height_inches}"` },
                    player.weight_lbs    && { label: 'Wt',   val: player.weight_lbs,    key: 'weight',      display: `${player.weight_lbs}lb`         },
                    p.forty_yard         && { label: '40yd', val: p.forty_yard,          key: 'forty',       display: `${Number(p.forty_yard).toFixed(2)}s`  },
                    p.ras                && { label: 'RAS',  val: p.ras,                 key: 'ras',         display: Number(p.ras).toFixed(1)               },
                    p.speed_score        && { label: 'Spd',  val: p.speed_score,         key: 'speed_score', display: Math.round(p.speed_score).toString()   },
                    p.arm_length         && { label: 'Arm',  val: p.arm_length,          key: 'arm_length',  display: `${Number(p.arm_length).toFixed(1)}"`  },
                    p.hand_size          && { label: 'Hand', val: p.hand_size,           key: 'hand_size',   display: `${Number(p.hand_size).toFixed(1)}"`   },
                ].filter(Boolean) as GradeSpec[];

                // Choose columns based on count to fill the row
                const cols = athleteGrades.length <= 3 ? 3 : athleteGrades.length <= 4 ? 4 : athleteGrades.length <= 6 ? 3 : 4;

                return (
                    <Link
                        key={player.id}
                        href={`/players/${player.slug}`}
                        className={cn(
                            'group flex flex-col bg-card border rounded-xl overflow-hidden',
                            'hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-200',
                            tier.bg
                        )}
                        style={{ borderLeft: `3px solid ${tier.border}70` }}
                    >
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2">
                            <div className="flex items-center gap-2">
                                <span className={cn('text-sm font-extrabold font-mono', tier.text)}>#{rank}</span>
                                <span className="text-[10px] font-bold font-mono text-muted-foreground/40">{draftSlot}</span>
                            </div>
                            <div className="flex items-center gap-2 mr-0.5">
                                {p.recruiting_stars >= 4 && (
                                    <span className={`text-[11px] font-bold ${p.recruiting_stars >= 5 ? 'text-yellow-400' : 'text-yellow-400/60'}`}>
                                        {'★'.repeat(p.recruiting_stars)}
                                    </span>
                                )}
                                <WatchlistButton playerSlug={player.slug} className="flex-shrink-0" />
                                <span
                                    style={{ padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 800, lineHeight: 1 }}
                                    className={cn('border inline-flex items-center', posColor)}
                                >{player.position}</span>
                            </div>
                        </div>

                        {/* ── Name + school ── */}
                        <div className="px-3 sm:px-4 pb-2 sm:pb-3 flex items-start gap-2.5">
                            {(p.headshot_url || p.espn_college_id) ? (
                                <img
                                    src={p.headshot_url || 'https://a.espncdn.com/i/headshots/college-football/players/full/' + p.espn_college_id + '.png'}
                                    alt={player.full_name}
                                    className="w-8 h-10 rounded-md object-cover object-top flex-shrink-0 opacity-90 mt-0.5"
                                />
                            ) : (
                                <div className="w-8 h-10 rounded-md bg-muted/20 flex items-center justify-center text-[9px] font-black text-muted-foreground/30 flex-shrink-0 mt-0.5">{pos[0]}</div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="font-bold text-[14px] text-foreground group-hover:text-primary transition-colors leading-snug" title={player.full_name}>
                                    {player.full_name}
                                </div>
                                <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{school}</div>
                                {p.breakout_age && (
                                    <div className="text-[10px] text-muted-foreground/40 font-mono mt-1">
                                        <span className={`font-bold ${p.breakout_age <= 19 ? 'text-emerald-400' : p.breakout_age <= 20 ? 'text-cyan-400' : ''}`}>
                                            BO age {Number(p.breakout_age).toFixed(1)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="border-t border-border/20" />

                        {/* ── Season bar chart ── */}
                        <div className="px-3 sm:px-4 py-2 sm:py-3">
                            <MiniBarChart seasons={seasons} color={barColor} label={barLabel} />
                        </div>

                        <div className="border-t border-border/20" />

                        {/* ── Production stat bars ── */}
                        <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-1.5 sm:space-y-2">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Production</div>
                            {pos === 'QB' && <>
                                <StatBar label="Comp %" val={compPct}         pos={pos} benchKey="comp_pct"  display={compPct  ? `${compPct.toFixed(1)}%`                    : '—'} />
                                <StatBar label="YPA"    val={ypa}             pos={pos} benchKey="ypa"       display={ypa      ? ypa.toFixed(1)                              : '—'} />
                                <StatBar label="Pass/G" val={p.best_pass_ypg} pos={pos} benchKey="pass_ypg"  display={p.best_pass_ypg ? Number(p.best_pass_ypg).toFixed(0) : '—'} />
                                <StatBar label="Dom %"  val={p.best_dominator}pos={pos} benchKey="dom_pct"   display={p.best_dominator ? `${Number(p.best_dominator).toFixed(1)}%` : '—'} />
                            </>}
                            {pos === 'RB' && <>
                                <StatBar label="Dom %"   val={p.best_dominator} pos={pos} benchKey="dom_pct"   display={p.best_dominator ? `${Number(p.best_dominator).toFixed(1)}%` : '—'} />
                                <StatBar label="YPC"     val={p.best_ypc}       pos={pos} benchKey="ypc"       display={p.best_ypc  ? Number(p.best_ypc).toFixed(2)  : '—'} />
                                <StatBar label="Scrim/G" val={scrimYpg}         pos={pos} benchKey="scrim_ypg" display={scrimYpg    ? scrimYpg.toFixed(1)             : '—'} />
                            </>}
                            {(pos === 'WR' || pos === 'TE') && <>
                                <StatBar label="Dom %"   val={p.best_dominator} pos={pos} benchKey="dom_pct"   display={p.best_dominator ? `${Number(p.best_dominator).toFixed(1)}%` : '—'} />
                                <StatBar label="Yds/Rec" val={p.best_ypr}       pos={pos} benchKey="ypr"       display={p.best_ypr  ? Number(p.best_ypr).toFixed(1)  : '—'} />
                                <StatBar label="Scrim/G" val={scrimYpg}         pos={pos} benchKey="scrim_ypg" display={scrimYpg    ? scrimYpg.toFixed(1)             : '—'} />
                            </>}
                        </div>

                        <div className="border-t border-border/20" />

                        {/* ── Athletics grade grid — fills full row ── */}
                        <div className="px-3 sm:px-4 py-2 sm:py-3">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Athletics</div>
                            {athleteGrades.length > 0 ? (
                                <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                                    {athleteGrades.map(g => (
                                        <GradeCell key={g.key} label={g.label} val={g.val} pos={pos} benchKey={g.key} displayVal={g.display} />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-[10px] text-muted-foreground/30 italic py-1">No combine data yet</div>
                            )}
                        </div>

                        <div className="border-t border-border/20" />

                        {/* ── Rankings ── */}
                        <div className="grid grid-cols-3">
                            {[
                                { label: 'KTC', val: p.ktc_rank            },
                                { label: 'FP',  val: p.fantasypros_rank    },
                                { label: 'DN',  val: p.dynasty_nerds_rank  },
                            ].map(({ label, val }) => (
                                <div key={label} className="flex flex-col items-center justify-center py-1.5 sm:py-2.5 border-r border-border/20 last:border-r-0">
                                    <div className="text-[8px] sm:text-[9px] text-muted-foreground/50 uppercase font-bold tracking-wider mb-0.5">{label}</div>
                                    <div className="text-[10px] sm:text-[11px] font-bold font-mono text-foreground/80">{val ?? '—'}</div>
                                </div>
                            ))}
                        </div>

                        {/* ── Tier footer ── */}
                        <div className={cn('px-3 sm:px-4 py-1.5 sm:py-2 text-center text-[8px] sm:text-[9px] font-bold tracking-widest uppercase border-t border-border/20', tier.text)}>
                            {tier.label}
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
