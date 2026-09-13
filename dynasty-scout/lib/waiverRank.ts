/**
 * How a waiver list is ordered, and which question the order answers.
 *
 * Lives apart from the route because the two orderings cannot both be
 * exercised against the database at once: ranking on a change in usage needs
 * a season of games behind it, and in September there isn't one. The path
 * that will run for four months of the year would otherwise ship untested
 * until it started running.
 */

export interface WaiverRow {
    id: number;
    slug: string;
    full_name: string;
    position: string | null;
    nfl_team: string | null;
    /** Games inside the window, so a two-game trend reads as one. */
    games: number;
    /** Per game, over the last RECENT games and the ones before them. */
    snap_now: number | null;
    snap_before: number | null;
    touches_now: number | null;
    touches_before: number | null;
    points_now: number | null;
    points_before: number | null;
    /** This week's environment, the same numbers the model uses. */
    implied_team_total: number | null;
    spread: number | null;
    opponent: string | null;
    on_bye: boolean;
    /** Whose absence may have opened this up. */
    teammate_out: string | null;
    /** Season projection, for the weeks there is no usage to rank on. */
    proj_points: number | null;
    /**
     * That projection against the last player at his position anybody starts.
     *
     * The number the projection ranking actually sorts on, carried so the
     * page can show what it ordered by rather than a number that does not
     * explain the order.
     */
    over_replacement: number | null;
}

/**
 * Which question the list is answering.
 *
 * `trend` is the one this page exists for. `projection` is what it falls
 * back to before there is a season to read, and it is not a lesser answer
 * dressed up — it is the same answer every other waiver page gives, given
 * openly, because in week one nobody has better information and a page that
 * invents some is worse than a page that admits it.
 */
export type WaiverMode = 'trend' | 'projection';

/** Games in the recent bucket, and in the comparison behind it. */
export const RECENT = 3;
export const WINDOW = 8;

/**
 * Games this season before a trend means anything.
 *
 * Three recent against three before is the least that is a comparison at
 * all. Below it the page has no usage signal and says so rather than
 * ranking on the shape of two games.
 */
export const MIN_TREND_GAMES = 6;

/**
 * And what a player has to be scoring for a rise to be worth reading.
 *
 * A back going from one touch to three has tripled his role and is still not
 * a football player. Without a floor the list fills with rises off nothing,
 * which is how it once ranked a man averaging two points third.
 */
export const MIN_RECENT_POINTS = 5;

/**
 * How much of the pool has to be readable before the page claims a trend.
 *
 * A handful of trendable players is not a usage list, it is a usage list
 * with four names on it, and ranking twelve hundred free agents by a signal
 * that exists for four of them is how a page ends up looking like nobody
 * else's for no reason.
 */
export const TREND_MIN_POOL = 12;

/**
 * Rank on the change, with the level as a tiebreak.
 *
 * Snaps carry the most weight because they are the least noisy signal of a
 * decision a coach has made, and touches next. Points are in there but
 * quietly: a single 30-point week moves an average by ten and says less
 * about next Sunday than four extra carries does.
 */
export function trendScore(r: WaiverRow): number {
    const d = (a: number | null, b: number | null) =>
        a == null || b == null ? 0 : a - b;
    return d(r.snap_now, r.snap_before) * 40
        + d(r.touches_now, r.touches_before) * 1.5
        + d(r.points_now, r.points_before) * 0.3
        + (r.points_now ?? 0) * 0.1;
}

/**
 * Who has enough of a season behind them to be read as a trend.
 *
 * Both halves have to be real: six games so three recent can be compared
 * with three before, and enough recent production that a rise is a rise in
 * something.
 */
export const isTrendable = (r: WaiverRow) =>
    r.games >= MIN_TREND_GAMES && (r.points_now ?? 0) >= MIN_RECENT_POINTS;

/**
 * How many of each position a twelve-team league actually starts.
 *
 * The line between a starter and a bench player, which is the line value
 * over replacement has to be drawn at. Flex is why backs and receivers run
 * past their own slot counts.
 */
export const STARTED: Record<string, number> = {
    QB: 12, RB: 30, WR: 36, TE: 12, K: 12, DST: 12,
};

/**
 * Kickers and defences are kept out of the combined list.
 *
 * Not because the arithmetic dislikes them — it likes them far too much.
 * Almost every startable kicker and defence is unrostered, so the best one
 * available really is thirty points above replacement over a season, which
 * put four kickers and four defences in the top eight of a list meant to
 * answer "who should I claim". Thirty points across a season is under two a
 * week at positions whose week-to-week swing is larger than that, and nobody
 * holds a kicker for the year anyway.
 *
 * They keep their own filters, where they are ranked against each other and
 * the comparison means something.
 */
export const STREAMED = new Set(['K', 'DST']);

export interface Projected {
    position: string | null;
    proj_points: number | null;
}

