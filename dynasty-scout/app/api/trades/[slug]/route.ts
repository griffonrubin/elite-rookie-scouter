import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Pick {
  season: number;
  round: number;
}

function parsePick(pickStr: string): Pick | null {
  const m = pickStr.match(/(\d{4})\s+(\d+)/);
  if (m) return { season: parseInt(m[1]), round: parseInt(m[2]) };
  return null;
}

function pickRoundLabel(r: number): string {
  const map: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
  return map[r] ?? `${r}th`;
}

function projRankToRound(rank: number): number {
  if (rank <= 12) return 1;
  if (rank <= 24) return 2;
  if (rank <= 36) return 3;
  return 4;
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const url = new URL(_req.url);
        const mode = url.searchParams.get('mode') || 'player';
        const season = url.searchParams.get('season') || '2026';

        const player = await queryOne<{
          id: number; full_name: string; position: string;
          ktc_rank: number | null; consensus_rank: number | null; best_rank: number | null
        }>(
            'SELECT id, full_name, position, ktc_rank, consensus_rank, best_rank FROM players WHERE slug = $1',
            [slug]
        );
        if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

        const projRank = player.ktc_rank ?? player.consensus_rank ?? player.best_rank ?? null;

        if (mode === 'picks') {
            const round = projRank ? projRankToRound(projRank) : 1;
            const pickLabel = `${season} ${pickRoundLabel(round)}`;

            const trades = await query<any>(
                `SELECT t.id, t.status_updated_at, t.side,
                        t.picks_sent, t.picks_received, t.counterpart_player_ids,
                        t.player_a_id,
                        sl.name as league_name, sl.total_rosters as roster_count
                 FROM trades t
                 JOIN sleeper_leagues sl ON sl.league_id = t.league_id
                 WHERE (t.picks_sent LIKE $1 OR t.picks_received LIKE $1)
                 ORDER BY t.status_updated_at DESC
                 LIMIT 50`,
                [`%${pickLabel}%`]
            );

            const allIds = new Set<number>();
            for (const t of trades) {
                if (t.player_a_id) allIds.add(t.player_a_id);
                try { JSON.parse(t.counterpart_player_ids || '[]').forEach((id: number) => allIds.add(id)); } catch { /**/ }
            }
            const playerMap: Record<number, any> = {};
            if (allIds.size > 0) {
                const ph = Array.from(allIds).map((_, i) => '$' + (i + 1)).join(',');
                const ps = await query<any>(`SELECT id, full_name, position, slug FROM players WHERE id IN (${ph})`, Array.from(allIds));
                for (const p of ps) playerMap[p.id] = p;
            }

            const transformed = trades.map(t => {
                let cpIds: number[] = [];
                let picksSent: Pick[] = [];
                let picksRcv: Pick[] = [];
                try { cpIds = JSON.parse(t.counterpart_player_ids || '[]'); } catch { /**/ }
                try { picksSent = JSON.parse(t.picks_sent || '[]').map(parsePick).filter(Boolean); } catch { /**/ }
                try { picksRcv = JSON.parse(t.picks_received || '[]').map(parsePick).filter(Boolean); } catch { /**/ }
                return {
                    id: t.id,
                    date: new Date(t.status_updated_at * 1000).toISOString().split('T')[0],
                    side: t.side,
                    picks_sent: picksSent,
                    picks_received: picksRcv,
                    counterpart_players: cpIds.map(id => playerMap[id]).filter(Boolean),
                    subject_player: playerMap[t.player_a_id] ?? null,
                    league_name: t.league_name,
                    roster_count: t.roster_count,
                };
            });

            return NextResponse.json({ player, trades: transformed, pick_label: pickLabel, round, mode: 'picks' });
        }

        // player mode
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

        const allCpIds = new Set<number>();
        for (const t of trades) {
            try { JSON.parse(t.counterpart_player_ids || '[]').forEach((id: number) => allCpIds.add(id)); } catch { /**/ }
        }
        const cpMap: Record<number, any> = {};
        if (allCpIds.size > 0) {
            const ph = Array.from(allCpIds).map((_, i) => '$' + (i + 1)).join(',');
            const cps = await query<any>(`SELECT id, full_name, position, slug FROM players WHERE id IN (${ph})`, Array.from(allCpIds));
            for (const cp of cps) cpMap[cp.id] = cp;
        }

        const transformed = trades.map(t => {
            let cpIds: number[] = [];
            let picksSent: Pick[] = [];
            let picksRcv: Pick[] = [];
            try { cpIds = JSON.parse(t.counterpart_player_ids || '[]'); } catch { /**/ }
            try { picksSent = JSON.parse(t.picks_sent || '[]').map(parsePick).filter(Boolean); } catch { /**/ }
            try { picksRcv = JSON.parse(t.picks_received || '[]').map(parsePick).filter(Boolean); } catch { /**/ }
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

        return NextResponse.json({ player, trades: transformed, mode: 'player' });
    } catch (e) {
        console.error('Trades API error:', e);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
