/**
 * The dynasty market's prices, for the one page that needs both halves.
 *
 * The In Season analyser prices a trade in playoff odds, which is the right
 * currency for a season and no currency at all for a pick that will not be
 * used for two of them. So it also totals the same trade on the market's
 * scale — and that total is only meaningful if the players in it are priced
 * on the same scale as the picks. A trade that says "you gain a 2027 1st"
 * without saying what the receiver leaving was worth is not a comparison.
 *
 * Narrow on purpose: this is two numbers per player, not the asset records
 * the dynasty calculator builds. The page already holds the names, the
 * positions and the ages; what it is missing is the price.
 */
import { query } from '@/lib/db';
import type { PickPrice } from '@/lib/tradePicks';

/** Player id, then its value in 1QB and in superflex. */
export type PlayerPrice = [id: number, value1qb: number | null, valueSf: number | null];

export interface TradePrices {
    players: PlayerPrice[];
    picks: PickPrice[];
}

interface PlayerRow {
    id: number;
    value_1qb: number | null;
    value_sf: number | null;
}

interface PickRow {
    season: number;
    round: number;
    slot: string | null;
    value_1qb: number | null;
    value_sf: number | null;
}

/**
 * Today's prices, each source narrowed to its own latest scrape.
 *
 * Per source rather than one global date, the same way the calculator does
 * it: a superflex refresh that failed while the 1QB one succeeded should
 * leave yesterday's superflex numbers on the page rather than a hole, and a
 * hole here reads as "this player is worth nothing", which is a much worse
 * thing to put in a total.
 */
export async function loadTradePrices(): Promise<TradePrices> {
    const players = await query<PlayerRow>(`
        SELECT p.id,
               q.value AS value_1qb,
               s.value AS value_sf
          FROM players p
          LEFT JOIN rankings q
                 ON q.player_id = p.id
                AND q.source = 'FantasyCalc Dynasty'
                AND q.scraped_at = (SELECT MAX(scraped_at) FROM rankings
                                     WHERE source = 'FantasyCalc Dynasty')
          LEFT JOIN rankings s
                 ON s.player_id = p.id
                AND s.source = 'FantasyCalc Dynasty SF'
                AND s.scraped_at = (SELECT MAX(scraped_at) FROM rankings
                                     WHERE source = 'FantasyCalc Dynasty SF')
         WHERE q.value IS NOT NULL OR s.value IS NOT NULL
    `);

    const picks = await query<PickRow>(`
        SELECT season, round, slot, value_1qb, value_sf
          FROM dynasty_picks
    `);

    return {
        players: players.map((p): PlayerPrice => [p.id, p.value_1qb, p.value_sf]),
        picks: picks.map((k): PickPrice => ({
            season: k.season,
            round: k.round,
            slot: k.slot,
            value1qb: k.value_1qb,
            valueSf: k.value_sf,
        })),
    };
}
