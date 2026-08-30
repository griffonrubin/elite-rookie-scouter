import { getDb } from '@/lib/db';

/**
 * Matching NFL players to ESPN's player universe.
 *
 * Shared by the daily projections refresh and the id backfill beside it,
 * which need the same name normalisation and the same defense handling.
 */

/** ESPN's internal position ids. */
export const ESPN_POSITIONS: Record<number, string> = {
    1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST',
};

/** Same normalisation as scrapers/redraft/names.py. */
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
export function normalizeName(name: string): string {
    return (name || '')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[.'`’]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(part => part && !SUFFIXES.has(part))
        .join(' ');
}

/**
 * Key a team defense by nickname.
 *
 * ESPN calls one "Lions D/ST" where the pool stores "Detroit Lions D/ST",
 * so the plain name match drops all 32 of them. Every NFL nickname is a
 * single word, so stripping the D/ST suffix and taking the last word gives
 * both spellings the same key.
 */
export function dstKey(name: string): string {
    const n = normalizeName(name)
        .replace(/\b(d st|dst|defense|special teams)\b/g, '')
        .trim();
    const parts = n.split(' ').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

/**
 * Does this pool player already carry a usable ESPN id?
 *
 * Every ESPN id is an integer — negative for a team defense. Anything else
 * is a sentinel that leaked out of a source file (R writes a missing value
 * as the string "NA"), and treating one as real would both leave the player
 * unfillable here and let a junk key match a pick during a live draft.
 */
export function isRealEspnId(v: unknown): boolean {
    return typeof v === 'string' || typeof v === 'number'
        ? /^-?\d+$/.test(String(v).trim())
        : false;
}

export interface PoolPlayer {
    id: number;
    full_name: string;
    position: string | null;
    nfl_team: string | null;
    sleeper_id: string | null;
    espn_nfl_id: string | null;
}

/** One entry from ESPN's player list — only the fields an id needs. */
export interface EspnPlayerRow {
    id?: number | string;
    fullName?: string;
    defaultPositionId?: number;
}

export interface BackfillResult {
    missing: number;
    filled: number;
    skipped: number;
    universe: number;
}

/**
 * Work out which pool players ESPN's list can supply an id for.
 *
 * Split out from the write so it can be checked directly: given a pool and a
 * player list, the answer is a pure function of the two.
 *
 * Deliberately timid. A name held by two players in the pool, an id already
 * spoken for, and two ESPN entries answering to one pool player are all
 * skipped rather than guessed at, because a wrong id takes the wrong player
 * off the board during a live draft — a worse failure than no id at all.
 */
export function matchEspnIds(
    pool: PoolPlayer[], players: EspnPlayerRow[],
): { found: Map<number, string>; missing: number; skipped: number } {
    const missing = pool.filter(p => !isRealEspnId(p.espn_nfl_id));
    // An id already on a player is spoken for; never move it to another.
    const taken = new Set(
        pool.filter(p => isRealEspnId(p.espn_nfl_id)).map(p => String(p.espn_nfl_id)));

    const byNamePos = new Map<string, PoolPlayer>();
    const byDst = new Map<string, PoolPlayer>();
    const ambiguous = new Set<string>();
    for (const p of missing) {
        const pos = (p.position || '').toUpperCase();
        if (pos === 'DST') {
            const nick = dstKey(p.full_name);
            if (nick) byDst.set(nick, p);
            continue;
        }
        const key = `${normalizeName(p.full_name)}|${pos}`;
        if (byNamePos.has(key)) ambiguous.add(key);
        byNamePos.set(key, p);
    }
    ambiguous.forEach(k => byNamePos.delete(k));

    const found = new Map<number, string>();
    const claimed = new Set<string>();
    const contested = new Set<number>();
    for (const raw of players) {
        const espnId = String(raw?.id ?? '');
        const pos = ESPN_POSITIONS[raw?.defaultPositionId as number];
        if (!espnId || espnId === 'undefined' || !pos) continue;
        if (taken.has(espnId) || claimed.has(espnId)) continue;

        const name = raw?.fullName ?? '';
        const hit = pos === 'DST'
            ? byDst.get(dstKey(name))
            : byNamePos.get(`${normalizeName(name)}|${pos}`);
        if (!hit) continue;

        if (found.has(hit.id) || contested.has(hit.id)) {
            found.delete(hit.id);
            contested.add(hit.id);
            continue;
        }
        found.set(hit.id, espnId);
        claimed.add(espnId);
    }

    return {
        found,
        missing: missing.length,
        skipped: ambiguous.size + contested.size,
    };
}

/** Write the matched ids, never overwriting one that is already there. */
export async function writeEspnIds(found: Map<number, string>): Promise<number> {
    const entries = [...found.entries()];
    // One statement per chunk rather than per player: this runs daily and
    // mostly finds nothing, so it should cost close to nothing.
    for (let i = 0; i < entries.length; i += 50) {
        const chunk = entries.slice(i, i + 50);
        const params: (number | string)[] = [];
        const cases: string[] = [];
        const ids: string[] = [];
        for (const [pid, espnId] of chunk) {
            cases.push(`WHEN $${params.length + 1} THEN $${params.length + 2}`);
            params.push(pid, espnId);
        }
        for (const [pid] of chunk) {
            // Every placeholder is numbered separately: the SQLite adapter
            // rewrites $N positionally, so a reused $1 would bind wrongly.
            ids.push(`$${params.length + 1}`);
            params.push(pid);
        }
        // .run(), not query(): query() reads rows back, which a bare UPDATE
        // has none of — the SQLite adapter throws on one.
        await getDb().prepare(
            `UPDATE players SET espn_nfl_id = CASE id ${cases.join(' ')} END
              WHERE id IN (${ids.join(',')}) AND espn_nfl_id IS NULL`,
        ).run(params);
    }
    return entries.length;
}
