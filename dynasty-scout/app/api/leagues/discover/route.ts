import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

async function fetchSleeperApi(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DyCharts/1.0' },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Sleeper API error: ${res.status}`);
    }

    return res.json();
  } catch (err) {
    console.error(`Fetch error for ${url}:`, err);
    return null;
  }
}

async function getUserLeagues(usernameOrId: string): Promise<any[] | null> {
  try {
    const userUrl = `https://api.sleeper.app/v1/user/${usernameOrId}`;
    const user = await fetchSleeperApi(userUrl);

    if (!user || !user.user_id) {
      throw new Error('User not found');
    }

    const leaguesUrl = `https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/2026`;
    const leagues = await fetchSleeperApi(leaguesUrl);

    return leagues || [];
  } catch (err) {
    console.error('Failed to get user leagues:', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    const leagues = await getUserLeagues(username);

    if (!leagues || leagues.length === 0) {
      return NextResponse.json(
        { error: 'No leagues found for this user' },
        { status: 404 }
      );
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sleeper_leagues (league_id, name, season, total_rosters, source, added_at)
      VALUES (?, ?, ?, ?, 'user_discovery', datetime('now'))
    `);

    const addedLeagues = [];

    for (const league of leagues) {
      try {
        stmt.run(league.league_id, league.name, league.season, league.total_rosters);
        addedLeagues.push({
          league_id: league.league_id,
          name: league.name,
          season: league.season,
          total_rosters: league.total_rosters,
        });
      } catch (err) {
        console.error(`Failed to add league ${league.league_id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      username,
      leagues_discovered: addedLeagues.length,
      leagues: addedLeagues,
      message: `Found and added ${addedLeagues.length} league(s). Trade data will be populated on the next refresh.`,
    });
  } catch (err) {
    console.error('POST /api/leagues/discover error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to discover leagues' },
      { status: 500 }
    );
  }
}
