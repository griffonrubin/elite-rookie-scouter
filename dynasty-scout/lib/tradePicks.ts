/**
 * Future draft picks, as things a trade can be made of.
 *
 * The In Season analyser priced a trade in the only currency that matters to
 * a season — how often you win — and then could not accept half of what
 * dynasty trades are actually made of. A manager offering his 2027 first for
 * your running back had to be entered as a manager offering nothing, which
 * does not produce a wrong answer so much as a refusal to answer.
 *
 * Two things are true at once here and the page says both rather than
 * averaging them into one number:
 *
 * A pick cannot change this season. It does not play, so the simulation is
 * right to ignore it, and any attempt to fold a 2027 first into a playoff
 * odds figure would be inventing the exchange rate that the whole trade
 * turns on — which is the reader's call, not ours.
 *
 * But a pick is not worth nothing, and the market prices it. So the same
 * trade is also totalled on the dynasty market's own scale, players and
 * picks together, and the two answers sit beside each other: what it does to
 * this season, and what it does to what you own afterwards. A rebuild reads
 * the second column and a contender reads the first, and neither of them
 * needs us to decide which they are.
 */

/** Which kind of league, which decides whether picks are worth anything. */
export type LeagueKind = 'redraft' | 'keeper' | 'dynasty';

/** A future pick that has changed hands, platform-independent. */
export interface PickTrade {
    season: number;
    round: number;
    /** Team key the pick originally belongs to. */
    originalKey: string;
    /** Team key holding it now. */
    ownerKey: string;
}

/** The market's price for one round of one season. */
export interface PickPrice {
    season: number;
    round: number;
    /** 'early' | 'mid' | 'late', or null for the pick whose slot is unknown. */
    slot: string | null;
    value1qb: number | null;
    valueSf: number | null;
}

/** One pick, held by one team, priced. */
export interface PickAsset {
    /** '2027-1', unique per season and round — what a URL carries. */
    id: string;
    season: number;
    round: number;
    /** "1st", "2nd"… */
    label: string;
    /** The team that holds it. */
    ownerKey: string;
    /**
     * Whose pick it originally is, when that is not the holder.
     *
     * A 2027 first is not one asset: the pick belonging to the worst team in
     * the league and the pick belonging to the best are a rookie apart, and
     * a manager who has collected three of them holds three different
     * things. Naming the original owner is what lets a reader see that, and
     * their record below is what lets them price it.
     */
    fromKey: string;
    fromName: string | null;
    /** The original owner's record, where the league reports one. */
    fromRecord: { wins: number; losses: number; ties: number } | null;
    value: number | null;
}

const ROUND_LABEL: Record<number, string> = {
    1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th',
};

export function roundLabel(round: number): string {
    return ROUND_LABEL[round] ?? `${round}th`;
}

/**
 * '2027-1-4' — season, round, and the team the pick belongs to.
 *
 * The original owner is in the id because a manager who has traded for one
 * holds two 2027 firsts, and they are not the same asset. Keyed on season
 * and round alone, selecting one would select both and the table would show
 * one pick where two had been offered.
 */
export function pickId(season: number, round: number, originalKey: string): string {
    return `${season}-${round}-${originalKey}`;
}

/** The three parts back out of one, or null if it is not one. */
export function parsePickId(
    raw: string,
): { season: number; round: number; originalKey: string } | null {
    const m = /^(\d{4})-(\d{1,2})-([A-Za-z0-9_.-]{1,40})$/.exec(raw.trim());
    if (!m) return null;
    const season = Number(m[1]);
    const round = Number(m[2]);
    return round >= 1 && round <= 20
        ? { season, round, originalKey: m[3] }
        : null;
}

/**
 * Which league types have picks worth trading.
 *
 * Keeper counts: a keeper league's rookie draft is smaller but its picks are
 * still an asset, and a keeper manager trading one is doing the same thing a
 * dynasty manager is. Redraft does not — every roster is torn up before that
 * pick is ever used, so putting one on the table would be theatre.
 */
export function hasPicks(kind: LeagueKind | null | undefined): boolean {
    return kind === 'dynasty' || kind === 'keeper';
}

/**
 * Which of the market's two price columns this league reads.
 *
 * The feed publishes a one-quarterback and a superflex number, and between
 * them is the largest split in dynasty pricing — a quarterback is worth
 * multiples more where two can start, and a rookie first is worth more
 * because of it. Read off the lineup shape rather than asked, because the
 * lineup shape is the definition: a league is superflex when it can start a
 * second quarterback, whatever the slot happens to be called.
 */
export function superflexLeague(slots: string[]): boolean {
    let qb = 0;
    for (const raw of slots) {
        const s = raw.toUpperCase();
        // OP is ESPN's name for the same slot, and both platforms spell
        // superflex with and without the underscore.
        if (s === 'SUPER_FLEX' || s === 'SUPERFLEX' || s === 'OP') return true;
        if (s === 'QB') qb++;
    }
    return qb >= 2;
}

