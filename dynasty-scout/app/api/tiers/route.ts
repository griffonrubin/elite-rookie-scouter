import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Tier } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Tiers are scoped by mode so the rookie and redraft builders never mix.
 * Omitting the param yields rookie tiers, which is what existing rows default
 * to — so the rookie tier builder behaves exactly as before.
 */
export async function GET(request: Request) {
    try {
        const db = getDb();
        const mode = new URL(request.url).searchParams.get('mode') === 'redraft'
            ? 'redraft' : 'rookie';

        const tiers = await db.prepare(`
            SELECT * FROM user_tiers
            WHERE COALESCE(mode, 'rookie') = $1
            ORDER BY tier_order ASC
        `).all(mode) as Tier[];

        for (const tier of tiers) {
            const players = await db.prepare(`
                SELECT p.*, tp.player_order
                FROM players p
                JOIN tier_players tp ON p.id = tp.player_id
                WHERE tp.tier_id = $1
                ORDER BY tp.player_order ASC
            `).all(tier.id);

            // @ts-ignore
            tier.players = players;
        }

        return NextResponse.json(tiers);
    } catch (error) {
        console.error('Error fetching tiers:', error);
        return NextResponse.json({ error: 'Failed to fetch tiers' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tier_name, tier_color, tier_description, tier_order } = body;
        const mode = body.mode === 'redraft' ? 'redraft' : 'rookie';

        if (!tier_name || !tier_color) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const db = getDb();
        const result = await db.prepare(`
            INSERT INTO user_tiers (tier_name, tier_color, tier_description, tier_order, mode)
            VALUES ($1, $2, $3, $4, $5)
        `).run(tier_name, tier_color, tier_description || null, tier_order || 99, mode);

        return NextResponse.json({
            id: result.lastInsertRowid,
            tier_name,
            tier_color,
            tier_description,
            tier_order,
            mode
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating tier:', error);
        return NextResponse.json({ error: 'Failed to create tier' }, { status: 500 });
    }
}
