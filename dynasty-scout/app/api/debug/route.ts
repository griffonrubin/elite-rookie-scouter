import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export async function GET() {
    try {
        let count = -1;
        let error = null;

        try {
            const result = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM players');
            count = result?.count || 0;
        } catch (e: any) {
            error = e.message;
        }

        return NextResponse.json({
            dbType: 'postgresql (supabase)',
            playerCount: count,
            dbError: error
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
