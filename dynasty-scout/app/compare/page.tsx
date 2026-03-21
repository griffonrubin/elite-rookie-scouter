import { query, queryOne } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft, Zap, Scale, TrendingUp, Users, Dumbbell, BookOpen, Activity } from 'lucide-react';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { ComparePlayerPicker } from '@/components/ComparePlayerPicker';
import { WatchlistButton } from '@/components/WatchlistButton';
import { RadarChart, type RadarMetric } from '@/components/RadarChart';

export const dynamic = 'force-dynamic';

const POS_STYLES: Record<string, string> = {
    QB: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/15',
    RB: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/15',
    WR: 'text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/15',
    TE: 'text-violet-300 border-violet-500/40 bg-violet-500/15',
};

function formatHeight(inches?: number | null) {
    if (!inches) return '—';
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function getDraftLabel(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick = rank - (round - 1) * 12;
    return `Round ${round}, Pick ${pick}`;
}

function computeSpeedScore(weight?: number | null, forty?: number | null): number | null {
    if (!weight || !forty || forty <= 0) return null;
    return Math.round(((weight * 200) / (forty ** 4)) * 10) / 10;
}

async function getPlayerData(slug: string) {
    const player = await queryOne<any>(`
        SELECT
            p.id, p.slug, p.full_name, p.first_name, p.last_name,
            p.position, p.dob, p.age_at_draft, p.height_inches, p.weight_lbs,
            p.star_rating, p.draft_year, p.headshot_url, p.nfl_team,
            p.breakout_age, p.breakout_year, p.recruiting_stars,
            COALESCE(
                (SELECT school FROM college_career WHERE player_id = p.id ORDER BY id DESC LIMIT 1),
                p.nfl_team
            ) as school,
            cr.rank_overall as consensus_rank,
            cr.avg_rank, cr.best_rank, cr.num_sources,
            m.forty_yard, m.vertical_jump, m.broad_jump, m.three_cone, m.twenty_yard_shuttle, m.bench_press, m.ras,
            (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'KeepTradeCut' ORDER BY scraped_at DESC LIMIT 1) as ktc_rank,
            (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'Sleeper ADP' ORDER BY scraped_at DESC LIMIT 1) as sleeper_adp,
            (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyPros' ORDER BY scraped_at DESC LIMIT 1) as fp_rank
        FROM players p
        LEFT JOIN measurables m ON p.id = m.player_id
        LEFT JOIN consensus_rankings cr ON p.id = cr.player_id
            AND cr.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id)
        WHERE p.slug = $1
    `, [slug]);

    if (!player) return null;

    // Best-season dominator rating and market share
    const bestDominator = await queryOne<any>(
        `SELECT dominator_rating, market_share, season
         FROM college_stats WHERE player_id = $1 AND dominator_rating IS NOT NULL
         ORDER BY dominator_rating DESC LIMIT 1`,
        [player.id]
    ).catch(() => null);

    if (bestDominator) {
        player.best_dominator = bestDominator.dominator_rating;
        player.best_market_share = bestDominator.market_share;
        player.best_dom_season = bestDominator.season;
    }

    const stats = await query<any>(
        `SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY player_id, season
                ORDER BY (COALESCE(pass_yards,0)+COALESCE(rush_yards,0)+COALESCE(rec_yards,0)) DESC
            ) as rn
            FROM college_stats WHERE player_id = $1
        ) t WHERE rn = 1 ORDER BY season DESC`,
        [player.id]
    );

    const careerStat = stats.reduce((acc, s) => ({
        games_played: (acc.games_played || 0) + (s.games_played || 0),
        pass_attempts: (acc.pass_attempts || 0) + (s.pass_attempts || 0),
        completions: (acc.completions || 0) + (s.completions || 0),
        pass_yards: (acc.pass_yards || 0) + (s.pass_yards || 0),
        pass_tds: (acc.pass_tds || 0) + (s.pass_tds || 0),
        interceptions: (acc.interceptions || 0) + (s.interceptions || 0),
        rush_attempts: (acc.rush_attempts || 0) + (s.rush_attempts || 0),
        rush_yards: (acc.rush_yards || 0) + (s.rush_yards || 0),
        rush_tds: (acc.rush_tds || 0) + (s.rush_tds || 0),
        receptions: (acc.receptions || 0) + (s.receptions || 0),
        rec_yards: (acc.rec_yards || 0) + (s.rec_yards || 0),
        rec_tds: (acc.rec_tds || 0) + (s.rec_tds || 0),
        targets: (acc.targets || 0) + (s.targets || 0),
        yards_after_catch: (acc.yards_after_catch || 0) + (s.yards_after_catch || 0),
    }), {} as any);

    if (careerStat.receptions > 0) careerStat.yards_per_reception = careerStat.rec_yards / careerStat.receptions;
    if (careerStat.rush_attempts > 0) careerStat.yards_per_carry = careerStat.rush_yards / careerStat.rush_attempts;

    return {
        ...player,
        careerStat: stats.length > 0 ? careerStat : null,
        speedScore: computeSpeedScore(player.weight_lbs, player.forty_yard),
    };
}

interface Props {
    searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function ComparePage({ searchParams }: Props) {
    const { a, b } = await searchParams;

    if (!a || !b) {
        const SUGGESTED = [
            { label: 'Love vs. Price',   sub: 'RB vs RB — Top 2 backs',      slugA: 'jeremiyah-love',   slugB: 'jadarian-price'   },
            { label: 'Tate vs. Lemon',   sub: 'WR vs WR — Top receiver duel', slugA: 'carnell-tate',     slugB: 'jack-lemon'       },
            { label: 'Mendoza vs. Gendron', sub: 'QB vs QB — Signal callers', slugA: 'fernando-mendoza', slugB: 'will-gendron'     },
            { label: 'Love vs. Tate',    sub: 'RB vs WR — Cross-position',    slugA: 'jeremiyah-love',   slugB: 'carnell-tate'     },
        ];
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
                <div className="text-center max-w-lg w-full p-8 space-y-8">
                    {/* Header */}
                    <div>
                        <div className="flex items-center justify-center gap-2 mb-3">
                            <Scale className="w-5 h-5 text-primary" />
                            <h1 className="text-xl font-black tracking-tight">Compare Players</h1>
                        </div>
                        <p className="text-sm text-muted-foreground">Search for two players to see a side-by-side breakdown with radar chart, measurables, and stats.</p>
                    </div>

                    {/* Picker */}
                    <ComparePlayerPicker currentSlugA={a} currentSlugB={b} />

                    {/* Suggested matchups */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Popular Matchups</p>
                        <div className="grid grid-cols-2 gap-2">
                            {SUGGESTED.map((s) => (
                                <Link
                                    key={s.label}
                                    href={`/compare?a=${s.slugA}&b=${s.slugB}`}
                                    className="text-left px-4 py-3 rounded-xl border border-border/50 bg-card/40 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                                >
                                    <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{s.label}</div>
                                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const [playerA, playerB] = await Promise.all([getPlayerData(a), getPlayerData(b)]);

    if (!playerA || !playerB) {
        notFound();
    }

    // Build radar metrics — normalize each to 0-100
    const norm = (val: number | null | undefined, lo: number, hi: number) =>
        val != null ? Math.min(100, Math.max(0, Math.round(((val - lo) / (hi - lo)) * 100))) : 0;
    const normInv = (val: number | null | undefined, lo: number, hi: number) =>
        val != null ? Math.min(100, Math.max(0, Math.round(((hi - val) / (hi - lo)) * 100))) : 0;

    const saCS = (playerA as any).careerStat || {};
    const sbCS = (playerB as any).careerStat || {};
    const totalScrimA = (saCS.rush_yards || 0) + (saCS.rec_yards || 0) + (saCS.pass_yards || 0) / 4;
    const totalScrimB = (sbCS.rush_yards || 0) + (sbCS.rec_yards || 0) + (sbCS.pass_yards || 0) / 4;

    const radarMetrics: RadarMetric[] = [
        { label: 'Rank',      a: normInv(playerA.consensus_rank, 1, 120), b: normInv(playerB.consensus_rank, 1, 120) },
        { label: 'RAS',       a: norm(playerA.ras, 0, 10),                b: norm(playerB.ras, 0, 10) },
        { label: 'Speed',     a: norm((playerA as any).speedScore, 60, 130), b: norm((playerB as any).speedScore, 60, 130) },
        { label: 'Size',      a: norm((playerA.height_inches || 0) + (playerA.weight_lbs || 0) / 20, 76, 94), b: norm((playerB.height_inches || 0) + (playerB.weight_lbs || 0) / 20, 76, 94) },
        { label: 'Dominator', a: norm(playerA.best_dominator, 0, 45),    b: norm(playerB.best_dominator, 0, 45) },
        { label: 'Youth',     a: normInv(playerA.age_at_draft, 20, 25),  b: normInv(playerB.age_at_draft, 20, 25) },
        { label: 'Production', a: norm(totalScrimA, 0, 4500),            b: norm(totalScrimB, 0, 4500) },
        { label: 'Recruiting', a: norm(playerA.recruiting_stars, 2, 5),  b: norm(playerB.recruiting_stars, 2, 5) },
    ].filter(m => m.a > 0 || m.b > 0);

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Nav */}
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
                        <span className="text-sm font-semibold hidden sm:block">Player Comparison</span>
                        <Scale className="w-4 h-4 text-muted-foreground" />
                    </div>
                </div>
            </header>

            <div className="w-full mx-auto px-6 sm:px-8 py-8">

                <ComparePlayerPicker
                    currentSlugA={a}
                    currentSlugB={b}
                    currentNameA={playerA.full_name}
                    currentNameB={playerB.full_name}
                />

                {/* Player name headers */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 mb-8">
                    <PlayerHeader player={playerA} side="left" />
                    <div className="flex items-center justify-center">
                        <span className="text-xl font-black text-muted-foreground/40">vs</span>
                    </div>
                    <PlayerHeader player={playerB} side="right" />
                </div>

                {/* Radar chart */}
                {radarMetrics.length >= 3 && (
                    <div className="mb-6">
                        <RadarChart
                            metrics={radarMetrics}
                            nameA={playerA.full_name}
                            nameB={playerB.full_name}
                        />
                    </div>
                )}

                {/* Comparison sections */}
                <div className="space-y-6">
                    <CompareSection
                        title="Dynasty Rankings"
                        icon={<TrendingUp className="w-4 h-4" />}
                        rows={[
                            { label: 'Class Rank', a: playerA.consensus_rank ? `#${playerA.consensus_rank}` : '—', b: playerB.consensus_rank ? `#${playerB.consensus_rank}` : '—', numA: playerA.consensus_rank, numB: playerB.consensus_rank, lowerWins: true },
                            { label: 'KTC Dynasty', a: playerA.ktc_rank ? `#${playerA.ktc_rank}` : '—', b: playerB.ktc_rank ? `#${playerB.ktc_rank}` : '—', numA: playerA.ktc_rank, numB: playerB.ktc_rank, lowerWins: true },
                            { label: 'FantasyPros', a: playerA.fp_rank ? `#${playerA.fp_rank}` : '—', b: playerB.fp_rank ? `#${playerB.fp_rank}` : '—', numA: playerA.fp_rank, numB: playerB.fp_rank, lowerWins: true },
                            { label: 'Dynasty ADP', a: playerA.ktc_rank ? getDraftLabel(playerA.ktc_rank) : '—', b: playerB.ktc_rank ? getDraftLabel(playerB.ktc_rank) : '—', numA: playerA.ktc_rank, numB: playerB.ktc_rank, lowerWins: true },
                        ]}
                    />

                    <CompareSection
                        title="Combine & Measurables"
                        icon={<Dumbbell className="w-4 h-4" />}
                        rows={[
                            { label: 'Height', a: formatHeight(playerA.height_inches), b: formatHeight(playerB.height_inches), numA: playerA.height_inches, numB: playerB.height_inches, lowerWins: false },
                            { label: 'Weight', a: playerA.weight_lbs ? `${playerA.weight_lbs} lb` : '—', b: playerB.weight_lbs ? `${playerB.weight_lbs} lb` : '—', numA: playerA.weight_lbs, numB: playerB.weight_lbs, lowerWins: false },
                            { label: '40 Yard Dash', a: playerA.forty_yard ? `${playerA.forty_yard}s` : '—', b: playerB.forty_yard ? `${playerB.forty_yard}s` : '—', numA: playerA.forty_yard, numB: playerB.forty_yard, lowerWins: true },
                            { label: 'Vertical Jump', a: playerA.vertical_jump ? `${playerA.vertical_jump}"` : '—', b: playerB.vertical_jump ? `${playerB.vertical_jump}"` : '—', numA: playerA.vertical_jump, numB: playerB.vertical_jump, lowerWins: false },
                            { label: 'Broad Jump', a: playerA.broad_jump ? `${playerA.broad_jump}"` : '—', b: playerB.broad_jump ? `${playerB.broad_jump}"` : '—', numA: playerA.broad_jump, numB: playerB.broad_jump, lowerWins: false },
                            { label: '3-Cone', a: playerA.three_cone ? `${playerA.three_cone}s` : '—', b: playerB.three_cone ? `${playerB.three_cone}s` : '—', numA: playerA.three_cone, numB: playerB.three_cone, lowerWins: true },
                            { label: 'Speed Score', a: playerA.speedScore ? `${playerA.speedScore}` : '—', b: playerB.speedScore ? `${playerB.speedScore}` : '—', numA: playerA.speedScore, numB: playerB.speedScore, lowerWins: false },
                            { label: 'RAS', a: playerA.ras ? `${playerA.ras}` : '—', b: playerB.ras ? `${playerB.ras}` : '—', numA: playerA.ras, numB: playerB.ras, lowerWins: false },
                        ]}
                    />

                    <CompareSection
                        title="College Career Stats"
                        icon={<BookOpen className="w-4 h-4" />}
                        rows={buildStatRows(playerA, playerB)}
                    />

                    <CompareSection
                        title="Advanced Metrics"
                        icon={<Activity className="w-4 h-4" />}
                        rows={buildAdvancedMetrics(playerA, playerB)}
                    />

                    <CompareSection
                        title="Background"
                        icon={<Users className="w-4 h-4" />}
                        rows={[
                            { label: 'School', a: playerA.school || '—', b: playerB.school || '—' },
                            { label: 'Age at Draft', a: playerA.age_at_draft ? `${playerA.age_at_draft}` : '—', b: playerB.age_at_draft ? `${playerB.age_at_draft}` : '—', numA: playerA.age_at_draft, numB: playerB.age_at_draft, lowerWins: true },
                            { label: 'Recruit Stars', a: playerA.recruiting_stars ? `${'★'.repeat(playerA.recruiting_stars)}` : '—', b: playerB.recruiting_stars ? `${'★'.repeat(playerB.recruiting_stars)}` : '—', numA: playerA.recruiting_stars, numB: playerB.recruiting_stars, lowerWins: false },
                        ]}
                    />
                </div>

                {/* Profile links */}
                <div className="grid grid-cols-2 gap-4 mt-8">
                    <Link href={`/players/${playerA.slug}`} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-card border border-border/60 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
                        Full Profile: {playerA.full_name} →
                    </Link>
                    <Link href={`/players/${playerB.slug}`} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-card border border-border/60 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
                        Full Profile: {playerB.full_name} →
                    </Link>
                </div>
            </div>
        </div>
    );
}

function buildStatRows(playerA: any, playerB: any) {
    const posA = playerA.position;
    const posB = playerB.position;
    const sa = playerA.careerStat || {};
    const sb = playerB.careerStat || {};

    // QB vs QB is unique
    if (posA === 'QB' && posB === 'QB') {
        return [
            { label: 'Pass Yards', a: sa?.pass_yards ?? '—', b: sb?.pass_yards ?? '—', numA: sa?.pass_yards, numB: sb?.pass_yards, lowerWins: false },
            { label: 'Pass TDs', a: sa?.pass_tds ?? '—', b: sb?.pass_tds ?? '—', numA: sa?.pass_tds, numB: sb?.pass_tds, lowerWins: false },
            { label: 'Interceptions', a: sa?.interceptions ?? '—', b: sb?.interceptions ?? '—', numA: sa?.interceptions, numB: sb?.interceptions, lowerWins: true },
            { label: 'Rush Yards', a: sa?.rush_yards ?? '—', b: sb?.rush_yards ?? '—', numA: sa?.rush_yards, numB: sb?.rush_yards, lowerWins: false },
        ];
    }

    // Unified skill position grid (RB, WR, TE)
    const rows: any[] = [];
    const hideRushing = (posA === 'WR' || posA === 'TE') && (posB === 'WR' || posB === 'TE')
        && (!sa?.rush_yards && !sa?.rush_tds) && (!sb?.rush_yards && !sb?.rush_tds);

    if (!hideRushing) {
        rows.push({ label: 'Rush Yards', a: sa?.rush_yards ?? '—', b: sb?.rush_yards ?? '—', numA: sa?.rush_yards, numB: sb?.rush_yards, lowerWins: false });
        rows.push({ label: 'Rush TDs', a: sa?.rush_tds ?? '—', b: sb?.rush_tds ?? '—', numA: sa?.rush_tds, numB: sb?.rush_tds, lowerWins: false });
    }

    rows.push(
        { label: 'Receptions', a: sa?.receptions ?? '—', b: sb?.receptions ?? '—', numA: sa?.receptions, numB: sb?.receptions, lowerWins: false },
        { label: 'Rec Yards', a: sa?.rec_yards ?? '—', b: sb?.rec_yards ?? '—', numA: sa?.rec_yards, numB: sb?.rec_yards, lowerWins: false },
        { label: 'Rec Avg', a: sa?.receptions > 0 ? (sa?.rec_yards / sa?.receptions).toFixed(1) : '—', b: sb?.receptions > 0 ? (sb?.rec_yards / sb?.receptions).toFixed(1) : '—', numA: sa?.receptions > 0 ? (sa?.rec_yards / sa?.receptions) : null, numB: sb?.receptions > 0 ? (sb?.rec_yards / sb?.receptions) : null, lowerWins: false },
        { label: 'Rec TDs', a: sa?.rec_tds ?? '—', b: sb?.rec_tds ?? '—', numA: sa?.rec_tds, numB: sb?.rec_tds, lowerWins: false }
    );
    return rows;
}

function buildAdvancedMetrics(playerA: any, playerB: any) {
    const sa = playerA.careerStat || {};
    const sb = playerB.careerStat || {};
    const posA = playerA.position;
    const posB = playerB.position;

    const rows: any[] = [];

    // Rushing YPC (RB)
    const ypcA = sa?.rush_attempts > 0 ? (sa.rush_yards / sa.rush_attempts).toFixed(1) : '—';
    const ypcB = sb?.rush_attempts > 0 ? (sb.rush_yards / sb.rush_attempts).toFixed(1) : '—';

    // Scrim Yds / G (RB)
    const scrimA = sa?.games_played > 0 ? ((sa.rush_yards + sa.rec_yards) / sa.games_played).toFixed(1) : '—';
    const scrimB = sb?.games_played > 0 ? ((sb.rush_yards + sb.rec_yards) / sb.games_played).toFixed(1) : '—';

    // QB Metrics
    if (posA === 'QB' && posB === 'QB') {
        const tdIntA = sa?.interceptions > 0 ? (sa.pass_tds / sa.interceptions).toFixed(1) : (sa?.pass_tds ? sa.pass_tds : '—');
        const tdIntB = sb?.interceptions > 0 ? (sb.pass_tds / sb.interceptions).toFixed(1) : (sb?.pass_tds ? sb.pass_tds : '—');
        const ypaA = sa?.pass_attempts > 0 ? (sa.pass_yards / sa.pass_attempts).toFixed(1) : '—';
        const ypaB = sb?.pass_attempts > 0 ? (sb.pass_yards / sb.pass_attempts).toFixed(1) : '—';
        rows.push({ label: 'Yards Per Attempt', a: ypaA, b: ypaB, numA: parseFloat(ypaA) || null, numB: parseFloat(ypaB) || null, lowerWins: false });
        rows.push({ label: 'TD:INT Ratio', a: tdIntA, b: tdIntB, numA: parseFloat(tdIntA) || null, numB: parseFloat(tdIntB) || null, lowerWins: false });
    }

    if (posA === 'RB' || posB === 'RB') {
        rows.push({ label: 'Yards Per Carry', a: ypcA, b: ypcB, numA: parseFloat(ypcA) || null, numB: parseFloat(ypcB) || null, lowerWins: false });
        rows.push({ label: 'Scrim Yds/Game', a: scrimA, b: scrimB, numA: parseFloat(scrimA) || null, numB: parseFloat(scrimB) || null, lowerWins: false });
    }

    // Career YAC (yards after catch) — shown when available
    const yacA = sa?.yards_after_catch != null && sa.yards_after_catch > 0 ? String(Math.round(sa.yards_after_catch)) : '—';
    const yacB = sb?.yards_after_catch != null && sb.yards_after_catch > 0 ? String(Math.round(sb.yards_after_catch)) : '—';

    // Best-season Dominator Rating (from DB)
    const domA = playerA.best_dominator != null ? `${playerA.best_dominator.toFixed(1)}%` : '—';
    const domB = playerB.best_dominator != null ? `${playerB.best_dominator.toFixed(1)}%` : '—';
    const mktA = playerA.best_market_share != null ? `${playerA.best_market_share.toFixed(1)}%` : '—';
    const mktB = playerB.best_market_share != null ? `${playerB.best_market_share.toFixed(1)}%` : '—';

    if (posA !== 'QB' || posB !== 'QB') {
        rows.push({ label: 'Dominator Rtg', a: domA, b: domB, numA: playerA.best_dominator ?? null, numB: playerB.best_dominator ?? null, lowerWins: false });
        rows.push({ label: 'Market Share', a: mktA, b: mktB, numA: playerA.best_market_share ?? null, numB: playerB.best_market_share ?? null, lowerWins: false });
    }

    if ((posA === 'WR' || posA === 'TE') && (posB === 'WR' || posB === 'TE')) {
        rows.push({ label: 'Career YAC', a: yacA, b: yacB, numA: sa?.yards_after_catch || null, numB: sb?.yards_after_catch || null, lowerWins: false });
    }

    // Breakout Age
    const baA = playerA.breakout_age != null ? `${playerA.breakout_age} (${playerA.breakout_year})` : '—';
    const baB = playerB.breakout_age != null ? `${playerB.breakout_age} (${playerB.breakout_year})` : '—';
    if (posA !== 'QB' || posB !== 'QB') {
        rows.push({ label: 'Breakout Age', a: baA, b: baB, numA: playerA.breakout_age ?? null, numB: playerB.breakout_age ?? null, lowerWins: true });
    }

    return rows;
}

function PlayerHeader({ player, side }: { player: any; side: 'left' | 'right' }) {
    const posStyle = POS_STYLES[player.position] || 'text-gray-400 border-gray-500/40 bg-gray-500/15';
    const rank = player.consensus_rank;
    return (
        <div className={cn('flex flex-col gap-2', side === 'right' && 'items-end text-right')}>
            <div className={cn('flex items-center gap-3', side === 'right' && 'flex-row-reverse')}>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-muted to-muted/60 border border-border/60 flex items-center justify-center text-2xl">
                    🏈
                </div>
                <div>
                    <div className={cn("flex items-center gap-2", side === 'right' && "justify-end")}>
                        <h2 className="text-2xl font-black text-foreground">{player.full_name}</h2>
                        <WatchlistButton playerSlug={player.slug} variant="icon" className="w-5 h-5" />
                    </div>
                    <div className={cn('flex items-center gap-2 mt-1', side === 'right' && 'justify-end')}>
                        <span
                            style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 800, lineHeight: 1 }}
                            className={`border ${posStyle}`}
                        >
                            {player.position}
                        </span>
                        <span className="text-sm text-muted-foreground">{player.school}</span>
                        {rank && <span className="text-sm font-bold text-primary">#{rank}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface CompareRow {
    label: string;
    a: string | number;
    b: string | number;
    numA?: number | null;
    numB?: number | null;
    lowerWins?: boolean;
}

function CompareSection({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: CompareRow[] }) {
    return (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
                <span className="text-muted-foreground">{icon}</span>
                <span className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</span>
            </div>
            <div className="divide-y divide-border/20">
                {rows.map((row) => {
                    const hasNumbers = row.numA != null && row.numB != null;
                    const aWins = hasNumbers && (row.lowerWins ? row.numA! < row.numB! : row.numA! > row.numB!);
                    const bWins = hasNumbers && (row.lowerWins ? row.numB! < row.numA! : row.numB! > row.numA!);
                    const tie = hasNumbers && row.numA === row.numB;

                    return (
                        <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
                            {/* Player A value */}
                            <div className={cn(
                                'text-right font-mono font-bold text-base transition-colors',
                                aWins ? 'text-primary' : tie ? 'text-foreground/70' : 'text-foreground/50'
                            )}>
                                {String(row.a)}
                                {aWins && <span className="ml-1.5 text-[10px] font-black text-primary/60">▲</span>}
                            </div>

                            {/* Label */}
                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest text-center min-w-[100px] px-2">
                                {row.label}
                            </div>

                            {/* Player B value */}
                            <div className={cn(
                                'text-left font-mono font-bold text-base transition-colors',
                                bWins ? 'text-primary' : tie ? 'text-foreground/70' : 'text-foreground/50'
                            )}>
                                {bWins && <span className="mr-1.5 text-[10px] font-black text-primary/60">▲</span>}
                                {String(row.b)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
