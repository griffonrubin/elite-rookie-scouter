import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface LeagueResponse {
  league_id: string;
  name: string;
  season: number;
  total_rosters: number;
}

async function fetchSleeperLeague(leagueId: string): Promise<LeagueResponse> {
  const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  const data = await res.json();
  return {
    league_id: data.league_id,
    name: data.name || 'Unnamed League',
    season: data.season || new Date().getFullYear(),
    total_rosters: data.total_rosters || 12,
  };
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT league_id, name, season, total_rosters FROM sleeper_leagues ORDER BY name');
    const leagues = stmt.all();

    return NextResponse.json({ leagues });
  } catch (err) {
    console.error('GET /api/leagues error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch leagues' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { league_id } = body;

    if (!league_id) {
      return NextResponse.json({ error: 'league_id required' }, { status: 400 });
    }

    // Fetch league details from Sleeper
    const leagueData = await fetchSleeperLeague(league_id);

    // Save to database
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sleeper_leagues (league_id, name, season, total_rosters, source, added_at)
      VALUES (?, ?, ?, ?, 'user_add', datetime('now'))
    `);
    stmt.run(leagueData.league_id, leagueData.name, leagueData.season, leagueData.total_rosters);

    return NextResponse.json({
      league_id: leagueData.league_id,
      name: leagueData.name,
      season: leagueData.season,
      total_rosters: leagueData.total_rosters,
    });
  } catch (err) {
    console.error('POST /api/leagues error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add league' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { league_id } = body;

    if (!league_id) {
      return NextResponse.json({ error: 'league_id required' }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare('DELETE FROM sleeper_leagues WHERE league_id = ?');
    stmt.run(league_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/leagues error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove league' },
      { status: 500 }
    );
  }
}
