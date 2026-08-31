import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
    dstKey, ESPN_POSITIONS, isRealEspnId, matchEspnIds, normalizeName, PoolPlayer,
    writeEspnIds,
} from '@/lib/espnPlayers';
import { refreshRankingSources } from '@/lib/redraftSources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Refresh the 2026 projections from Sleeper and ESPN.
 *
 * This is the server-side twin of scrapers/redraft/{sleeper,espn}_redraft.py.
 * Those run from a machine with a route to both APIs; this runs on Vercel,
 * which also has one, so the projections stay current without anybody
 * running the local pipeline.
 *
 * Projections, the ESPN player ids that live-draft sync matches picks on,
 * and the three ranking sources with no other way in.
 *
 * The ranking sources used to be left to the local pipeline, because writing
 * fresher source ranks without recomputing the consensus leaves the board's
 * consensus column disagreeing with the columns beside it. The consensus is
 * now rebuilt in the same pass (lib/redraftConsensus, held to matching the
 * Python exactly), so that objection no longer holds.
 *
 * The other seven sources come from a CSV export that has to be downloaded by
 * hand, so they stay with the local import. They are unaffected by this: the
 * board and the consensus both read the newest scrape per source.
 *
 * This carries the ranking refresh rather than giving it its own schedule
 * because the Hobby plan allows few enough scheduled jobs to make one shared
 * daily pass the safer arrangement.
 *
 * Auth mirrors /api/cron/trades — Vercel Cron sends VERCEL_CRON_SECRET as a
 * bearer token, and the check is skipped when the variable is not set.
 */

const SEASON = 2026;
const GAMES = 17;

const SLEEPER_URL =
    `https://api.sleeper.com/projections/nfl/${SEASON}?season_type=regular&`
    + ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => `position[]=${p}`).join('&')
    + '&order_by=pts_ppr';

