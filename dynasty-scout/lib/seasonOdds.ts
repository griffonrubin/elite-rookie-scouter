/**
 * A league's season, played out — the one computation two pages share.
 *
 * The Power page ranks the rosters and plays the rest of the year out. The
 * Start/Sit page wants one number off the back of that: what this Sunday
 * is worth, so a lineup decision can be priced in the season it belongs to
 * rather than in a win probability that stops on Monday.
 *
 * Both call this, and both get the same object out of the same cache. That
 * is the point rather than an optimisation: a second implementation is a
 * page saying a week is worth twenty-three points of playoff odds beside a
 * page saying twenty-four, with nothing to tell a reader which to believe.
 * One run, one seed, one answer.
 */
import { powerRank, playoffOdds, type PlayoffOdds, type PowerResult, type PowerTeam }
    from '@/lib/power';
import { bestLineup } from '@/lib/trade';
import { simInputFor, simPlayerFrom } from '@/lib/simInput';
import type { SimPlayer } from '@/lib/startSit';
import type { Horizon } from '@/lib/simInput';
import type { Scoring } from '@/lib/scoring';
import type { RedraftPlayer } from '@/lib/types';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';
import type { LeagueRoster } from '@/lib/leagueRosters';
import { pairingTable, scheduleUsable, type LeagueGame } from '@/lib/leagueSchedule';

/**
 * Weeks simulated per roster.
 *
 * The same twenty thousand the Start/Sit headline uses, and affordable for
 * the same reason: every roster is drawn once per trial and all the
 * pairings settle on that week, so a twelve-team league costs twelve
 * lineups per trial rather than a hundred and thirty-two.
 */
export const SEASON_TRIALS = 20000;

export interface SeasonOdds {
    result: PowerResult;
    /** Null before there is a season left to play. */
    odds: Map<string, PlayoffOdds> | null;
    /** True when the weeks played were the league's own fixtures. */
    realSchedule: boolean;
    /** Regular-season weeks still to play, and where the cut is. */
    remaining: number;
    cut: number;
}

export interface SeasonInput {
    teams: LeagueRoster[];
    slots: string[];
    players: RedraftPlayer[];
    data: Map<number, StartSitPlayer>;
    season: number;
    horizon: Horizon;
    scoring: Scoring | null;
    games: LeagueGame[] | null;
    /** The week being played next, which is the first of the remaining ones. */
    week: number;
    remaining: number;
    cut: number;
}

/**
 * Rank the league and play the rest of its season.
 *
 * Pure, so it can be memoised by its caller and checked without a browser.
 */
export function seasonOdds(input: SeasonInput): SeasonOdds {
    const {
        teams, slots, players, data, season, horizon, scoring, games,
        week, remaining, cut,
    } = input;

    const byId = new Map(players.map(p => [p.id, p]));
    const cache = new Map<number, SimPlayer | null>();
    const sim = (id: number): SimPlayer | null => {
        if (cache.has(id)) return cache.get(id)!;
        const p = byId.get(id);
        const v = p
            ? simPlayerFrom(simInputFor(p, data.get(id), season, horizon, scoring))
            : null;
        cache.set(id, v);
        return v;
    };
    const meanOf = (id: number) => sim(id)?.outcome.mean ?? -Infinity;

    const ranked: PowerTeam[] = teams.map(t => {
        // Over a season, the best lineup this roster can field — which is
        // the roster's strength rather than one Sunday's decisions.
        const ids = horizon === 'season'
            ? bestLineup(slots, t.roster, meanOf).filter((id): id is number => id != null)
            : t.ids;
        /**
         * Two different shortfalls, and the table words them differently.
         *
         * A roster carrying no kicker fills eight of nine slots — a fact
         * about that team, and the reason its row is low. A roster with
         * players we could not match is a gap in our own data, which
         * understates it. Over a season the lineup is ours to pick, so a
         * short one means the roster is short; `filled` is set to what the
         * roster can actually field and the warning about pricing is
         * reserved for the case that really is about us.
         */
        const filled = horizon === 'season'
            ? (t.unmatched > 0 ? slots.length : ids.length)
            : t.filled;
        return {
            key: t.key, name: t.name, record: t.record,
            filled,
            slots: horizon === 'season' ? slots.length : t.slots,
            lineup: ids.map(sim).filter((s): s is SimPlayer => s != null),
        };
    });
    const result = powerRank(ranked, SEASON_TRIALS);

    /**
     * The league's own fixtures, used only if every week in range pairs
     * every team exactly once. Anything short of that falls back to the
     * random pairing, because simulating the weeks that happened to arrive
     * and dropping the rest gives a number that is specific, confident and
     * a fraction of a season.
     */
    const keys = result.rows.map(r => r.key);
    const last = week + remaining - 1;
    const real = !!games?.length && remaining > 0
        && keys.length > 1 && scheduleUsable(games, keys, week, last);
    const pairs = real ? pairingTable(games!, keys, week, last) : null;

    return {
        result,
        odds: remaining > 0 && result.rows.length > 1
            ? playoffOdds(result.rows, remaining, cut, SEASON_TRIALS / 2, 41, pairs)
            : null,
        realSchedule: real,
        remaining,
        cut,
    };
}

/**
 * What one week is worth to a team, from odds already computed.
 *
 * The gap between the season conditional on winning it and the season
 * conditional on losing it. Null where the team has no fixture that week,
 * because an empty Sunday cannot be won and telling somebody theirs
 * decides their season would be a lie with a number on it.
 */
export function leverageOf(odds: PlayoffOdds | undefined | null): number | null {
    if (!odds || odds.oddsIfWin == null || odds.oddsIfLose == null) return null;
    return odds.oddsIfWin - odds.oddsIfLose;
}

/**
 * Playoff odds given a win probability for this week that is better than
 * the round robin's.
 *
 * The Start/Sit page simulates this Sunday from the two actual lineups,
 * against this week's opponents, lines, byes and injury reports. That is a
 * better estimate of one week than the round-robin rate the season is
 * built on — so it replaces the weight rather than the conditionals, which
 * stay exactly as the season computed them. The two pages then agree about
 * the season and differ only where one of them genuinely knows more.
 */
export function oddsGivenWinProb(
    odds: PlayoffOdds | undefined | null, winProb: number,
): number | null {
    if (!odds || odds.oddsIfWin == null || odds.oddsIfLose == null) return null;
    const p = Math.max(0, Math.min(1, winProb));
    return p * odds.oddsIfWin + (1 - p) * odds.oddsIfLose;
}
