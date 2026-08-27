import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Typeahead over the redraft pool. The rookie search hardcodes
 * draft_year = 2026, so redraft needs its own pool-scoped route.
 * Results are ordered by consensus rank so the best-known players
 * surface first rather than alphabetically.
 */
export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q') || '';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '8'), 20);

    if (!q.trim() || q.length < 2) {
        return NextResponse.json([]);
    }

    try {
        const rows = await query<{ slug: string; full_name: string; position: string; school: string }>(`
            SELECT p.slug, p.full_name, p.position,
                   COALESCE(p.nfl_team, 'FA') AS school
            FROM players p
            LEFT JOIN consensus_rankings c
              ON c.player_id = p.id AND c.format = 'REDRAFT'
             AND c.calculated_at = (
               SELECT MAX(calculated_at) FROM consensus_rankings WHERE format = 'REDRAFT'
             )
            WHERE p.redraft_pool = 1
              AND (
                  p.full_name ILIKE $1 OR
                  p.last_name ILIKE $2 OR
                  p.slug ILIKE $3
              )
            ORDER BY c.rank_overall ASC NULLS LAST, p.full_name ASC
            LIMIT $4
        `, [`%${q}%`, `%${q}%`, `%${q}%`, limit]);

        return NextResponse.json(rows);
    } catch (e) {
        console.error('Redraft search error:', e);
        return NextResponse.json([], { status: 500 });
    }
}
