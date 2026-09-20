/**
 * Dynasty trade values, refreshed where the app actually runs.
 *
 * The server-side twin of scrapers/rankings/dynasty_values.py. The Python one
 * writes to the local SQLite file, which is the right thing on this machine
 * and reaches nothing in production — Vercel runs against Supabase and cannot
 * run Python. So the daily refresh lives here, behind a cron route, and the
 * script stays for working locally.
 *
 * Two things this deliberately does not do.
 *
 * It does not touch the rookie sources. "KeepTradeCut", "FantasyPros",
 * "DynastyNerds" and "FantasyCalc" hold how the 2026 class was seen before
 * the draft; run_consensus.py weights them into the rookie board, and they
 * are a snapshot worth keeping rather than a feed worth refreshing. Dynasty
 * values are their own sources.
 *
 * And it never deletes. Every write is keyed on (player_id, source,
 * scraped_at), so a second run on one day corrects that day and every earlier
 * day survives. That is what makes a player's value a line rather than a
 * number: you can only see that somebody has been sliding for a month if the
 * month is still there.
 */
import { query, getDb } from '@/lib/db';

const BASE = 'https://api.fantasycalc.com/values/current';
const SOURCE_URL = 'https://fantasycalc.com/rankings';

/** The two formats, and which column of `dynasty_picks` each one fills. */
export const DYNASTY_FEEDS = [
    {
        key: '1qb',
        source: 'FantasyCalc Dynasty',
        query: '?isDynasty=true&numQbs=1&ppr=1&superflex=false',
        valueCol: 'value_1qb',
        rankCol: 'rank_1qb',
    },
    {
        key: 'sf',
        source: 'FantasyCalc Dynasty SF',
        query: '?isDynasty=true&numQbs=2&ppr=1&superflex=true',
        valueCol: 'value_sf',
        rankCol: 'rank_sf',
    },
] as const;

/** "2027 1st (Early)", "2028 2nd", … */
const PICK_LABEL = /^(\d{4}) (\d+)(?:st|nd|rd|th)(?: \((Early|Mid|Late)\))?$/;

interface FcRow {
    player: {
        name: string;
        position: string;
        sleeperId?: string | null;
    };
    value: number;
    overallRank: number | null;
    positionRank: number | null;
}

/**
 * Picks are assets, not players, so they get their own table rather than a
 * fake row in `players` that every other query would then have to exclude.
 */
export async function ensurePickTable(): Promise<void> {
    // run(), not query(): `query` reads with .all(), which SQLite refuses for
    // a statement that returns no rows, so the local path 500s on the DDL.
    await getDb().prepare(
        `CREATE TABLE IF NOT EXISTS dynasty_picks (
           label      TEXT PRIMARY KEY,
           season     INTEGER NOT NULL,
           round      INTEGER NOT NULL,
           slot       TEXT,
           value_1qb  INTEGER,
           value_sf   INTEGER,
           rank_1qb   INTEGER,
           rank_sf    INTEGER,
           scraped_at TEXT NOT NULL
         )`).run([]);
}

