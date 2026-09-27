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
    fromRecord: TeamForm | null;
    /**
     * Where this pick is projected to land, for the next draft only.
     *
     * Null for every later draft and for a season too young to project,
     * which is the same as saying the market's unslotted price is the best
     * available answer. Where it is set, `value` is the slotted price and
     * this is what justifies it.
     */
    projection: SlotProjection | null;
    value: number | null;
}

/** A team's season so far, which is what a future pick is worth guessing from. */
export interface TeamForm {
    wins: number;
    losses: number;
    ties: number;
    /** Total scored, which is the better guide to a team's real strength. */
    pointsFor: number;
}

/** Where a pick is projected to land, and what said so. */
export interface SlotProjection {
    /** 'early' | 'mid' | 'late' — the feed's own three bands. */
    slot: string;
    /** Projected draft position, 1 to the number of teams. */
    pick: number;
    /** Teams in the league, so "4th of 12" reads as a position. */
    teams: number;
    /** Where the original owner sits on record alone. */
    recordRank: number;
    /** And on points scored. */
    pointsRank: number;
    /** How much of the blend the record took, 0 to 1. */
    recordWeight: number;
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
 * Dynasty, and only dynasty.
 *
 * This used to count keeper as well, on the reasoning that a keeper league's
 * rookie draft is smaller but its picks are still an asset. The flaw is not
 * in whether those picks can be traded — they often can — but in what this
 * page would say they are worth. Every price here comes from a dynasty
 * rookie-pick feed, where a 2027 first means the first pick of a draft made
 * only of incoming rookies, entering a roster kept whole.
 *
 * A keeper league's first-round pick is a different asset with the same name.
 * It buys the best player in a draft that nearly everybody is re-entering,
 * and it is used once before the roster is torn up again. Putting a dynasty
 * rookie price against it is not an approximation, it is a number about
 * something else — and a confident wrong number is worse here than no number,
 * because the whole panel exists to be weighed against the points.
 *
 * Redraft never had them: every roster is torn up before that pick is used,
 * so putting one on the table would be theatre.
 */
export function hasPicks(kind: LeagueKind | null | undefined): boolean {
    return kind === 'dynasty';
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
    /** The projected band, where there is one. Falls back if the feed has none. */
    slot?: string | null,
): number | null {
    const want = (s: string | null) =>
        prices.find(p => p.season === season && p.round === round && p.slot === s);
    const row = (slot ? want(slot) : null) ?? want(null)
        ?? prices.find(p => p.season === season && p.round === round);
    if (!row) return null;
    return (superflex ? row.valueSf : row.value1qb) ?? null;
}

/**
 * Below this many games, a season has not said anything worth pricing on.
 *
 * The swing is the reason for the floor. A 2027 first is 4,477 early and
 * 2,290 late — near enough double — so projecting a slot off two games means
 * putting a 2x multiplier on two games, and two games of fantasy football is
 * mostly which quarterback ran into a soft defence. Under this, every pick
 * keeps the market's unslotted price, which is exactly what that price is
 * for: the pick whose landing spot nobody knows yet.
 */
export const PROJECTION_MIN_GAMES = 4;

/**
 * How much of the blend the record takes, given how much season has gone.
 *
 * The thing being predicted is the *final standings*, and final standings
 * are made of record — so by the last week the record is not a predictor of
 * the answer, it is the answer, and deserves all the weight. Early on it is
 * four games of a fourteen-game sample and points scored is the better guide
 * to which teams are actually good.
 *
 * So the weight is simply the share of the regular season played. It needs
 * no tuning and it degenerates correctly at both ends: nothing at kickoff,
 * everything at the finish. A fixed weight cannot do that — it would still
 * be second-guessing the standings in the last week of the season, when the
 * standings have stopped being an estimate of anything.
 */
export function recordWeightFor(played: number, total: number): number {
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, played / total));
}

/**
 * Where each team's own pick is projected to land in the next rookie draft.
 *
 * Rookie draft order is the standings reversed — the worst team picks first —
 * so this ranks the league and then reads it upside down. The ranking is a
 * weighted average of two ranks, the record and the points scored, which is
 * the blend asked for: record is what the draft order is actually made of,
 * points scored is what says whether a record is real.
 *
 * Only the next draft. A 2029 pick belongs to a roster that does not exist
 * yet and a season nobody has played, and putting a confident band on it
 * would be inventing information rather than reading it — those keep the
 * market's unslotted price, which is the honest number for a pick whose
 * owner might be anybody by then.
 */
