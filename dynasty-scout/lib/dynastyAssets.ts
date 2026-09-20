/**
 * Everything a dynasty trade can be made of, in one list.
 *
 * A trade is players and picks, and the calculator should not care which it
 * is being handed — you type "Chase" or you type "2027 1st" and either way
 * something with a value lands on the table. They come from two tables
 * because a pick is not a player and pretending otherwise would put a fake
 * row in `players` that every other query in the app would then have to
 * exclude. They leave as one type.
 */
import { query } from '@/lib/db';

export type AssetKind = 'player' | 'pick';

export interface DynastyAsset {
    /** 'p123' or 'k2027-1-early' — unique across both kinds, and URL-safe. */
    id: string;
    kind: AssetKind;
    name: string;
    /** QB/RB/WR/TE for a player; the round for a pick, as "1st". */
    position: string;
    /** NFL team for a player; the season for a pick. */
    detail: string | null;
    value1qb: number | null;
    valueSf: number | null;
    /** Overall dynasty rank in the 1QB format, for ordering the list. */
    rank1qb: number | null;
    /** Age for a player, which is most of what dynasty value is about. */
    age: number | null;
}

/**
 * Age in years, worked out here rather than in SQL.
 *
 * The date arithmetic for this is spelled differently in SQLite and in
 * Postgres, and the app runs on one locally and the other in production, so
 * the query stays portable and the sum happens once the row is home.
 */
function ageFrom(dob: string | null): number | null {
    if (!dob) return null;
    const born = Date.parse(dob);
    if (Number.isNaN(born)) return null;
    return Math.round(((Date.now() - born) / 31_557_600_000) * 10) / 10;
}

const ROUND_LABEL: Record<number, string> = {
    1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th',
};

interface PlayerRow {
    id: number; full_name: string; position: string | null;
    nfl_team: string | null; dob: string | null;
    value_1qb: number | null; value_sf: number | null; rank_1qb: number | null;
}

interface PickRow {
    label: string; season: number; round: number; slot: string | null;
    value_1qb: number | null; value_sf: number | null; rank_1qb: number | null;
}

/**
 * Both feeds, newest scrape only.
 *
 * The rankings table keeps a row per source per day so a player's value can
 * be drawn as a line; the calculator wants today's, so each source is
 * narrowed to its own most recent date rather than to one global date — a
 * superflex refresh that failed while the 1QB one succeeded should leave
 * yesterday's superflex numbers on the page, not a hole.
 */
export async function loadDynastyAssets(): Promise<DynastyAsset[]> {
    const players = await query<PlayerRow>(`
        SELECT p.id, p.full_name, p.position, p.nfl_team,
               p.dob,
               q.value  AS value_1qb,
               s.value  AS value_sf,
               q.rank_overall AS rank_1qb
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
         ORDER BY COALESCE(q.rank_overall, 9999)
    `);

    const picks = await query<PickRow>(`
        SELECT label, season, round, slot, value_1qb, value_sf, rank_1qb
          FROM dynasty_picks
         ORDER BY COALESCE(value_1qb, 0) DESC
    `);

    return [
        ...players.map((p): DynastyAsset => ({
            id: `p${p.id}`,
            kind: 'player',
            name: p.full_name,
            position: (p.position ?? '').toUpperCase(),
            detail: p.nfl_team,
            value1qb: p.value_1qb,
            valueSf: p.value_sf,
            rank1qb: p.rank_1qb,
            age: ageFrom(p.dob),
        })),
        ...picks.map((k): DynastyAsset => ({
            // Built from the pick's own parts rather than its label, so a
            // link keeps working if FantasyCalc ever renames "2027 1st
            // (Early)" to something else.
            id: `k${k.season}-${k.round}-${k.slot ?? 'any'}`,
            kind: 'pick',
            name: k.label,
            position: ROUND_LABEL[k.round] ?? `${k.round}th`,
            detail: String(k.season),
            value1qb: k.value_1qb,
            valueSf: k.value_sf,
            rank1qb: k.rank_1qb,
            age: null,
        })),
    ];
}
