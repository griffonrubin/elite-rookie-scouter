import { query, queryOne } from '@/lib/db';
import { Player, CollegeStats, Measurables, Ranking } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatsTable } from '@/components/StatsTable';
import { StatTrendChart } from '@/components/StatTrendChart';
import { PercentileChart } from '@/components/PercentileChart';
import { SourceRankings } from '@/components/SourceRankings';
import { AthleticsCard } from '@/components/AthleticsCard';
import { DominatorChart } from '@/components/DominatorChart';
import { StatRingGauge } from '@/components/StatRingGauge';
import { DonutSplit } from '@/components/DonutSplit';
import { SeasonRankingsChart, type RankingMetric } from '@/components/SeasonRankingsChart';
import { AdvancedStatsTable } from '@/components/AdvancedStatsTable';
import { ButterflyChart, type ButterflyRow } from '@/components/ButterflyChart';
import { POSITION_COLORS, POSITION_HEADLINE_STATS } from '@/lib/constants';
import { ArrowLeft, ArrowRight, GraduationCap, Calendar, Ruler, Weight, Star, Newspaper, BarChart2, ExternalLink, Scale, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';
import { WatchlistButton } from '@/components/WatchlistButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionNav } from '@/components/SectionNav';

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ slug: string }>;
}

function getDraftSlot(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick = rank - (round - 1) * 12;
    return `${round}.${String(pick).padStart(2, '0')}`;
}

// Human-readable format for the profile page: "Round 1, Pick 5"
function getDraftLabel(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick = rank - (round - 1) * 12;
    return `Round ${round}, Pick ${pick}`;
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
    QB: 'bg-red-500/20 text-red-400 border-red-500/40',
    RB: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    WR: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    TE: 'bg-violet-500/20 text-violet-400 border-violet-500/40',
};

