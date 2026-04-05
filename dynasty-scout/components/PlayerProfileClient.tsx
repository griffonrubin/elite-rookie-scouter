'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { StatsTable } from '@/components/StatsTable';
import { StatTrendChart } from '@/components/StatTrendChart';
import { PercentileChart } from '@/components/PercentileChart';
import { SourceRankings } from '@/components/SourceRankings';
import { AthleticsCard } from '@/components/AthleticsCard';
import { DominatorChart } from '@/components/DominatorChart';
import { DonutSplit } from '@/components/DonutSplit';
import { SeasonRankingsChart, type RankingMetric } from '@/components/SeasonRankingsChart';
import { AdvancedStatsTable } from '@/components/AdvancedStatsTable';
import { RBProductionTable } from '@/components/RBProductionTable';
import { RBAdvancedRatesTable } from '@/components/RBAdvancedRatesTable';
import { WRTargetDepthBar } from '@/components/WRTargetDepthBar';
import { WRAdvancedRatesTable } from '@/components/WRAdvancedRatesTable';
import { ButterflyChart, type ButterflyRow } from '@/components/ButterflyChart';
import { FilmGradesCard } from '@/components/FilmGradesCard';
import { RecentTrades } from '@/components/RecentTrades';
import { POSITION_HEADLINE_STATS } from '@/lib/constants';
import { getArchetypes } from '@/lib/archetypes';
import { GraduationCap, Calendar, Ruler, Weight, Star, Newspaper, BarChart2, ExternalLink, Scale, AlertTriangle, ChevronLeft, ChevronRight, Share2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WatchlistButton } from '@/components/WatchlistButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AppHeader } from '@/components/AppHeader';
import type { CollegeStats, JFosterGrades, Measurables, NflScoutProfile, Ranking } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDraftSlot(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick = rank - (round - 1) * 12;
    return `${round}.${String(pick).padStart(2, '0')}`;
}

