/**
 * The player prop market, as a fantasy projection, refreshed from the server.
 *
 * A prop line is a price rather than an opinion, and it moves on news hours
 * before any ranking does — which only helps if it is re-read often. This is
 * the daily-pass twin of scrapers/redraft/player_props.py, held to the same
 * arithmetic; scripts/props_check.py and the TypeScript checks below run the
 * same fixture so the two cannot quietly drift apart.
 *
 * Needs ODDS_API_KEY. Without one this does nothing and says so: a missing
 * market stays missing, and every player keeps the model's own number.
 */
import { normalizeName } from '@/lib/espnPlayers';
import { getDb, query } from '@/lib/db';

const API = 'https://api.the-odds-api.com/v4';
const SPORT = 'americanfootball_nfl';

/** The Odds API market keys, mapped to ours. */
export const MARKETS: Record<string, string> = {
    player_receptions: 'receptions',
    player_reception_yds: 'rec_yds',
    player_rush_yds: 'rush_yds',
    player_rush_attempts: 'rush_attempts',
    player_pass_yds: 'pass_yds',
    player_pass_tds: 'pass_tds',
    player_anytime_td: 'anytime_td',
};

/** PPR value of one unit. Touchdowns are a probability, handled separately. */
const PPR_PER_UNIT: Record<string, number> = {
    receptions: 1, rec_yds: 0.1, rush_yds: 0.1,
    pass_yds: 0.04, pass_tds: 4, rush_attempts: 0,
};
const TD_POINTS = 6;

/** American odds to their implied probability, vig included. */
export function americanToProb(price: number | null | undefined): number | null {
    if (price == null || price === 0) return null;
    return price < 0 ? -price / (-price + 100) : 100 / (price + 100);
}

/**
 * The over's probability with the book's margin removed.
 *
 * Both sides priced makes the overround measurable and the split exact. One
 * side only leaves the raw implied probability, which runs high; callers can
 * tell which they got from whether the under was there.
 */
export function devig(over: number | null | undefined,
                      under: number | null | undefined): number | null {
    const po = americanToProb(over);
    if (po == null) return null;
    const pu = americanToProb(under);
    if (pu == null) return po;
    const total = po + pu;
    return total > 0 ? po / total : po;
}

/** PPR points from a player's priced markets, and how many were priced. */
export function pprFromMarkets(v: Record<string, number>): [number, number] {
    let pts = 0, used = 0;
    for (const [m, per] of Object.entries(PPR_PER_UNIT)) {
        if (v[m] == null) continue;
        used++; pts += v[m] * per;
    }
    if (v.anytime_td_prob != null) { used++; pts += v.anytime_td_prob * TD_POINTS; }
    return [Math.round(pts * 100) / 100, used];
}

export interface PropRow {
    playerId: number; market: string; book: string;
    line: number | null; overPrice: number | null; underPrice: number | null;
    overProb: number | null; eventId: string | null; commenceTime: string | null;
}

/**
 * One event's odds payload into prop rows.
 *
 * Free of network and database so the shape it assumes can be pinned: the
 * player is in `description`, the line in `point`, and Over/Under (or Yes/No)
 * in `name`.
 */
export function parseEvent(event: any, byName: Map<string, number>): PropRow[] {
    const out: PropRow[] = [];
    for (const bm of event?.bookmakers ?? []) {
        const book = bm?.key ?? '?';
        for (const mk of bm?.markets ?? []) {
            const market = MARKETS[mk?.key];
            if (!market) continue;
            const sides = new Map<string, { over?: any; under?: any }>();
            for (const o of mk?.outcomes ?? []) {
                const who = (o?.description ?? '').trim();
                if (!who) continue;
                const name = (o?.name ?? '').trim().toLowerCase();
                const key = (name === 'over' || name === 'yes') ? 'over'
                    : (name === 'under' || name === 'no') ? 'under' : null;
                if (!key) continue;
                const cur = sides.get(who) ?? {};
                cur[key] = o;
                sides.set(who, cur);
            }
            for (const [who, s] of sides) {
                const pid = byName.get(normalizeName(who));
                if (!pid || !s.over) continue;
                out.push({
                    playerId: pid, market, book,
                    line: s.over.point ?? null,
                    overPrice: s.over.price ?? null,
                    underPrice: s.under?.price ?? null,
                    overProb: devig(s.over.price, s.under?.price),
                    eventId: event?.id ?? null,
                    commenceTime: event?.commence_time ?? null,
                });
            }
        }
    }
    return out;
}

export interface MarketProjection {
    values: Record<string, number>;
    pprPoints: number; marketsPriced: number; booksPriced: number;
}

/**
 * One projection per player from however many books priced them.
 *
 * The median across books, not the mean: a book that has not moved a stale
 * line should not drag the number, and with a handful of prices the median is
 * the robust choice.
 */
