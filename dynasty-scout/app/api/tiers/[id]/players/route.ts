import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tier_id = (await params).id;
        const body = await request.json();
        const { player_id, player_order } = body;

        if (!player_id) {
            return NextResponse.json({ error: 'Missing player_id' }, { status: 400 });
        }

        // Remove from any existing tier first
        await sql.unsafe('DELETE FROM tier_players WHERE player_id = $1', [player_id]);

        const result = await sql.unsafe(
            'INSERT INTO tier_players (tier_id, player_id, player_order) VALUES ($1, $2, $3) RETURNING id',
            [tier_id, player_id, player_order || 0]
        ) as any[];

        return NextResponse.json({ success: true, id: result[0]?.id });
    } catch (error) {
        console.error('Error adding player to tier:', error);
        return NextResponse.json({ error: 'Failed to add player to tier' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tier_id = (await params).id;
        const body = await request.json();
        const { player_id } = body;

        if (!player_id) {
            return NextResponse.json({ error: 'Missing player_id' }, { status: 400 });
        }

        await sql.unsafe(
            'DELETE FROM tier_players WHERE tier_id = $1 AND player_id = $2',
            [tier_id, player_id]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing player from tier:', error);
        return NextResponse.json({ error: 'Failed to remove player' }, { status: 500 });
    }
}