function formatHeight(inches: number) {
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function pctRank(val: number, arr: number[]): number {
    if (arr.length === 0) return 50;
    const sorted = [...arr].sort((a, b) => a - b);
    return Math.round((sorted.filter(v => v < val).length / sorted.length) * 100);
}

function timeAgo(dateStr: string) {
    if (!dateStr) return '';
    try {
        const diff = Date.now() - new Date(dateStr).getTime();
        const days = Math.floor(diff / 86400000);
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        if (days < 30) return `${Math.floor(days / 7)}w ago`;
        return `${Math.floor(days / 30)}mo ago`;
    } catch { return ''; }
}

const POS_STYLES: Record<string, string> = {
    QB: 'bg-red-500/15 text-red-400 border-red-500/35',
    RB: 'bg-sky-400/15 text-sky-400 border-sky-400/35',
    WR: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/35',
    TE: 'bg-violet-400/15 text-violet-400 border-violet-400/35',
};

const POS_RAW: Record<string, string> = {
    QB: '#ef4444', RB: '#38bdf8', WR: '#34d399', TE: '#a78bfa',
};

function getTierInfo(rank: number): { label: string; color: string; accent: string } {
    if (rank <= 5)  return { label: 'S Tier', color: 'bg-orange-500/15 text-orange-300 border-orange-500/35', accent: '#f97316' };
    if (rank <= 12) return { label: 'A Tier', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35', accent: '#22c55e' };
    if (rank <= 24) return { label: 'B Tier', color: 'bg-sky-400/15 text-sky-300 border-sky-400/35', accent: '#38bdf8' };
    if (rank <= 48) return { label: 'C Tier', color: 'bg-violet-500/15 text-violet-300 border-violet-500/35', accent: '#a78bfa' };
    return { label: 'Depth', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', accent: '#475569' };
}

// ─── Local UI components ──────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-4 rounded-full bg-primary/60" />
            <span className="text-sm font-black tracking-wider uppercase text-muted-foreground/60 whitespace-nowrap">{label}</span>
            <div className="flex-1 h-px bg-white/[0.04]" />
        </div>
    );
}

function AnalyticCard({ label, value, pct }: { label: string; value: string; pct: number }) {
    const p = Math.min(100, Math.max(0, pct));
    const color = p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-sky-400' : p >= 40 ? 'text-yellow-400' : p >= 20 ? 'text-orange-400' : 'text-red-400';
    const bar   = p >= 80 ? 'bg-emerald-400' : p >= 60 ? 'bg-sky-400'    : p >= 40 ? 'bg-yellow-400'   : p >= 20 ? 'bg-orange-400'   : 'bg-red-400';
    return (
        <div className="rounded-xl px-3.5 py-3.5 text-center min-w-0 border border-white/[0.06]" style={{ background: 'var(--bg-elevated)' }}>
            <div className={`text-lg font-black font-[var(--font-jetbrains),monospace] leading-none ${color}`}>{value || '—'}</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/50 mt-1.5 leading-tight">{label}</div>
            <div className="mt-2.5 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${bar} opacity-60`} style={{ width: `${p}%` }} />
            </div>
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    player: any;
    stats: CollegeStats[];
    rankings: Ranking[];
    measurables: Measurables | null;
    speedScore: number | null;
    news: any[];
    trustIndicator: string;
    peerCareer: any[];
    peerAdvanced: any[];
    historicalComps: any[];
    epaStats: any[];
    dominatorStats: any[];
    prevPlayer: { slug: string; full_name: string; position: string } | null;
    nextPlayer: { slug: string; full_name: string; position: string } | null;
    wrAdvanced: any | null;
    peerWrAdv: any[];
    highSchool: any | null;
    jfosterData: JFosterGrades | null;
    nflScout: NflScoutProfile | null;
    rbAdvanced: any | null;
    peerRBAdv: any[];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlayerProfileClient({
    player, stats, rankings, measurables, speedScore, news, trustIndicator,
    peerCareer, peerAdvanced, historicalComps, epaStats, dominatorStats,
    prevPlayer, nextPlayer, wrAdvanced, peerWrAdv, highSchool, jfosterData, nflScout,
    rbAdvanced, peerRBAdv,
}: Props) {
    const pos = player.position as string;
    const posStyle = POS_STYLES[pos] || 'bg-gray-500/20 text-gray-400 border-gray-500/40';

    const posColor = POS_RAW[pos] || '#a78bfa';
    const avatarBg = `linear-gradient(135deg, ${posColor}18, ${posColor}08)`;

    const headshotUrl: string | null =
        player.headshot_url ??
        (player.espn_college_id ? `https://a.espncdn.com/i/headshots/college-football/players/full/${player.espn_college_id}.png` : null);

    const classRank: number | null = player.consensus_rank && player.consensus_rank > 0 ? player.consensus_rank : null;
    const projRank: number | null = player.ktc_rank ?? player.consensus_rank ?? player.best_rank ?? null;
    const draftSlot = projRank ? getDraftSlot(projRank) : null;
    const tier = classRank ? getTierInfo(classRank) : { label: 'Unranked', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40', accent: '#6b7280' };

    const headlines = POSITION_HEADLINE_STATS[pos] || [];
    // ── Share ──────────────────────────────────────────────────────────────
    const [copied, setCopied] = useState(false);
    const handleShare = useCallback(() => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            // fallback for older browsers
            const el = document.createElement('textarea');
            el.value = url;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);


    // ── Derived career stats ───────────────────────────────────────────────
    const statsWithGames = stats.filter(row => row.games_played && row.games_played > 0);
    const careerGames = stats.reduce((sum, row) => sum + (row.games_played ?? 0), 0);
    const careerRushYards = stats.reduce((sum, row) => sum + (row.rush_yards ?? 0), 0);
    const careerRushAttempts = stats.reduce((sum, row) => sum + (row.rush_attempts ?? 0), 0);
    const careerRecYards = stats.reduce((sum, row) => sum + (row.rec_yards ?? 0), 0);
    const careerReceptions = stats.reduce((sum, row) => sum + (row.receptions ?? 0), 0);
    const statsWithPassAtt = stats.filter(row => (row.pass_attempts ?? 0) > 0);
    const careerPassYards = statsWithPassAtt.reduce((sum, row) => sum + (row.pass_yards ?? 0), 0);
    const careerPassAttempts = statsWithPassAtt.reduce((sum, row) => sum + (row.pass_attempts ?? 0), 0);
    const careerCompletions = statsWithPassAtt.reduce((sum, row) => sum + (row.completions ?? 0), 0);
    const careerPassTds = statsWithPassAtt.reduce((sum, row) => sum + (row.pass_tds ?? 0), 0);
    const careerRushTds = stats.reduce((sum, row) => sum + (row.rush_tds ?? 0), 0);
    const careerRecTds = stats.reduce((sum, row) => sum + (row.rec_tds ?? 0), 0);
    const careerTargetsAgg = stats.reduce((sum, row) => sum + (row.targets ?? 0), 0);

    const attPerGame = careerGames > 0 ? (careerRushAttempts / careerGames).toFixed(1) : '—';
    const recPerGame = careerGames > 0 ? (careerReceptions / careerGames).toFixed(1) : '—';
    const tgtPerGame = careerGames > 0 && careerTargetsAgg > 0 ? (careerTargetsAgg / careerGames).toFixed(1) : '—';
    const compPct = careerPassAttempts > 0 ? Math.round((careerCompletions / careerPassAttempts) * 100) + '%' : '—';
    const ypa = careerPassAttempts > 0 ? (careerPassYards / careerPassAttempts).toFixed(1) : '—';
    const ypc = careerRushAttempts > 0 ? (careerRushYards / careerRushAttempts).toFixed(1) : '—';
    const ypr = careerReceptions > 0 ? (careerRecYards / careerReceptions).toFixed(1) : '—';
    const totalTds = careerRushTds + careerRecTds + careerPassTds;
    const totalScrimmageYards = careerRushYards + careerRecYards;
    const rushYpgNum = careerGames > 0 ? (careerRushYards / careerGames).toFixed(1) : null;
    const scrimYpgNum = careerGames > 0 ? ((careerRushYards + careerRecYards) / careerGames).toFixed(1) : '—';
    const ydsPerGameNum = careerGames > 0 ? (careerRecYards / careerGames).toFixed(1) : null;

    const recentStat: any = stats[0] ? { ...stats[0] } : null;
    if (recentStat) {
        recentStat.att_per_game = attPerGame;
        recentStat.tgt_per_game = tgtPerGame;
        recentStat.rec_per_game = recPerGame;
        recentStat.completion_pct = compPct;
        recentStat.yards_per_attempt = ypa;
        recentStat.yards_per_carry = ypc !== '—' ? ypc : null;
        recentStat.rush_yards_per_game = rushYpgNum !== null ? rushYpgNum : '—';
        recentStat.yds_per_game = ydsPerGameNum !== null ? ydsPerGameNum : '—';
    }

    const hasAdvancedMetrics = totalScrimmageYards > 0 || totalTds > 0 || careerPassYards > 0;

    // ── Archetype tags ─────────────────────────────────────────────────────
    const bestYpc = stats.reduce((best, row) => {
        if (row.rush_attempts && row.rush_attempts > 0 && row.rush_yards) {
            const v = row.rush_yards / row.rush_attempts;
            return v > best ? v : best;
        }
        return best;
    }, 0) || undefined;

    const bestYpr = stats.reduce((best, row) => {
        if (row.receptions && row.receptions > 0 && row.rec_yards) {
            const v = row.rec_yards / row.receptions;
            return v > best ? v : best;
        }
        return best;
    }, 0) || undefined;

    const bestPassYpg = stats.reduce((best, row) => {
        if (row.games_played && row.games_played > 0 && row.pass_yards) {
            const v = row.pass_yards / row.games_played;
            return v > best ? v : best;
        }
        return best;
    }, 0) || undefined;

    const archetypePlayer = {
        position: pos,
        forty_yard: measurables?.forty_yard ?? null,
        speed_score: speedScore,
        weight_lbs: player.weight_lbs,
        height_inches: player.height_inches,
        ras: measurables?.ras ?? null,
        best_ypc: bestYpc,
        best_ypr: bestYpr,
        career_receptions: careerReceptions || undefined,
        career_rush_attempts: careerRushAttempts || undefined,
        career_games: careerGames || undefined,
        career_rec_yards: careerRecYards || undefined,
        career_rush_yards: careerRushYards || undefined,
        career_pass_yards: careerPassYards || undefined,
        best_pass_ypg: bestPassYpg,
        career_ypa: careerPassAttempts > 0 ? careerPassYards / careerPassAttempts : undefined,
        career_comp_pct: careerPassAttempts > 0 ? (careerCompletions / careerPassAttempts) * 100 : undefined,
        best_dominator: dominatorStats.length > 0
            ? Math.max(...dominatorStats.map((d: any) => d.dominator_rating ?? 0))
            : undefined,
    };
    const archetypes = getArchetypes(archetypePlayer);

    let statsGrid: any[] = [];
    if (pos === 'QB') {
        statsGrid = [
            { label: 'Pass Yards', val: careerPassYards, hint: 'Career Total' },
            { label: 'Total TDs', val: totalTds, hint: 'Rush + Rec + Pass' },
            { label: 'Comp %', val: compPct, hint: 'Efficiency metric' },
            { label: 'Yds/Attempt', val: ypa, hint: 'Volume metric' },
            { label: 'Games Played', val: careerGames, hint: 'Contests played' },
            { label: 'Breakout Age', val: '—', hint: 'Age at 20%+ market share' },
            { label: 'Rush YPG', val: rushYpgNum !== null ? rushYpgNum : '—', hint: 'Rushing yards per game' },
            { label: 'Mkt Share', val: '—', hint: 'Team offensive share' },
        ];
    } else if (pos === 'RB') {
        statsGrid = [
            { label: 'Scrim. Yards', val: totalScrimmageYards, hint: 'Career Total' },
            { label: 'Total TDs', val: totalTds, hint: 'Rush + Rec + Pass' },
            { label: 'Yards/Carry', val: ypc, hint: 'Efficiency metric' },
            { label: 'Yards/Rec', val: ypr, hint: 'Efficiency metric' },
            { label: 'Games Played', val: careerGames, hint: 'Contests played' },
            { label: 'Breakout Age', val: '—', hint: 'Age at 20%+ market share' },
            { label: 'Scrim Yds/G', val: scrimYpgNum, hint: 'Career avg per game' },
            { label: 'Mkt Share', val: '—', hint: 'Team offensive share' },
        ];
    } else {
        statsGrid = [
            { label: 'Scrim. Yards', val: totalScrimmageYards, hint: 'Career Total' },
            { label: 'Total TDs', val: totalTds, hint: 'Rush + Rec + Pass' },
            { label: 'Yards/Rec', val: ypr, hint: 'Efficiency metric' },
            { label: 'Rec/G', val: recPerGame, hint: 'Receptions per game' },
            { label: 'Games Played', val: careerGames, hint: 'Contests played' },
            { label: 'Breakout Age', val: '—', hint: 'Age at 20%+ market share' },
            { label: 'Dom. Rating', val: '—', hint: 'Team target/yardage share %' },
            { label: 'Mkt Share', val: '—', hint: 'Team offensive share' },
        ];
    }

    // ── Percentile metrics ─────────────────────────────────────────────────
    const myPeer = peerCareer.find((p: any) => Number(p.player_id) === Number(player.id));
    const percentileMetrics: { label: string; value: string | number; percentile: number; unit?: string }[] = [];
    if (myPeer && peerCareer.length > 3) {
        const s = (v: any) => Number(v) || 0;
        if (pos === 'QB') {
            const passYpgArr = peerCareer.map((p: any) => s(p.games) > 0 ? s(p.pass_yards) / s(p.games) : 0);
            const ypaArr     = peerCareer.map((p: any) => s(p.pass_att) > 0 ? s(p.pass_yards) / s(p.pass_att) : 0);
            const cpArr      = peerCareer.map((p: any) => s(p.pass_att) > 0 ? s(p.completions) / s(p.pass_att) * 100 : 0);
            const rushYpgArr = peerCareer.map((p: any) => s(p.games) > 0 ? s(p.rush_yards) / s(p.games) : 0);
            const myPassYpg  = s(myPeer.games) > 0 ? s(myPeer.pass_yards) / s(myPeer.games) : 0;
            const myYpa      = s(myPeer.pass_att) > 0 ? s(myPeer.pass_yards) / s(myPeer.pass_att) : 0;
            const myCp       = s(myPeer.pass_att) > 0 ? s(myPeer.completions) / s(myPeer.pass_att) * 100 : 0;
            const myRushYpg  = s(myPeer.games) > 0 ? s(myPeer.rush_yards) / s(myPeer.games) : 0;
            percentileMetrics.push(
                { label: 'Pass Yds/G',  value: myPassYpg > 0 ? myPassYpg.toFixed(0) : '—', percentile: pctRank(myPassYpg, passYpgArr), unit: 'yds' },
                { label: 'Yds/Attempt', value: myYpa > 0 ? myYpa.toFixed(1) : '—',          percentile: pctRank(myYpa, ypaArr) },
                { label: 'Comp %',      value: myCp > 0 ? myCp.toFixed(1) + '%' : '—',       percentile: pctRank(myCp, cpArr) },
                { label: 'Rush Yds/G',  value: myRushYpg > 0 ? myRushYpg.toFixed(1) : '—',  percentile: pctRank(myRushYpg, rushYpgArr), unit: 'yds' },
            );
        } else if (pos === 'RB') {
            const rushYpgArr  = peerCareer.map((p: any) => s(p.games) > 0 ? s(p.rush_yards) / s(p.games) : 0);
            const ypcArr      = peerCareer.map((p: any) => s(p.rush_att) > 0 ? s(p.rush_yards) / s(p.rush_att) : 0);
            const scrimYpgArr = peerCareer.map((p: any) => s(p.games) > 0 ? (s(p.rush_yards) + s(p.rec_yards)) / s(p.games) : 0);
            const recPgArr    = peerCareer.map((p: any) => s(p.games) > 0 ? s(p.receptions) / s(p.games) : 0);
            const myRushYpg   = s(myPeer.games) > 0 ? s(myPeer.rush_yards) / s(myPeer.games) : 0;
            const myYpc       = s(myPeer.rush_att) > 0 ? s(myPeer.rush_yards) / s(myPeer.rush_att) : 0;
            const myScrimYpg  = s(myPeer.games) > 0 ? (s(myPeer.rush_yards) + s(myPeer.rec_yards)) / s(myPeer.games) : 0;
            const myRecPg     = s(myPeer.games) > 0 ? s(myPeer.receptions) / s(myPeer.games) : 0;
            percentileMetrics.push(
                { label: 'Rush Yds/G',  value: myRushYpg > 0 ? myRushYpg.toFixed(1) : '—',  percentile: pctRank(myRushYpg, rushYpgArr), unit: 'yds' },
                { label: 'Yds/Carry',   value: myYpc > 0 ? myYpc.toFixed(1) : '—',            percentile: pctRank(myYpc, ypcArr) },
                { label: 'Scrim Yds/G', value: myScrimYpg > 0 ? myScrimYpg.toFixed(1) : '—', percentile: pctRank(myScrimYpg, scrimYpgArr), unit: 'yds' },
                { label: 'Rec/G',       value: myRecPg > 0 ? myRecPg.toFixed(2) : '—',        percentile: pctRank(myRecPg, recPgArr) },
            );
            const yprPeerArr = peerCareer.map((p: any) => s(p.receptions) > 0 ? s(p.rec_yards) / s(p.receptions) : 0);
            const myYprPct   = s(myPeer.receptions) > 0 ? s(myPeer.rec_yards) / s(myPeer.receptions) : 0;
            if (myYprPct > 0) percentileMetrics.push(
                { label: 'Yds/Rec', value: myYprPct.toFixed(1), percentile: pctRank(myYprPct, yprPeerArr) }
            );
        } else {
            const recYpgArr = peerCareer.map((p: any) => s(p.games) > 0 ? s(p.rec_yards) / s(p.games) : 0);
            const yprArr    = peerCareer.map((p: any) => s(p.receptions) > 0 ? s(p.rec_yards) / s(p.receptions) : 0);
            const recPgArr  = peerCareer.map((p: any) => s(p.games) > 0 ? s(p.receptions) / s(p.games) : 0);
            const myRecYpg  = s(myPeer.games) > 0 ? s(myPeer.rec_yards) / s(myPeer.games) : 0;
            const myYpr     = s(myPeer.receptions) > 0 ? s(myPeer.rec_yards) / s(myPeer.receptions) : 0;
            const myRecPg   = s(myPeer.games) > 0 ? s(myPeer.receptions) / s(myPeer.games) : 0;
            percentileMetrics.push(
                { label: 'Rec Yds/G', value: myRecYpg > 0 ? myRecYpg.toFixed(1) : '—', percentile: pctRank(myRecYpg, recYpgArr), unit: 'yds' },
                { label: 'Yds/Rec',   value: myYpr > 0 ? myYpr.toFixed(1) : '—',         percentile: pctRank(myYpr, yprArr) },
                { label: 'Rec/G',     value: myRecPg > 0 ? myRecPg.toFixed(2) : '—',      percentile: pctRank(myRecPg, recPgArr) },
            );
        }
    }

    // ── Advanced analytics ─────────────────────────────────────────────────
    const sd = (a: number | null | undefined, b: number | null | undefined) =>
        a != null && b != null && b > 0 ? a / b : null;
    const clamp = (v: number, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, v));
    const classRankFn = (val: number, arr: number[], higherIsBetter = true): number =>
        higherIsBetter ? arr.filter(v => v > val).length + 1 : arr.filter(v => v < val).length + 1;

    const myAdv = peerAdvanced.find((p: any) => Number(p.player_id) === Number(player.id));

    const carTotals = stats.reduce((acc, s) => ({
        gp:      acc.gp + (s.games_played ?? 0),
        routes:  acc.routes + (s.routes_run ?? 0),
        targets: acc.targets + (s.targets ?? 0),
        rec:     acc.rec + (s.receptions ?? 0),
        recYds:  acc.recYds + (s.rec_yards ?? 0),
        recTds:  acc.recTds + (s.rec_tds ?? 0),
        yac:     acc.yac + (s.yards_after_catch ?? 0),
        airYds:  acc.airYds + (s.air_yards ?? 0),
        mtf:     acc.mtf + (s.missed_tackles_forced ?? 0),
        firstDs: acc.firstDs + (s.first_downs ?? 0),
        rushYds: acc.rushYds + (s.rush_yards ?? 0),
        rushAtt: acc.rushAtt + (s.rush_attempts ?? 0),
        yacCont: acc.yacCont + (s.yards_after_contact ?? 0),
    }), { gp:0, routes:0, targets:0, rec:0, recYds:0, recTds:0, yac:0, airYds:0, mtf:0, firstDs:0, rushYds:0, rushAtt:0, yacCont:0 });

    const carYPRR = stats.length > 0 ? (() => {
        const wSum = stats.reduce((s, r) => s + (r.routes_run ?? 0), 0);
        if (wSum === 0) return null;
        return stats.reduce((s, r) => s + (r.yprr ?? 0) * (r.routes_run ?? 0), 0) / wSum;
    })() : null;
    const carDropRate = stats.length > 0 ? (() => {
        const wSum = stats.reduce((s, r) => s + (r.targets ?? 0), 0);
        if (wSum === 0) return null;
        return stats.reduce((s, r) => s + (r.drop_rate ?? 0) * (r.targets ?? 0), 0) / wSum;
    })() : null;
    const carContestedRate = stats.length > 0 ? (() => {
        const wSum = stats.reduce((s, r) => s + (r.targets ?? 0), 0);
        if (wSum === 0) return null;
        return stats.reduce((s, r) => s + (r.contested_catch_rate ?? 0) * (r.targets ?? 0), 0) / wSum;
    })() : null;
    const carDominator = stats.length > 0 ? (() => {
        const wSum = stats.reduce((s, r) => s + (r.games_played ?? 0), 0);
        if (wSum === 0) return null;
        return stats.reduce((s, r) => s + (r.dominator_rating ?? 0) * (r.games_played ?? 0), 0) / wSum;
    })() : null;

    type GaugeSpec = { label: string; displayValue: string; pct: number };
    type CompositeSpec = { label: string; score: number | null; description: string };
    type DonutProps = { title: string; labelA: string; valueA: number | null; labelB: string; valueB: number | null; colorA: string; colorB: string };

    const advGauges: GaugeSpec[] = [];
    const advComposites: CompositeSpec[] = [];
    let advDonutA: DonutProps | null = null;
    let advDonutB: DonutProps | null = null;
    const advRankingMetrics: RankingMetric[] = [];
    const butterflyRows: ButterflyRow[] = [];

    if (pos === 'WR' || pos === 'TE') {
        const wa = wrAdvanced as any;
        const pw = peerWrAdv as any[];
        const catchRate  = wa?.catch_rate   ?? sd(carTotals.rec, carTotals.targets);
        const dropRate   = wa?.drop_rate    ?? carDropRate;
        const yacRec     = wa?.yac_per_rec  ?? sd(carTotals.yac, carTotals.rec);
        const adotVal    = wa?.adot         ?? sd(carTotals.airYds, carTotals.targets);
        const yprr       = wa?.yprr         ?? carYPRR;
        const contRate   = wa?.contested_catch_rate ?? carContestedRate;
        const rprr       = sd(carTotals.rec, carTotals.routes);

        const fmt1 = (v: number | null | undefined, d = 1) => v != null ? v.toFixed(d) : '—';
        const fmtPct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—';

        if (catchRate != null)  advGauges.push({ label: 'Catch Rate',    displayValue: fmtPct(catchRate),  pct: catchRate * 100 });
        if (wa?.open_target_rate != null) advGauges.push({ label: 'Open Tgt Rate', displayValue: fmtPct(wa.open_target_rate), pct: wa.open_target_rate * 100 });
        if (dropRate != null)   advGauges.push({ label: 'Drop Rate',     displayValue: fmtPct(dropRate),   pct: 100 - dropRate * 100 });
        if (contRate != null)   advGauges.push({ label: 'Contested%',    displayValue: fmtPct(contRate),   pct: contRate * 100 });
        if (wa?.forced_mtf_pct != null) advGauges.push({ label: 'FMT%', displayValue: fmtPct(wa.forced_mtf_pct), pct: Math.min(100, (wa.forced_mtf_pct / 0.35) * 100) });
        if (wa?.qbr_when_targeted != null) advGauges.push({ label: 'QBR When Tgt', displayValue: wa.qbr_when_targeted.toFixed(1), pct: Math.min(100, ((wa.qbr_when_targeted - 80) / 80) * 100) });
        if (yprr != null)       advGauges.push({ label: 'YPRR',          displayValue: fmt1(yprr, 2),       pct: Math.min(100, (yprr / 3.5) * 100) });
        if (wa?.zone_yprr != null) advGauges.push({ label: 'Zone YPRR',  displayValue: fmt1(wa.zone_yprr, 2), pct: Math.min(100, (wa.zone_yprr / 3.5) * 100) });
        if (wa?.man_yprr != null)  advGauges.push({ label: 'Man YPRR',   displayValue: fmt1(wa.man_yprr, 2),  pct: Math.min(100, (wa.man_yprr / 3.5) * 100) });

        if (wa?.air_yards_rate != null && wa?.yac_rate != null) {
            advDonutA = { title: 'Air Yds / YAC Split', labelA: 'Air Yards', valueA: Math.round(wa.air_yards_rate * 100), colorA: '#06b6d4', labelB: 'YAC', valueB: Math.round(wa.yac_rate * 100), colorB: '#a78bfa' };
        } else if (carTotals.airYds > 0 && carTotals.yac > 0) {
            advDonutA = { title: 'Air Yds / YAC Split', labelA: 'Air Yards', valueA: carTotals.airYds, colorA: '#06b6d4', labelB: 'YAC', valueB: carTotals.yac, colorB: '#a78bfa' };
        }
        if (wa?.wide_rate != null && wa?.slot_rate != null) {
            advDonutB = { title: 'Alignment Split', labelA: 'Wide', valueA: Math.round(wa.wide_rate * 100), colorA: '#10b981', labelB: 'Slot', valueB: Math.round(wa.slot_rate * 100), colorB: '#f59e0b' };
        }

        const prodScore = carDominator != null && yprr != null ? clamp((carDominator/30)*4 + (yprr/3)*3 + (catchRate ?? 0.65)/0.70*3) : null;
        const yacScore  = yacRec != null ? clamp((yacRec / 8) * 10) : null;
        const playmakerScore = yprr != null ? clamp((yprr/3)*5 + ((contRate ?? 0)/0.5)*2.5 + (Math.min(carTotals.mtf,40)/40)*2.5) : null;
        const effScore  = rprr != null ? clamp((rprr/0.65)*3.5 + ((catchRate ?? 0)/0.72)*3.5 + ((1-(dropRate ?? 0.08))/0.94)*3) : null;

        advComposites.push(
            { label: 'Production',  score: prodScore,      description: 'DOM + YPRR + Catch%' },
            { label: 'YAC',         score: yacScore,       description: 'Yards after catch per rec' },
            { label: 'Playmaker',   score: playmakerScore, description: 'YPRR + Contested + MTF' },
            { label: 'Efficiency',  score: effScore,       description: 'RPRR + Catch% + Drop%' },
        );

        if (myAdv && peerAdvanced.length > 3) {
            const n = (x: any) => Number(x) || 0;
            const routesArr = peerAdvanced.filter((p: any) => n(p.routes) > 0).map((p: any) => n(p.routes));
            const tgtsArr   = peerAdvanced.filter((p: any) => n(p.targets) > 0).map((p: any) => n(p.targets));
            const recYdsArr = peerAdvanced.filter((p: any) => n(p.receptions) > 0).map((p: any) => n(p.rec_yards ?? 0));
            const recTdsArr = peerAdvanced.filter((p: any) => n(p.rec_tds) > 0).map((p: any) => n(p.rec_tds));
            const yprr2Arr  = peerAdvanced.filter((p: any) => p.yprr_wavg != null).map((p: any) => n(p.yprr_wavg));
            const yacArr    = peerAdvanced.filter((p: any) => n(p.yac) > 0).map((p: any) => n(p.yac));

            if (routesArr.length > 0 && carTotals.routes > 0) advRankingMetrics.push({ label: 'Routes', value: String(carTotals.routes), rank: classRankFn(carTotals.routes, routesArr), total: routesArr.length });
            if (tgtsArr.length > 0 && carTotals.targets > 0) advRankingMetrics.push({ label: 'Targets', value: String(carTotals.targets), rank: classRankFn(carTotals.targets, tgtsArr), total: tgtsArr.length });
            if (recYdsArr.length > 0 && carTotals.recYds > 0) advRankingMetrics.push({ label: 'Rec Yards', value: String(carTotals.recYds), rank: classRankFn(carTotals.recYds, recYdsArr), total: recYdsArr.length });
            if (recTdsArr.length > 0 && carTotals.recTds > 0) advRankingMetrics.push({ label: 'Rec TDs', value: String(carTotals.recTds), rank: classRankFn(carTotals.recTds, recTdsArr), total: recTdsArr.length });
            if (yprr2Arr.length > 0 && yprr != null) advRankingMetrics.push({ label: 'YPRR', value: yprr.toFixed(2), rank: classRankFn(yprr, yprr2Arr), total: yprr2Arr.length });
            if (yacArr.length > 0 && carTotals.yac > 0) advRankingMetrics.push({ label: 'YAC', value: String(carTotals.yac), rank: classRankFn(carTotals.yac, yacArr), total: yacArr.length });
        }

        if (wa && pw.length > 3) {
            const pRank = (val: number | null | undefined, arr: (number | null | undefined)[], higherBetter = true) => {
                if (val == null) return null;
                const clean = arr.filter((v): v is number => v != null);
                if (clean.length === 0) return null;
                return higherBetter ? clean.filter(v => v > val).length + 1 : clean.filter(v => v < val).length + 1;
            };
            const peerArr = (key: string) => pw.map((r: any) => r[key] as number | null);
            const tot = (key: string) => pw.filter((r: any) => r[key] != null).length;
            const bRow = (effLabel: string, effVal: number | null | undefined, effKey: string,
                          prodLabel: string, prodVal: number | null | undefined,
                          higherBetter = true): ButterflyRow => ({
                effLabel,
                effValue: effVal != null ? (effVal < 1 ? fmtPct(effVal) : fmt1(effVal, 2)) : '—',
                rank: pRank(effVal ?? null, peerArr(effKey), higherBetter),
                total: tot(effKey),
                prodLabel,
                prodValue: prodVal != null ? String(Math.round(prodVal as number)) : '—',
            });
            butterflyRows.push(
                bRow('YPRR',       wa.yprr,               'yprr',              'Rec Yards', carTotals.recYds),
                bRow('Zone YPRR',  wa.zone_yprr,          'zone_yprr',         'Targets',   carTotals.targets),
                bRow('Man YPRR',   wa.man_yprr,           'man_yprr',          'Routes',    carTotals.routes),
                bRow('Catch Rate', wa.catch_rate,         'catch_rate',        'Rec TDs',   carTotals.recTds),
                bRow('Drop Rate',  wa.drop_rate,          'drop_rate',         'Air Yards', carTotals.airYds, false),
                bRow('TD/Route',   wa.td_per_route,       'td_per_route',      'YAC',       carTotals.yac),
                bRow('1D/Route',   wa.first_down_rate,    'first_down_rate',   'MTF',       carTotals.mtf),
                bRow('ADOT',       wa.adot,               'adot',              'First Downs', carTotals.firstDs),
                bRow('YAC/Rec',    wa.yac_per_rec,        'yac_per_rec',       'Air Yds/Rec', wa.air_yards_per_rec != null ? wa.air_yards_per_rec * (carTotals.rec || 1) : null),
                bRow('FMT%',       wa.forced_mtf_pct,     'forced_mtf_pct',    'QBR When Tgt', wa.qbr_when_targeted),
            );
        }
    } else if (pos === 'RB') {
        const catchRate = sd(carTotals.rec, carTotals.targets);
        const yacAtt = sd(carTotals.yacCont, carTotals.rushAtt);
        const ypcVal = sd(carTotals.rushYds, carTotals.rushAtt);
        const carBreakaway = stats.length > 0 ? (() => {
            const wSum = stats.reduce((s, r) => s + (r.rush_attempts ?? 0), 0);
            if (wSum === 0) return null;
            return stats.reduce((s, r) => s + (r.breakaway_run_rate ?? 0) * (r.rush_attempts ?? 0), 0) / wSum;
        })() : null;

        if (yacAtt != null) advGauges.push({ label: 'YAC/Att', displayValue: yacAtt.toFixed(2), pct: Math.min(100, (yacAtt / 3.5) * 100) });
        if (carBreakaway != null) advGauges.push({ label: 'Breakaway%', displayValue: `${(carBreakaway*100).toFixed(1)}%`, pct: Math.min(100, (carBreakaway / 0.12) * 100) });
        if (carTotals.mtf > 0) advGauges.push({ label: 'MTF', displayValue: String(carTotals.mtf), pct: Math.min(100, (carTotals.mtf / 50) * 100) });
        if (catchRate != null) advGauges.push({ label: 'Catch Rate', displayValue: `${(catchRate*100).toFixed(1)}%`, pct: catchRate * 100 });

        const scrimYds = carTotals.rushYds + carTotals.recYds;
        if (scrimYds > 0) {
            advDonutA = { title: 'Rush / Receiving Split', labelA: 'Rush Yards', valueA: carTotals.rushYds, colorA: '#10b981', labelB: 'Rec Yards', valueB: carTotals.recYds, colorB: '#06b6d4' };
        }

        const visionScore = ypcVal != null && yacAtt != null ? clamp((ypcVal/6)*5 + (yacAtt/2.5)*5) : null;
        const contactScore = carTotals.mtf > 0 && carBreakaway != null ? clamp((carTotals.mtf/40)*5 + (carBreakaway/0.10)*5) : null;
        const recvScore = catchRate != null && carTotals.rec > 0 ? clamp((sd(carTotals.rec, carTotals.gp) ?? 0)/5*5 + (catchRate/0.80)*5) : null;

        advComposites.push(
            { label: 'Vision', score: visionScore, description: 'YPC + YAC/Att' },
            { label: 'Contact Balance', score: contactScore, description: 'MTF + Breakaway%' },
            { label: 'Receiving', score: recvScore, description: 'Rec/G + Catch%' },
        );

        if (myAdv && peerAdvanced.length > 3) {
            const n = (x: any) => Number(x) || 0;
            const rushYdsArr = peerAdvanced.filter((p: any) => n(p.rush_yards) > 0).map((p: any) => n(p.rush_yards));
            const ypcArr     = peerAdvanced.filter((p: any) => n(p.rush_att) > 0).map((p: any) => n(p.rush_yards) / n(p.rush_att));
            const mtfArr     = peerAdvanced.filter((p: any) => n(p.mtf) > 0).map((p: any) => n(p.mtf));

            if (rushYdsArr.length > 0) advRankingMetrics.push({ label: 'Rush Yards', value: String(carTotals.rushYds), rank: classRankFn(carTotals.rushYds, rushYdsArr), total: rushYdsArr.length });
            if (ypcArr.length > 0 && ypcVal != null) advRankingMetrics.push({ label: 'YPC', value: ypcVal.toFixed(2), rank: classRankFn(ypcVal, ypcArr), total: ypcArr.length });
            if (mtfArr.length > 0 && carTotals.mtf > 0) advRankingMetrics.push({ label: 'MTF', value: String(carTotals.mtf), rank: classRankFn(carTotals.mtf, mtfArr), total: mtfArr.length });
        }
    } else if (pos === 'QB') {
        const carComp = stats.reduce((a, s) => a + (s.completions ?? 0), 0);
        const carAtt  = stats.reduce((a, s) => a + (s.pass_attempts ?? 0), 0);
        const carPassYdsQB = stats.reduce((a, s) => a + (s.pass_yards ?? 0), 0);
        const compPctNum = sd(carComp, carAtt);
        const ypaNum = sd(carPassYdsQB, carAtt);
        const carQBR = stats.length > 0 ? (() => {
            const wSum = stats.reduce((s, r) => s + (r.pass_attempts ?? 0), 0);
            if (wSum === 0) return null;
            return stats.reduce((s, r) => s + (r.qbr ?? 0) * (r.pass_attempts ?? 0), 0) / wSum;
        })() : null;

        if (compPctNum != null) advGauges.push({ label: 'Comp%', displayValue: `${(compPctNum*100).toFixed(1)}%`, pct: Math.min(100, ((compPctNum - 0.50) / 0.20) * 100) });
        if (ypaNum != null) advGauges.push({ label: 'YPA', displayValue: ypaNum.toFixed(1), pct: Math.min(100, ((ypaNum - 5) / 6) * 100) });
        if (carQBR != null) advGauges.push({ label: 'QBR', displayValue: carQBR.toFixed(1), pct: carQBR });
        if (carTotals.rushYds > 0 && carTotals.gp > 0) advGauges.push({ label: 'Rush Yds/G', displayValue: (carTotals.rushYds/carTotals.gp).toFixed(1), pct: Math.min(100, (carTotals.rushYds/carTotals.gp / 60) * 100) });

        const carTds = stats.reduce((a, s) => a + (s.pass_tds ?? 0), 0);
        const carInts = stats.reduce((a, s) => a + (s.interceptions ?? 0), 0);
        const tdInt = sd(carTds, carInts);
        const passYpg = sd(carPassYdsQB, carTotals.gp);
        const accScore = compPctNum != null && ypaNum != null ? clamp((compPctNum/0.66)*5 + (ypaNum/9.0)*5) : null;
        const mobilityScore = carTotals.gp > 0 ? clamp((carTotals.rushYds/carTotals.gp / 50) * 10) : null;
        const prodScore = passYpg != null && tdInt != null ? clamp((passYpg/280)*5 + (tdInt/4)*5) : null;

        advComposites.push(
            { label: 'Accuracy', score: accScore, description: 'Comp% + YPA' },
            { label: 'Mobility', score: mobilityScore, description: 'Rush Yards/G' },
            { label: 'Production', score: prodScore, description: 'Pass Yds/G + TD:INT' },
        );
    }

    const hasAdvancedAnalytics = stats.length > 0 && ['WR', 'TE', 'RB', 'QB'].includes(pos);

    const firstStatSeason = stats.length > 0 ? Math.min(...stats.map(s => s.season ?? 9999)) : null;
    const isEarlyDeclare = firstStatSeason != null && firstStatSeason >= 2023 && player.draft_year === 2026;
    const earlyDeclareLabel = firstStatSeason === 2024 ? 'Sophomore Declare' : firstStatSeason === 2023 ? 'Junior Declare' : null;

    // ── KPI strip values ────────────────────────────────────────────────────
    const kpiStrip: { label: string; value: string }[] = [];
    if (pos === 'RB') {
        kpiStrip.push(
            { label: 'YPC', value: ypc !== '—' ? ypc : '—' },
            { label: 'YPR', value: ypr !== '—' ? ypr : '—' },
            { label: 'Scrim/G', value: scrimYpgNum },
            { label: 'Breakout', value: player.breakout_age ? String(player.breakout_age) : '—' },
        );
    } else if (pos === 'WR' || pos === 'TE') {
        kpiStrip.push(
            { label: 'YDS/G', value: ydsPerGameNum ?? '—' },
            { label: 'REC/G', value: recPerGame },
            { label: 'YPR', value: ypr !== '—' ? ypr : '—' },
            { label: 'Breakout', value: player.breakout_age ? String(player.breakout_age) : '—' },
        );
    } else if (pos === 'QB') {
        kpiStrip.push(
            { label: 'COMP%', value: compPct },
            { label: 'YPA', value: ypa !== '—' ? ypa : '—' },
            { label: 'RUSH/G', value: rushYpgNum ?? '—' },
            { label: 'Breakout', value: player.breakout_age ? String(player.breakout_age) : '—' },
        );
    }

    // Breakout age percentile for AnalyticCard
    const breakoutAgePct = player.breakout_age
        ? player.breakout_age <= 19 ? 95 : player.breakout_age <= 20 ? 80 : player.breakout_age <= 21 ? 60 : player.breakout_age <= 22 ? 40 : 25
        : 0;

    // Section jump nav
    const SECTIONS = [
        { id: 'scout',      label: 'Scout'      },
        ...(jfosterData ? [{ id: 'grades', label: 'Grades' }] : []),
        { id: 'athletics',  label: 'Athletics'  },
        { id: 'production', label: 'Production' },
        { id: 'analytics',  label: 'Analytics'  },
        { id: 'stats',      label: 'Stats'      },
        { id: 'rankings',   label: 'Rankings'   },
        { id: 'news',       label: 'News'       },
    ];

    // ── Swipe between profiles on mobile ────────────────────────────────────
    const router = useRouter();
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
        };
        const handleTouchEnd = (e: TouchEvent) => {
            if (touchStartX.current == null || touchStartY.current == null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            const dy = e.changedTouches[0].clientY - touchStartY.current;
            touchStartX.current = null;
            touchStartY.current = null;
            // Only trigger on horizontal swipes (dx > 80px, and more horizontal than vertical)
            if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            if (dx > 0 && prevPlayer) router.push(`/players/${prevPlayer.slug}`);
            if (dx < 0 && nextPlayer) router.push(`/players/${nextPlayer.slug}`);
        };
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [prevPlayer, nextPlayer, router]);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* App header with prev/next nav */}
            <AppHeader>
                <div className="flex items-center gap-2">
                    {prevPlayer ? (
                        <Link
                            href={`/players/${prevPlayer.slug}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors group"
                        >
                            <ChevronLeft className="w-3.5 h-3.5 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
                            <span className="hidden sm:block truncate max-w-[120px]">{prevPlayer.full_name}</span>
                        </Link>
                    ) : <div className="w-8" />}
                    <div className="w-px h-3.5 bg-border/50" />
                    {nextPlayer ? (
                        <Link
                            href={`/players/${nextPlayer.slug}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors group"
                        >
                            <span className="hidden sm:block truncate max-w-[120px]">{nextPlayer.full_name}</span>
                            <ChevronRight className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                    ) : <div className="w-8" />}
                </div>
            </AppHeader>

            {/* ── Sticky Hero + Section Nav ────────────────────────────────────────── */}
            <div className="md:sticky md:top-[54px] z-20 border-b border-white/[0.05]"
                style={{
                    background: 'linear-gradient(180deg, rgba(6,10,16,0.96) 0%, rgba(12,21,32,0.94) 100%)',
                }}
            >
                {/* Hero card */}
                <div className="max-w-screen-2xl mx-auto px-3 sm:px-8 lg:px-14 pt-3 sm:pt-5 pb-2 sm:pb-4">
                    <div className="flex items-start gap-8">
                        {/* Photo with position-colored ring */}
                        <div className="flex-shrink-0 hidden sm:block">
                            <div
                                className="w-[100px] h-[124px] rounded-2xl overflow-hidden shadow-lg relative"
                                style={{
                                    background: avatarBg,
                                    border: `2px solid ${posColor}40`,
                                    boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px ${posColor}15`,
                                }}
                            >
                                {headshotUrl ? (
                                    <img src={headshotUrl} alt={player.full_name} className="w-full h-full object-cover object-top" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                                        <div className={`text-sm font-black px-2 py-1 rounded-full border ${posStyle}`}>{pos}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Identity block */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 mb-1.5">
                                <h1 className="text-2xl sm:text-[28px] font-black tracking-tight text-foreground truncate leading-tight">
                                    {player.full_name}
                                </h1>
                                <Badge variant="outline" className={cn("text-xs font-bold border shrink-0", posStyle)}>
                                    {pos}
                                </Badge>
                                <WatchlistButton playerSlug={player.slug} variant="icon" className="w-5 h-5" />
                            </div>

                            {/* Bio pills */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground/70 mb-3">
                                {player.school && <span className="flex items-center gap-1.5"><GraduationCap className="w-3 h-3 text-muted-foreground/40" /> {player.school}</span>}
                                {player.age_at_draft && <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3 text-muted-foreground/40" /> Age {player.age_at_draft}</span>}
                                {player.height_inches && <span className="flex items-center gap-1.5"><Ruler className="w-3 h-3 text-muted-foreground/40" /> {formatHeight(player.height_inches)}</span>}
                                {player.weight_lbs && <span className="flex items-center gap-1.5"><Weight className="w-3 h-3 text-muted-foreground/40" /> {player.weight_lbs}lb</span>}
                                {player.star_rating && <span className="flex items-center gap-1 text-yellow-400/80"><Star className="w-3 h-3 fill-yellow-400/80" /> {player.star_rating}-star</span>}
                            </div>

                            {/* Key rank badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className={cn('rounded-lg px-3 py-1.5 flex items-center gap-2 border text-xs', tier.color)}
                                    style={{ boxShadow: `0 0 10px ${tier.accent}15` }}
                                >
                                    <span className="font-black font-[var(--font-jetbrains),monospace] text-sm">#{classRank ?? '—'}</span>
                                    <span className="text-xs uppercase tracking-widest opacity-60 font-bold">{tier.label}</span>
                                </div>
                                {draftSlot && (
                                    <div className="rounded-lg px-3 py-1.5 border border-white/[0.08] flex items-center gap-2 text-xs" style={{ background: 'var(--bg-elevated)' }}>
                                        <span className="font-black font-[var(--font-jetbrains),monospace] text-foreground">{draftSlot}</span>
                                        <span className="text-xs uppercase tracking-widest text-muted-foreground/50 font-bold">Proj Pick</span>
                                    </div>
                                )}
                                {player.ktc_rank && (
                                    <div className="rounded-lg px-3 py-1.5 bg-sky-400/5 border border-sky-400/25 flex items-center gap-2 text-xs">
                                        <span className="font-black font-[var(--font-jetbrains),monospace] text-sky-400">#{player.ktc_rank}</span>
                                        <span className="text-xs uppercase tracking-widest text-sky-400/50 font-bold">KTC</span>
                                    </div>
                                )}

                            </div>

                            {/* Action buttons */}
                            <div className="hidden sm:flex items-center gap-2 mt-3">
                                <Link
                                    href={`/compare?a=${player.slug}`}
                                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-white/[0.10] text-sm font-bold text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all"
                                    style={{ background: 'var(--bg-elevated)' }}
                                >
                                    <Scale className="w-4 h-4" /> Compare
                                </Link>
                                <button
                                    onClick={handleShare}
                                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border text-sm font-bold transition-all"
                                    style={{ background: 'var(--bg-elevated)', color: copied ? '#4ade80' : 'var(--muted-foreground)', borderColor: copied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)' }}
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                                    {copied ? 'Copied!' : 'Share'}
                                </button>
                            </div>
                        </div>

                        {/* KPI strip */}
                        {kpiStrip.length > 0 && (
                            <div className="hidden lg:flex gap-2 shrink-0" style={{ minWidth: 280 }}>
                                {kpiStrip.map(kpi => (
                                    <div key={kpi.label} className="flex-1 rounded-xl px-2 py-3 text-center border border-white/[0.06]"
                                        style={{ background: 'var(--bg-elevated)', minWidth: 70 }}
                                    >
                                        <div className="text-xl font-black font-[var(--font-jetbrains),monospace] text-foreground leading-none">{kpi.value}</div>
                                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-bold mt-1.5">{kpi.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Section jump nav */}
                <div className="max-w-screen-2xl mx-auto px-3 sm:px-8 lg:px-14 flex gap-0 overflow-x-auto border-t border-white/[0.04]">
                    {SECTIONS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="px-4 py-2.5 text-sm font-semibold tracking-wide text-muted-foreground/60 border-b-2 border-transparent hover:text-foreground hover:border-primary/40 transition-all flex-shrink-0"
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Page Content ─────────────────────────────────────────────────────── */}
            <div className="max-w-screen-2xl mx-auto px-3 sm:px-8 lg:px-14 py-6 sm:py-10 space-y-10 sm:space-y-14">

                {/* ── ZONE 1: Scout Report ─────────────────────────────────────────── */}
                <section id="scout" className="scroll-mt-16 md:scroll-mt-56">
                    <SectionLabel label="Scout Report" />

                    {/* Dynasty Snapshot */}
                    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 p-5 mb-6">
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[96px] font-black text-foreground/[0.03] leading-none select-none pointer-events-none">{pos}</div>
                        <div className="relative z-10 flex items-center gap-4 flex-wrap">
                            <span className={cn('border text-sm font-black px-3 py-1 rounded-full', tier.color)}>{tier.label}</span>
                            {projRank && (
                                <span className="text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full border border-border/40">
                                    {projRank <= 12 ? '1st-Round Dynasty Pick' : projRank <= 24 ? '2nd-Round Dynasty Pick' : projRank <= 36 ? '3rd-Round Dynasty Pick' : 'Late-Round Dynasty Pick'}
                                </span>
                            )}
                            {archetypes.map(arch => (
                                <span key={arch.label} className={cn('border text-[10px] font-bold px-2 py-0.5 rounded-full', arch.color)}>
                                    {arch.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Source Rankings — full width */}
                    {[classRank, player.ktc_rank, player.fp_rank, player.fc_rank, player.dn_rank].some((r: any) => r != null) && (() => {
                        const sources = [
                            { label: 'Consensus', rank: classRank, bar: 'bg-primary' },
                            { label: 'KTC Dynasty', rank: player.ktc_rank as number | null, bar: 'bg-cyan-400' },
                            { label: 'FantasyPros', rank: player.fp_rank as number | null, bar: 'bg-emerald-400' },
                            { label: 'FantasyCalc', rank: player.fc_rank as number | null, bar: 'bg-blue-400' },
                            { label: 'Dyn. Nerds', rank: player.dn_rank as number | null, bar: 'bg-violet-400' },
                        ].filter(s => s.rank != null) as { label: string; rank: number; bar: string }[];
                        const maxScale = Math.max(50, ...sources.map(s => s.rank));
                        return (
                            <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden mb-6">
                                <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Source Rankings</span>
                                    <span className="text-[10px] text-muted-foreground/50 font-mono">1 → {maxScale} scale</span>
                                </div>
                                <div className="p-4 space-y-3">
                                    {sources.map(src => {
                                        const pct = Math.max(3, Math.round(((maxScale - src.rank + 1) / maxScale) * 100));
                                        const rankCol = src.rank <= 12 ? 'text-emerald-400' : src.rank <= 24 ? 'text-cyan-400' : src.rank <= 36 ? 'text-yellow-400' : 'text-muted-foreground/80';
                                        const avg = sources.reduce((s, x) => s + x.rank, 0) / sources.length;
                                        const isHigh = src.rank < avg - 2;
                                        const isLow  = src.rank > avg + 2;
                                        return (
                                            <div key={src.label} className="grid grid-cols-[110px_1fr_52px_24px] items-center gap-3">
                                                <span className="text-[11px] text-muted-foreground font-medium">{src.label}</span>
                                                <div className="relative h-3.5 bg-border/20 rounded-full overflow-hidden">
                                                    <div className={`absolute left-0 top-0 h-full rounded-full ${src.bar} opacity-75 transition-all duration-700`} style={{ width: `${pct}%` }} />
                                                    <div className="absolute top-0 h-full w-px bg-emerald-400/30" style={{ left: `${Math.round(((maxScale - 12 + 1) / maxScale) * 100)}%` }} />
                                                    <div className="absolute top-0 h-full w-px bg-white/10"    style={{ left: `${Math.round(((maxScale - 24 + 1) / maxScale) * 100)}%` }} />
                                                </div>
                                                <span className={`text-sm font-black font-mono text-right ${rankCol}`}>#{src.rank}</span>
                                                <span className={`text-[10px] font-bold text-right ${isHigh ? 'text-emerald-400' : isLow ? 'text-red-400' : 'text-transparent'}`}>
                                                    {isHigh ? '▲' : isLow ? '▼' : '·'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="px-4 py-2 border-t border-border/20 flex gap-4 text-[9px] text-muted-foreground/40">
                                    <span>Bar extends right = better rank</span>
                                    <span className="text-emerald-400/50">│ R1 cutoff</span>
                                    <span className="text-emerald-400 ml-auto">▲ bullish vs. consensus</span>
                                    <span className="text-red-400">▼ bearish</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Dynasty Context */}
                    <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden mb-6">
                        <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dynasty Context</span>
                        </div>
                        <div className="p-4 space-y-3 text-sm text-muted-foreground">
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-bold mt-0.5 shrink-0">→</span>
                                <span>Projected as a <strong className="text-foreground">{projRank ? (projRank <= 12 ? '1st-round' : projRank <= 24 ? '2nd-round' : projRank <= 36 ? '3rd-round' : 'late-round') : 'unranked'}</strong> dynasty pick based on consensus ranking.</span>
                            </div>
                            {pos === 'RB' && recentStat && (() => {
                                const scrimYds = (recentStat?.rush_yards || 0) + (recentStat?.rec_yards || 0);
                                const scrimYpg = recentStat?.games_played ? (scrimYds / recentStat.games_played).toFixed(1) : '—';
                                const rasScore = (measurables as any)?.ras || '—';
                                const yr = recentStat?.season || '2025';
                                const projStr = projRank ? (projRank <= 12 ? '1st' : projRank <= 24 ? '2nd' : projRank <= 36 ? '3rd' : 'late') : 'unranked';
                                return <div className="flex items-start gap-2"><span className="text-amber-400 font-bold mt-0.5 shrink-0">→</span><span>{player.last_name} averaged <strong className="text-foreground">{scrimYpg} scrim. yds/G</strong> in {yr} with a <strong className="text-foreground">{rasScore} RAS</strong> — {projStr}-round dynasty asset.</span></div>;
                            })()}
                            {pos === 'WR' && recentStat && (() => {
                                const ypg = recentStat?.yds_per_game || '—';
                                const rpg = recentStat?.rec_per_game || '—';
                                const yr = recentStat?.season || '2025';
                                const rasScore = (measurables as any)?.ras || '—';
                                const ht = player.height_inches || 72;
                                const sizeDesc = ht >= 74 ? `big-bodied (${Math.floor(ht / 12)}'${ht % 12}")` : `slot-frame (${Math.floor(ht / 12)}'${ht % 12}")`;
                                return <div className="flex items-start gap-2"><span className="text-fuchsia-400 font-bold mt-0.5 shrink-0">→</span><span>{player.last_name} averaged <strong className="text-foreground">{ypg} rec yds/G</strong> ({rpg} rec/G) in {yr} — {sizeDesc} with <strong className="text-foreground">{rasScore} RAS</strong>.</span></div>;
                            })()}
                            {pos === 'QB' && recentStat && (() => {
                                const cmp = recentStat?.completion_pct || '—';
                                const pyds = recentStat?.pass_yards || '—';
                                const ptds = recentStat?.pass_tds || '—';
                                const ryds = recentStat?.rush_yards || 0;
                                const yr = recentStat?.season || '2025';
                                const mob = ryds >= 300 ? 'dual-threat' : 'pocket passer';
                                return <div className="flex items-start gap-2"><span className="text-cyan-400 font-bold mt-0.5 shrink-0">→</span><span>{player.last_name} completed <strong className="text-foreground">{cmp}</strong> of passes for <strong className="text-foreground">{pyds} yds / {ptds} TDs</strong> in {yr} — <strong className="text-foreground">{mob}</strong> profile.</span></div>;
                            })()}
                            {pos === 'TE' && <div className="flex items-start gap-2"><span className="text-violet-400 font-bold mt-0.5 shrink-0">→</span><span>Elite TEs are extremely rare — top-12 TEs in the 1st round represent <strong className="text-foreground">generational dynasty value</strong>.</span></div>}
                            {player.age_at_draft && (
                                <div className="flex items-start gap-2">
                                    <span className="text-muted-foreground/50 font-bold mt-0.5 shrink-0">→</span>
                                    <span>Draft age <strong className="text-foreground">{player.age_at_draft}</strong> — {player.age_at_draft <= 21 ? <span className="text-emerald-400 font-bold">young prospect with long NFL runway</span> : player.age_at_draft <= 23 ? <span className="text-cyan-400 font-bold">prime age for NFL entry</span> : <span className="text-yellow-400 font-bold">older prospect, shorter dynasty window</span>}.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Historical Athletic Comps */}
                    {historicalComps && historicalComps.length > 0 && (
                        <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden">
                            <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Athletic Comps</span>
                                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Most similar 2010–2024 draft prospects by athleticism</p>
                            </div>
                            <div className="divide-y divide-border/20">
                                {historicalComps.map((comp: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold font-mono text-muted-foreground/30 w-4">{i + 1}</span>
                                            <div>
                                                <div className="text-sm font-bold text-foreground">{comp.comp_name}</div>
                                                <div className="text-[11px] text-muted-foreground">
                                                    {comp.comp_year} · {comp.comp_round ? `Rd ${comp.comp_round}` : 'UDFA'}
                                                    {comp.comp_team ? ` · ${comp.comp_team}` : ''}
                                                    {comp.comp_probowls ? ` · ${comp.comp_probowls}× Pro Bowl` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-right">
                                            {comp.comp_w_av != null && (
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground/50 uppercase">Career AV</div>
                                                    <div className={`text-sm font-black font-mono ${comp.comp_w_av >= 40 ? 'text-emerald-400' : comp.comp_w_av >= 15 ? 'text-cyan-400' : 'text-muted-foreground'}`}>{comp.comp_w_av}</div>
                                                </div>
                                            )}
                                            <div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Sim.</div>
                                                <div className="text-sm font-bold font-mono text-foreground">{comp.similarity}%</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* NFL.com Combine Scout Card */}
                    {nflScout && (nflScout.draft_grade != null || nflScout.nfl_comparison || nflScout.overview) && (
                        <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden">
                            <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">NFL Scout</span>
                                <span className="text-[10px] text-muted-foreground/40">
                                    {nflScout.profile_author ?? 'NFL.com'} · 2026 Combine
                                </span>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="flex flex-wrap gap-3 items-center">
                                    {nflScout.draft_grade != null && (
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-2xl font-black font-mono text-foreground">
                                                {nflScout.draft_grade.toFixed(1)}
                                            </span>
                                            <span className="text-xs text-muted-foreground/50">/100</span>
                                        </div>
                                    )}
                                    {nflScout.nfl_comparison && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Comp</span>
                                            <span className="text-sm font-semibold text-foreground/90">{nflScout.nfl_comparison}</span>
                                        </div>
                                    )}
                                    {nflScout.athleticism_score != null && (
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Ath</span>
                                            <span className="text-sm font-bold font-mono text-primary">{nflScout.athleticism_score.toFixed(1)}</span>
                                        </div>
                                    )}
                                </div>
                                {nflScout.overview && (
                                    <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-4">{nflScout.overview}</p>
                                )}
                                {(nflScout.strengths || nflScout.weaknesses) && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                        {nflScout.strengths && (
                                            <div>
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/70 mb-1">Strengths</div>
                                                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{nflScout.strengths}</p>
                                            </div>
                                        )}
                                        {nflScout.weaknesses && (
                                            <div>
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-red-500/60 mb-1">Weaknesses</div>
                                                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{nflScout.weaknesses}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* J. Foster Scouting Card */}
                    {jfosterData && (jfosterData.overall_grade != null || jfosterData.round_grade || jfosterData.nfl_comp) && (
                        <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden mt-6">
                            <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Film Scout</span>
                                <a
                                    href="https://jfosterdraft.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors flex items-center gap-1"
                                >
                                    J. Foster · NoFlagsFilm <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            </div>
                            <div className="p-4 flex flex-wrap gap-3 items-center">
                                {jfosterData.overall_grade != null && (
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-black font-mono text-foreground">
                                            {jfosterData.overall_grade.toFixed(2)}
                                        </span>
                                        <span className="text-xs text-muted-foreground/50">/10</span>
                                    </div>
                                )}
                                {jfosterData.round_grade && (
                                    <span className={cn(
                                        'px-2.5 py-1 rounded-md text-xs font-bold',
                                        jfosterData.round_grade.toLowerCase().includes('top 10') || jfosterData.round_grade.includes('1 (')
                                            ? 'bg-emerald-500/20 text-emerald-300'
                                            : jfosterData.round_grade.includes('2 (')
                                                ? 'bg-cyan-500/20 text-cyan-300'
                                                : jfosterData.round_grade.includes('3 (')
                                                    ? 'bg-blue-500/20 text-blue-300'
                                                    : 'bg-muted/20 text-muted-foreground'
                                    )}>
                                        {jfosterData.round_grade}
                                    </span>
                                )}
                                {jfosterData.nfl_comp && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Comp</span>
                                        <span className="text-sm font-semibold text-foreground/90">{jfosterData.nfl_comp}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* ── Film Grades Section ─────────────────────────────────────────────── */}
                {jfosterData && (
                    <section id="grades" className="scroll-mt-16 md:scroll-mt-56">
                        <div className="flex items-center gap-3 mb-5">
                            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground/50 whitespace-nowrap">
                                Film Grades
                            </span>
                            <span className="text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded-md border border-border/20 text-muted-foreground/40">
                                {pos} · CLASS 2026
                            </span>
                            <div className="flex-1 h-px bg-border/20" />
                            <a
                                href="https://jfosterdraft.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors flex items-center gap-1 shrink-0"
                            >
                                J. Foster · NoFlagsFilm <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                        </div>
                        <FilmGradesCard jfoster={jfosterData} position={pos} />
                    </section>
                )}

                {/* ── ZONE 2+3: Two-column Analysis ────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* LEFT — Athletic Profile */}
                    <div id="athletics" className="scroll-mt-16 md:scroll-mt-56 space-y-6">
                        <SectionLabel label="Athletic Profile" />

                        <AthleticsCard
                            position={player.position}
                            heightInches={player.height_inches}
                            weightLbs={player.weight_lbs}
                            measurables={measurables}
                            speedScore={speedScore}
                        />

                        {/* Recruiting Pedigree — compressed summary */}
                        {(player.recruiting_composite || player.recruiting_stars) && (
                            <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recruiting Pedigree</span>
                                </div>
                                <div className="p-4 space-y-3">
                                    {player.recruiting_stars && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">Star Rating</span>
                                            <span className="text-yellow-400 font-black text-lg">{'★'.repeat(player.recruiting_stars)}</span>
                                        </div>
                                    )}
                                    {player.recruiting_composite && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">Composite Rating</span>
                                            <span className="text-sm font-black font-mono text-foreground">{Number(player.recruiting_composite).toFixed(4)}</span>
                                        </div>
                                    )}
                                    {player.recruiting_year && (() => {
                                        const composite = Number(player.recruiting_composite || 0);
                                        const pct = Math.max(2, Math.min(100, ((composite - 0.85) / 0.15) * 100));
                                        const barColor = composite >= 0.98 ? 'bg-yellow-400' : composite >= 0.95 ? 'bg-emerald-400' : composite >= 0.90 ? 'bg-cyan-400' : 'bg-yellow-500';
                                        return (
                                            <>
                                                {composite > 0 && (
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                                            <span>0.8500</span><span>Natl. avg: 0.9000</span><span>Elite: 0.9800+</span>
                                                        </div>
                                                        <div className="relative h-2 bg-border/25 rounded-full overflow-hidden">
                                                            <div className={`absolute left-0 top-0 h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-muted-foreground">Recruit Class</span>
                                                    <span className="text-xs font-bold text-foreground/70">{player.recruiting_year}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Breakout Profile */}
                        {(player.breakout_age || isEarlyDeclare) && (
                            <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Breakout Profile</span>
                                </div>
                                <div className={`p-4 grid gap-4 ${player.breakout_age && isEarlyDeclare ? 'grid-cols-3' : player.breakout_age ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {player.breakout_age && (
                                        <>
                                            <div className="text-center">
                                                <div className={`text-4xl font-black leading-none ${player.breakout_age <= 19 ? 'text-emerald-400' : player.breakout_age <= 20 ? 'text-cyan-400' : player.breakout_age <= 21 ? 'text-yellow-400' : 'text-foreground'}`}>
                                                    {player.breakout_age}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Breakout Age</div>
                                                <div className="text-[10px] mt-1 font-bold">
                                                    {player.breakout_age <= 19 ? <span className="text-emerald-400">Elite early</span>
                                                        : player.breakout_age <= 20 ? <span className="text-cyan-400">Early breakout</span>
                                                        : player.breakout_age <= 21 ? <span className="text-yellow-400">On schedule</span>
                                                        : <span className="text-muted-foreground/60">Late bloomer</span>}
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-4xl font-black text-foreground leading-none">{player.breakout_year}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Season</div>
                                                <div className="text-[10px] text-muted-foreground/50 mt-1">First elite season</div>
                                            </div>
                                        </>
                                    )}
                                    {isEarlyDeclare && (
                                        <div className="text-center">
                                            <div className="text-2xl font-black text-amber-400 leading-none">{stats.length}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">College Seasons</div>
                                            <div className="text-[10px] mt-1 font-bold">
                                                <span className={`${firstStatSeason === 2024 ? 'text-amber-400' : 'text-yellow-400'}`}>
                                                    {earlyDeclareLabel ?? 'Early Declare'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="px-4 py-2 border-t border-border/20">
                                    <p className="text-[9px] text-muted-foreground/40">
                                        {player.breakout_age ? 'Age of first season with ≥20% dominator rating. Earlier = stronger dynasty prospect.' : ''}
                                        {isEarlyDeclare ? (player.breakout_age ? ' · ' : '') + 'Entering draft with college eligibility remaining.' : ''}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Athletic Testing */}
                        <div>
                            <SectionLabel label="Athletic Testing" />
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { label: '40 Yard Dash', key: 'forty_yard', unit: 's', src: measurables, disputed: measurables && (measurables as any).forty_disputed, proDay: measurables && (measurables as any).is_pro_day },
                                    { label: 'Vertical Jump', key: 'vertical_jump', unit: '"', src: measurables, proDay: measurables && (measurables as any).is_pro_day },
                                    { label: 'Broad Jump', key: 'broad_jump', unit: '"', src: measurables, proDay: measurables && (measurables as any).is_pro_day },
                                    { label: '3-Cone Drill', key: 'three_cone', unit: 's', src: measurables, proDay: measurables && (measurables as any).is_pro_day },
                                    { label: 'RAS Score', key: 'ras', unit: '', src: measurables },
                                    { label: 'Speed Score', key: '__speed__', unit: '', src: { __speed__: speedScore } },
                                    { label: 'Height', key: 'height_inches', unit: '', src: player, fmt: (v: number) => `${Math.floor(v / 12)}'${v % 12}"` },
                                    { label: 'Weight', key: 'weight_lbs', unit: 'lb', src: player },
                                ] as any[]).map(m => {
                                    const val = m.src ? (m.src as any)[m.key] : null;
                                    const display = val != null ? (m.fmt ? m.fmt(val) : `${val}${m.unit}`) : null;
                                    return (
                                        <div key={m.key} className={`bg-card border rounded-xl p-4 text-center ${display ? 'border-border/40' : 'border-dashed border-border/20 opacity-30 hidden sm:flex'} flex flex-col justify-center items-center relative gap-1`}>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">{m.label}</div>
                                            <div className={`text-xl font-black mt-1 flex items-center justify-center gap-1 ${display ? 'text-foreground' : 'text-muted-foreground/20'}`}>
                                                {display ?? '—'}
                                                {m.proDay ? <span className="text-[9px] font-medium text-muted-foreground uppercase opacity-80">(Pro Day)</span> : null}
                                                {m.disputed ? (
                                                    <TooltipProvider>
                                                        <Tooltip delayDuration={200}>
                                                            <TooltipTrigger asChild>
                                                                <AlertTriangle className="w-4 h-4 text-amber-500 cursor-help" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" className="max-w-[280px] bg-card text-foreground border-border text-xs leading-relaxed p-3 shadow-lg z-50">
                                                                Official time disputed — multiple teams clocked this player significantly faster. Treat with caution until Pro Day confirmation.
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT — Production */}
                    <div id="production" className="scroll-mt-16 md:scroll-mt-56 space-y-6">
                        <SectionLabel label="Production" />

                        {stats.length > 0 && <StatTrendChart stats={stats} position={player.position} />}
                        {dominatorStats.length > 0 && <DominatorChart data={dominatorStats} position={player.position} />}
                        {percentileMetrics.length > 0 && <PercentileChart metrics={percentileMetrics} position={player.position} />}

                        {/* EPA / SP+ if available */}
                        {epaStats && epaStats.length > 0 && dominatorStats.length === 0 && (
                            <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4">
                                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Competition Adjustment</h3>
                                <div className="space-y-2">
                                    {epaStats.map((row: any) => (
                                        <div key={row.season} className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground font-mono text-xs">{row.season}</span>
                                            <div className="flex gap-5">
                                                {row.sp_rating != null && <span className={`font-bold font-mono text-xs ${row.sp_rating >= 20 ? 'text-emerald-400' : row.sp_rating >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>SP+ {row.sp_rating > 0 ? '+' : ''}{Number(row.sp_rating).toFixed(1)}</span>}
                                                {row.epa_per_play != null && <span className={`font-bold font-mono text-xs ${row.epa_per_play >= 1.0 ? 'text-emerald-400' : row.epa_per_play >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>EPA {Number(row.epa_per_play).toFixed(3)}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── ZONE 4: Advanced Analytics ───────────────────────────────────── */}
                {hasAdvancedAnalytics && (
                    <section id="analytics" className="scroll-mt-16 md:scroll-mt-56">
                        <div className="flex items-center gap-3 mb-5">
                            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground/50 whitespace-nowrap">Advanced Analytics</span>
                            <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold border border-primary/20">{pos} · CLASS 2026</span>
                            <div className="flex-1 h-px bg-border/20" />
                        </div>

                        {/* Analytic cards — replaces ring gauges */}
                        {(advGauges.length > 0 || advComposites.filter(c => c.score != null).length > 0) && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 mb-6">
                                {advGauges.map(g => (
                                    <AnalyticCard key={g.label} label={g.label} value={g.displayValue} pct={g.pct} />
                                ))}
                                {advComposites.filter(c => c.score != null).map(c => (
                                    <AnalyticCard
                                        key={c.label}
                                        label={c.label}
                                        value={c.score != null ? c.score.toFixed(1) : '—'}
                                        pct={c.score != null ? (c.score / 10) * 100 : 0}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Donut splits */}
                        {(advDonutA != null || advDonutB != null) && (
                            <div className={`grid gap-3 mb-6 ${advDonutA != null && advDonutB != null ? 'grid-cols-2 max-w-md' : 'grid-cols-1 max-w-xs'}`}>
                                {advDonutA != null && <DonutSplit title={(advDonutA as DonutProps).title} labelA={(advDonutA as DonutProps).labelA} valueA={(advDonutA as DonutProps).valueA} labelB={(advDonutA as DonutProps).labelB} valueB={(advDonutA as DonutProps).valueB} colorA={(advDonutA as DonutProps).colorA} colorB={(advDonutA as DonutProps).colorB} />}
                                {advDonutB != null && <DonutSplit title={(advDonutB as DonutProps).title} labelA={(advDonutB as DonutProps).labelA} valueA={(advDonutB as DonutProps).valueA} labelB={(advDonutB as DonutProps).labelB} valueB={(advDonutB as DonutProps).valueB} colorA={(advDonutB as DonutProps).colorA} colorB={(advDonutB as DonutProps).colorB} />}
                            </div>
                        )}

                        {/* Butterfly chart */}
                        {butterflyRows.length > 0 && (
                            <div className="mb-6">
                                <ButterflyChart rows={butterflyRows} effTitle="Efficiency" prodTitle="Production" rankTitle="Percentile Rank" />
                            </div>
                        )}

                        {/* Season class rankings */}
                        {advRankingMetrics.length > 0 && (
                            <div className="mb-6">
                                <SeasonRankingsChart metrics={advRankingMetrics} title={`Career Class Rankings · ${pos}`} />
                            </div>
                        )}

                        {/* WR/TE target depth distribution */}
                        {(pos === 'WR' || pos === 'TE') && (wrAdvanced as any)?.depth_behind_line_pct != null && (
                            <div className="mb-6">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Target Depth Distribution</h4>
                                <WRTargetDepthBar
                                    behindLine={(wrAdvanced as any).depth_behind_line_pct}
                                    short={(wrAdvanced as any).depth_0_9_pct}
                                    intermediate={(wrAdvanced as any).depth_10_19_pct}
                                    deep={(wrAdvanced as any).depth_20plus_pct}
                                    peerWrAdv={peerWrAdv}
                                />
                            </div>
                        )}

                        {/* WR Career Production Heatmap */}
                        {(pos === 'WR' || pos === 'TE') && wrAdvanced && peerWrAdv.length > 0 && (
                            <div className="mb-6">
                                <WRAdvancedRatesTable wrAdvanced={wrAdvanced} peerWrAdv={peerWrAdv} />
                            </div>
                        )}

                        {/* RB career production heatmap */}
                        {pos === 'RB' && (
                            <>
                            <RBProductionTable stats={stats} peerAdvanced={peerAdvanced} playerId={player.id} rbCareer={rbAdvanced} peerRBAdv={peerRBAdv} />
                            <RBAdvancedRatesTable rbCareer={rbAdvanced} peerRBAdv={peerRBAdv} />
                            </>
                        )}

                        {/* Advanced season stats table */}
                        {stats.length > 0 && (
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Advanced Season Stats</h4>
                                <AdvancedStatsTable stats={stats} position={player.position} />
                            </div>
                        )}
                    </section>
                )}

                {/* ── ZONE 5: College Stats ─────────────────────────────────────────── */}
                <section id="stats" className="scroll-mt-16 md:scroll-mt-56">
                    <SectionLabel label="College Stats" />

                    {stats.length > 0 ? (
                        <>
                            <StatsTable stats={stats} position={player.position} />
                            {hasAdvancedMetrics && (
                                <div className="mt-3 grid grid-cols-4 sm:grid-cols-8 gap-1">
                                    {statsGrid.map((m) => {
                                        const hasVal = m.val != null && m.val !== 0 && m.val !== '—';
                                        return (
                                            <div key={m.label} className="bg-card/40 border border-border/20 rounded-lg px-2 py-2.5 text-center">
                                                <div className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-bold leading-none mb-1">{m.label}</div>
                                                <div className={`text-base font-black font-mono leading-none ${hasVal ? 'text-foreground' : 'text-muted-foreground/20'}`}>{hasVal ? m.val : '—'}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="text-right text-[10px] text-muted-foreground font-medium uppercase tracking-wide opacity-60 mt-2">{trustIndicator}</div>
                        </>
                    ) : (
                        <div className="bg-card border border-dashed border-border/60 rounded-xl p-8 text-center">
                            <BarChart2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-muted-foreground text-sm font-semibold">Season stats not yet available</p>
                            <div className="text-center mt-4 text-[10px] text-muted-foreground font-medium uppercase tracking-wide opacity-60">{trustIndicator}</div>
                        </div>
                    )}
                </section>

                {/* ── High School ─────────────────────────────────────────────────── */}
                {highSchool && (highSchool.high_school || highSchool.city || highSchool.state) && (
                    <section className="mt-6">
                        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
                            <div className="px-5 py-3 border-b border-border/30 bg-muted/10">
                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">High School</span>
                            </div>
                            <div className="px-5 py-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <GraduationCap className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                                    <span className="text-sm font-semibold text-foreground">
                                        {highSchool.high_school || 'Unknown'}
                                    </span>
                                    {(highSchool.city || highSchool.state) && (
                                        <span className="text-xs text-muted-foreground/60">
                                            {[highSchool.city, highSchool.state].filter(Boolean).join(', ')}
                                        </span>
                                    )}
                                </div>
                                {highSchool.graduating_class && (
                                    <div className="text-[11px] text-muted-foreground/50">
                                        Class of {highSchool.graduating_class}
                                    </div>
                                )}
                                {highSchool.games != null && highSchool.games > 0 && (
                                    <div className="text-[11px] text-muted-foreground/50">
                                        {highSchool.games} career games
                                    </div>
                                )}
                                {/* Career stats grid — only shown if we have any stats */}
                                {(highSchool.rush_yards || highSchool.rec_yards || highSchool.pass_yards) && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                                        {/* Passing — show for QBs or anyone with pass stats */}
                                        {highSchool.pass_yards != null && highSchool.pass_yards !== 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.pass_yards?.toLocaleString()}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Pass Yds</div>
                                            </div>
                                        )}
                                        {highSchool.pass_tds != null && highSchool.pass_tds > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.pass_tds}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Pass TD</div>
                                            </div>
                                        )}
                                        {/* Rushing — show for RBs/QBs or anyone with rush stats */}
                                        {highSchool.rush_yards != null && highSchool.rush_yards > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.rush_yards?.toLocaleString()}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Rush Yds</div>
                                            </div>
                                        )}
                                        {highSchool.rush_tds != null && highSchool.rush_tds > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.rush_tds}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Rush TD</div>
                                            </div>
                                        )}
                                        {/* Receiving — show for WR/TE/RB or anyone with rec stats */}
                                        {highSchool.receptions != null && highSchool.receptions > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.receptions}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Rec</div>
                                            </div>
                                        )}
                                        {highSchool.rec_yards != null && highSchool.rec_yards > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.rec_yards?.toLocaleString()}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Rec Yds</div>
                                            </div>
                                        )}
                                        {highSchool.rec_tds != null && highSchool.rec_tds > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.rec_tds}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Rec TD</div>
                                            </div>
                                        )}
                                        {/* Interceptions — show for anyone with INTs */}
                                        {highSchool.interceptions != null && highSchool.interceptions > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.interceptions}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">{pos === 'QB' ? 'INT' : 'INT'}</div>
                                            </div>
                                        )}
                                        {/* Fumbles — only if non-zero */}
                                        {highSchool.fumbles != null && highSchool.fumbles > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.fumbles}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Fumbles</div>
                                            </div>
                                        )}
                                        {/* Totals */}
                                        {highSchool.total_yards != null && highSchool.total_yards > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.total_yards?.toLocaleString()}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Total Yds</div>
                                            </div>
                                        )}
                                        {highSchool.total_tds != null && highSchool.total_tds > 0 && (
                                            <div className="text-center p-2 rounded-lg bg-muted/20">
                                                <div className="text-xs font-black text-foreground">{highSchool.total_tds}</div>
                                                <div className="text-[9px] text-muted-foreground/50 uppercase">Total TD</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {/* ── ZONE 6: Expert Rankings ───────────────────────────────────────── */}
                <section id="rankings" className="scroll-mt-16 md:scroll-mt-56">
                    <SectionLabel label="Expert Rankings" />
                    <SourceRankings rankings={rankings} consensusRank={player.consensus_rank ?? null} />
                </section>

                {/* ── ZONE 7b: Dynasty Trades ──────────────────────────────────────── */}
                <section id="dynasty-trades" className="scroll-mt-16 md:scroll-mt-56">
                    <SectionLabel label="Dynasty Trades" />
                    <RecentTrades playerSlug={player.slug} projRank={projRank} playerName={player.last_name} />
                </section>

                {/* ── ZONE 7: News ──────────────────────────────────────────────────── */}
                <section id="news" className="scroll-mt-16 md:scroll-mt-56">
                    <SectionLabel label="Latest News" />
                    {news.length > 0 ? (
                        <div className="space-y-2">
                            {news.map((article: any) => (
                                <a
                                    key={article.id}
                                    href={article.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3 p-4 bg-card border border-border/60 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2 mb-1">{article.title}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                            <span className="font-medium">{article.source}</span>
                                            {article.published_at && <><span>·</span><span>{timeAgo(article.published_at)}</span></>}
                                        </div>
                                    </div>
                                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary/60 flex-shrink-0 mt-0.5" />
                                </a>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-card border border-dashed border-border/60 rounded-xl p-12 text-center">
                            <Newspaper className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-muted-foreground text-sm">No recent news for this player</p>
                        </div>
                    )}
                </section>

            </div>
        </div>
    );
}



