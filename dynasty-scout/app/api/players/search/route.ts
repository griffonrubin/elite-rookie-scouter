import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q') || '';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '8'), 20);

    if (!q.trim() || q.length < 2) {
        return NextResponse.json([]);
    }

    try {
        const rows = await query<{ slug: string; full_name: string; position: string; school: string }>(`
            SELECT
                p.slug,
                p.full_name,
                p.position,
                COALESCE(MAX(cc.school), p.nfl_team, '') as school
            FROM players p
            LEFT JOIN college_career cc ON p.id = cc.player_id
            WHERE p.draft_year = 2026
              AND (
                  p.full_name ILIKE $1 OR
                  p.first_name ILIKE $2 OR
                  p.last_name ILIKE $3 OR
                  p.slug ILIKE $4
              )
            GROUP BY p.id, p.slug, p.full_name, p.position, p.nfl_team
            ORDER BY p.full_name ASC
            LIMIT $5
        `, [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit]);

        return NextResponse.json(rows);
    } catch (e) {
        console.error('Player search error:', e);
        return NextResponse.json([], { status: 500 });
    }
}
