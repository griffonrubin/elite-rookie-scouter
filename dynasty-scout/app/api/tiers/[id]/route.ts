import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import sql from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = (await params).id;
        const body = await request.json();
        const { tier_name, tier_color, tier_description, tier_order } = body;

        const updates: string[] = [];
        const values: any[] = [];

        if (tier_name) { updates.push(`tier_name = $${values.push(tier_name)}`); }
        if (tier_color) { updates.push(`tier_color = $${values.push(tier_color)}`); }
        if (tier_description !== undefined) { updates.push(`tier_description = $${values.push(tier_description)}`); }
        if (tier_order !== undefined) { updates.push(`tier_order = $${values.push(tier_order)}`); }
        updates.push('updated_at = NOW()');

        values.push(id);

        if (updates.length > 1) {
            await sql.unsafe(
                `UPDATE user_tiers SET ${updates.join(', ')} WHERE id = $${values.length}`,
                values
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating tier:', error);
        return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const id = (await params).id;

        const result = await sql.unsafe(
            'DELETE FROM user_tiers WHERE id = $1 RETURNING id',
            [id]
        );

        if ((result as any[]).length === 0) {
            return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting tier:', error);
        return NextResponse.json({ error: 'Failed to delete tier' }, { status: 500 });
    }
}
