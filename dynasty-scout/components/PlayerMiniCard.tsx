'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ConsensusRanking, Player } from '@/lib/types';
import { WatchlistButton } from './WatchlistButton';
import { getColDefs, getGridTemplate, pickInIdentity, BoardDataset, ColDef } from '@/lib/boardColumns';
import { Scale } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { NflTeamLogo, getDraftStatus } from '@/components/NflTeamLogo';

interface PlayerMiniCardProps {
    player: Player;
    ranking: ConsensusRanking;
    period: '1d' | '7d' | '30d';
    index: number;
    positionFilter?: string;
    format?: 'SF' | '1QB';
    dataset?: BoardDataset;
}

function getTier(rank: number): { label: string; color: string; border: string; accent: string } {
    if (rank <= 5)  return { label: 'S Tier', color: 'bg-orange-500/15 text-orange-300 border-orange-500/35',   border: 'rgba(249,115,22,0.5)',   accent: '#f97316' };
    if (rank <= 12) return { label: 'A Tier', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35', border: 'rgba(34,197,94,0.5)',   accent: '#22c55e' };
    if (rank <= 24) return { label: 'B Tier', color: 'bg-sky-500/15 text-sky-300 border-sky-500/35',             border: 'rgba(56,189,248,0.5)',  accent: '#38bdf8' };
    if (rank <= 48) return { label: 'C Tier', color: 'bg-violet-500/15 text-violet-300 border-violet-500/35',   border: 'rgba(167,139,250,0.5)',  accent: '#a78bfa' };
    if (rank <= 80) return { label: 'D Tier', color: 'bg-amber-500/15 text-amber-300 border-amber-500/35',      border: 'rgba(245,158,11,0.45)', accent: '#f59e0b' };
    return            { label: 'Depth',  color: 'bg-slate-500/15 text-slate-400 border-slate-500/30',            border: 'rgba(71,85,105,0.3)',   accent: '#475569' };
}

function getRankColor(rank: number): string {
    if (rank <= 5)  return 'text-orange-400 font-extrabold';
    if (rank <= 12) return 'text-emerald-400 font-extrabold';
    if (rank <= 24) return 'text-sky-400 font-bold';
    if (rank <= 48) return 'text-violet-400 font-bold';
    return 'text-muted-foreground/70 font-semibold';
}

function formatHeight(inches?: number | null) {
    if (!inches) return '—';
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function getFortyColor(v: number, pos: string): string {
    const p = pos.toUpperCase();
    if (p === 'RB') { if (v < 4.40) return 'text-emerald-400 font-bold'; if (v < 4.50) return 'text-yellow-400'; if (v < 4.60) return 'text-orange-400'; return 'text-red-400'; }
    if (p === 'WR') { if (v < 4.38) return 'text-emerald-400 font-bold'; if (v < 4.47) return 'text-yellow-400'; if (v < 4.56) return 'text-orange-400'; return 'text-red-400'; }
    if (p === 'TE') { if (v < 4.50) return 'text-emerald-400 font-bold'; if (v < 4.62) return 'text-yellow-400'; if (v < 4.75) return 'text-orange-400'; return 'text-red-400'; }
    if (p === 'QB') { if (v < 4.65) return 'text-emerald-400 font-bold'; if (v < 4.78) return 'text-yellow-400'; return 'text-orange-400'; }
    return 'text-foreground/70';
}

function getSpeedScoreColor(v: number, pos: string): string {
    const p = pos.toUpperCase();
    if (p === 'RB') { if (v >= 110) return 'text-emerald-400 font-bold'; if (v >= 100) return 'text-yellow-400'; if (v >= 90) return 'text-foreground/70'; return 'text-red-400'; }
    if (p === 'WR') { if (v >= 105) return 'text-emerald-400 font-bold'; if (v >= 95)  return 'text-yellow-400'; if (v >= 85) return 'text-foreground/70'; return 'text-red-400'; }
    if (p === 'TE') { if (v >= 98)  return 'text-emerald-400 font-bold'; if (v >= 88)  return 'text-yellow-400'; if (v >= 78) return 'text-foreground/70'; return 'text-red-400'; }
    if (p === 'QB') { if (v >= 100) return 'text-emerald-400 font-bold'; if (v >= 88)  return 'text-yellow-400'; return 'text-foreground/70'; }
    return 'text-foreground/70';
}

function getArmColor(v: number, pos: string): string {
    const p = pos.toUpperCase();
    if (p === 'QB') { if (v >= 32.5) return 'text-emerald-400 font-bold'; if (v >= 31.0) return 'text-foreground/80'; return 'text-red-400'; }
    if (p === 'WR') { if (v >= 33.0) return 'text-emerald-400 font-bold'; if (v >= 31.0) return 'text-foreground/80'; return 'text-orange-400'; }
    if (p === 'RB') { if (v >= 32.0) return 'text-emerald-400 font-bold'; if (v >= 30.5) return 'text-foreground/80'; return 'text-orange-400'; }
    if (p === 'TE') { if (v >= 34.0) return 'text-emerald-400 font-bold'; if (v >= 32.5) return 'text-foreground/80'; return 'text-red-400'; }
    return 'text-foreground/80';
}

function sourceRankColor(v: number | null | undefined): string {
    if (!v) return 'text-muted-foreground/25';
    if (v <= 5)  return 'text-emerald-400 font-extrabold';
    if (v <= 12) return 'text-sky-400 font-bold';
    if (v <= 24) return 'text-yellow-400 font-bold';
    if (v <= 36) return 'text-orange-400';
    return 'text-muted-foreground/45';
}

function getHandColor(v: number, pos: string): string {
    const p = pos.toUpperCase();
    if (p === 'QB') { if (v >= 9.5)  return 'text-emerald-400 font-bold'; if (v >= 9.0) return 'text-foreground/80'; return 'text-red-400'; }
    if (p === 'RB') { if (v >= 9.75) return 'text-emerald-400 font-bold'; if (v >= 9.0) return 'text-foreground/80'; return 'text-orange-400'; }
    if (p === 'WR') { if (v >= 9.75) return 'text-emerald-400 font-bold'; if (v >= 9.0) return 'text-foreground/80'; return 'text-orange-400'; }
    if (p === 'TE') { if (v >= 10.0) return 'text-emerald-400 font-bold'; if (v >= 9.5) return 'text-foreground/80'; return 'text-orange-400'; }
    return 'text-foreground/80';
}

function StatVal({ val, highlight }: { val: string | number | null | undefined; highlight?: string }) {
    const display = val != null && val !== '' ? String(val) : '—';
    const empty   = display === '—';
    return (
        <span className={`font-[var(--font-jetbrains),monospace] font-bold text-[13px] ${empty ? 'text-muted-foreground/25' : (highlight || 'text-foreground/75')}`}>
            {display}
        </span>
    );
}

function RecruitStars({ stars }: { stars: number | null | undefined }) {
    if (!stars) return <StatVal val={null} />;
    const color = stars >= 5 ? 'text-yellow-400' : stars >= 4 ? 'text-yellow-300/80' : 'text-muted-foreground/50';
    return <span className={`text-[13px] font-bold ${color}`}>{'★'.repeat(stars)}</span>;
}

function PlayerMiniCardInner({ player, ranking, period, index, positionFilter = 'ALL', format = 'SF', dataset = 'snapshot' }: PlayerMiniCardProps) {
    const router = useRouter();
    const p = player as any;
    const positionColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';

    const rookieRank = ranking?.rank_overall ?? (index + 1);
    const tier       = getTier(rookieRank);
    const rankColor  = getRankColor(rookieRank);
    const schoolDisplay = p.school || '';

    const ht        = player.height_inches ? formatHeight(player.height_inches) : '—';
    const wt        = player.weight_lbs    ? `${player.weight_lbs}lb`           : '—';
    const fortyYard = p.forty_yard as number | null | undefined;

    const colDefs           = getColDefs(dataset, positionFilter);
    const gridTemplate      = getGridTemplate(dataset, positionFilter);
    const showPickInIdentity = pickInIdentity(dataset);

    // Computed career stats used by position-specific columns
    const compPct   = p.career_pass_att > 0  ? ((p.career_completions  / p.career_pass_att)  * 100).toFixed(1) + '%' : null;
    const ypa       = p.career_pass_att > 0  ? (p.career_pass_yards    / p.career_pass_att).toFixed(1)              : null;
    const scrimYpg  = p.career_games_cs > 0  ? (p.career_scrim_yards   / p.career_games_cs).toFixed(1)              : null;
    const domPct    = p.best_dominator != null ? Number(p.best_dominator).toFixed(1) + '%'                           : null;

    function renderCell(col: ColDef) {
        switch (col.key) {

            // ── Individual sortable measurable columns ─────────────────────────
            case 'hw':
                return (
                    <div className="flex flex-col items-center leading-tight">
                        <span className="font-[var(--font-jetbrains),monospace] font-bold text-[13px] text-foreground/80">{ht}</span>
                        <span className="font-[var(--font-jetbrains),monospace] text-[10px] text-muted-foreground/50">{wt}</span>
                    </div>
                );

            case 'forty':
                return fortyYard
                    ? <span className={`font-[var(--font-jetbrains),monospace] font-bold text-[13px] ${getFortyColor(fortyYard, player.position)}`}>{fortyYard.toFixed(2)}s</span>
                    : <StatVal val={null} />;

            case 'spd': {
                const ss = p.speed_score as number | null | undefined;
                return ss
                    ? <span className={`font-[var(--font-jetbrains),monospace] font-bold text-[13px] ${getSpeedScoreColor(Number(ss), player.position)}`}>{Math.round(Number(ss))}</span>
                    : <StatVal val={null} />;
            }

            case 'ras':
                return <span className={`font-[var(--font-jetbrains),monospace] font-bold text-[13px] ${p.ras ? 'text-violet-400' : 'text-muted-foreground/25'}`}>{p.ras ? Number(p.ras).toFixed(1) : '—'}</span>;

            case 'arm': {
                const av = p.arm_length as number | null | undefined;
                return av
                    ? <span className={`font-[var(--font-jetbrains),monospace] font-bold text-[13px] ${getArmColor(Number(av), player.position)}`}>{Number(av).toFixed(1)}"</span>
                    : <StatVal val={null} />;
            }

            case 'hand': {
                const hv = p.hand_size as number | null | undefined;
                return hv
                    ? <span className={`font-[var(--font-jetbrains),monospace] font-bold text-[13px] ${getHandColor(Number(hv), player.position)}`}>{Number(hv).toFixed(1)}"</span>
                    : <StatVal val={null} />;
            }

            case 'stars':
                return <RecruitStars stars={p.recruiting_stars} />;

            // ── Legacy compact measurables (fallback) ─────────────────────────
            case 'measurables':
                return (
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-[var(--font-jetbrains),monospace] text-foreground/80 truncate">
                        <span className="shrink-0">{ht} / {wt}</span>
                        {fortyYard ? <span className={`shrink-0 ${getFortyColor(fortyYard, player.position)}`}>· {fortyYard.toFixed(2)}s</span> : null}
                        {p.ras      ? <span className="text-violet-400 shrink-0">· RAS {Number(p.ras).toFixed(1)}</span> : null}
                        {p.speed_score && !p.ras ? <span className="text-sky-400/80 shrink-0 text-[10px]">· Spd {Number(p.speed_score).toFixed(0)}</span> : null}
                    </div>
                );

            // ── Ranking sources ────────────────────────────────────────────────
            case 'fp':  { const v = format === 'SF' ? (p as any).fantasypros_sf_rank : p.fantasypros_rank; return <StatVal val={v} highlight={sourceRankColor(v)} />; }
            case 'ktc': { const v = format === '1QB' ? (p as any).ktc_1qb_rank : (p as any).ktc_rank; return <StatVal val={v} highlight={sourceRankColor(v)} />; }
            case 'fc':  { const v = format === 'SF'  ? (p as any).fantasycalc_sf_rank : (p as any).fantasycalc_rank; return <StatVal val={v} highlight={sourceRankColor(v)} />; }
            case 'dn':  { const v = format === 'SF' ? (p as any).dynasty_nerds_sf_rank : p.dynasty_nerds_rank; return <StatVal val={v} highlight={sourceRankColor(v)} />; }
            case 'tfc': { const v = (p as any).tyler_ff_sf_rank; return <StatVal val={v} highlight={sourceRankColor(v)} />; }
            case 'pick':
            case 'adp': {
                if (draftStatus.type === 'drafted') {
                    return (
                        <span className="inline-flex items-center gap-1">
                            <NflTeamLogo abbr={draftStatus.team} size={22} />
                            <span className="font-[var(--font-jetbrains),monospace] font-bold text-[14px] text-yellow-300/90">{draftStatus.slot}</span>
                        </span>
                    );
                }
                if (draftStatus.type === 'udfa') {
                    return (
                        <span className="inline-flex items-center gap-1">
                            <NflTeamLogo abbr={draftStatus.team} size={22} />
                            <span className="font-[var(--font-jetbrains),monospace] font-bold text-[13px] text-sky-300/80">UDFA</span>
                        </span>
                    );
                }
                return <span className="font-[var(--font-jetbrains),monospace] text-[11px] text-muted-foreground/25">—</span>;
            }

            // ── Tier badge ────────────────────────────────────────────────────
            case 'tier':
                return (ranking?.num_sources ?? 0) < 1 ? (
                    <span
                        title={`Not yet ranked by any tracked sources — check back after more rankings drop`}
                        style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' }}
                        className={cn('border', 'bg-slate-500/10 text-slate-400/70 border-slate-500/25')}
                    >⚠ Limited</span>
                ) : (
                    <span
                        style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em' }}
                        className={cn('border', tier.color)}
                    >{tier.label}</span>
                );

            // ── Position-specific stats ────────────────────────────────────────
            case 'career_pass_yards': return <StatVal val={p.career_pass_yards > 0 ? Number(p.career_pass_yards).toLocaleString() : null} />;
            case 'best_pass_ypg':     return <StatVal val={p.best_pass_ypg != null ? `${Number(p.best_pass_ypg).toFixed(1)}` : null} highlight="text-sky-400 font-bold" />;
            case 'comp_pct':          return <StatVal val={compPct} />;
            case 'ypa':               return <StatVal val={ypa} />;
            case 'best_ypr':          return <StatVal val={p.best_ypr != null ? Number(p.best_ypr).toFixed(1) : null} highlight={p.best_ypr >= 16 ? 'text-emerald-400 font-bold' : p.best_ypr >= 12 ? 'text-sky-400' : undefined} />;
            case 'best_ypc':          return <StatVal val={p.best_ypc != null ? Number(p.best_ypc).toFixed(2) : null} highlight={p.best_ypc >= 6.5 ? 'text-emerald-400 font-bold' : p.best_ypc >= 5.5 ? 'text-sky-400' : undefined} />;
            case 'breakout_age':      return <StatVal val={p.breakout_age ? Number(p.breakout_age).toFixed(1) : null} highlight={p.breakout_age && p.breakout_age <= 19 ? 'text-emerald-400 font-extrabold' : p.breakout_age <= 20 ? 'text-sky-400 font-bold' : undefined} />;
            case 'best_dominator':    return <StatVal val={domPct} highlight={p.best_dominator >= 30 ? 'text-emerald-400 font-bold' : p.best_dominator >= 20 ? 'text-sky-400' : undefined} />;
            case 'scrim_ypg':         return <StatVal val={scrimYpg} />;
            case 'recruiting_stars':  return <RecruitStars stars={p.recruiting_stars} />;

            // ── Traits — combine drills ────────────────────────────────────────
            case 'vert':    return <StatVal val={p.vertical_jump != null ? `${Number(p.vertical_jump).toFixed(1)}"` : null} />;
            case 'broad':   return <StatVal val={p.broad_jump != null ? `${Number(p.broad_jump)}"` : null} />;
            case 'cone':    return <StatVal val={p.three_cone != null ? `${Number(p.three_cone).toFixed(2)}s` : null} />;
            case 'shuttle': return <StatVal val={p.shuttle != null ? `${Number(p.shuttle).toFixed(2)}s` : null} />;
            case 'bench':   return <StatVal val={p.bench_press != null ? String(p.bench_press) : null} />;

            // ── Production — career college totals ─────────────────────────────
            case 'gp':                 return <StatVal val={p.career_games_cs > 0 ? String(p.career_games_cs) : null} />;
            case 'career_pass_tds':    return <StatVal val={p.career_pass_tds > 0 ? String(p.career_pass_tds) : null} />;
            case 'career_rush_yards':  return <StatVal val={p.career_rush_yards > 0 ? Number(p.career_rush_yards).toLocaleString() : null} />;
            case 'career_rush_tds':    return <StatVal val={p.career_rush_tds > 0 ? String(p.career_rush_tds) : null} />;
            case 'career_rec_yards':   return <StatVal val={p.career_rec_yards > 0 ? Number(p.career_rec_yards).toLocaleString() : null} />;
            case 'career_rec_tds':     return <StatVal val={p.career_rec_tds > 0 ? String(p.career_rec_tds) : null} />;
            case 'career_receptions':  return <StatVal val={p.career_receptions > 0 ? String(p.career_receptions) : null} />;

            // ── Rankings — consensus average + movement ────────────────────────
            case 'avg_rank': {
                const v = format === '1QB' ? p.avg_rank_1qb : p.avg_rank;
                return <StatVal val={v != null ? Number(v).toFixed(1) : null} highlight={sourceRankColor(v)} />;
            }
            case 'mv7': {
                const v = format === '1QB' ? p.rank_change_7d_1qb : p.rank_change_7d;
                if (v == null || v === 0) return <StatVal val={null} />;
                const up = v > 0;
                return <span className={`font-[var(--font-jetbrains),monospace] font-bold text-[13px] ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '▲' : '▼'}{Math.abs(v)}</span>;
            }

            // ── Seasons — per-season production + breakout age ─────────────────
            case 's1':
            case 's2':
            case 's3':
            case 's4': {
                const n = col.key.slice(1);
                const yr = p[`s${n}_yr`];
                const stat = player.position === 'QB' ? p[`s${n}_pass`] : p[`s${n}_scrim`];
                if (!yr || stat == null || stat === 0) return <StatVal val={null} />;
                return (
                    <div className="flex flex-col items-center leading-tight">
                        <span className="font-[var(--font-jetbrains),monospace] font-bold text-[13px] text-foreground/80">{Number(stat).toLocaleString()}</span>
                        <span className="font-[var(--font-jetbrains),monospace] text-[10px] text-muted-foreground/50">{yr}</span>
                    </div>
                );
            }

            // ── Advanced — WR receiving metrics (wr_advanced_career) ───────────
            case 'wr_yprr': {
                const v = p.wr_yprr;
                return <StatVal val={v != null ? Number(v).toFixed(2) : null} highlight={v != null && v >= 2.5 ? 'text-emerald-400 font-bold' : v != null && v >= 1.8 ? 'text-sky-400' : undefined} />;
            }
            case 'wr_adot':
                return <StatVal val={p.wr_adot != null ? Number(p.wr_adot).toFixed(1) : null} />;
            case 'wr_drop': {
                const v = p.wr_drop_rate;
                return <StatVal val={v != null ? (Number(v) * 100).toFixed(1) + '%' : null} highlight={v != null && v < 0.03 ? 'text-emerald-400 font-bold' : v != null && v > 0.07 ? 'text-red-400' : undefined} />;
            }
            case 'wr_contested': {
                const v = p.wr_contested;
                return <StatVal val={v != null ? (Number(v) * 100).toFixed(1) + '%' : null} highlight={v != null && v >= 0.6 ? 'text-emerald-400 font-bold' : undefined} />;
            }
            case 'wr_yac_per_rec':
                return <StatVal val={p.wr_yac_per_rec != null ? Number(p.wr_yac_per_rec).toFixed(1) : null} />;
            case 'wr_slot':
                return <StatVal val={p.wr_slot_rate != null ? (Number(p.wr_slot_rate) * 100).toFixed(0) + '%' : null} />;
            case 'wr_catch': {
                const v = p.wr_catch_rate;
                return <StatVal val={v != null ? (Number(v) * 100).toFixed(1) + '%' : null} highlight={v != null && v >= 0.72 ? 'text-emerald-400 font-bold' : v != null && v >= 0.62 ? 'text-sky-400' : undefined} />;
            }
            case 'wr_mtf': {
                const v = p.wr_mtf;
                return <StatVal val={v != null ? (Number(v) * 100).toFixed(1) + '%' : null} highlight={v != null && v >= 0.15 ? 'text-emerald-400 font-bold' : undefined} />;
            }
            case 'wr_tgt': {
                const v = p.wr_target_rate;
                return <StatVal val={v != null ? (Number(v) * 100).toFixed(1) + '%' : null} highlight={v != null && v >= 0.25 ? 'text-emerald-400 font-bold' : v != null && v >= 0.2 ? 'text-sky-400' : undefined} />;
            }
            case 'wr_open': {
                const v = p.wr_open_rate;
                return <StatVal val={v != null ? (Number(v) * 100).toFixed(1) + '%' : null} highlight={v != null && v >= 0.8 ? 'text-emerald-400 font-bold' : undefined} />;
            }
            case 'wr_zyprr': {
                const v = p.wr_zone_yprr;
                return <StatVal val={v != null ? Number(v).toFixed(2) : null} highlight={v != null && v >= 2.5 ? 'text-emerald-400 font-bold' : v != null && v >= 1.8 ? 'text-sky-400' : undefined} />;
            }
            case 'wr_myprr': {
                const v = p.wr_man_yprr;
                return <StatVal val={v != null ? Number(v).toFixed(2) : null} highlight={v != null && v >= 2.5 ? 'text-emerald-400 font-bold' : v != null && v >= 1.8 ? 'text-sky-400' : undefined} />;
            }

            // ── Advanced — RB rushing metrics (rb_advanced_career) ─────────────
            case 'rb_yac':
                return <StatVal val={p.rb_yds_after_contact != null ? Number(p.rb_yds_after_contact).toFixed(1) : null} />;
            case 'rb_mtf': {
                const v = p.rb_mtf_pct;
                return <StatVal val={v != null ? Number(v).toFixed(1) + '%' : null} highlight={v != null && v >= 35 ? 'text-emerald-400 font-bold' : v != null && v >= 25 ? 'text-sky-400' : undefined} />;
            }
            case 'rb_yprr':
                return <StatVal val={p.rb_yprr != null ? Number(p.rb_yprr).toFixed(2) : null} />;
            case 'rb_brk':
                return <StatVal val={p.rb_breakaway_rate != null ? Number(p.rb_breakaway_rate).toFixed(1) + '%' : null} />;
            case 'rb_exp':
                return <StatVal val={p.rb_explosive_rate != null ? Number(p.rb_explosive_rate).toFixed(1) + '%' : null} />;
            case 'rb_fd':
                return <StatVal val={p.rb_first_down_rate != null ? Number(p.rb_first_down_rate).toFixed(1) + '%' : null} />;
            case 'rb_ayprr': {
                const v = p.rb_ayprr;
                return <StatVal val={v != null ? Number(v).toFixed(2) : null} highlight={v != null && v >= 2 ? 'text-emerald-400 font-bold' : v != null && v >= 1.4 ? 'text-sky-400' : undefined} />;
            }
            case 'rb_tgt':
                return <StatVal val={p.rb_target_rate != null ? Number(p.rb_target_rate).toFixed(1) + '%' : null} highlight={p.rb_target_rate != null && p.rb_target_rate >= 20 ? 'text-emerald-400 font-bold' : undefined} />;
            case 'rb_drop': {
                const v = p.rb_drop_rate;
                return <StatVal val={v != null ? Number(v).toFixed(1) + '%' : null} highlight={v != null && v < 3 ? 'text-emerald-400 font-bold' : v != null && v > 9 ? 'text-red-400' : undefined} />;
            }
            case 'rb_fum': {
                const v = p.rb_fumble_rate;
                return <StatVal val={v != null ? Number(v).toFixed(1) + '%' : null} highlight={v != null && v <= 0.5 ? 'text-emerald-400 font-bold' : v != null && v > 1.5 ? 'text-red-400' : undefined} />;
            }
            case 'rb_gap':
                return <StatVal val={p.rb_gap_rate != null ? Number(p.rb_gap_rate).toFixed(1) + '%' : null} />;
            case 'rb_zone':
                return <StatVal val={p.rb_zone_rate != null ? Number(p.rb_zone_rate).toFixed(1) + '%' : null} />;

            // ── Scouting — film grades + historical comps ──────────────────────
            case 'jf_grade': {
                const v = p.jf_grade;
                return <StatVal val={v != null ? Number(v).toFixed(1) : null} highlight={v != null && v >= 8 ? 'text-emerald-400 font-bold' : v != null && v >= 6.5 ? 'text-sky-400' : undefined} />;
            }
            case 'jf_round':
                return <StatVal val={p.jf_round_grade != null ? String(p.jf_round_grade) : null} />;
            case 'jf_fit':
                return p.jf_pos_fit
                    ? <span className="text-[11px] font-semibold text-foreground/70 text-center leading-tight">{p.jf_pos_fit}</span>
                    : <StatVal val={null} />;
            case 'jf_athletic': {
                const v = p.jf_athletic;
                return <StatVal val={v != null ? Number(v).toFixed(1) : null} highlight={v != null && v >= 8 ? 'text-emerald-400 font-bold' : undefined} />;
            }
            case 'jf_nfl_comp':
                return p.jf_nfl_comp
                    ? <span className="text-[11px] font-semibold text-foreground/70 text-center leading-tight truncate max-w-full px-1">{p.jf_nfl_comp}</span>
                    : <StatVal val={null} />;
            case 'hist_comp':
                return p.hist_comp_name
                    ? <span className="text-[11px] font-semibold text-foreground/70 text-center leading-tight truncate max-w-full px-1">{p.hist_comp_name}</span>
                    : <StatVal val={null} />;
            case 'hist_sim':
                return <StatVal val={p.hist_comp_sim != null ? Number(p.hist_comp_sim).toFixed(1) : null} />;

            default: return <StatVal val={null} />;
        }
    }

    const draftStatus = getDraftStatus(player);
    const isEven   = index % 2 === 0;

    return (
        <Link href={`/players/${player.slug}`} className="block group">
            <div
                className={cn(
                    'relative flex items-center px-4 py-3 transition-all duration-150 gap-3',
                    'border-b border-white/[0.04]',
                    'hover:bg-white/[0.03]',
                    isEven ? 'bg-transparent' : 'bg-white/[0.015]',
                )}
            >
                {/* Tier accent bar — absolutely positioned so it never shifts layout */}
                <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tier.border }} />

                {/* Sticky identity group: star + rank + compare + player (+ pick) */}
                <div
                    className={`sticky left-0 z-10 flex items-center self-stretch gap-1 sm:gap-2.5 pr-1 sm:pr-2 flex-shrink-0 min-w-0 ${showPickInIdentity ? 'lg:w-[416px]' : 'lg:w-[304px]'}`}
                >
                    {/* Watchlist star */}
                    <WatchlistButton playerSlug={player.slug} className="flex-shrink-0" />

                    {/* Rank number */}
                    <div className="w-7 sm:w-10 flex-shrink-0 flex items-center justify-center">
                        <span className={`text-sm sm:text-base font-[var(--font-jetbrains),monospace] leading-none ${rankColor}`}>{rookieRank}</span>
                    </div>

                    {/* Compare quick-launch */}
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/compare?a=${player.slug}`); }}
                        className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 rounded-md text-muted-foreground/25 hover:text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        aria-label={`Compare ${player.full_name}`}
                    >
                        <Scale className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>

                    {/* Player info — wrapped in hover card for quick stats preview */}
                    <HoverCard openDelay={200} closeDelay={80}>
                        <HoverCardTrigger asChild>
                            <div className="flex-1 min-w-0 lg:w-[224px] lg:min-w-[224px] lg:flex-none cursor-default">
                                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 overflow-hidden">
                                    <span className="font-bold text-[13px] sm:text-[15px] text-foreground group-hover:text-primary transition-colors leading-snug truncate">
                                        {player.full_name}
                                    </span>
                                    <span
                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 5px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: '0.03em' }}
                                        className={cn('border sm:px-[7px] sm:text-[10px]', positionColor)}
                                    >{player.position}</span>
                                </div>
                                <div className="flex items-center text-[10px] sm:text-[11px] text-muted-foreground/60 gap-1 sm:gap-1.5 leading-none">
                                    <span className="truncate">{schoolDisplay || 'School TBD'}</span>
                                    {player.age_at_draft && (
                                        <><span className="opacity-30 hidden sm:inline">·</span><span className="whitespace-nowrap hidden sm:inline">Age {player.age_at_draft}</span></>
                                    )}
                                    {(player.height_inches || player.weight_lbs) && (
                                        <><span className="opacity-30 hidden sm:inline">·</span><span className="whitespace-nowrap font-[var(--font-jetbrains),monospace] text-[10px] hidden sm:inline">{ht}{player.weight_lbs ? ` ${player.weight_lbs}` : ''}</span></>
                                    )}
                                </div>
                            </div>
                        </HoverCardTrigger>
                        <HoverCardContent side="right" align="start" className="w-64 p-0 overflow-hidden border-white/[0.08]">
                            {/* Mini player preview card */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]" style={{ background: 'var(--bg-elevated)' }}>
                                {(p.headshot_url || p.espn_college_id) ? (
                                    <img src={p.headshot_url || `https://a.espncdn.com/i/headshots/college-football/players/full/${p.espn_college_id}.png`} alt={player.full_name} className="w-10 h-12 rounded-lg object-cover object-top flex-shrink-0" decoding="async" />
                                ) : (
                                    <div className="w-10 h-12 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0 text-lg font-black text-muted-foreground/30">
                                        {player.position}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-sm text-foreground leading-tight truncate">{player.full_name}</div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', positionColor)}>{player.position}</span>
                                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border', tier.color)}>{tier.label}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground/50 mt-1 truncate">{schoolDisplay || 'School TBD'}</div>
                                    {/* Draft destination — prominent, in blank space under badges */}
                                    {draftStatus.type === 'drafted' && (
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <NflTeamLogo abbr={draftStatus.team} size={18} />
                                            <span className="text-[13px] font-bold font-[var(--font-jetbrains),monospace] text-yellow-300 leading-none">{draftStatus.team} {draftStatus.slot}</span>
                                        </div>
                                    )}
                                    {draftStatus.type === 'udfa' && (
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <NflTeamLogo abbr={draftStatus.team} size={18} />
                                            <span className="text-[13px] font-bold text-sky-300 leading-none">UDFA – {draftStatus.team}</span>
                                        </div>
                                    )}
                                    {draftStatus.type === 'undrafted' && (
                                        <div className="mt-2">
                                            <span className="text-[11px] font-semibold text-muted-foreground/40">Undrafted</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="px-4 py-3 space-y-2">
                                {/* Position-specific top stats */}
                                {player.position === 'RB' && [
                                    { label: 'Best YPC',   val: p.best_ypc    != null ? Number(p.best_ypc).toFixed(2)    : null },
                                    { label: 'Scrim/G',    val: scrimYpg },
                                    { label: 'Best DOM%',  val: p.best_dominator != null ? Number(p.best_dominator).toFixed(1) + '%' : null },
                                    { label: 'RAS',        val: p.ras  != null ? Number(p.ras).toFixed(1)  : null },
                                ].filter(s => s.val).map(s => (
                                    <div key={s.label} className="flex justify-between items-center">
                                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide font-semibold">{s.label}</span>
                                        <span className="text-xs font-[var(--font-jetbrains),monospace] font-bold text-foreground">{s.val}</span>
                                    </div>
                                ))}
                                {player.position === 'WR' && [
                                    { label: 'Best YDS/REC', val: p.best_ypr   != null ? Number(p.best_ypr).toFixed(1)   : null },
                                    { label: 'Best DOM%',    val: p.best_dominator != null ? Number(p.best_dominator).toFixed(1) + '%' : null },
                                    { label: 'RAS',          val: p.ras  != null ? Number(p.ras).toFixed(1)  : null },
                                    { label: 'Speed Score',  val: p.speed_score != null ? Math.round(Number(p.speed_score)).toString() : null },
                                ].filter(s => s.val).map(s => (
                                    <div key={s.label} className="flex justify-between items-center">
                                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide font-semibold">{s.label}</span>
                                        <span className="text-xs font-[var(--font-jetbrains),monospace] font-bold text-foreground">{s.val}</span>
                                    </div>
                                ))}
                                {player.position === 'TE' && [
                                    { label: 'Best YDS/REC', val: p.best_ypr   != null ? Number(p.best_ypr).toFixed(1)   : null },
                                    { label: 'Best DOM%',    val: p.best_dominator != null ? Number(p.best_dominator).toFixed(1) + '%' : null },
                                    { label: 'RAS',          val: p.ras  != null ? Number(p.ras).toFixed(1)  : null },
                                ].filter(s => s.val).map(s => (
                                    <div key={s.label} className="flex justify-between items-center">
                                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide font-semibold">{s.label}</span>
                                        <span className="text-xs font-[var(--font-jetbrains),monospace] font-bold text-foreground">{s.val}</span>
                                    </div>
                                ))}
                                {player.position === 'QB' && [
                                    { label: 'Comp %',   val: compPct },
                                    { label: 'YPA',      val: ypa     },
                                    { label: 'Best Pass/G', val: p.best_pass_ypg != null ? Number(p.best_pass_ypg).toFixed(1) : null },
                                    { label: 'RAS',      val: p.ras   != null ? Number(p.ras).toFixed(1) : null },
                                ].filter(s => s.val).map(s => (
                                    <div key={s.label} className="flex justify-between items-center">
                                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide font-semibold">{s.label}</span>
                                        <span className="text-xs font-[var(--font-jetbrains),monospace] font-bold text-foreground">{s.val}</span>
                                    </div>
                                ))}
                            </div>
                        </HoverCardContent>
                    </HoverCard>

                    {/* Pick — pinned into identity for Traits / Production datasets */}
                    {showPickInIdentity && (
                        <div className="hidden lg:flex w-[52px] flex-shrink-0 items-center justify-center self-stretch border-l border-white/[0.05]">
                            {renderCell({ key: 'pick', label: 'Pick' })}
                        </div>
                    )}
                </div>{/* end sticky identity group */}

                {/* 3. Dynamic stat columns — CSS grid */}
                <div
                    className="hidden lg:grid flex-1 min-w-0"
                    style={{ gridTemplateColumns: gridTemplate }}
                >
                    {colDefs.map((col, i) => (
                        <div
                            key={col.key}
                            className={`flex items-center justify-center text-center min-h-[38px] overflow-hidden ${i === 0 ? 'border-l border-white/[0.05]' : ''} ${col.key === 'fp' || col.key === 'tier' ? 'border-l border-white/[0.05]' : ''}`}
                        >
                            {renderCell(col)}
                        </div>
                    ))}
                </div>

            </div>
        </Link>
    );
}

export const PlayerMiniCard = React.memo(PlayerMiniCardInner);
