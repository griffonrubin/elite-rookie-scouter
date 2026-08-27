import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Redraft pool list for the tier builder, ordered by consensus rank so the
 * players worth tiering appear first. The rookie /api/players route hardcodes
 * draft_year = 2026, so redraft needs its own.
 */
export async function GET(req: NextRequest) {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '300'), 1000);
    const position = req.nextUrl.searchParams.get('position');

    try {
        const params: any[] = [];
        let posClause = '';
        if (position && position !== 'ALL') {
            params.push(position.toUpperCase());
            posClause = `AND UPPER(p.position) = $${params.length}`;
        }
        params.push(limit);

        const rows = await query<any>(`
            SELECT p.id, p.slug, p.full_name, p.position, p.nfl_team,
                   p.nfl_headshot_url, p.headshot_url, p.years_exp,
                   c.rank_overall, c.rank_positional,
                   s.fantasy_points_ppr AS pts25, s.ppg_ppr AS ppg25,
                   s.finish_positional AS fin25
            FROM players p
            LEFT JOIN consensus_rankings c
              ON c.player_id = p.id AND c.format = 'REDRAFT'
             AND c.calculated_at = (
               SELECT MAX(calculated_at) FROM consensus_rankings WHERE format = 'REDRAFT'
             )
            LEFT JOIN nfl_season_stats s ON s.player_id = p.id AND s.season = 2025
            WHERE p.redraft_pool = 1 ${posClause}
            ORDER BY c.rank_overall ASC NULLS LAST, p.full_name ASC
            LIMIT $${params.length}
        `, params);

        return NextResponse.json(rows);
    } catch (e) {
        console.error('Redraft players list error:', e);
        return NextResponse.json([], { status: 500 });
    }
}
