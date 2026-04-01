import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Pick {
  season: number;
  round: number;
}

function parsePick(pickStr: string): Pick | null {
  const match = pickStr.match(/(\d{4})\s+(\d+)(?:st|nd|rd|th)?/);
  if (match) {
    return { season: parseInt(match[1]), round: parseInt(match[2]) };
  }
  return null;
}

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
            `SELECT t.id, t.status_updated_at, t.side,
                    t.picks_sent, t.picks_received, t.counterpart_player_ids,
                    sl.name as league_name, sl.total_rosters as roster_count
             FROM trades t
             JOIN sleeper_leagues sl ON sl.league_id = t.league_id
             WHERE t.player_a_id = $1
             ORDER BY t.status_updated_at DESC
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
            let picksSent: Pick[] = [];
            let picksRcv: Pick[] = [];
            
            try { cpIds = JSON.parse(t.counterpart_player_ids || '[]'); } catch { /**/ }
            try { 
                const picks: string[] = JSON.parse(t.picks_sent || '[]');
                picksSent = picks.map(p => parsePick(p)).filter(p => p !== null) as Pick[];
            } catch { /**/ }
            try { 
                const picks: string[] = JSON.parse(t.picks_received || '[]');
                picksRcv = picks.map(p => parsePick(p)).filter(p => p !== null) as Pick[];
            } catch { /**/ }
            
            return {
                id: t.id,
                date: new Date(t.status_updated_at * 1000).toISOString().split('T')[0],
                side: t.side,
                picks_sent: picksSent,
                picks_received: picksRcv,
                counterpart_players: cpIds.map(id => cpMap[id]).filter(Boolean),
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
