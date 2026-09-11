/**
 * Refresh the injury report and snap share from the server.
 *
 * The Python loader in scrapers/redraft/nflverse_availability.py runs from a
 * machine someone has to be sitting at. Injury reports land on Wednesday,
 * Thursday and Friday afternoons — exactly the window when a lineup is being
 * set — so a snapshot that only moves when the pipeline is run by hand is
 * close to useless for the thing it exists to answer. This is the same load,
 * on the daily Vercel pass.
 *
 * Both files are nflverse release assets on GitHub: no key, no scraping, and
 * reachable from anywhere the rest of the pipeline is.
 */
import { normalizeName } from '@/lib/espnPlayers';
import { getDb, query } from '@/lib/db';

const INJURY_URL = (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;
const SNAP_URL = (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`;

/** Only the positions a fantasy lineup is set from. */
const KEEP = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'FB']);

const UA = 'Mozilla/5.0 (compatible; DyCharts/1.0)';

/**
 * A CSV parser that survives quoted fields.
 *
 * The injury file carries free text — "Illness/Non-Injury Related" and player
 * names with commas in them — so splitting on commas silently shifts every
 * column after the first quoted one.
 */
export function parseCsv(text: string): Record<string, string>[] {
    const rows: string[][] = [];
    let row: string[] = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
            } else field += c;
            continue;
        }
        if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c !== '\r') field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    if (rows.length === 0) return [];
    const head = rows[0];
    return rows.slice(1)
        .filter(r => r.length >= head.length - 1 && r.some(v => v !== ''))
        .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
    const res = await fetch(url, {
        headers: { 'User-Agent': UA }, cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    return parseCsv(await res.text());
}

interface PoolRow { id: number; full_name: string; position: string | null; gsis_id: string | null }

function index(pool: PoolRow[]) {
    const byGsis = new Map<string, number>();
    const seen = new Map<string, number[]>();
    for (const p of pool) {
        if (p.gsis_id) byGsis.set(p.gsis_id, p.id);
        const key = `${normalizeName(p.full_name)}|${(p.position ?? '').toUpperCase()}`;
        const arr = seen.get(key);
        if (arr) arr.push(p.id); else seen.set(key, [p.id]);
    }
    // Only unambiguous names are safe to match on.
    const byNamePos = new Map<string, number>();
    for (const [k, v] of seen) if (v.length === 1) byNamePos.set(k, v[0]);
    return { byGsis, byNamePos };
}

const num = (v: string | undefined): number | null => {
    if (v == null || v === '' || v === 'NA') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

export interface AvailabilityReport {
    injuries: number;
    snaps: number;
    unmatched: number;
}

export async function refreshAvailability(season: number): Promise<AvailabilityReport> {
    const pool = await query<PoolRow>(
        `SELECT id, full_name, position, gsis_id
           FROM players WHERE redraft_pool = 1 AND position != 'DST'`);
    const { byGsis, byNamePos } = index(pool);

    const resolve = (gsis: string, name: string, pos: string): number | null => {
        if (gsis && byGsis.has(gsis)) return byGsis.get(gsis)!;
        return byNamePos.get(`${normalizeName(name)}|${pos}`) ?? null;
    };

    let unmatched = 0;

    // ── injuries ────────────────────────────────────────────────────────
    const injRows = await fetchCsv(INJURY_URL(season));
    const inj: any[] = [];
    for (const r of injRows) {
        const pos = (r.position ?? '').toUpperCase();
        if (!KEEP.has(pos)) continue;
        const pid = resolve(r.gsis_id ?? '', r.full_name ?? '', pos);
        if (!pid) { unmatched++; continue; }
        inj.push([
            pid, Number(r.season), Number(r.week),
            (r.season_type || 'REG').toUpperCase(),
            (r.team || '').toUpperCase() || null, pos,
            r.report_status?.trim() || null,
            r.report_primary_injury?.trim() || null,
            r.practice_status?.trim() || null,
            r.practice_primary_injury?.trim() || null,
            'nflverse',
        ]);
    }

    for (let i = 0; i < inj.length; i += 100) {
        const chunk = inj.slice(i, i + 100);
        const params: any[] = [];
        const values = chunk.map(r => {
            const b = params.length;
            params.push(...r);
            return `(${r.map((_: unknown, k: number) => `$${b + k + 1}`).join(',')})`;
        });
        await getDb().prepare(
            `INSERT INTO nfl_player_injury
               (player_id, season, week, season_type, team, position,
                report_status, report_primary_injury, practice_status,
                practice_primary_injury, data_source)
             VALUES ${values.join(',')}
             ON CONFLICT (player_id, season, week, season_type) DO UPDATE SET
               team = excluded.team,
               report_status = excluded.report_status,
               report_primary_injury = excluded.report_primary_injury,
               practice_status = excluded.practice_status,
               practice_primary_injury = excluded.practice_primary_injury`,
        ).run(params);
    }

    // ── snap share ──────────────────────────────────────────────────────
    // Updates rather than inserts: a snap count for a player with no weekly
    // stat row is a row we do not want to invent.
    const snapRows = await fetchCsv(SNAP_URL(season));
    let snaps = 0;
    for (const r of snapRows) {
        const pos = (r.position ?? '').toUpperCase();
        if (!KEEP.has(pos)) continue;
        const pid = resolve('', r.player ?? '', pos);
        if (!pid) continue;
        // nflverse writes the share as a fraction already.
        const res = await getDb().prepare(
            `UPDATE nfl_player_week SET offense_snaps = $1, offense_pct = $2
              WHERE player_id = $3 AND season = $4 AND week = $5 AND season_type = $6`,
        ).run([num(r.offense_snaps), num(r.offense_pct), pid,
               Number(r.season), Number(r.week), (r.game_type || 'REG').toUpperCase()]);
        snaps += res.changes ?? 0;
    }

    return { injuries: inj.length, snaps, unmatched };
}