/**
 * What a projection is worth, against what a started player is worth.
 *
 * Ranking free agents by raw projected points puts quarterbacks at the top
 * of every list, because a starting quarterback scores two hundred and fifty
 * where a good receiver scores a hundred and fifty. That is a fact about
 * scoring systems, not about who is worth claiming, and it made this list
 * read as eight quarterbacks nobody in a one-quarterback league would start.
 *
 * Value over replacement fixes that, but only if replacement is measured
 * against the *whole* pool rather than the free agents in it. Computed over
 * free agents alone the quarterbacks got worse, not better: the available
 * list runs 276, then 179 at the twelfth, then 21 at the twenty-fourth,
 * because every startable quarterback is already rostered and the tail is
 * backups projected at nothing. Measured against that cliff a free-agent
 * starter looks like the best player in the game.
 *
 * So the line is drawn where the league draws it — the number of that
 * position actually started across twelve teams — over every player in the
 * pool, rostered or not. A quarterback then has to beat a real starting
 * quarterback to be worth a claim, which is the whole reason you would not
 * claim one.
 */
export function replacementBaseline(pool: Projected[]): Map<string, number> {
    const baseline = new Map<string, number>();
    for (const position of Object.keys(STARTED)) {
        const projs = pool
            .filter(p => (p.position ?? '').toUpperCase() === position
                && p.proj_points != null)
            .map(p => Number(p.proj_points))
            .sort((a, b) => b - a);
        if (projs.length === 0) continue;
        baseline.set(position, projs[Math.min(STARTED[position] - 1, projs.length - 1)]);
    }
    return baseline;
}

export const overReplacement = (r: Projected, baseline: Map<string, number>) =>
    (r.proj_points ?? 0) - (baseline.get((r.position ?? '').toUpperCase()) ?? 0);

/** Games in a fantasy regular season, for turning a season into a week. */
export const SEASON_GAMES = 17;

export interface PositionShape {
    /** Free agents at this position with a projection. */
    count: number;
    /** The best gap to replacement among them, in points of season. */
    best: number;
    /** How many are at or above the line — i.e. would start for somebody. */
    startable: number;
    /** Where the line is, so the gap can be read against something. */
    replacement: number;
}

/**
 * What the waiver wire looks like position by position.
 *
 * Sent because the combined list is ranked across positions and comes out
 * lopsided, and a lopsided list reads as a broken one. Eleven of a league's
 * twenty best available being tight ends is not a glitch: it means the
 * twelve teams in it roster one tight end each, so the thirteenth-best tight
 * end in the game is sitting there while every useful back is owned. That is
 * a real edge and a reader should be able to see it rather than infer it
 * from a list that looks wrong.
 */
export function positionShape(rows: WaiverRow[], baseline: Map<string, number>) {
    const shape: Record<string, PositionShape> = {};
    for (const position of Object.keys(STARTED)) {
        const line = baseline.get(position);
        if (line == null) continue;
        const gaps = rows
            .filter(r => (r.position ?? '').toUpperCase() === position
                && r.proj_points != null)
            .map(r => (r.proj_points as number) - line)
            .sort((a, b) => b - a);
        if (gaps.length === 0) continue;
        shape[position] = {
            count: gaps.length,
            best: Math.round(gaps[0] * 10) / 10,
            startable: gaps.filter(g => g >= 0).length,
            replacement: Math.round(line * 10) / 10,
        };
    }
    return shape;
}

export interface Ranking {
    mode: WaiverMode;
    /** How many of the pool have a season behind them worth reading. */
    trendable: number;
    players: WaiverRow[];
}

/**
 * Order the list, and say which ordering it got.
 *
 * The mode is decided by the data rather than by the week number, so a
 * league that plays into February and one that starts in August both get the
 * answer their own games support.
 *
 * `pos` being set means the reader asked for one position, and a list of
 * kickers ranked against kickers is a real answer — so the streaming
 * positions are only held out of the combined list.
 */
export function rankWaivers(
    rows: WaiverRow[],
    baseline: Map<string, number>,
    pos: string | null,
): Ranking {
    for (const r of rows) {
        r.over_replacement = r.proj_points == null ? null
            : Math.round(overReplacement(r, baseline) * 10) / 10;
    }
    const trendable = rows.filter(isTrendable);
    const mode: WaiverMode = trendable.length >= TREND_MIN_POOL ? 'trend' : 'projection';
    const forRanking = pos
        ? rows
        : rows.filter(r => !STREAMED.has((r.position ?? '').toUpperCase()));
    const players = mode === 'trend'
        ? [...trendable].sort((a, b) => trendScore(b) - trendScore(a))
        : forRanking.filter(r => r.proj_points != null)
            .sort((a, b) => (b.over_replacement ?? 0) - (a.over_replacement ?? 0));
    return { mode, trendable: trendable.length, players };
}
