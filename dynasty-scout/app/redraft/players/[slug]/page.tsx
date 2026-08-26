import { query, queryOne } from '@/lib/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RedraftPlayer, NflSeasonStat, Projection } from '@/lib/types';
import { RedraftProfileClient } from '@/components/redraft/RedraftProfileClient';

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ slug: string }>;
}

const PLAYER_SQL = `
  SELECT
    p.id, p.slug, p.full_name, p.position, p.nfl_team, p.dob,
    p.height_inches, p.weight_lbs, p.years_exp, p.nfl_draft_year,
    p.draft_year, p.nfl_headshot_url, p.headshot_url, p.espn_college_id,
    t.logo_url AS team_logo, t.full_name AS team_name,
    t.primary_color AS team_color,
    c.rank_overall, c.rank_positional, c.avg_rank, c.best_rank,
    c.worst_rank, c.std_deviation, c.num_sources
  FROM players p
  LEFT JOIN nfl_teams t ON t.abbreviation = p.nfl_team
  LEFT JOIN consensus_rankings c
    ON c.player_id = p.id AND c.format = 'REDRAFT'
   AND c.calculated_at = (
     SELECT MAX(calculated_at) FROM consensus_rankings WHERE format = 'REDRAFT'
   )
  WHERE p.slug = $1 AND p.redraft_pool = 1
`;

async function getPlayer(slug: string) {
    const player = await queryOne<any>(PLAYER_SQL, [slug]);
    if (!player) return null;

    const seasons = await query<NflSeasonStat>(
        `SELECT * FROM nfl_season_stats WHERE player_id = $1 ORDER BY season DESC`,
        [player.id]
    );

    const sourceRanks = await query<{ source: string; rank_overall: number; rank_positional: number | null; tier: number | null }>(
        `SELECT r.source, r.rank_overall, r.rank_positional, r.tier
         FROM rankings r
         JOIN (
           SELECT source, MAX(scraped_at) AS md
           FROM rankings WHERE player_id = $1 GROUP BY source
         ) l ON l.source = r.source AND r.scraped_at = l.md
         WHERE r.player_id = $1 AND r.rank_overall IS NOT NULL
         ORDER BY r.rank_overall ASC`,
        [player.id]
    );

    const projections = await query<Projection>(
        `SELECT * FROM projections WHERE player_id = $1 AND season = 2026
         ORDER BY proj_points DESC NULLS LAST`,
        [player.id]
    );

    // Prev / next by board order, so the profile can page through the board.
    const ordered = await query<{ slug: string; full_name: string }>(
        `SELECT p.slug, p.full_name
         FROM players p
         LEFT JOIN consensus_rankings c
           ON c.player_id = p.id AND c.format = 'REDRAFT'
          AND c.calculated_at = (
            SELECT MAX(calculated_at) FROM consensus_rankings WHERE format = 'REDRAFT'
          )
         WHERE p.redraft_pool = 1
         ORDER BY c.rank_overall ASC NULLS LAST, p.id ASC`,
        []
    );
    const idx = ordered.findIndex(o => o.slug === slug);

    return {
        player: player as RedraftPlayer & Record<string, any>,
        seasons,
        sourceRanks,
        projections,
        boardRank: idx >= 0 ? idx + 1 : null,
        prev: idx > 0 ? ordered[idx - 1] : null,
        next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null,
    };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const data = await getPlayer(slug).catch(() => null);
    if (!data) return { title: 'Player not found | DyCharts' };
    const { player } = data;
    const pos = player.position;
    return {
        title: `${player.full_name} — ${pos} ${player.nfl_team ?? 'FA'} | Redraft | DyCharts`,
        description: `2026 PPR redraft profile for ${player.full_name}: rankings, projections, and NFL production 2021-2025.`,
    };
}

export default async function RedraftPlayerPage({ params }: PageProps) {
    const { slug } = await params;
    let data;
    try {
        data = await getPlayer(slug);
    } catch (e) {
        console.error('Failed to load redraft player:', e);
        data = null;
    }
    if (!data) notFound();

    return (
        <RedraftProfileClient
            player={data.player}
            seasons={data.seasons}
            sourceRanks={data.sourceRanks}
            projections={data.projections}
            boardRank={data.boardRank}
            prev={data.prev}
            next={data.next}
        />
    );
}
