import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ROUND_SUFFIXES: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
// Well-known dynasty FF community Sleeper accounts used to seed league discovery
const SEED_USERNAMES = [
  'dynastynerds', 'keepertradecalculator', 'dynastyleaguefootball',
  'superflex', 'dynastyff', 'sfbx', 'underdog', 'dynastyprocess',
  'razzball', 'rotoballer', 'dynastyrobot', 'fantasypros',
  'sleeper', 'sleeperbot', 'dynastytradevalue',
];



async function ensureSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS sleeper_leagues (league_id TEXT PRIMARY KEY, name TEXT, season TEXT, total_rosters INTEGER, status TEXT, source TEXT DEFAULT 'user', added_at TIMESTAMPTZ DEFAULT NOW(), last_scraped_at TIMESTAMPTZ)`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, league_id TEXT, transaction_id TEXT, player_a_id INTEGER, side TEXT, counterpart_player_ids TEXT, picks_sent TEXT, picks_received TEXT, status_updated_at BIGINT, raw_adds TEXT, raw_drops TEXT, scraped_at TIMESTAMPTZ DEFAULT NOW())`
  );
  try { await query(`ALTER TABLE sleeper_leagues ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ`); } catch { /**/ }
  try { await query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS sleeper_id TEXT`); } catch { /**/ }
}
async function fetchSleeper(url: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DynastyScout/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) { await sleep(10000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch { if (attempt === 0) await sleep(2000); }
  }
  return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function normName(name: string): string {
  return name.toLowerCase()
    .replace(/['-.,]/g, '')
    .replace(/(jr|sr|ii|iii|iv|v)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPick(pick: any): string {
  const season = pick.season ?? '?';
  const roundNum = typeof pick.round === 'string' ? parseInt(pick.round) : (pick.round ?? 0);
  const roundStr = ROUND_SUFFIXES[roundNum] ?? `${roundNum}th`;
  return `${season} ${roundStr}`;
}

async function syncSleeperIds(): Promise<Map<string, number>> {
  const existing = await query<{ id: number; sleeper_id: string }>(
    `SELECT id, sleeper_id FROM players WHERE draft_year = 2026 AND sleeper_id IS NOT NULL AND sleeper_id != ''`
  );
  const bySleeperIdMap = new Map<string, number>(existing.map(r => [String(r.sleeper_id), r.id]));

  const unmatched = await query<{ id: number; full_name: string; position: string }>(
    `SELECT id, full_name, position FROM players WHERE draft_year = 2026 AND (sleeper_id IS NULL OR sleeper_id = '')`
  );
  if (unmatched.length === 0) return bySleeperIdMap;

  console.log(`[sync] Fetching Sleeper player map for ${unmatched.length} unmatched players...`);
  const sleeperPlayers: Record<string, any> | null = await fetchSleeper('https://api.sleeper.app/v1/players/nfl');
  if (!sleeperPlayers) return bySleeperIdMap;

  const sleeperLookup = new Map<string, string>();
  for (const [sleeperIdStr, info] of Object.entries(sleeperPlayers)) {
    const fullName = info.full_name || `${info.first_name || ''} ${info.last_name || ''}`.trim();
    const pos = (info.fantasy_positions?.[0] || info.position || '').toUpperCase();
    if (fullName && pos) sleeperLookup.set(`${normName(fullName)}|${pos}`, sleeperIdStr);
  }

  let matched = 0;
  for (const p of unmatched) {
    const key = `${normName(p.full_name)}|${p.position.toUpperCase()}`;
    const sleeperIdStr = sleeperLookup.get(key);
    if (sleeperIdStr) {
      await query(`UPDATE players SET sleeper_id = $1 WHERE id = $2`, [sleeperIdStr, p.id]);
      bySleeperIdMap.set(sleeperIdStr, p.id);
      matched++;
    }
  }
  console.log(`[sync] Matched ${matched}/${unmatched.length} players`);
  return bySleeperIdMap;
}


async function discoverLeagues(): Promise<number> {
  const discovered = new Map<string, { name: string; season: string; total_rosters: number }>();

  async function processUser(userId: string) {
    const leagues: any[] | null = await fetchSleeper(
      `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/2026`
    );
    await sleep(200);
    if (!Array.isArray(leagues)) return;
    for (const l of leagues) {
      if (l.league_id && !discovered.has(l.league_id)) {
        discovered.set(l.league_id, {
          name: l.name || l.league_id,
          season: l.season || "2026",
          total_rosters: l.total_rosters || 12,
        });
      }
    }
  }

  const level1UserIds = new Set<string>();
  for (const username of SEED_USERNAMES) {
    const user = await fetchSleeper(`https://api.sleeper.app/v1/user/${username}`);
    await sleep(300);
    if (!user?.user_id) continue;
    level1UserIds.add(user.user_id);
    await processUser(user.user_id);
    console.log(`[discover] Seeded user ${username}: ${discovered.size} leagues so far`);
  }

  const level1Leagues = Array.from(discovered.keys());
  const level2UserIds = new Set<string>();
  for (const leagueId of level1Leagues.slice(0, 50)) {
    const users: any[] | null = await fetchSleeper(
      `https://api.sleeper.app/v1/league/${leagueId}/users`
    );
    await sleep(200);
    if (!Array.isArray(users)) continue;
    for (const u of users) {
      if (u.user_id && !level1UserIds.has(u.user_id) && !level2UserIds.has(u.user_id)) {
        level2UserIds.add(u.user_id);
      }
    }
  }

  for (const userId of Array.from(level2UserIds).slice(0, 200)) {
    await processUser(userId);
    await sleep(150);
  }

  console.log(`[discover] Total leagues discovered: ${discovered.size}`);

  let upserted = 0;
  for (const [leagueId, info] of discovered.entries()) {
    try {
      await query(
        `INSERT INTO sleeper_leagues (league_id, name, season, total_rosters, source) VALUES ($1, $2, $3, $4, 'auto') ON CONFLICT (league_id) DO NOTHING`,
        [leagueId, info.name, info.season, info.total_rosters]
      );
      upserted++;
    } catch { /**/ }
  }
  console.log(`[discover] Upserted ${upserted} new leagues`);
  return upserted;
}