async function fetchFeed(q: string): Promise<FcRow[]> {
    const res = await fetch(BASE + q, {
        headers: { 'user-agent': 'dynasty-scout/1.0' },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`${res.status} from api.fantasycalc.com`);
    return res.json() as Promise<FcRow[]>;
}

async function savePlayers(
    rows: FcRow[], source: string, bySleeper: Map<string, number>, today: string,
): Promise<number> {
    const matched = rows
        .filter(r => r.player.position !== 'PICK')
        .map(r => ({ row: r, pid: bySleeper.get(String(r.player.sleeperId ?? '')) }))
        .filter((x): x is { row: FcRow; pid: number } => x.pid != null)
        // Two feed rows resolving to one player would break the 1..N
        // ordering below, so the better rank wins.
        .sort((a, b) => (a.row.overallRank ?? 9e9) - (b.row.overallRank ?? 9e9));

    const seen = new Set<number>();
    const dense = matched.filter(x => !seen.has(x.pid) && seen.add(x.pid));

    for (let i = 0; i < dense.length; i += 200) {
        const chunk = dense.slice(i, i + 200);
        const params: (number | string | null)[] = [];
        const values = chunk.map((x, j) => {
            const b = params.length;
            params.push(x.pid, source, i + j + 1, x.row.positionRank,
                SOURCE_URL, today, x.row.value);
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
        });
        await getDb().prepare(
            `INSERT INTO rankings
               (player_id, source, rank_overall, rank_positional,
                source_url, scraped_at, value)
             VALUES ${values.join(',')}
             ON CONFLICT (player_id, source, scraped_at) DO UPDATE SET
               rank_overall    = excluded.rank_overall,
               rank_positional = excluded.rank_positional,
               source_url      = excluded.source_url,
               value           = excluded.value`,
        ).run(params);
    }
    return dense.length;
}

async function savePicks(
    rows: FcRow[], valueCol: string, rankCol: string, today: string,
): Promise<number> {
    let n = 0;
    for (const r of rows) {
        if (r.player.position !== 'PICK') continue;
        const m = PICK_LABEL.exec(r.player.name.trim());
        if (!m) continue;
        n += 1;
        // `query`, with an explicit RETURNING, and both halves of that
        // matter.
        //
        // getDb().run() appends `RETURNING id` to any INSERT that lacks one,
        // so it can report a lastInsertRowid. dynasty_picks is keyed on the
        // label and has no id column, so every pick insert died in
        // production on `column "id" does not exist` — while the player
        // writes beside them succeeded, because those go to `rankings`,
        // which does have an id. The cron reported 397 players saved and
        // quietly saved no picks at all.
        //
        // Naming a RETURNING stops the injection. It has to go through
        // `query` rather than `run` because better-sqlite3 refuses `.run()`
        // on a statement that returns rows, which is how the local path
        // would then have broken instead.
        await query(
            `INSERT INTO dynasty_picks
               (label, season, round, slot, ${valueCol}, ${rankCol}, scraped_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (label) DO UPDATE SET
               season       = excluded.season,
               round        = excluded.round,
               slot         = excluded.slot,
               ${valueCol}  = excluded.${valueCol},
               ${rankCol}   = excluded.${rankCol},
               scraped_at   = excluded.scraped_at
             RETURNING label`,
            [r.player.name.trim(), Number(m[1]), Number(m[2]),
                m[3] ? m[3].toLowerCase() : null, r.value, r.overallRank, today]);
    }
    return n;
}

export interface DynastyRefreshResult {
    status: 'ok' | 'failed';
    scraped_at: string;
    [key: string]: unknown;
}

/** Refresh both formats. One failing must not cost the other its run. */
export async function refreshDynastyValues(today: string): Promise<DynastyRefreshResult> {
    await ensurePickTable();
    const pool = await query<{ id: number; sleeper_id: string | null }>(
        `SELECT id, sleeper_id FROM players
          WHERE sleeper_id IS NOT NULL AND sleeper_id != ''`);
    const bySleeper = new Map(pool.map(p => [String(p.sleeper_id), p.id]));

    const settled = await Promise.allSettled(DYNASTY_FEEDS.map(async feed => {
        const rows = await fetchFeed(feed.query);
        const players = await savePlayers(rows, feed.source, bySleeper, today);
        const picks = await savePicks(rows, feed.valueCol, feed.rankCol, today);
        return { key: feed.key, source: feed.source, players, picks };
    }));

    const report: Record<string, unknown> = {};
    settled.forEach((r, i) => {
        const feed = DYNASTY_FEEDS[i];
        report[feed.key] = r.status === 'fulfilled'
            ? { source: r.value.source, players: r.value.players, picks: r.value.picks }
            : { error: String((r.reason as Error)?.message ?? r.reason) };
    });

    return {
        status: settled.some(r => r.status === 'fulfilled') ? 'ok' : 'failed',
        scraped_at: today,
        matchable: bySleeper.size,
        ...report,
    };
}
