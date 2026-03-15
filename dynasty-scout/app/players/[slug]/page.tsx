import { query, queryOne } from '@/lib/db';
import { Player, CollegeStats, Measurables, Ranking } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatsTable } from '@/components/StatsTable';
import { StatTrendChart } from '@/components/StatTrendChart';
import { PercentileChart } from '@/components/PercentileChart';
import { SourceRankings } from '@/components/SourceRankings';
import { POSITION_COLORS, POSITION_HEADLINE_STATS } from '@/lib/constants';
import { ArrowLeft, GraduationCap, Calendar, Ruler, Weight, Star, Trophy, Newspaper, BarChart2, TrendingUp, ExternalLink, Scale, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';
import { WatchlistButton } from '@/components/WatchlistButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
                (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyPros' ORDER BY scraped_at DESC LIMIT 1) as fp_rank
            FROM players p
            LEFT JOIN consensus_rankings cr ON p.id = cr.player_id
                AND cr.calculated_at = (
                    SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id
                )
            WHERE p.slug = $1
        `, [slug]);

        if (!player) return null;

        // Retrieve true board rank (array index)
        const orderedSlugs = await query<{ slug: string }>(`
            SELECT p.slug
            FROM players p
            LEFT JOIN consensus_rankings c ON p.id = c.player_id AND c.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id)
            WHERE p.draft_year = 2026
            ORDER BY c.rank_overall ASC NULLS LAST
        `, []);

        player.consensus_rank = orderedSlugs.findIndex(s => s.slug === slug) + 1;

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

        const missingLog = await query<{ reason: string }>(
            "SELECT $1::text as reason LIMIT 0", ['']
        ).catch(() => [] as { reason: string }[]);

        let trustIndicator = '';
        if (player.espn_college_id) {
            trustIndicator = `Stats via ESPN · Updated ${scrapeDate}`;
        } else if (player.cfbref_id) {
            trustIndicator = `Stats via CFB Reference · Updated ${scrapeDate}`;
        } else if (stats && stats.length > 0) {
            trustIndicator = `Stats manually verified · ${scrapeDate}`;
        } else {
            const reason = missingLog && missingLog.length > 0 ? missingLog[0].reason : 'Unscraped / Defensive Player';
            trustIndicator = `No stats available · ${reason}`;
        }

        // Historical athletic comps
        const historicalComps = await query<any>(
            `SELECT comp_name, comp_year, comp_round, comp_pick, comp_team,
                    comp_position, comp_w_av, comp_probowls, similarity, shared_metrics
             FROM historical_comps WHERE player_id = $1 ORDER BY similarity DESC LIMIT 3`,
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

        return { player, stats: stats || [], rankings: rankings || [], measurables: measurables || null, speedScore, news: news || [], trustIndicator, peerCareer: peerCareer || [], historicalComps: historicalComps || [], epaStats: epaStats || [], dominatorStats: dominatorStats || [] };
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

    const { player, stats, rankings, measurables, speedScore, news, peerCareer, historicalComps, epaStats, dominatorStats } = data;
    const posStyle = POS_STYLES[player.position] || 'bg-gray-500/20 text-gray-400 border-gray-500/40 text-gray-300';
    const avatarBgMap: Record<string, string> = {
        QB: 'rgba(34, 211, 238, 0.15)',
        RB: 'rgba(52, 211, 153, 0.15)',
        WR: 'rgba(232, 121, 249, 0.15)',
        TE: 'rgba(167, 139, 250, 0.15)',
    };
    const avatarBg = avatarBgMap[player.position] || avatarBgMap.WR;
    const classRank: number | null = player.consensus_rank && player.consensus_rank > 0 ? player.consensus_rank : null;
    // PROJ PICK = KTC is the most reliable source for draft slot estimation
    const projRank: number | null = player.ktc_rank ?? player.consensus_rank ?? player.best_rank ?? null;
    const draftSlot = projRank ? getDraftSlot(projRank) : null;
    const headlines = POSITION_HEADLINE_STATS[player.position] || [];
    const recentStat = stats[0] || null;

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

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Top nav bar */}
            <header className="border-b border-border/60 bg-card/60 backdrop-blur-md sticky top-0 z-50">
                <div className="w-full mx-auto px-6 sm:px-8 h-14 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        <span>Draft Board</span>
                    </Link>
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={2.5} />
                        </div>
                        <span className="text-sm font-semibold text-foreground hidden sm:block">Elite Rookie Scouter</span>
                    </div>
                </div>
            </header>

            <div className="w-full mx-auto px-6 sm:px-8 py-8">
                {/* ── Profile Section ── */}
                <div className="flex flex-col lg:flex-row gap-6 mb-8">
                    {/* Avatar — football silhouette placeholder */}
                    <div className="flex-shrink-0">
                        <div className="w-36 h-36 rounded-3xl border border-border/60 overflow-hidden flex items-center justify-center shadow-lg relative" style={{ background: avatarBg }}>
                            {player.headshot_url ? (
                                <img src={player.headshot_url} alt={player.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="flex flex-col items-center gap-1 z-10 relative">
                                    {/* Jersey number / silhouette */}
                                    <div className="text-4xl font-black text-muted-foreground/30 leading-none select-none mb-2">🏈</div>
                                    <div
                                        style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 800, lineHeight: 1 }}
                                        className={`border ${posStyle} bg-background/80`}
                                    >
                                        {player.position}
                                    </div>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
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
                        <div className="flex flex-wrap gap-3 mt-4">
                            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex-1 min-w-[100px] text-center shadow-sm">
                                <div className="text-2xl font-black text-foreground leading-none">#{classRank ?? '—'}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Class Rank</div>
                            </div>
                            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex-1 min-w-[100px] text-center shadow-sm">
                                <div className="text-lg font-black text-foreground leading-none">{projRank ? getDraftLabel(projRank) : '—'}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Dynasty ADP</div>
                            </div>
                            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex-1 min-w-[100px] text-center shadow-sm">
                                <div className="text-2xl font-black text-cyan-400 leading-none">{player.ktc_rank ? `#${player.ktc_rank}` : '—'}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">KTC Dynasty</div>
                            </div>
                            <div className="bg-card border border-border/60 rounded-xl px-4 py-3 flex-1 min-w-[100px] text-center shadow-sm">
                                <div className="text-2xl font-black text-foreground leading-none">{player.num_sources || '—'}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Sources</div>
                            </div>
                        </div>


                    </div>
                </div>


                {/* ── Headline stats row (if we have stats) ── */}
                {recentStat && headlines.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
                        {headlines.map((m) => {
                            const val = (recentStat as any)[m.key];
                            return (
                                <div key={m.key} className="bg-card border border-border/60 rounded-xl p-3 flex flex-col items-center justify-center">
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{m.label}</span>
                                    <span className="text-xl font-black text-foreground mt-1">{val != null && val !== 0 && val !== '0' && val !== '0.0' ? val : '—'}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Tabs ── */}
                <Tabs defaultValue="stats">
                    <TabsList className="bg-card border border-border/60 mb-6 h-10 w-full justify-start rounded-xl overflow-x-auto overflow-y-hidden">
                        <TabsTrigger value="stats" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex-1">
                            📊 <span className="ml-0.5">Stats</span>
                        </TabsTrigger>
                        <TabsTrigger value="rankings" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex-1">
                            🏆 <span className="ml-0.5">Rankings</span>
                        </TabsTrigger>
                        <TabsTrigger value="scout" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex-1">
                            🔬 <span className="ml-0.5">Scout</span>
                        </TabsTrigger>
                        <TabsTrigger value="draft" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex-1">
                            📋 <span className="ml-0.5">Draft</span>
                        </TabsTrigger>
                        <TabsTrigger value="news" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-none flex-1">
                            📰 <span className="ml-0.5">News</span> {news.length > 0 && <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">{news.length}</span>}
                        </TabsTrigger>
                    </TabsList>

                    {/* Stats Tab */}
                    <TabsContent value="stats">
                        {stats.length > 0 ? (
                            <div className="space-y-6">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">College Career Stats</h3>
                                <StatsTable stats={stats} position={player.position} />

                                <StatTrendChart stats={stats} position={player.position} />

                                {hasAdvancedMetrics && (
                                    <div className="bg-card border border-border/60 rounded-xl p-5">
                                        <div className="flex items-center gap-2 mb-4">
                                            <BarChart2 className="w-5 h-5 text-primary/60" />
                                            <span className="text-sm font-bold text-foreground">College Production</span>
                                            <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Career Aggregated</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                            {statsGrid.map(m => (
                                                <div key={m.label} className="bg-muted/30 border border-border/30 rounded-lg p-3 flex flex-col">
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">{m.label}</div>
                                                    <div className="text-xl font-black mt-1 text-foreground">{m.val != null && m.val !== 0 && m.val !== '—' ? m.val : '—'}</div>
                                                    <div className="text-[9px] text-muted-foreground/50 mt-1">{m.hint}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {percentileMetrics.length > 0 && (
                                    <PercentileChart metrics={percentileMetrics} position={player.position} />
                                )}

                                {/* EPA / Competition-Adjusted Stats */}
                                {epaStats && epaStats.length > 0 && (
                                    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                                        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">EPA & Competition Adjustment</h3>
                                        <div className="space-y-2">
                                            {epaStats.map((row: any) => (
                                                <div key={row.season} className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground font-mono">{row.season}</span>
                                                    <div className="flex items-center gap-4">
                                                        {row.sp_rating != null && (
                                                            <div className="text-right">
                                                                <span className="text-[10px] text-muted-foreground uppercase mr-1">SP+</span>
                                                                <span className={`font-bold font-mono text-xs ${row.sp_rating >= 20 ? 'text-emerald-400' : row.sp_rating >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                                                                    {row.sp_rating > 0 ? '+' : ''}{Number(row.sp_rating).toFixed(1)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {row.epa_per_play != null && (
                                                            <div className="text-right">
                                                                <span className="text-[10px] text-muted-foreground uppercase mr-1">EPA/play</span>
                                                                <span className={`font-bold font-mono text-xs ${row.epa_per_play >= 1.0 ? 'text-emerald-400' : row.epa_per_play >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                                                                    {Number(row.epa_per_play).toFixed(3)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/50 mt-2">SP+ = team strength vs. avg (higher = stronger competition). EPA/play = expected points added per play.</p>
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
                        <div className="mt-6">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Athletic Testing</h3>
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
                                        <div key={m.key} className={`bg-card border rounded-xl p-3 text-center ${display ? 'border-border/60' : 'border-dashed border-border/30 opacity-60'} flex flex-col justify-center items-center relative`}>
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
                    </TabsContent>

                    {/* Rankings Tab */}
                    <TabsContent value="rankings">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ranking Sources</h3>
                        <SourceRankings
                            rankings={rankings}
                            consensusRank={player.consensus_rank ?? null}
                        />
                    </TabsContent>

                    {/* Draft Profile Tab */}
                    <TabsContent value="draft">
                        <div className="space-y-6">
                            {/* Draft round projection */}
                            <div>
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">NFL Draft Projection</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Dynasty Proj. Pick</div>
                                        <div className="text-lg font-black text-primary mt-1">{projRank ? getDraftLabel(projRank) : '—'}</div>
                                    </div>
                                    <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">KTC Dynasty Rank</div>
                                        <div className="text-2xl font-black text-cyan-400 mt-1">{player.ktc_rank ? `#${player.ktc_rank}` : '—'}</div>
                                    </div>
                                    <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Consensus Rank</div>
                                        <div className="text-2xl font-black text-foreground mt-1">{classRank ? `#${classRank}` : '—'}</div>
                                    </div>
                                    <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Draft Year</div>
                                        <div className="text-2xl font-black text-foreground mt-1">{player.draft_year ?? '2026'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Dynasty context */}
                            <div className="bg-card border border-border/60 rounded-xl p-5">
                                <h3 className="text-sm font-bold text-foreground mb-3">Dynasty Context</h3>
                                <div className="space-y-2 text-sm text-muted-foreground">
                                    <div className="flex items-start gap-2">
                                        <span className="text-primary font-bold mt-0.5">→</span>
                                        <span>Projected as a <strong className="text-foreground">{projRank ? (projRank <= 12 ? '1st-round' : projRank <= 24 ? '2nd-round' : projRank <= 36 ? '3rd-round' : 'late-round') : 'unranked'}</strong> dynasty pick based on KTC ranking.</span>
                                    </div>
                                    {player.position === 'RB' && (() => {
                                        const scrimYds = (recentStat?.rush_yards || 0) + (recentStat?.rec_yards || 0);
                                        const scrimYdsPerGame = recentStat?.games_played ? (scrimYds / recentStat.games_played).toFixed(1) : '—';
                                        const rasScore = (measurables as any)?.ras || '—';
                                        const fortyTime = (measurables as any)?.forty_yard || '—';
                                        const recentYear = recentStat?.season || '2024';
                                        const projStr = projRank ? (projRank <= 12 ? '1st' : projRank <= 24 ? '2nd' : projRank <= 36 ? '3rd' : 'late') : 'unranked';
                                        return (
                                            <div className="flex items-start gap-2">
                                                <span className="text-amber-400 font-bold mt-0.5">→</span>
                                                <span>
                                                    {player.last_name} averaged <strong className="text-foreground">{scrimYdsPerGame} scrimmage yds/G</strong> in {recentYear} with a <strong className="text-foreground">{rasScore} RAS</strong> and {fortyTime}s speed — projects as a {projStr}-round dynasty asset.
                                                </span>
                                            </div>
                                        );
                                    })()}
                                    {player.position === 'WR' && (() => {
                                        const ydsPerGame = (recentStat as any)?.yds_per_game || '—';
                                        const recPerGame = (recentStat as any)?.rec_per_game || '—';
                                        const recentYear = recentStat?.season || '2024';
                                        const rasScore = (measurables as any)?.ras || '—';
                                        const ht = player.height_inches || 72; // default 6'0"
                                        const sizeDesc = ht >= 74 ? `elite size at ${Math.floor(ht / 12)}'${ht % 12}"` : `smaller slot at ${Math.floor(ht / 12)}'${ht % 12}"`;
                                        return (
                                            <div className="flex items-start gap-2">
                                                <span className="text-fuchsia-400 font-bold mt-0.5">→</span>
                                                <span>
                                                    {player.last_name} averaged <strong className="text-foreground">{ydsPerGame} rec yds/G</strong> ({recPerGame} rec/G) in {recentYear} — {sizeDesc} with <strong className="text-foreground">{rasScore} RAS</strong>.
                                                </span>
                                            </div>
                                        );
                                    })()}
                                    {player.position === 'QB' && (() => {
                                        const cmpPct = (recentStat as any)?.completion_pct || '—';
                                        const passYards = recentStat?.pass_yards || '—';
                                        const passTds = recentStat?.pass_tds || '—';
                                        const rushYards = recentStat?.rush_yards || '0';
                                        const recentYear = recentStat?.season || '2024';
                                        const mobility = (recentStat?.rush_yards || 0) >= 300 ? "dual-threat" : "pocket passer";
                                        return (
                                            <div className="flex items-start gap-2">
                                                <span className="text-cyan-400 font-bold mt-0.5">→</span>
                                                <span>
                                                    {player.last_name} completed <strong className="text-foreground">{cmpPct} of passes</strong> for {passYards} yards and {passTds} TDs in {recentYear}, adding {rushYards} rush yards — <strong className="text-foreground">{mobility}</strong> profile.
                                                </span>
                                            </div>
                                        );
                                    })()}
                                    {player.position === 'TE' && <div className="flex items-start gap-2"><span className="text-violet-400 font-bold mt-0.5">→</span><span>Elite TEs are extremely rare — top-12 TEs drafted in the first round represent <strong className="text-foreground">generational value</strong>.</span></div>}
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Scout Tab */}
                    <TabsContent value="scout">
                        <div className="space-y-6">

                            {/* Athletic profile */}
                            {(player.height_inches || player.weight_lbs || (measurables && (measurables as any).forty_yard)) && (
                                <div>
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Athletic Profile</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {([
                                            { label: 'Height', val: player.height_inches ? `${Math.floor(player.height_inches / 12)}'${player.height_inches % 12}"` : null },
                                            { label: 'Weight', val: player.weight_lbs ? `${player.weight_lbs}lb` : null },
                                            { label: '40 Yard', val: measurables && (measurables as any).forty_yard ? `${(measurables as any).forty_yard}s` : null },
                                            { label: 'Vertical', val: measurables && (measurables as any).vertical_jump ? `${(measurables as any).vertical_jump}"` : null },
                                            { label: 'Broad Jump', val: measurables && (measurables as any).broad_jump ? `${(measurables as any).broad_jump}"` : null },
                                            { label: '3-Cone', val: measurables && (measurables as any).three_cone ? `${(measurables as any).three_cone}s` : null },
                                            { label: 'Hand Size', val: measurables && (measurables as any).hand_size ? `${(measurables as any).hand_size}"` : null },
                                            { label: 'Arm Length', val: measurables && (measurables as any).arm_length ? `${(measurables as any).arm_length}"` : null },
                                            { label: 'RAS Score', val: measurables && (measurables as any).ras ? String((measurables as any).ras) : null },
                                            { label: 'Speed Score', val: (measurables && (measurables as any).speed_score ? (measurables as any).speed_score : speedScore) ? String(measurables && (measurables as any).speed_score ? (measurables as any).speed_score : speedScore) : null },
                                        ] as { label: string; val: string | null }[]).map(item => (
                                            <div key={item.label} className={`bg-card border rounded-xl p-3 text-center ${item.val ? 'border-border/60' : 'border-dashed border-border/30 opacity-50'}`}>
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</div>
                                                <div className={`text-xl font-black mt-1 ${item.val ? 'text-foreground' : 'text-muted-foreground/20'}`}>{item.val ?? '—'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recruiting */}
                            {(player as any).recruiting_composite && (
                                <div>
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recruiting Profile</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {[
                                            { label: 'Stars', val: (player as any).recruiting_stars ? `${'★'.repeat((player as any).recruiting_stars)}` : null },
                                            { label: 'Composite Rating', val: (player as any).recruiting_composite ? `${((player as any).recruiting_composite as number).toFixed(4)}` : null },
                                            { label: 'Recruit Year', val: (player as any).recruiting_year ? String((player as any).recruiting_year) : null },
                                        ].map(item => (
                                            <div key={item.label} className={`bg-card border rounded-xl p-3 text-center ${item.val ? 'border-border/60' : 'border-dashed border-border/30 opacity-50'}`}>
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{item.label}</div>
                                                <div className={`text-lg font-black mt-1 ${item.val ? 'text-foreground' : 'text-muted-foreground/20'}`}>{item.val ?? '—'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Production Metrics */}
                            {(dominatorStats.length > 0 || player.breakout_age) && (
                                <div>
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Production Metrics</h3>

                                    {/* Breakout Age */}
                                    {player.breakout_age && (
                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            <div className="bg-card border border-border/60 rounded-xl p-3 text-center">
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Breakout Age</div>
                                                <div className={`text-2xl font-black mt-1 ${player.breakout_age <= 19 ? 'text-emerald-400' : player.breakout_age <= 20 ? 'text-cyan-400' : 'text-foreground'}`}>
                                                    {player.breakout_age}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground/60 mt-0.5">{player.breakout_year} season</div>
                                            </div>
                                            <div className="bg-card border border-border/60 rounded-xl p-3 text-center">
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Breakout Year</div>
                                                <div className="text-2xl font-black mt-1 text-foreground">{player.breakout_year || '—'}</div>
                                                <div className="text-[10px] text-muted-foreground/60 mt-0.5">First elite season</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Dominator Rating by Season */}
                                    {dominatorStats.length > 0 && (
                                        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
                                            <div className="px-4 py-2 border-b border-border/40 bg-muted/20">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dominator Rating by Season</span>
                                            </div>
                                            <div className="divide-y divide-border/20">
                                                {dominatorStats.map((row: any) => (
                                                    <div key={row.season} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3">
                                                        <span className="text-xs font-bold text-muted-foreground font-mono w-10">{row.season}</span>
                                                        <span className="text-xs text-muted-foreground truncate">{row.school}</span>
                                                        {row.dominator_rating != null && (
                                                            <div className="text-right">
                                                                <div className="text-[10px] text-muted-foreground/60 uppercase">DOM</div>
                                                                <div className={`text-sm font-bold font-mono ${row.dominator_rating >= 25 ? 'text-emerald-400' : row.dominator_rating >= 15 ? 'text-cyan-400' : 'text-foreground'}`}>
                                                                    {row.dominator_rating.toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        )}
                                                        {row.market_share != null && (
                                                            <div className="text-right">
                                                                <div className="text-[10px] text-muted-foreground/60 uppercase">MKT</div>
                                                                <div className="text-sm font-bold font-mono text-foreground/80">
                                                                    {row.market_share.toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="px-4 py-2 border-t border-border/40">
                                                <p className="text-[10px] text-muted-foreground/50">DOM = share of team's total passing production (yds + TDs). MKT = share of team pass yards. ≥20% DOM is elite for WR/RB.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Historical Comps */}
                            {historicalComps && historicalComps.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Historical Athletic Comps</h3>
                                    <p className="text-xs text-muted-foreground/60 mb-3">Most athletically similar prospects from 2010–2024 NFL Draft classes</p>
                                    <div className="space-y-2">
                                        {historicalComps.map((comp: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between bg-card border border-border/60 rounded-xl px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="text-xs font-bold text-muted-foreground/40 font-mono w-4">{i + 1}</div>
                                                    <div>
                                                        <div className="text-sm font-bold text-foreground">{comp.comp_name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {comp.comp_year} · {comp.comp_round ? `Round ${comp.comp_round}` : 'UDFA'}
                                                            {comp.comp_team ? ` · ${comp.comp_team}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 text-right">
                                                    {comp.comp_w_av != null && (
                                                        <div>
                                                            <div className="text-[10px] text-muted-foreground uppercase">Career AV</div>
                                                            <div className={`text-sm font-bold ${comp.comp_w_av >= 40 ? 'text-emerald-400' : comp.comp_w_av >= 15 ? 'text-cyan-400' : 'text-muted-foreground'}`}>
                                                                {comp.comp_w_av}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="text-[10px] text-muted-foreground uppercase">Similarity</div>
                                                        <div className="text-sm font-bold text-foreground font-mono">{comp.similarity}%</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* News Tab */}
                    <TabsContent value="news">
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
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