async function scrapeLeague(leagueId: string, sleeperIdMap: Map<string, number>): Promise<number> {
  let newRecords = 0;
  for (let week = 1; week <= 18; week++) {
    const transactions: any[] | null = await fetchSleeper(
      `https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`
    );
    await sleep(300);
    if (!Array.isArray(transactions)) continue;

    for (const txn of transactions) {
      if (txn.type !== 'trade') continue;
      const transactionId = String(txn.transaction_id ?? '');
      const adds: Record<string, number> = txn.adds || {};
      const drops: Record<string, number> = txn.drops || {};
      const draftPicks: any[] = txn.draft_picks || [];
      const statusUpdatedAt: number = txn.status_updated_at;

      const ourPlayers = new Map<number, { side: 'received' | 'sent'; rosterId: number }>();
      for (const [sid, rid] of Object.entries(adds)) {
        const dbId = sleeperIdMap.get(sid);
        if (dbId != null) ourPlayers.set(dbId, { side: 'received', rosterId: rid as number });
      }
      for (const [sid, rid] of Object.entries(drops)) {
        const dbId = sleeperIdMap.get(sid);
        if (dbId != null && !ourPlayers.has(dbId)) ourPlayers.set(dbId, { side: 'sent', rosterId: rid as number });
      }
      if (ourPlayers.size === 0) continue;

      for (const [dbPlayerId, { side, rosterId }] of ourPlayers.entries()) {
        const counterpartIds = [...ourPlayers.keys()].filter(id => id !== dbPlayerId);
        const picksSent = draftPicks.filter(p => p.previous_owner_id === rosterId).map(formatPick);
        const picksReceived = draftPicks.filter(p => p.owner_id === rosterId).map(formatPick);
        const recordId = `${transactionId}_${dbPlayerId}`;
        try {
          await query(
            `INSERT INTO trades (id, league_id, transaction_id, player_a_id, side, counterpart_player_ids, picks_sent, picks_received, status_updated_at, raw_adds, raw_drops) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
            [recordId, leagueId, transactionId, dbPlayerId, side,
             JSON.stringify(counterpartIds), JSON.stringify(picksSent), JSON.stringify(picksReceived),
             statusUpdatedAt, JSON.stringify(adds), JSON.stringify(drops)]
          );
          newRecords++;
        } catch (err) {
          console.error(`[trade] Insert error ${recordId}:`, err);
        }
      }
    }
  }
  return newRecords;
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (process.env.VERCEL_CRON_SECRET && secret !== process.env.VERCEL_CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSchema();
    const sleeperIdMap = await syncSleeperIds();
    if (sleeperIdMap.size === 0) {
      return NextResponse.json({ status: 'warning', message: 'No players matched to Sleeper IDs', timestamp: new Date().toISOString() });
    }

    let leagues = await query<{ league_id: string; name: string; last_scraped_at: string | null }>(
      `SELECT league_id, name, last_scraped_at FROM sleeper_leagues`
    );
    // Auto-discover leagues if none exist yet
    if (leagues.length === 0) {
      console.log('[cron/trades] No leagues found — running auto-discovery...');
      await discoverLeagues();
      leagues = await query<{ league_id: string; name: string; last_scraped_at: string | null }>(
        `SELECT league_id, name, last_scraped_at FROM sleeper_leagues`
      );
    }

    if (leagues.length === 0) {
      return NextResponse.json({ status: 'warning', message: 'League discovery found no leagues', timestamp: new Date().toISOString() });
    }

    const cutoff = Date.now() - 45 * 60 * 1000;
    const toScrape = leagues.filter(l => !l.last_scraped_at || new Date(l.last_scraped_at).getTime() < cutoff);

    let totalNew = 0;
    const results: { league: string; new_records: number }[] = [];
    for (const league of toScrape) {
      console.log(`[cron/trades] Scraping: ${league.name || league.league_id}`);
      const n = await scrapeLeague(league.league_id, sleeperIdMap);
      totalNew += n;
      results.push({ league: league.name || league.league_id, new_records: n });
      await query(`UPDATE sleeper_leagues SET last_scraped_at = NOW() WHERE league_id = $1`, [league.league_id]);
    }

    return NextResponse.json({
      status: 'success',
      leagues_scraped: toScrape.length,
      leagues_skipped: leagues.length - toScrape.length,
      new_records: totalNew,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/trades] Error:', err);
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown error', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) { return GET(req); }