/**
 * The price of a pick, on the market's scale.
 *
 * The unspecified pick is what a team holds before the standings say where
 * it lands, so that is the row wanted — early, mid and late exist in the
 * feed for the pick whose position is already settled, which is not the case
 * for anything tradeable now. Where a season has no row at all (the feed
 * carries three years out, a league may trade four) the pick is still
 * listed, with no price, and every total it lands in says so.
 */
export function priceOf(
    prices: PickPrice[], season: number, round: number, superflex: boolean,
): number | null {
    const exact = prices.find(p =>
        p.season === season && p.round === round && p.slot == null);
    const row = exact ?? prices.find(p => p.season === season && p.round === round);
    if (!row) return null;
    return (superflex ? row.valueSf : row.value1qb) ?? null;
}

/**
 * Every pick every team holds, priced.
 *
 * Built from the assumption that a team owns its own picks and then moved
 * by whatever the platform says has been traded, because that is the shape
 * of the only report any platform gives: Sleeper lists the picks that
 * changed hands and nothing else. Where a platform reports no trades at all
 * — ESPN — the result is each team's own picks, and the page says so rather
 * than implying the ownership was read.
 *
 * Seasons run from the next rookie draft outwards. The current season is
 * never included: its draft has been held, so its picks are the players
 * already on these rosters.
 */
export function pickInventory({
    teamKeys, teamNames, records, seasons, rounds, traded, prices, superflex,
}: {
    teamKeys: string[];
    teamNames: Map<string, string>;
    records: Map<string, { wins: number; losses: number; ties: number } | null>;
    seasons: number[];
    rounds: number;
    traded: PickTrade[];
    prices: PickPrice[];
    superflex: boolean;
}): Map<string, PickAsset[]> {
    const keys = new Set(teamKeys);
    /** season-round-original → who holds it now. */
    const moved = new Map<string, string>();
    for (const t of traded) {
        // A trade naming a team this league does not have is a trade from a
        // previous season's roster ids; dropping it leaves the pick with its
        // original owner, which is the safer of the two wrong answers.
        if (!keys.has(t.ownerKey) || !keys.has(t.originalKey)) continue;
        moved.set(`${t.season}-${t.round}-${t.originalKey}`, t.ownerKey);
    }

    const out = new Map<string, PickAsset[]>(teamKeys.map(k => [k, []]));
    for (const season of seasons) {
        for (let round = 1; round <= rounds; round++) {
            for (const originalKey of teamKeys) {
                const ownerKey =
                    moved.get(`${season}-${round}-${originalKey}`) ?? originalKey;
                out.get(ownerKey)!.push({
                    id: pickId(season, round, originalKey),
                    season, round,
                    label: roundLabel(round),
                    ownerKey,
                    fromKey: originalKey,
                    fromName: teamNames.get(originalKey) ?? null,
                    fromRecord: records.get(originalKey) ?? null,
                    value: priceOf(prices, season, round, superflex),
                });
            }
        }
    }

    // Ordered the way they are valued: the soonest draft first, and inside a
    // season the earliest round, which is also the order they get offered in.
    for (const list of out.values()) {
        list.sort((a, b) =>
            a.season - b.season
            || a.round - b.round
            || (b.value ?? 0) - (a.value ?? 0));
    }
    return out;
}

/**
 * What a pick is called on the table.
 *
 * Its own if the holder owns it, and named otherwise, because "2027 1st" and
 * "2027 1st (from Dave)" are different assets and a table listing two of the
 * first is a table that has lost track of one of them.
 */
export function pickName(p: PickAsset): string {
    const base = `${p.season} ${p.label}`;
    return p.fromKey === p.ownerKey || !p.fromName
        ? base
        : `${base} (from ${p.fromName})`;
}

/**
 * A pick in a holding, found by the id a URL carried.
 *
 * Exactly first, then by season and round alone. A link is opened days later
 * against a league where that pick may have moved on again, and putting the
 * 2027 first this team now holds on the table is more use than silently
 * dropping the asset the link was written about.
 */
export function findPick(list: PickAsset[], id: string): PickAsset | null {
    const exact = list.find(p => p.id === id);
    if (exact) return exact;
    const parsed = parsePickId(id);
    if (!parsed) return null;
    return list.find(p => p.season === parsed.season && p.round === parsed.round)
        ?? null;
}

/** The market total of a set of picks, and whether any of it is unpriced. */
export function pickTotal(picks: PickAsset[]): { total: number; unpriced: number } {
    let total = 0;
    let unpriced = 0;
    for (const p of picks) {
        if (p.value == null) unpriced++;
        else total += p.value;
    }
    return { total, unpriced };
}