async function getPlayer(slug: string) {
    try {
        const player = await queryOne<any>(`
            SELECT
                p.id, p.slug, p.full_name, p.first_name, p.last_name,
                p.position, p.dob, p.age_at_draft, p.height_inches, p.weight_lbs,
                p.star_rating, p.draft_year, p.headshot_url, p.nfl_team,
                p.breakout_age, p.breakout_year,
                p.recruiting_composite, p.recruiting_stars, p.recruiting_year,
                COALESCE(
                    (SELECT school FROM college_career WHERE player_id = p.id ORDER BY id DESC LIMIT 1),
                    p.nfl_team
                ) as school,
                cr.rank_overall as consensus_rank,
                cr.avg_rank, cr.best_rank, cr.num_sources,
                (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'KeepTradeCut' ORDER BY scraped_at DESC LIMIT 1) as ktc_rank,
                (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'Sleeper ADP' ORDER BY scraped_at DESC LIMIT 1) as sleeper_adp,
                (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyPros' ORDER BY scraped_at DESC LIMIT 1) as fp_rank,
                (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyCalc' ORDER BY scraped_at DESC LIMIT 1) as fc_rank,
                (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'DynastyNerds' ORDER BY scraped_at DESC LIMIT 1) as dn_rank
            FROM players p
            LEFT JOIN consensus_rankings cr ON p.id = cr.player_id
                AND cr.calculated_at = (
                    SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id
                )
            WHERE p.slug = $1
        `, [slug]);

        if (!player) return null;

        // Retrieve true board rank (array index)
        const orderedSlugs = await query<{ slug: string; full_name: string; position: string }>(`
            SELECT p.slug, p.full_name, p.position
            FROM players p
            LEFT JOIN consensus_rankings c ON p.id = c.player_id AND c.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id)
            WHERE p.draft_year = 2026
            ORDER BY c.rank_overall ASC NULLS LAST, p.id ASC
        `, []);

        const idx = orderedSlugs.findIndex(s => s.slug === slug);
        player.consensus_rank = idx >= 0 ? idx + 1 : null;

        const prevPlayer = idx > 0 ? orderedSlugs[idx - 1] : null;
        const nextPlayer = idx >= 0 && idx < orderedSlugs.length - 1 ? orderedSlugs[idx + 1] : null;

        const stats = await query<CollegeStats>(
            `SELECT * FROM (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY player_id, season
                    ORDER BY (COALESCE(pass_yards,0)+COALESCE(rush_yards,0)+COALESCE(rec_yards,0)) DESC
                ) as rn
                FROM college_stats WHERE player_id = $1
            ) t WHERE rn = 1 ORDER BY season DESC`,
            [player.id]
        );

        const rankings = await query<Ranking>(
            "SELECT * FROM rankings WHERE player_id = $1 ORDER BY scraped_at DESC",
            [player.id]
        );

        const measurables = await queryOne<Measurables>(
            "SELECT * FROM measurables WHERE player_id = $1",
            [player.id]
        );

        // Career aggregates for all position peers — used for percentile bars
        const peerCareer = await query<any>(`
            SELECT
                cs.player_id,
                SUM(COALESCE(cs.games_played, 0)) as games,
                SUM(COALESCE(cs.rush_yards, 0))   as rush_yards,
                SUM(COALESCE(cs.rush_attempts, 0)) as rush_att,
                SUM(COALESCE(cs.rec_yards, 0))    as rec_yards,
                SUM(COALESCE(cs.receptions, 0))   as receptions,
                SUM(COALESCE(cs.pass_yards, 0))   as pass_yards,
                SUM(COALESCE(cs.pass_attempts, 0)) as pass_att,
                SUM(COALESCE(cs.completions, 0))  as completions,
                SUM(COALESCE(cs.rush_tds, 0) + COALESCE(cs.rec_tds, 0) + COALESCE(cs.pass_tds, 0)) as total_tds
            FROM college_stats cs
            JOIN players p ON p.id = cs.player_id
            WHERE p.position = $1 AND p.draft_year = 2026
            GROUP BY cs.player_id
            HAVING SUM(COALESCE(cs.games_played, 0)) >= 1
        `, [player.position]);

        // Advanced career metrics for position peers — used for class rankings + extended percentiles
        const peerAdvanced = await query<any>(`
            SELECT
                cs.player_id,
                SUM(COALESCE(cs.routes_run, 0))               as routes,
                SUM(COALESCE(cs.targets, 0))                  as targets,
                SUM(COALESCE(cs.receptions, 0))               as receptions,
                SUM(COALESCE(cs.yards_after_catch, 0))        as yac,
                SUM(COALESCE(cs.missed_tackles_forced, 0))    as mtf,
                SUM(COALESCE(cs.first_downs, 0))              as first_downs,
                SUM(COALESCE(cs.rec_tds, 0))                  as rec_tds,
                SUM(COALESCE(cs.rec_yards, 0))                as rec_yards,
                SUM(COALESCE(cs.rush_yards, 0))               as rush_yards,
                SUM(COALESCE(cs.rush_attempts, 0))            as rush_att,
                SUM(COALESCE(cs.yards_after_contact, 0))      as yac_contact,
                SUM(COALESCE(cs.games_played, 0))             as games,
                CASE WHEN SUM(COALESCE(cs.routes_run, 0)) > 0
                    THEN SUM(COALESCE(cs.yprr, 0) * COALESCE(cs.routes_run, 0)) / SUM(COALESCE(cs.routes_run, 0))
                    ELSE NULL END                             as yprr_wavg,
                CASE WHEN SUM(COALESCE(cs.targets, 0)) > 0
                    THEN SUM(COALESCE(cs.target_share, 0) * COALESCE(cs.targets, 0)) / SUM(COALESCE(cs.targets, 0))
                    ELSE NULL END                             as target_share_wavg,
                CASE WHEN SUM(COALESCE(cs.rush_attempts, 0)) > 0
                    THEN SUM(COALESCE(cs.breakaway_run_rate, 0) * COALESCE(cs.rush_attempts, 0)) / SUM(COALESCE(cs.rush_attempts, 0))
                    ELSE NULL END                             as breakaway_wavg
            FROM college_stats cs
            JOIN players p ON p.id = cs.player_id
            WHERE p.position = $1 AND p.draft_year = 2026
            GROUP BY cs.player_id
            HAVING SUM(COALESCE(cs.games_played, 0)) >= 1
        `, [player.position]);

        // Compute speed score inline if not stored: (weight × 200) / (40yd)^4
        const speedScore: number | null = (() => {
            if (measurables && (measurables as any).speed_score) return (measurables as any).speed_score;
            const wt = player.weight_lbs;
            const ft = measurables && (measurables as any).forty_yard;
            if (wt && ft && ft > 0) return Math.round(((wt * 200) / (ft ** 4)) * 10) / 10;
            return null;
        })();

        const news = await query<any>(
            "SELECT * FROM news WHERE player_id = $1 ORDER BY published_at DESC LIMIT 8",
            [player.id]
        );

        // scraper_runs / missing_stats_log may not exist in all environments — fall back gracefully
        const lastScrape = await queryOne<{ completed_at: string }>(
            "SELECT MAX(scraped_at) as completed_at FROM rankings LIMIT 1", []
        ).catch(() => null);
        const scrapeDate = lastScrape?.completed_at ? new Date(lastScrape.completed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'March 7, 2026';

        const trustIndicator = stats && stats.length > 0
            ? `Stats via ESPN · Updated ${scrapeDate}`
            : `No stats available · Unscraped / Defensive Player`;

        // Historical athletic comps
        const historicalComps = await query<any>(
            `SELECT comp_name, comp_year, comp_round, comp_pick, comp_team,
                    comp_position, comp_w_av, comp_probowls, MAX(similarity) as similarity, shared_metrics
             FROM historical_comps WHERE player_id = $1
             GROUP BY comp_name
             ORDER BY similarity DESC LIMIT 3`,
            [player.id]
        ).catch(() => [] as any[]);

        // Best EPA/SP+ season for this player
        const epaStats = await query<any>(
            `SELECT season, epa_per_play, sp_rating FROM college_stats
             WHERE player_id = $1 AND epa_per_play IS NOT NULL
             ORDER BY season DESC LIMIT 3`,
            [player.id]
        ).catch(() => [] as any[]);

        // Dominator rating + market share by season
        const dominatorStats = await query<any>(
            `SELECT season, school, dominator_rating, market_share
             FROM college_stats
             WHERE player_id = $1 AND (dominator_rating IS NOT NULL OR market_share IS NOT NULL)
             ORDER BY season DESC LIMIT 5`,
            [player.id]
        ).catch(() => [] as any[]);

        // WR advanced career stats
        const wrAdvanced = (player.position === 'WR' || player.position === 'TE')
            ? await queryOne<any>("SELECT * FROM wr_advanced_career WHERE player_id = $1", [player.id]).catch(() => null)
            : null;

        // Peer WR advanced career for class rankings in butterfly chart
        const peerWrAdv = (player.position === 'WR' || player.position === 'TE')
            ? await query<any>(`
                SELECT wac.yprr, wac.zone_yprr, wac.man_yprr, wac.catch_rate, wac.drop_rate,
                       wac.adot, wac.yac_per_rec, wac.qbr_when_targeted, wac.td_per_route,
                       wac.first_down_rate, wac.forced_mtf_pct, wac.open_target_rate,
                       wac.air_yards_per_rec, wac.td_per_target, wac.first_down_per_target,
                       wac.target_rate, wac.contested_catch_rate, wac.yac_rate, wac.air_yards_rate
                FROM wr_advanced_career wac
                JOIN players p ON p.id = wac.player_id
                WHERE p.position = $1 AND p.draft_year = 2026
              `, [player.position]).catch(() => [] as any[])
            : [];

        return { player, stats: stats || [], rankings: rankings || [], measurables: measurables || null, speedScore, news: news || [], trustIndicator, peerCareer: peerCareer || [], peerAdvanced: peerAdvanced || [], historicalComps: historicalComps || [], epaStats: epaStats || [], dominatorStats: dominatorStats || [], prevPlayer, nextPlayer, wrAdvanced: wrAdvanced || null, peerWrAdv: peerWrAdv || [] };
    } catch (e) {
        console.error("DB Error:", e);
        return null;
    }
}

export default async function PlayerPage({ params }: PageProps) {
    const { slug } = await params;
    const data = await getPlayer(slug);

    if (!data || !data.player) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <div className="text-5xl mb-4">🏈</div>
                    <h2 className="text-2xl font-bold mb-2 text-foreground">Player not found</h2>
                    <p className="text-muted-foreground mb-6">"{slug}" isn't in our 2026 database.</p>
                    <Link href="/" className="text-primary hover:underline text-sm">← Back to Draft Board</Link>
                </div>
            </div>
        );
    }

    const { player, stats, rankings, measurables, speedScore, news, peerCareer, peerAdvanced, historicalComps, epaStats, dominatorStats, prevPlayer, nextPlayer, wrAdvanced, peerWrAdv } = data;
    const posStyle = POS_STYLES[player.position] || 'bg-gray-500/20 text-gray-400 border-gray-500/40 text-gray-300';
    const avatarBgMap: Record<string, string> = {
        QB: 'rgba(34, 211, 238, 0.12)',
        RB: 'rgba(52, 211, 153, 0.12)',
        WR: 'rgba(232, 121, 249, 0.12)',
        TE: 'rgba(167, 139, 250, 0.12)',
    };
    const avatarBg = avatarBgMap[player.position] || avatarBgMap.WR;
    // Best available headshot: stored URL → ESPN college CDN → placeholder
    const headshotUrl: string | null =
        player.headshot_url ??
        (player.espn_college_id ? `https://a.espncdn.com/i/headshots/college-football/players/full/${player.espn_college_id}.png` : null);
    const classRank: number | null = player.consensus_rank && player.consensus_rank > 0 ? player.consensus_rank : null;
    // PROJ PICK = KTC is the most reliable source for draft slot estimation
    const projRank: number | null = player.ktc_rank ?? player.consensus_rank ?? player.best_rank ?? null;
    const draftSlot = projRank ? getDraftSlot(projRank) : null;
    const headlines = POSITION_HEADLINE_STATS[player.position] || [];

    // Tier for scout tab
    function getTierInfo(rank: number): { label: string; color: string } {
        if (rank <= 5)  return { label: 'S Tier', color: 'bg-[#FF6B00]/20 text-[#FF9A50] border-[#FF6B00]/40' };
        if (rank <= 12) return { label: 'A Tier', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
        if (rank <= 24) return { label: 'B Tier', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' };
        if (rank <= 48) return { label: 'C Tier', color: 'bg-violet-500/20 text-violet-300 border-violet-500/40' };
        return { label: 'Depth', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
    }
    const tier = classRank ? getTierInfo(classRank) : { label: 'Unranked', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
    const recentStat = stats[0] ? { ...stats[0] } : null;

    // Derived stats for the summary bubbles calculated directly from accurate career database aggregations
    // For per-game averages, we must only sum attempts/yards for seasons where games_played is known!
    const statsWithGames = stats.filter(row => row.games_played && row.games_played > 0);
    const careerGamesStrict = statsWithGames.reduce((sum, row) => sum + (row.games_played ?? 0), 0);
    const validRushAtt = statsWithGames.reduce((sum, row) => sum + (row.rush_attempts ?? 0), 0);
    const validRecRecep = statsWithGames.reduce((sum, row) => sum + (row.receptions ?? 0), 0);
    const validTgt = statsWithGames.reduce((sum, row) => sum + (row.targets ?? 0), 0);
    const validRushYards = statsWithGames.reduce((sum, row) => sum + (row.rush_yards ?? 0), 0);
    const validRecYards = statsWithGames.reduce((sum, row) => sum + (row.rec_yards ?? 0), 0);

    const careerGames = stats.reduce((sum, row) => sum + (row.games_played ?? 0), 0);
    const careerRushYards = stats.reduce((sum, row) => sum + (row.rush_yards ?? 0), 0);
    const careerRushAttempts = stats.reduce((sum, row) => sum + (row.rush_attempts ?? 0), 0);
    const careerRecYards = stats.reduce((sum, row) => sum + (row.rec_yards ?? 0), 0);
    const careerReceptions = stats.reduce((sum, row) => sum + (row.receptions ?? 0), 0);
    // Only sum passing yards/completions from seasons where attempts were also recorded — prevents inflated YPA
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

    // Inject the aggregations to safely handle the position headlines components relying on "recentStat" mapping without refactoring the UI loop
    if (recentStat) {
        (recentStat as any).att_per_game = attPerGame;
        (recentStat as any).tgt_per_game = tgtPerGame;
        (recentStat as any).rec_per_game = recPerGame;
        (recentStat as any).completion_pct = compPct;
        (recentStat as any).yards_per_attempt = ypa;
        (recentStat as any).yards_per_carry = ypc !== '—' ? ypc : null;
        (recentStat as any).rush_yards_per_game = rushYpgNum !== null ? rushYpgNum : '—';
        (recentStat as any).yds_per_game = ydsPerGameNum !== null ? ydsPerGameNum : '—';
    }

    const hasAdvancedMetrics = totalScrimmageYards > 0 || totalTds > 0 || careerPassYards > 0;

    let statsGrid: any[] = [];
    if (player.position === 'QB') {
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
    } else if (player.position === 'RB') {
        statsGrid = [
            { label: 'Scrim. Yards', val: totalScrimmageYards, hint: 'Career Total' },
            { label: 'Total TDs', val: totalTds, hint: 'Rush + Rec + Pass' },
            { label: 'Yards/Carry', val: ypc, hint: 'Efficiency metric' },
            { label: 'Receptions', val: careerReceptions, hint: 'Volume metric' },
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
            { label: 'Receptions', val: careerReceptions, hint: 'Volume metric' },
            { label: 'Games Played', val: careerGames, hint: 'Contests played' },
            { label: 'Breakout Age', val: '—', hint: 'Age at 20%+ market share' },
            { label: 'Dom. Rating', val: '—', hint: 'Team target/yardage share %' },
            { label: 'Mkt Share', val: '—', hint: 'Team offensive share' },
        ];
    }

    // ── Percentile metrics vs. 2026 position peers ────────────────────────────
    const myPeer = peerCareer.find((p: any) => Number(p.player_id) === Number(player.id));
    const percentileMetrics: { label: string; value: string | number; percentile: number; unit?: string }[] = [];
    if (myPeer && peerCareer.length > 3) {
        const s = (v: any) => Number(v) || 0;
        const pos = player.position;
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

    // ── Advanced analytics ────────────────────────────────────────────────────
    // Helpers
    const sd = (a: number | null | undefined, b: number | null | undefined) =>
        a != null && b != null && b > 0 ? a / b : null;
    const clamp = (v: number, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, v));
    const classRankFn = (val: number, arr: number[], higherIsBetter = true): number =>
        higherIsBetter ? arr.filter(v => v > val).length + 1 : arr.filter(v => v < val).length + 1;

    const myAdv = peerAdvanced.find((p: any) => Number(p.player_id) === Number(player.id));

    // Career totals for this player
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

    // Weighted-avg rate stats from DB
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

    // Gauges, donuts, composite scores — position-specific
    type GaugeSpec = { label: string; displayValue: string; pct: number };
    type CompositeSpec = { label: string; score: number | null; description: string };
    const advGauges: GaugeSpec[] = [];
    const advComposites: CompositeSpec[] = [];
    type DonutProps = { title: string; labelA: string; valueA: number | null; labelB: string; valueB: number | null; colorA: string; colorB: string };
    let advDonutA: DonutProps | null = null;
    let advDonutB: DonutProps | null = null;
    const advRankingMetrics: RankingMetric[] = [];

    const pos = player.position;

    // Butterfly chart rows — built from wrAdvanced + peerWrAdv
    const butterflyRows: ButterflyRow[] = [];

    if (pos === 'WR' || pos === 'TE') {
        const wa = wrAdvanced as any;  // seeded career data
        const pw = peerWrAdv as any[]; // peer data for class ranks

        // Prefer seeded values; fall back to computed
        const catchRate  = wa?.catch_rate   ?? sd(carTotals.rec, carTotals.targets);
        const dropRate   = wa?.drop_rate    ?? carDropRate;
        const yacRec     = wa?.yac_per_rec  ?? sd(carTotals.yac, carTotals.rec);
        const adotVal    = wa?.adot         ?? sd(carTotals.airYds, carTotals.targets);
        const yprr       = wa?.yprr         ?? carYPRR;
        const contRate   = wa?.contested_catch_rate ?? carContestedRate;
        const rprr       = sd(carTotals.rec, carTotals.routes);

        const fmt1 = (v: number | null | undefined, d = 1) => v != null ? v.toFixed(d) : '—';
        const fmtPct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : '—';

        // ── Ring Gauges row 1: core efficiency ──────────────────────────────
        if (catchRate != null)  advGauges.push({ label: 'Catch Rate',    displayValue: fmtPct(catchRate),  pct: catchRate * 100 });
        if (wa?.open_target_rate != null) advGauges.push({ label: 'Open Tgt Rate', displayValue: fmtPct(wa.open_target_rate), pct: wa.open_target_rate * 100 });
        if (dropRate != null)   advGauges.push({ label: 'Drop Rate',     displayValue: fmtPct(dropRate),   pct: 100 - dropRate * 100 });
        if (contRate != null)   advGauges.push({ label: 'Contested%',    displayValue: fmtPct(contRate),   pct: contRate * 100 });
        if (wa?.forced_mtf_pct != null) advGauges.push({ label: 'FMT%', displayValue: fmtPct(wa.forced_mtf_pct), pct: Math.min(100, (wa.forced_mtf_pct / 0.35) * 100) });
        if (wa?.qbr_when_targeted != null) advGauges.push({ label: 'QBR When Tgt', displayValue: wa.qbr_when_targeted.toFixed(1), pct: Math.min(100, ((wa.qbr_when_targeted - 80) / 80) * 100) });
        if (yprr != null)       advGauges.push({ label: 'YPRR',          displayValue: fmt1(yprr, 2),       pct: Math.min(100, (yprr / 3.5) * 100) });
        if (wa?.zone_yprr != null) advGauges.push({ label: 'Zone YPRR',  displayValue: fmt1(wa.zone_yprr, 2), pct: Math.min(100, (wa.zone_yprr / 3.5) * 100) });
        if (wa?.man_yprr != null)  advGauges.push({ label: 'Man YPRR',   displayValue: fmt1(wa.man_yprr, 2),  pct: Math.min(100, (wa.man_yprr / 3.5) * 100) });

        // ── Donut splits ─────────────────────────────────────────────────────
        if (wa?.air_yards_rate != null && wa?.yac_rate != null) {
            advDonutA = { title: 'Air Yds / YAC Split', labelA: 'Air Yards', valueA: Math.round(wa.air_yards_rate * 100), colorA: '#06b6d4', labelB: 'YAC', valueB: Math.round(wa.yac_rate * 100), colorB: '#a78bfa' };
        } else if (carTotals.airYds > 0 && carTotals.yac > 0) {
            advDonutA = { title: 'Air Yds / YAC Split', labelA: 'Air Yards', valueA: carTotals.airYds, colorA: '#06b6d4', labelB: 'YAC', valueB: carTotals.yac, colorB: '#a78bfa' };
        }
        if (wa?.wide_rate != null && wa?.slot_rate != null) {
            advDonutB = { title: 'Alignment Split', labelA: 'Wide', valueA: Math.round(wa.wide_rate * 100), colorA: '#10b981', labelB: 'Slot', valueB: Math.round(wa.slot_rate * 100), colorB: '#f59e0b' };
        }

        // ── Composite scores ─────────────────────────────────────────────────
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

        // ── Class rankings (SeasonRankingsChart) from peerAdvanced ──────────
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

        // ── Butterfly chart — efficiency vs production ───────────────────────
        if (wa && pw.length > 3) {
            const pRank = (val: number | null | undefined, arr: (number | null | undefined)[], higherBetter = true) => {
                if (val == null) return null;
                const clean = arr.filter((v): v is number => v != null);
                if (clean.length === 0) return null;
                return higherBetter
                    ? clean.filter(v => v > val).length + 1
                    : clean.filter(v => v < val).length + 1;
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
        const ypc = sd(carTotals.rushYds, carTotals.rushAtt);
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

        const visionScore = ypc != null && yacAtt != null ? clamp((ypc/6)*5 + (yacAtt/2.5)*5) : null;
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
            if (ypcArr.length > 0 && ypc != null) advRankingMetrics.push({ label: 'YPC', value: ypc.toFixed(2), rank: classRankFn(ypc, ypcArr), total: ypcArr.length });
            if (mtfArr.length > 0 && carTotals.mtf > 0) advRankingMetrics.push({ label: 'MTF', value: String(carTotals.mtf), rank: classRankFn(carTotals.mtf, mtfArr), total: mtfArr.length });
        }

    } else if (pos === 'QB') {
        const carComp = stats.reduce((a, s) => a + (s.completions ?? 0), 0);
        const carAtt  = stats.reduce((a, s) => a + (s.pass_attempts ?? 0), 0);
        const carPassYds = stats.reduce((a, s) => a + (s.pass_yards ?? 0), 0);
        const compPct = sd(carComp, carAtt);
        const ypa = sd(carPassYds, carAtt);
        const carQBR = stats.length > 0 ? (() => {
            const wSum = stats.reduce((s, r) => s + (r.pass_attempts ?? 0), 0);
            if (wSum === 0) return null;
            return stats.reduce((s, r) => s + (r.qbr ?? 0) * (r.pass_attempts ?? 0), 0) / wSum;
        })() : null;

        if (compPct != null) advGauges.push({ label: 'Comp%', displayValue: `${(compPct*100).toFixed(1)}%`, pct: Math.min(100, ((compPct - 0.50) / 0.20) * 100) });
        if (ypa != null) advGauges.push({ label: 'YPA', displayValue: ypa.toFixed(1), pct: Math.min(100, ((ypa - 5) / 6) * 100) });
        if (carQBR != null) advGauges.push({ label: 'QBR', displayValue: carQBR.toFixed(1), pct: carQBR });
        if (carTotals.rushYds > 0 && carTotals.gp > 0) advGauges.push({ label: 'Rush Yds/G', displayValue: (carTotals.rushYds/carTotals.gp).toFixed(1), pct: Math.min(100, (carTotals.rushYds/carTotals.gp / 60) * 100) });

        const carTds = stats.reduce((a, s) => a + (s.pass_tds ?? 0), 0);
        const carInts = stats.reduce((a, s) => a + (s.interceptions ?? 0), 0);
        const tdInt = sd(carTds, carInts);
        const passYpg = sd(carPassYds, carTotals.gp);
        const accScore = compPct != null && ypa != null ? clamp((compPct/0.66)*5 + (ypa/9.0)*5) : null;
        const mobilityScore = carTotals.gp > 0 ? clamp((carTotals.rushYds/carTotals.gp / 50) * 10) : null;
        const prodScore = passYpg != null && tdInt != null ? clamp((passYpg/280)*5 + (tdInt/4)*5) : null;

        advComposites.push(
            { label: 'Accuracy', score: accScore, description: 'Comp% + YPA' },
            { label: 'Mobility', score: mobilityScore, description: 'Rush Yards/G' },
            { label: 'Production', score: prodScore, description: 'Pass Yds/G + TD:INT' },
        );
    }

    const hasAdvancedAnalytics = stats.length > 0 && ['WR', 'TE', 'RB', 'QB'].includes(pos);

    // Early declare detection: first stat season >= 2023 means they're entering before senior year
    const firstStatSeason = stats.length > 0 ? Math.min(...stats.map(s => s.season ?? 9999)) : null;
    const isEarlyDeclare = firstStatSeason != null && firstStatSeason >= 2023 && player.draft_year === 2026;
    const earlyDeclareLabel = firstStatSeason === 2024 ? 'Sophomore Declare' : firstStatSeason === 2023 ? 'Junior Declare' : null;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <SectionNav />
            {/* Top nav bar */}
            <header className="border-b border-border/60 bg-card/60 backdrop-blur-md sticky top-0 z-50">
                <div className="w-full mx-auto px-8 sm:px-12 h-14 flex items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:block">Draft Board</span>
                    </Link>

                    {/* Player prev/next navigation */}
                    <div className="flex items-center gap-6 flex-1 justify-center min-w-0">
                        {prevPlayer ? (
                            <Link
                                href={`/players/${prevPlayer.slug}`}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors group min-w-0 max-w-[180px] sm:max-w-[240px]"
                            >
                                <ChevronLeft className="w-4 h-4 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
                                <span className="truncate">{prevPlayer.full_name}</span>
                            </Link>
                        ) : (
                            <div className="w-[140px] sm:w-[180px]" />
                        )}

                        <div className="w-px h-4 bg-border/50 shrink-0" />

                        {nextPlayer ? (
                            <Link
                                href={`/players/${nextPlayer.slug}`}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors group min-w-0 max-w-[180px] sm:max-w-[240px]"
                            >
                                <span className="truncate">{nextPlayer.full_name}</span>
                                <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                        ) : (
                            <div className="w-[140px] sm:w-[180px]" />
                        )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={2.5} />
                        </div>
                        <span className="text-sm font-semibold text-foreground hidden sm:block">Elite Rookie Scouter</span>
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-6 sm:px-10 py-10">
                {/* ── Profile Section ── */}
                <div id="overview" className="flex flex-col lg:flex-row gap-8 mb-10">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                        <div
                            className="w-36 h-44 rounded-2xl border border-border/40 overflow-hidden shadow-xl relative"
                            style={{ background: avatarBg }}
                        >
                            {headshotUrl ? (
                                <img
                                    src={headshotUrl}
                                    alt={player.full_name}
                                    className="w-full h-full object-cover object-top"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                    <div className="text-5xl text-muted-foreground/20 leading-none select-none">🏈</div>
                                    <div
                                        style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 800, lineHeight: 1 }}
                                        className={`border ${posStyle} bg-background/80`}
                                    >
                                        {player.position}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Name + info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                                    {player.full_name}
                                </h1>
                                <Badge variant="outline" className={cn("text-sm font-bold border px-2.5", posStyle)}>
                                    {player.position}
                                </Badge>
                                <WatchlistButton playerSlug={player.slug} variant="icon" className="w-6 h-6 ml-2" />
                            </div>

                            {/* Compare CTA moved to top right */}
                            <Link
                                href={`/compare?a=${player.slug}`}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border/60 text-sm font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 shadow-sm"
                            >
                                <Scale className="w-4 h-4" />
                                ⚖ Compare Player
                            </Link>
                        </div>

                        {/* Quick meta pills row */}
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-4">
                            {player.school && (
                                <span className="flex items-center gap-1">
                                    <GraduationCap className="w-3.5 h-3.5" /> {player.school}
                                </span>
                            )}
                            {player.age_at_draft && (
                                <>
                                    <span className="opacity-30">·</span>
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5" /> Age {player.age_at_draft}
                                    </span>
                                </>
                            )}
                            {player.height_inches && (
                                <>
                                    <span className="opacity-30">·</span>
                                    <span className="flex items-center gap-1">
                                        <Ruler className="w-3.5 h-3.5" /> {formatHeight(player.height_inches)}
                                    </span>
                                </>
                            )}
                            {player.weight_lbs && (
                                <>
                                    <span className="opacity-30">·</span>
                                    <span className="flex items-center gap-1">
                                        <Weight className="w-3.5 h-3.5" /> {player.weight_lbs} lbs
                                    </span>
                                </>
                            )}
                            {player.star_rating && (
                                <>
                                    <span className="opacity-30">·</span>
                                    <span className="flex items-center gap-1 text-yellow-400">
                                        <Star className="w-3.5 h-3.5 fill-yellow-400" /> {player.star_rating}-star recruit
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Standardized 4-Col Header Badges */}
                        <div className="flex flex-wrap gap-3 mt-5">
                            {/* Class Rank — tier-colored accent */}
                            <div className={cn(
                                'rounded-xl px-4 py-3 flex-1 min-w-[110px] text-center shadow-sm border relative overflow-hidden',
                                tier.color
                            )}>
                                <div className="text-3xl font-black leading-none font-mono">#{classRank ?? '—'}</div>
                                <div className="text-[10px] uppercase tracking-widest mt-1.5 opacity-70 font-bold">Class Rank</div>
                            </div>
                            {/* Dynasty ADP */}
                            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex-1 min-w-[110px] text-center shadow-sm">
                                <div className="text-xl font-black text-foreground leading-tight font-mono">
                                    {projRank ? getDraftSlot(projRank) : '—'}
                                </div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1.5 font-bold">Proj. Pick</div>
                            </div>
                            {/* KTC Dynasty */}
                            <div className="bg-card border border-cyan-500/30 rounded-xl px-4 py-3 flex-1 min-w-[110px] text-center shadow-sm" style={{ background: 'rgba(34,211,238,0.04)' }}>
                                <div className="text-3xl font-black text-cyan-400 leading-none font-mono">{player.ktc_rank ? `#${player.ktc_rank}` : '—'}</div>
                                <div className="text-[10px] text-cyan-400/60 uppercase tracking-widest mt-1.5 font-bold">KTC Dynasty</div>
                            </div>
                            {/* Avg Rank */}
                            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex-1 min-w-[110px] text-center shadow-sm">
                                <div className="text-3xl font-black text-foreground leading-none font-mono">
                                    {player.avg_rank ? `#${Math.round(player.avg_rank)}` : '—'}
                                </div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1.5 font-bold">
                                    Avg Rank
                                    {player.num_sources > 0 && <span className="ml-1 opacity-50">({player.num_sources} src)</span>}
                                </div>
                            </div>
                        </div>


                    </div>
                </div>


                {/* ── Headline stats row (if we have stats) ── */}
                {recentStat && headlines.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
                        {headlines.map((m, i) => {
                            const val = (recentStat as any)[m.key];
                            const display = val != null && val !== 0 && val !== '0' && val !== '0.0' ? val : '—';
                            const hasVal = display !== '—';
                            // Rotate accent colors across the stat strip
                            return (
                                <div key={m.key} className="bg-card border border-border/40 rounded-xl px-3 py-5 flex flex-col items-center justify-center gap-2 hover:border-border/70 transition-colors">
                                    <span className="text-[9px] text-muted-foreground/50 font-bold uppercase tracking-widest leading-none">{m.label}</span>
                                    <span className={`text-2xl font-black leading-none font-mono ${hasVal ? 'text-foreground' : 'text-muted-foreground/20'}`}>
                                        {display}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Sections ── */}
                <div className="space-y-16">
                    {/* ── Scout Section ── */}
                    <section id="scout">
                        <div className="flex items-center gap-3 mb-8">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 shrink-0">Scout Report</h2>
                            <div className="flex-1 h-px bg-border/30" />
                        </div>
                        <div className="space-y-10">

                            {/* ── Dynasty Snapshot ── */}
                            <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 p-5">
                                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[96px] font-black text-foreground/[0.03] leading-none select-none pointer-events-none">
                                    {player.position}
                                </div>
                                <div className="relative z-10 flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className={cn('border text-sm font-black px-3 py-1 rounded-full', tier.color)}>
                                            {tier.label}
                                        </span>
                                        {projRank && (
                                            <span className="text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full border border-border/40">
                                                {projRank <= 12 ? '1st-Round Dynasty Pick' : projRank <= 24 ? '2nd-Round Dynasty Pick' : projRank <= 36 ? '3rd-Round Dynasty Pick' : 'Late-Round Dynasty Pick'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── Source Rankings Visual ── */}
                            {[classRank, player.ktc_rank, player.fp_rank, (player as any).fc_rank, (player as any).dn_rank].some(r => r != null) && (() => {
                                const sources = [
                                    { label: 'Consensus', rank: classRank, bar: 'bg-primary' },
                                    { label: 'KTC Dynasty', rank: player.ktc_rank as number | null, bar: 'bg-cyan-400' },
                                    { label: 'FantasyPros', rank: player.fp_rank as number | null, bar: 'bg-emerald-400' },
                                    { label: 'FantasyCalc', rank: (player as any).fc_rank as number | null, bar: 'bg-blue-400' },
                                    { label: 'Dyn. Nerds', rank: (player as any).dn_rank as number | null, bar: 'bg-violet-400' },
                                ].filter(s => s.rank != null) as { label: string; rank: number; bar: string }[];
                                const maxScale = Math.max(50, ...sources.map(s => s.rank));
                                return (
                                    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                                        <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
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
                                                    <div key={src.label} className="grid grid-cols-[100px_1fr_52px_24px] items-center gap-3">
                                                        <span className="text-[11px] text-muted-foreground font-medium">{src.label}</span>
                                                        <div className="relative h-3.5 bg-border/20 rounded-full overflow-hidden">
                                                            <div
                                                                className={`absolute left-0 top-0 h-full rounded-full ${src.bar} opacity-75 transition-all duration-700`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                            {/* R1/R2 reference lines */}
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

                            {/* ── Two-column layout ── */}
                            <div id="athletics" className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                {/* Left: Athletic profile + recruiting */}
                                <div className="space-y-6">

                                    {/* Athletic grades */}
                                    <AthleticsCard
                                        position={player.position}
                                        heightInches={player.height_inches}
                                        weightLbs={player.weight_lbs}
                                        measurables={measurables}
                                        speedScore={speedScore}
                                    />

                                    {/* Recruiting spotlight */}
                                    {((player as any).recruiting_composite || (player as any).recruiting_stars) && (
                                        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                                            <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                                                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recruiting Pedigree</span>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                {(player as any).recruiting_stars && (
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-muted-foreground">Star Rating</span>
                                                        <span className="text-yellow-400 font-black text-lg">{'★'.repeat((player as any).recruiting_stars)}</span>
                                                    </div>
                                                )}
                                                {(player as any).recruiting_composite && (
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-muted-foreground">Composite Rating</span>
                                                        <span className="text-sm font-black font-mono text-foreground">{Number((player as any).recruiting_composite).toFixed(4)}</span>
                                                    </div>
                                                )}
                                                {(player as any).recruiting_year && (() => {
                                                    const composite = Number((player as any).recruiting_composite || 0);
                                                    // Bar showing 0.8500 (avg) to 1.0000 (elite)
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
                                                                <span className="text-xs font-bold text-foreground/70">{(player as any).recruiting_year}</span>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                    {/* Breakout + Draft Entry Profile */}
                                    {(player.breakout_age || isEarlyDeclare) && (
                                        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                                            <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
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

                                </div>

                                {/* Right: Production visualizations */}
                                <div className="space-y-6">

                                    {/* Career production bar chart */}
                                    {stats.length > 0 && (
                                        <StatTrendChart stats={stats} position={player.position} />
                                    )}

                                    {/* Dominator rating visual */}
                                    {dominatorStats.length > 0 && (
                                        <DominatorChart data={dominatorStats} position={player.position} />
                                    )}

                                    {/* Percentile bars vs. class */}
                                    {percentileMetrics.length > 0 && (
                                        <PercentileChart metrics={percentileMetrics} position={player.position} />
                                    )}

                                    {/* EPA / Competition — shown here if no dominator data */}
                                    {epaStats && epaStats.length > 0 && dominatorStats.length === 0 && (
                                        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
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

                            {/* ── Dynasty Context + Historical Comps ── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                {/* Dynasty context narrative */}
                                <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dynasty Context</span>
                                    </div>
                                    <div className="p-4 space-y-3 text-sm text-muted-foreground">
                                        <div className="flex items-start gap-2">
                                            <span className="text-primary font-bold mt-0.5 shrink-0">→</span>
                                            <span>Projected as a <strong className="text-foreground">{projRank ? (projRank <= 12 ? '1st-round' : projRank <= 24 ? '2nd-round' : projRank <= 36 ? '3rd-round' : 'late-round') : 'unranked'}</strong> dynasty pick based on consensus ranking.</span>
                                        </div>
                                        {player.position === 'RB' && (() => {
                                            const scrimYds = (recentStat?.rush_yards || 0) + (recentStat?.rec_yards || 0);
                                            const scrimYpg = recentStat?.games_played ? (scrimYds / recentStat.games_played).toFixed(1) : '—';
                                            const rasScore = (measurables as any)?.ras || '—';
                                            const yr = recentStat?.season || '2025';
                                            const projStr = projRank ? (projRank <= 12 ? '1st' : projRank <= 24 ? '2nd' : projRank <= 36 ? '3rd' : 'late') : 'unranked';
                                            return <div className="flex items-start gap-2"><span className="text-amber-400 font-bold mt-0.5 shrink-0">→</span><span>{player.last_name} averaged <strong className="text-foreground">{scrimYpg} scrim. yds/G</strong> in {yr} with a <strong className="text-foreground">{rasScore} RAS</strong> — {projStr}-round dynasty asset.</span></div>;
                                        })()}
                                        {player.position === 'WR' && (() => {
                                            const ypg = (recentStat as any)?.yds_per_game || '—';
                                            const rpg = (recentStat as any)?.rec_per_game || '—';
                                            const yr = recentStat?.season || '2025';
                                            const rasScore = (measurables as any)?.ras || '—';
                                            const ht = player.height_inches || 72;
                                            const sizeDesc = ht >= 74 ? `big-bodied (${Math.floor(ht / 12)}'${ht % 12}")` : `slot-frame (${Math.floor(ht / 12)}'${ht % 12}")`;
                                            return <div className="flex items-start gap-2"><span className="text-fuchsia-400 font-bold mt-0.5 shrink-0">→</span><span>{player.last_name} averaged <strong className="text-foreground">{ypg} rec yds/G</strong> ({rpg} rec/G) in {yr} — {sizeDesc} with <strong className="text-foreground">{rasScore} RAS</strong>.</span></div>;
                                        })()}
                                        {player.position === 'QB' && (() => {
                                            const cmp = (recentStat as any)?.completion_pct || '—';
                                            const pyds = recentStat?.pass_yards || '—';
                                            const ptds = recentStat?.pass_tds || '—';
                                            const ryds = recentStat?.rush_yards || 0;
                                            const yr = recentStat?.season || '2025';
                                            const mob = ryds >= 300 ? 'dual-threat' : 'pocket passer';
                                            return <div className="flex items-start gap-2"><span className="text-cyan-400 font-bold mt-0.5 shrink-0">→</span><span>{player.last_name} completed <strong className="text-foreground">{cmp}</strong> of passes for <strong className="text-foreground">{pyds} yds / {ptds} TDs</strong> in {yr} — <strong className="text-foreground">{mob}</strong> profile.</span></div>;
                                        })()}
                                        {player.position === 'TE' && <div className="flex items-start gap-2"><span className="text-violet-400 font-bold mt-0.5 shrink-0">→</span><span>Elite TEs are extremely rare — top-12 TEs in the 1st round represent <strong className="text-foreground">generational dynasty value</strong>.</span></div>}
                                        {player.age_at_draft && (
                                            <div className="flex items-start gap-2">
                                                <span className="text-muted-foreground/50 font-bold mt-0.5 shrink-0">→</span>
                                                <span>Draft age <strong className="text-foreground">{player.age_at_draft}</strong> — {player.age_at_draft <= 21 ? <span className="text-emerald-400 font-bold">young prospect with long NFL runway</span> : player.age_at_draft <= 23 ? <span className="text-cyan-400 font-bold">prime age for NFL entry</span> : <span className="text-yellow-400 font-bold">older prospect, shorter dynasty window</span>}.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Historical athletic comps */}
                                {historicalComps && historicalComps.length > 0 ? (
                                    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                                        <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
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
                                ) : (
                                    <div className="rounded-xl border border-dashed border-border/40 bg-card/20 p-8 text-center">
                                        <p className="text-sm text-muted-foreground/40">No historical comps data yet</p>
                                    </div>
                                )}

                            </div>

                            {/* ── Advanced Analytics Panel ── */}
                            {hasAdvancedAnalytics && (
                                <div id="analytics" className="space-y-5">
                                    <div className="flex items-center gap-2 pt-1">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Advanced Analytics</h3>
                                        <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold border border-primary/20">
                                            {player.position} · CLASS 2026
                                        </span>
                                    </div>

                                    {/* Ring Gauges */}
                                    {advGauges.length > 0 && (
                                        <div className={`grid gap-3 ${advGauges.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                                            {advGauges.map(g => (
                                                <div key={g.label} className="bg-card border border-border/40 rounded-xl p-3 flex justify-center">
                                                    <StatRingGauge {...g} />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Donut Splits */}
                                    {(advDonutA != null || advDonutB != null) && (
                                        <div className={`grid gap-3 ${advDonutA != null && advDonutB != null ? 'grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
                                            {advDonutA != null && <DonutSplit title={(advDonutA as DonutProps).title} labelA={(advDonutA as DonutProps).labelA} valueA={(advDonutA as DonutProps).valueA} labelB={(advDonutA as DonutProps).labelB} valueB={(advDonutA as DonutProps).valueB} colorA={(advDonutA as DonutProps).colorA} colorB={(advDonutA as DonutProps).colorB} />}
                                            {advDonutB != null && <DonutSplit title={(advDonutB as DonutProps).title} labelA={(advDonutB as DonutProps).labelA} valueA={(advDonutB as DonutProps).valueA} labelB={(advDonutB as DonutProps).labelB} valueB={(advDonutB as DonutProps).valueB} colorA={(advDonutB as DonutProps).colorA} colorB={(advDonutB as DonutProps).colorB} />}
                                        </div>
                                    )}

                                    {/* Composite Score Rings */}
                                    {advComposites.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Composite Scores</h4>
                                            <div className={`grid gap-3 ${advComposites.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                                                {advComposites.map(c => (
                                                    <div key={c.label} className="bg-card border border-border/40 rounded-xl p-3 flex flex-col items-center gap-1.5">
                                                        <StatRingGauge
                                                            label={c.label}
                                                            displayValue={c.score != null ? c.score.toFixed(1) : '—'}
                                                            pct={c.score != null ? (c.score / 10) * 100 : 0}
                                                            size={80}
                                                            strokeWidth={8}
                                                        />
                                                        <div className="text-[9px] text-muted-foreground/35 text-center leading-tight">{c.description}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Butterfly Chart */}
                                    {butterflyRows.length > 0 && (
                                        <ButterflyChart
                                            rows={butterflyRows}
                                            effTitle="Efficiency"
                                            prodTitle="Production"
                                            rankTitle="Percentile Rank"
                                        />
                                    )}

                                    {/* Class Rankings Chart */}
                                    {advRankingMetrics.length > 0 && (
                                        <SeasonRankingsChart
                                            metrics={advRankingMetrics}
                                            title={`Career Class Rankings · ${player.position}`}
                                        />
                                    )}

                                    {/* Advanced Stats Table */}
                                    <div>
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Advanced Season Stats</h4>
                                        <AdvancedStatsTable stats={stats} position={player.position} />
                                    </div>
                                </div>
                            )}

                        </div>
                    </section>

                    {/* ── Stats Section ── */}
                    <section id="stats">
                        <div className="flex items-center gap-3 mb-8">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 shrink-0">College Stats</h2>
                            <div className="flex-1 h-px bg-border/30" />
                        </div>
                        {stats.length > 0 ? (
                            <div className="space-y-7">
                                <StatsTable stats={stats} position={player.position} />

                                {hasAdvancedMetrics && (
                                    <div className="bg-card border border-border/40 rounded-xl p-6">
                                        <div className="flex items-center gap-2 mb-5">
                                            <BarChart2 className="w-4 h-4 text-muted-foreground/50" />
                                            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Career Production</span>
                                            <span className="ml-auto text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-0.5 rounded-full">Aggregated</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                            {statsGrid.map((m) => {
                                                const hasVal = m.val != null && m.val !== 0 && m.val !== '—';
                                                return (
                                                    <div key={m.label} className="bg-muted/30 border border-border/30 rounded-xl p-4 flex flex-col gap-1.5">
                                                        <div className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-bold leading-none">{m.label}</div>
                                                        <div className={`text-2xl font-black font-mono leading-none ${hasVal ? 'text-foreground' : 'text-muted-foreground/20'}`}>
                                                            {hasVal ? m.val : '—'}
                                                        </div>
                                                        <div className="text-[9px] text-muted-foreground/40 leading-none">{m.hint}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}



                                <div className="text-right text-[10px] text-muted-foreground font-medium uppercase tracking-wide opacity-60">
                                    {data.trustIndicator}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-card border border-dashed border-border/60 rounded-xl p-8 text-center">
                                    <BarChart2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                                    <p className="text-muted-foreground text-sm font-semibold">Season stats not yet available</p>
                                    <div className="text-center mt-4 text-[10px] text-muted-foreground font-medium uppercase tracking-wide opacity-60">
                                        {data.trustIndicator}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Combine / athletic testing */}
                        <div className="mt-8 pt-6 border-t border-border/20">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-4">Athletic Testing</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {([
                                    {
                                        label: '40 Yard Dash', key: 'forty_yard', unit: 's', src: measurables,
                                        disputed: measurables && (measurables as any).forty_disputed,
                                        proDay: measurables && (measurables as any).is_pro_day,
                                    },
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
                                        <div key={m.key} className={`bg-card border rounded-xl p-5 text-center ${display ? 'border-border/40' : 'border-dashed border-border/20 opacity-50'} flex flex-col justify-center items-center relative gap-1`}>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                                {m.label}
                                            </div>
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
                    </section>

                    {/* ── Rankings Section ── */}
                    <section id="rankings">
                        <div className="flex items-center gap-3 mb-8">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 shrink-0">Expert Rankings</h2>
                            <div className="flex-1 h-px bg-border/30" />
                        </div>
                        <SourceRankings
                            rankings={rankings}
                            consensusRank={player.consensus_rank ?? null}
                        />
                    </section>

                    {/* ── News Section ── */}
                    <section id="news">
                        <div className="flex items-center gap-3 mb-8">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 shrink-0">Latest News</h2>
                            <div className="flex-1 h-px bg-border/30" />
                        </div>
                        {news.length > 0 ? (
                            <div className="space-y-4">
                                {/* Top summary header removed (Latest Buzz) */}

                                {/* Individual articles */}
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
                                                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2 mb-1">
                                                    {article.title}
                                                </p>

                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                    <span className="font-medium">{article.source}</span>
                                                    {article.published_at && (
                                                        <>
                                                            <span>·</span>
                                                            <span>{timeAgo(article.published_at)}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary/60 flex-shrink-0 mt-0.5" />
                                        </a>
                                    ))}
                                </div>
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
        </div>
    );
}
