import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const player = await queryOne<{ id: number; full_name: string; position: string }>(
            'SELECT id, full_name, position FROM players WHERE slug = $1',
            [slug]
        );
        if (!player) {
            return NextResponse.json({ error: 'Player not found' }, { status: 404 });
        }

        const trades = await query<any>(
            `SELECT t.id, t.transaction_date, t.side,
                    t.picks_sent, t.picks_received, t.counterpart_player_ids,
                    sl.league_name, sl.roster_count
             FROM trades t
             JOIN sleeper_leagues sl ON sl.league_id = t.league_id
             WHERE t.player_a_id = $1
             ORDER BY t.transaction_date DESC
             LIMIT 50`,
            [player.id]
        );

        // Collect all counterpart player ids to batch-fetch names
        const allCpIds = new Set<number>();
        for (const t of trades) {
            try {
                const ids: number[] = JSON.parse(t.counterpart_player_ids || '[]');
                ids.forEach(id => allCpIds.add(id));
            } catch { /* ignore */ }
        }

        const cpMap: Record<number, { id: number; full_name: string; position: string; slug: string }> = {};
        if (allCpIds.size > 0) {
            const placeholders = Array.from(allCpIds).map((_, i) => '$' + (i + 1)).join(',');
            const cpPlayers = await query<any>(
                `SELECT id, full_name, position, slug FROM players WHERE id IN (${placeholders})`,
                Array.from(allCpIds)
            );
            for (const cp of cpPlayers) cpMap[cp.id] = cp;
        }

        const transformed = trades.map(t => {
            let cpIds: number[] = [];
            let picksSent: string[] = [];
            let picksRcv: string[] = [];
            try { cpIds = JSON.parse(t.counterpart_player_ids || '[]'); } catch { /**/ }
            try { picksSent = JSON.parse(t.picks_sent || '[]'); } catch { /**/ }
            try { picksRcv = JSON.parse(t.picks_received || '[]'); } catch { /**/ }
            return {
                id: t.id,
                date: t.transaction_date,
                side: t.side,
                picks_sent: picksSent,
                picks_received: picksRcv,
                counterparts: cpIds.map(id => cpMap[id]).filter(Boolean),
                league_name: t.league_name,
                roster_count: t.roster_count,
            };
        });

        return NextResponse.json({ player, trades: transformed });
    } catch (e) {
        console.error('Trades API error:', e);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
