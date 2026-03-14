import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { Player } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '300');
        const search = searchParams.get('search') || '';
        const position = searchParams.get('position') || '';

        const conditions: string[] = ['p.draft_year = 2026'];
        const params: any[] = [];

        if (search) {
            params.push(`%${search}%`, `%${search}%`);
            conditions.push(`(p.full_name ILIKE $${params.length - 1} OR p.position ILIKE $${params.length})`);
        }

        if (position && position !== 'ALL') {
            params.push(position);
            conditions.push(`p.position = $${params.length}`);
        }

        params.push(limit);
        const limitParam = `$${params.length}`;

        const whereClause = conditions.join(' AND ');

        const players = await sql.unsafe(`
            SELECT
                p.*,
                COALESCE(cc.school, p.nfl_team) as school,
                m.forty_yard,
                m.speed_score,
                m.ras,
                cr.rank_overall as consensus_rank,
                cr.avg_rank,
                cr.rank_change_1d,
                cr.rank_change_7d,
                cr.rank_change_30d,
                cr.num_sources
            FROM players p
            LEFT JOIN college_career cc ON p.id = cc.player_id
            LEFT JOIN measurables m ON p.id = m.player_id
            LEFT JOIN consensus_rankings cr ON p.id = cr.player_id
                AND cr.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id)
            WHERE ${whereClause}
            ORDER BY COALESCE(cr.rank_overall, 9999) ASC, p.id ASC
            LIMIT ${limitParam}
        `, params) as any[];

        const mapped = players.map(p => ({
            ...p,
            consensus: p.consensus_rank ? {
                rank_overall: p.consensus_rank,
                avg_rank: p.avg_rank,
                rank_change_1d: p.rank_change_1d ?? 0,
                rank_change_7d: p.rank_change_7d ?? 0,
                rank_change_30d: p.rank_change_30d ?? 0,
                num_sources: p.num_sources ?? 0,
            } : null
        }));

        return NextResponse.json(mapped);
    } catch (error) {
        console.error('Error fetching players:', error);
        return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
    }
}