export function projectDraftOrder({
    teams, played, total,
}: {
    teams: { key: string; form: TeamForm | null }[];
    /** Regular-season games played so far. */
    played: number;
    /** Regular-season games in total. */
    total: number;
}): Map<string, SlotProjection> {
    const out = new Map<string, SlotProjection>();
    const known = teams.filter(t => t.form != null) as
        { key: string; form: TeamForm }[];
    // Every team or none: a league where half the rosters have a record and
    // half do not cannot be ranked, and a partial ranking would quietly
    // place the unknown half at the bottom — which is the band worth the
    // most money.
    if (known.length !== teams.length || known.length < 2) return out;
    if (played < PROJECTION_MIN_GAMES) return out;

    const played_ = (f: TeamForm) => f.wins + f.losses + f.ties;
    const winPct = (f: TeamForm) => {
        const g = played_(f);
        return g > 0 ? (f.wins + f.ties / 2) / g : 0;
    };

    /** Rank 1 is the best team, by each measure on its own. */
    const rankBy = (score: (f: TeamForm) => number) => {
        const order = [...known].sort((a, b) =>
            score(b.form) - score(a.form)
            // Ties broken by points, then by key, so the ranking is stable
            // rather than dependent on the order rosters arrived in.
            || b.form.pointsFor - a.form.pointsFor
            || a.key.localeCompare(b.key));
        return new Map(order.map((t, i) => [t.key, i + 1]));
    };

    const recordRank = rankBy(winPct);
    const pointsRank = rankBy(f => f.pointsFor);
    const w = recordWeightFor(played, total);

    const blended = known.map(t => ({
        key: t.key,
        score: w * recordRank.get(t.key)! + (1 - w) * pointsRank.get(t.key)!,
    })).sort((a, b) => a.score - b.score
        || recordRank.get(a.key)! - recordRank.get(b.key)!
        || a.key.localeCompare(b.key));

    const n = blended.length;
    blended.forEach((t, i) => {
        // i is the projected finish, best first. The draft runs the other
        // way: the team finishing last picks first.
        const pick = n - i;
        out.set(t.key, {
            slot: slotForPick(pick, n),
            pick,
            teams: n,
            recordRank: recordRank.get(t.key)!,
            pointsRank: pointsRank.get(t.key)!,
            recordWeight: w,
        });
    });
    return out;
}

/**
 * Which of the feed's three bands a draft position falls in.
 *
 * Thirds of the round, which is what the feed means by them: in a
 * twelve-team league picks 1–4 are early, 5–8 mid and 9–12 late. Rounded so
 * that a ten- or fourteen-team league splits as evenly as it can rather than
 * leaving the last band holding everybody left over.
 */
export function slotForPick(pick: number, teams: number): string {
    if (teams <= 0) return 'mid';
    const third = teams / 3;
    if (pick <= Math.round(third)) return 'early';
    if (pick <= Math.round(third * 2)) return 'mid';
    return 'late';
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
    played = 0, total = 0,
}: {
    teamKeys: string[];
    teamNames: Map<string, string>;
    records: Map<string, TeamForm | null>;
    seasons: number[];
    rounds: number;
    traded: PickTrade[];
    prices: PickPrice[];
    superflex: boolean;
    /** Regular-season games played, for projecting the next draft's order. */
    played?: number;
    /** And how many there are in total. */
    total?: number;
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

    /**
     * The order of the next rookie draft, which is the only one this season
     * decides. Later drafts are set by seasons nobody has played.
     */
    const nextDraft = seasons.length ? Math.min(...seasons) : null;
    const projected = projectDraftOrder({
        teams: teamKeys.map(k => ({ key: k, form: records.get(k) ?? null })),
        played, total,
    });

    const out = new Map<string, PickAsset[]>(teamKeys.map(k => [k, []]));
    for (const season of seasons) {
        for (let round = 1; round <= rounds; round++) {
            for (const originalKey of teamKeys) {
                const ownerKey =
                    moved.get(`${season}-${round}-${originalKey}`) ?? originalKey;
                // The band belongs to the team the pick came from, not the
                // team holding it: a first acquired from the worst roster in
                // the league is an early pick whoever ends up with it.
                const projection = season === nextDraft
                    ? projected.get(originalKey) ?? null
                    : null;
                out.get(ownerKey)!.push({
                    id: pickId(season, round, originalKey),
                    season, round,
                    label: roundLabel(round),
                    ownerKey,
                    fromKey: originalKey,
                    fromName: teamNames.get(originalKey) ?? null,
                    fromRecord: records.get(originalKey) ?? null,
                    projection,
                    value: priceOf(prices, season, round, superflex,
                        projection?.slot ?? null),
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