const ESPN_URL =
    'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/'
    + `${SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

/**
 * ESPN's whole player universe — id, name, position, team and nothing else.
 *
 * The projections feed above is the top few hundred by draft rank, which is
 * all a projection needs but leaves the tail of the pool without an id. This
 * list is far deeper and far lighter, carrying no stats at all.
 */
const ESPN_PLAYERS_URL =
    'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/'
    + `${SEASON}/players?scoringPeriodId=0&view=players_wl`;

async function fetchJson(url: string, headers: Record<string, string>) {
    const res = await fetch(url, {
        headers, cache: 'no-store', signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    return res.json();
}

/** One source's projections, written as a dense 1..N ordering by points. */
async function saveProjections(
    source: string,
    rows: { pid: number; pts: number; pos: string }[],
    today: string,
): Promise<number> {
    if (rows.length === 0) return 0;
    const ordered = [...rows].sort((a, b) => b.pts - a.pts);

    const posCount: Record<string, number> = {};
    const values: string[] = [];
    const params: any[] = [];
    ordered.forEach((r, i) => {
        posCount[r.pos] = (posCount[r.pos] ?? 0) + 1;
        const b = params.length;
        values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
        params.push(r.pid, source, SEASON, r.pts, Number((r.pts / GAMES).toFixed(2)),
            i + 1, posCount[r.pos], today);
    });

    await query(
        `INSERT INTO projections
           (player_id, source, season, proj_points, proj_ppg,
            proj_rank_overall, proj_rank_positional, scraped_at)
         VALUES ${values.join(',')}
         ON CONFLICT (player_id, source, season, scraped_at) DO UPDATE SET
           proj_points          = excluded.proj_points,
           proj_ppg             = excluded.proj_ppg,
           proj_rank_overall    = excluded.proj_rank_overall,
           proj_rank_positional = excluded.proj_rank_positional`,
        params,
    );
    return ordered.length;
}

async function refreshSleeper(pool: PoolPlayer[], today: string) {
    const bySleeper = new Map(
        pool.filter(p => p.sleeper_id).map(p => [String(p.sleeper_id), p]),
    );
    const rows = await fetchJson(SLEEPER_URL, {
        'User-Agent': 'Mozilla/5.0 (compatible; DyCharts/1.0)',
        Accept: 'application/json',
    });
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('no projection rows');

    const out: { pid: number; pts: number; pos: string }[] = [];
    let unmatched = 0;
    for (const row of rows) {
        const p = bySleeper.get(String(row?.player_id ?? ''));
        if (!p) { unmatched++; continue; }      // IDP and other non-pool players
        const pts = Number(row?.stats?.pts_ppr);
        if (!Number.isFinite(pts) || pts <= 0) continue;
        out.push({ pid: p.id, pts: Number(pts.toFixed(2)), pos: (p.position || '').toUpperCase() });
    }
    return {
        seen: rows.length,
        saved: await saveProjections('Sleeper', out, today),
        unmatched,
    };
}

async function refreshEspn(pool: PoolPlayer[], today: string) {
    const byEspn = new Map(
        pool.filter(p => isRealEspnId(p.espn_nfl_id)).map(p => [String(p.espn_nfl_id), p]));
    const byNamePos = new Map<string, PoolPlayer>();
    const byDst = new Map<string, PoolPlayer>();
    const ambiguous = new Set<string>();
    for (const p of pool) {
        const pos = (p.position || '').toUpperCase();
        if (pos === 'DST') {
            const nick = dstKey(p.full_name);
            if (nick) byDst.set(nick, p);
            if (p.nfl_team) byDst.set(p.nfl_team.toUpperCase(), p);
            continue;
        }
        const key = `${normalizeName(p.full_name)}|${pos}`;
        if (byNamePos.has(key)) ambiguous.add(key);
        byNamePos.set(key, p);
    }
    ambiguous.forEach(k => byNamePos.delete(k));   // never guess between two players

    const data = await fetchJson(ESPN_URL, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/json',
        'X-Fantasy-Filter': JSON.stringify({
            players: {
                limit: 900,
                sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'PPR' },
            },
        }),
        'X-Fantasy-Source': 'kona',
        'X-Fantasy-Platform': 'kona-PROD',
    });
    const players = data?.players ?? [];
    if (!Array.isArray(players) || players.length === 0) {
        throw new Error('kona_player_info returned no players');
    }

    const out: { pid: number; pts: number; pos: string }[] = [];
    let unmatched = 0;
    for (const entry of players) {
        const raw = entry?.player ?? {};
        const pos = ESPN_POSITIONS[raw?.defaultPositionId];
        if (!pos) continue;

        const name = raw?.fullName ?? '';
        const player = pos === 'DST'
            ? byDst.get(dstKey(name)) ?? byDst.get(String(raw?.proTeamId ?? '').toUpperCase())
            : byEspn.get(String(raw?.id ?? '')) ?? byNamePos.get(`${normalizeName(name)}|${pos}`);
        if (!player) { unmatched++; continue; }

        // The full-season projection, as opposed to a weekly or actual split.
        const stat = (raw?.stats ?? []).find(
            (s: any) => s?.statSourceId === 1 && s?.statSplitTypeId === 0 && s?.seasonId === SEASON,
        );
        const pts = Number(stat?.appliedTotal);
        if (!Number.isFinite(pts) || pts <= 0) continue;
        out.push({ pid: player.id, pts: Number(pts.toFixed(2)), pos });
    }
    return {
        seen: players.length,
        saved: await saveProjections('ESPN', out, today),
        unmatched,
    };
}

/**
 * Fill in the ESPN ids the pool is missing.
 *
 * Live-draft sync matches an ESPN pick by `espn_nfl_id`, so a player without
 * one cannot come off the board when he is drafted. Nobody near the top of
 * the board is missing one today, but pool membership moves through the
 * season — a player at rank 500 in August can be rank 150 in November — so
 * this keeps the gap from ever reaching the part of the board that is
 * actually drafted.
 */
async function backfillEspnIds(pool: PoolPlayer[]) {
    if (pool.every(p => isRealEspnId(p.espn_nfl_id))) {
        return { missing: 0, filled: 0, skipped: 0, universe: 0 };
    }
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/json',
    };
    // The filter asks for everyone rather than only the active players ESPN
    // returns by default. If it is rejected, the unfiltered list is still
    // worth having, so fall back to it rather than losing the whole pass.
    let players: unknown;
    try {
        players = await fetchJson(ESPN_PLAYERS_URL, {
            ...headers, 'X-Fantasy-Filter': JSON.stringify({ filterActive: null }),
        });
    } catch {
        players = await fetchJson(ESPN_PLAYERS_URL, headers);
    }
    if (!Array.isArray(players) || players.length === 0) {
        throw new Error('players_wl returned no players');
    }
    const { found, missing, skipped } = matchEspnIds(pool, players);
    return { missing, filled: await writeEspnIds(found), skipped, universe: players.length };
}

export async function GET(req: NextRequest) {
    const secret = req.headers.get('authorization')?.replace('Bearer ', '');
    if (process.env.VERCEL_CRON_SECRET && secret !== process.env.VERCEL_CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const pool = await query<PoolPlayer>(
        `SELECT id, full_name, position, nfl_team, sleeper_id, espn_nfl_id
           FROM players WHERE redraft_pool = 1`,
    );

    // One of these failing must not cost the others their refresh — and the
    // id backfill in particular must never be able to fail a projection run.
    const [sleeper, espn, ids] = await Promise.allSettled([
        refreshSleeper(pool, today),
        refreshEspn(pool, today),
        backfillEspnIds(pool),
    ]);
    const report = (r: PromiseSettledResult<unknown>) =>
        r.status === 'fulfilled' ? r.value : { error: String(r.reason?.message ?? r.reason) };

    // The ranking scrapes are independent of the projections above, and must
    // not be able to fail them.
    let rankings: unknown;
    try {
        rankings = await refreshRankingSources(today);
    } catch (e) {
        rankings = { error: String((e as Error)?.message ?? e) };
    }

    const ok = sleeper.status === 'fulfilled' || espn.status === 'fulfilled';
    return NextResponse.json({
        status: ok ? 'ok' : 'failed',
        season: SEASON,
        scraped_at: today,
        pool: pool.length,
        sleeper: report(sleeper),
        espn: report(espn),
        espn_ids: report(ids),
        rankings,
    }, { status: ok ? 200 : 502 });
}
