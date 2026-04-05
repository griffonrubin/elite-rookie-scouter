import { query, queryOne } from '@/lib/db';
import type { Metadata } from 'next';
import { CollegeStats, JFosterGrades, Measurables, NflScoutProfile, Ranking } from '@/lib/types';
import Link from 'next/link';
import { PlayerProfileClient } from '@/components/PlayerProfileClient';

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ slug: string }>;
}


async function getPlayer(slug: string) {
    try {
        const player = await queryOne<any>(`
            SELECT
                p.id, p.slug, p.full_name, p.first_name, p.last_name,
                p.position, p.dob, p.age_at_draft, p.height_inches, p.weight_lbs,
                p.star_rating, p.draft_year, p.headshot_url, p.espn_college_id, p.nfl_team,
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
            "SELECT r.* FROM rankings r WHERE r.player_id = $1 AND r.scraped_at = (SELECT MAX(r2.scraped_at) FROM rankings r2 WHERE r2.player_id = r.player_id AND r2.source = r.source) ORDER BY r.rank_overall",
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
                    ELSE NULL END                             as breakaway_wavg,
                SUM(COALESCE(cs.rush_tds, 0))                as rush_tds,
                SUM(COALESCE(cs.explosive_run_rate, 0) * COALESCE(cs.rush_attempts, 0)) as explosive_att,
                SUM(COALESCE(cs.breakaway_run_rate, 0) * COALESCE(cs.rush_attempts, 0)) as breakaway_att,
                SUM(cs.fumbles)                              as fumbles
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
                       wac.target_rate, wac.contested_catch_rate, wac.yac_rate, wac.air_yards_rate,
                       wac.wide_rate, wac.slot_rate, wac.screen_target_pct,
                       wac.depth_behind_line_pct, wac.depth_0_9_pct, wac.depth_10_19_pct, wac.depth_20plus_pct
                FROM wr_advanced_career wac
                JOIN players p ON p.id = wac.player_id
                WHERE p.position = $1 AND p.draft_year = 2026
              `, [player.position]).catch(() => [] as any[])
            : [];

        // RB advanced career stats
        const rbAdvanced = player.position === 'RB'
            ? await queryOne<any>("SELECT * FROM rb_advanced_career WHERE player_id = $1", [player.id]).catch(() => null)
            : null;

        const peerRBAdv = player.position === 'RB'
            ? await query<any>(
                "SELECT * FROM rb_advanced_career rb JOIN players p ON p.id = rb.player_id WHERE p.position = 'RB' AND p.draft_year = 2026",
                []
              ).catch(() => [] as any[])
            : [];

        // High school data
        const highSchool = await queryOne<any>(
            "SELECT * FROM high_school_stats WHERE player_id = $1",
            [player.id]
        ).catch(() => null);

        // J. Foster scouting grades
        const jfosterData = await queryOne<JFosterGrades>(
            "SELECT * FROM jfoster_grades WHERE player_id = $1",
            [player.id]
        ).catch(() => null);

        // NFL.com combine scout profile
        const nflScout = await queryOne<NflScoutProfile>(
            "SELECT * FROM nfl_scout_profiles WHERE player_id = $1",
            [player.id]
        ).catch(() => null);

        return { player, stats: stats || [], rankings: rankings || [], measurables: measurables || null, speedScore, news: news || [], trustIndicator, peerCareer: peerCareer || [], peerAdvanced: peerAdvanced || [], historicalComps: historicalComps || [], epaStats: epaStats || [], dominatorStats: dominatorStats || [], prevPlayer, nextPlayer, wrAdvanced: wrAdvanced || null, peerWrAdv: peerWrAdv || [], highSchool: highSchool || null, jfosterData: jfosterData || null, nflScout: nflScout || null, rbAdvanced: rbAdvanced || null, peerRBAdv: peerRBAdv || [] };
    } catch (e) {
        console.error("DB Error:", e);
        return null;
    }
}


export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    try {
        const p = await queryOne<any>(
            `SELECT p.full_name, p.position, p.weight_lbs,
                    COALESCE((SELECT school FROM college_career WHERE player_id = p.id ORDER BY id DESC LIMIT 1), p.nfl_team) as school,
                    m.forty_yard, m.ras,
                    cr.rank_overall as consensus_rank,
                    (SELECT COALESCE(SUM(rush_yards),0)+COALESCE(SUM(rec_yards),0) FROM college_stats WHERE player_id = p.id) as career_scrim,
                    (SELECT COALESCE(SUM(pass_yards),0) FROM college_stats WHERE player_id = p.id) as career_pass,
                    (SELECT COALESCE(SUM(pass_tds),0) FROM college_stats WHERE player_id = p.id) as career_ptds,
                    (SELECT COALESCE(SUM(rush_tds),0)+COALESCE(SUM(rec_tds),0) FROM college_stats WHERE player_id = p.id) as career_tds
             FROM players p
             LEFT JOIN measurables m ON m.player_id = p.id
             LEFT JOIN consensus_rankings cr ON p.id = cr.player_id
                 AND cr.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id)
             WHERE p.slug = $1`,
            [slug]
        );
        if (!p) return { title: 'Player Not Found | DyCharts' };

        const pos = p.position || 'RB';
        const tierLabel = !p.consensus_rank ? '' :
            p.consensus_rank <= 5 ? 'S Tier' : p.consensus_rank <= 12 ? 'A Tier' :
            p.consensus_rank <= 24 ? 'B Tier' : p.consensus_rank <= 48 ? 'C Tier' : 'D Tier';

        // Position-appropriate stats
        const statParams: Record<string, string> = {};
        if (pos === 'QB') {
            statParams['s0l'] = 'Career Pass Yds'; statParams['s0v'] = String(p.career_pass ?? 0);
            statParams['s1l'] = 'Career Pass TDs'; statParams['s1v'] = String(p.career_ptds ?? 0);
        } else {
            statParams['s0l'] = 'Career Scrim Yds'; statParams['s0v'] = String(p.career_scrim ?? 0);
            statParams['s1l'] = 'Career TDs';       statParams['s1v'] = String(p.career_tds ?? 0);
        }
        if (p.forty_yard) { statParams['s2l'] = '40-Yard Dash'; statParams['s2v'] = String(p.forty_yard) + 's'; }
        else if (p.ras)   { statParams['s2l'] = 'RAS Score';    statParams['s2v'] = String(p.ras); }

        const ogParams = new URLSearchParams({
            name: p.full_name || '',
            pos,
            school: p.school || '',
            rank: String(p.consensus_rank || ''),
            tier: tierLabel,
            forty: p.forty_yard ? String(p.forty_yard) : '',
            ras: p.ras ? String(p.ras) : '',
            ...statParams,
        });

        const title = `${p.full_name} | ${pos} | DyCharts 2026`;
        const description = `#${p.consensus_rank ?? '?'} overall · ${p.position} · ${p.school || 'NFL Draft'} — Dynasty scouting profile on DyCharts`;
        const ogImageUrl = `/api/og/player?${ogParams.toString()}`;

        return {
            title,
            description,
            openGraph: {
                title,
                description,
                images: [{ url: ogImageUrl, width: 1200, height: 630, alt: p.full_name }],
                type: 'profile',
            },
            twitter: {
                card: 'summary_large_image',
                title,
                description,
                images: [ogImageUrl],
            },
        };
    } catch {
        return { title: 'DyCharts | 2026 Dynasty Draft' };
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

    return <PlayerProfileClient {...data} />;
}