export function consensus(rows: PropRow[]): Map<number, MarketProjection> {
    const byPlayer = new Map<number, Map<string, number[]>>();
    const books = new Map<number, Set<string>>();
    for (const r of rows) {
        if (!books.has(r.playerId)) books.set(r.playerId, new Set());
        books.get(r.playerId)!.add(r.book);
        const key = r.market === 'anytime_td' ? 'anytime_td_prob' : r.market;
        const val = r.market === 'anytime_td' ? r.overProb : r.line;
        if (val == null) continue;
        if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, new Map());
        const m = byPlayer.get(r.playerId)!;
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(val);
    }
    const out = new Map<number, MarketProjection>();
    for (const [pid, markets] of byPlayer) {
        const values: Record<string, number> = {};
        for (const [m, vals] of markets) {
            const v = [...vals].sort((a, b) => a - b);
            const mid = v.length >> 1;
            values[m] = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
        }
        const [pts, used] = pprFromMarkets(values);
        out.set(pid, {
            values, pprPoints: pts, marketsPriced: used,
            booksPriced: books.get(pid)?.size ?? 0,
        });
    }
    return out;
}

export interface PropReport {
    status: 'ok' | 'skipped' | 'failed';
    reason?: string;
    events?: number; props?: number; players?: number;
}

export async function refreshPlayerProps(
    season: number, week: number, today: string,
): Promise<PropReport> {
    const key = (process.env.ODDS_API_KEY ?? '').trim();
    if (!key) {
        return { status: 'skipped', reason: 'ODDS_API_KEY not set' };
    }

    const pool = await query<{ id: number; full_name: string }>(
        `SELECT id, full_name FROM players
          WHERE redraft_pool = 1 AND position != 'DST'`);
    const seen = new Map<string, number[]>();
    for (const p of pool) {
        const k = normalizeName(p.full_name);
        (seen.get(k) ?? seen.set(k, []).get(k)!).push(p.id);
    }
    const byName = new Map<string, number>();
    for (const [k, v] of seen) if (v.length === 1) byName.set(k, v[0]);

    const get = async (url: string) => {
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
    };

    let events: any[];
    try {
        events = await get(`${API}/sports/${SPORT}/events?apiKey=${key}`);
    } catch (e) {
        return { status: 'failed', reason: String((e as Error)?.message ?? e) };
    }

    const markets = Object.keys(MARKETS).join(',');
    const rows: PropRow[] = [];
    for (const ev of events) {
        try {
            const odds = await get(
                `${API}/sports/${SPORT}/events/${ev.id}/odds`
                + `?apiKey=${key}&regions=us&oddsFormat=american&markets=${markets}`);
            rows.push(...parseEvent(odds, byName));
        } catch {
            // One event without a priced market is normal; the rest stand.
        }
    }

    const proj = consensus(rows);
    for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const params: any[] = [];
        const values = chunk.map(r => {
            const b = params.length;
            params.push(r.playerId, season, week, r.market, r.book, r.line,
                r.overPrice, r.underPrice, r.overProb, r.eventId,
                r.commenceTime, today);
            return `(${Array.from({ length: 12 }, (_, k) => `$${b + k + 1}`).join(',')})`;
        });
        await getDb().prepare(
            `INSERT INTO nfl_player_prop
               (player_id, season, week, market, book, line, over_price,
                under_price, over_prob, event_id, commence_time, scraped_at)
             VALUES ${values.join(',')}
             ON CONFLICT (player_id, season, week, market, book, scraped_at)
             DO UPDATE SET line = excluded.line, over_price = excluded.over_price,
               under_price = excluded.under_price, over_prob = excluded.over_prob`,
        ).run(params);
    }

    const projRows = [...proj.entries()];
    for (let i = 0; i < projRows.length; i += 100) {
        const chunk = projRows.slice(i, i + 100);
        const params: any[] = [];
        const values = chunk.map(([pid, v]) => {
            const b = params.length;
            params.push(pid, season, week, v.values.receptions ?? null,
                v.values.rec_yds ?? null, v.values.rush_yds ?? null,
                v.values.pass_yds ?? null, v.values.pass_tds ?? null,
                v.values.rush_attempts ?? null, v.values.anytime_td_prob ?? null,
                v.pprPoints, v.marketsPriced, v.booksPriced, today);
            return `(${Array.from({ length: 14 }, (_, k) => `$${b + k + 1}`).join(',')})`;
        });
        await getDb().prepare(
            `INSERT INTO nfl_player_market_projection
               (player_id, season, week, receptions, rec_yards, rush_yards,
                pass_yards, pass_tds, rush_attempts, anytime_td_prob,
                ppr_points, markets_priced, books_priced, scraped_at)
             VALUES ${values.join(',')}
             ON CONFLICT (player_id, season, week, scraped_at)
             DO UPDATE SET receptions = excluded.receptions,
               rec_yards = excluded.rec_yards, rush_yards = excluded.rush_yards,
               pass_yards = excluded.pass_yards, pass_tds = excluded.pass_tds,
               rush_attempts = excluded.rush_attempts,
               anytime_td_prob = excluded.anytime_td_prob,
               ppr_points = excluded.ppr_points,
               markets_priced = excluded.markets_priced,
               books_priced = excluded.books_priced`,
        ).run(params);
    }

    return { status: 'ok', events: events.length, props: rows.length, players: proj.size };
}
