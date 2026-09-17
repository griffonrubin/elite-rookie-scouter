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
export function seasonOdds(
    input: SeasonInput,
    /**
     * One team's roster, replaced before anything is ranked.
     *
     * What a waiver claim is: the same league with one roster holding a
     * different set of players. Running it through this function rather
     * than through a copy of it is the whole point — a claim priced by a
     * second implementation is a number that disagrees with the page it
     * is meant to be compared against.
     */
    override?: { key: string; roster: LeagueRoster['roster'] } | null,
    trials = SEASON_TRIALS,
    /** Threaded so a paired comparison can be re-run from another seed,
        which is the only way to measure what its own noise floor is. */
    seed = 23,
): SeasonOdds {
    const {
        teams: given, slots, players, data, season, horizon, scoring, games,
        week, remaining, cut,
    } = input;
    const teams = override
        ? given.map(t => (t.key === override.key
            ? { ...t, roster: override.roster, unmatched: 0 }
            : t))
        : given;

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
    const result = powerRank(ranked, trials, seed);

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
            ? playoffOdds(result.rows, remaining, cut, trials / 2, seed + 18, pairs)
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

/**
 * How far playoff odds have to move before a waiver claim moved them.
 *
 * Five points, which is coarse, and measured rather than chosen. The same
 * claim re-run from eight seeds in a twelve-team league with seven weeks
 * left moves by up to four points of odds — 10.4, 10.1 and 11.1 as the
 * mean at eight, twenty and forty thousand trials, with a spread of 3.8,
 * 4.5 and 1.1 points around it.
 *
 * Playoff odds are a step function of wins, so they are inherently noisier
 * than the rate they are computed from: a season is counted in or out, and
 * a few hundred trials landing the other side of the cut moves the number
 * by a point. Buying the precision does work — forty thousand trials
 * quarters the spread — and it costs 380ms a run against 188ms, which on a
 * page pricing several claims is most of a second of blocked main thread
 * for a decimal place nobody should act on.
 *
 * So the floor sits above what was measured and the number is shown to the
 * nearest point. "About ten points of playoff odds" is the honest claim;
 * "10.4" would be a decimal the next seed would move.
 *
 * A claim that changes no lineup is exempt from all of this: both sides
 * run from one seed, so it comes back at exactly zero at every trial count
 * tested, which is what makes the floor a statement about marginal claims
 * rather than about the arithmetic.
 */
export const CLAIM_NOISE = 0.05;

export interface ClaimWorth {
    /** Playoff odds before the claim and after it, and the gap. */
    before: number;
    after: number;
    delta: number;
}

/**
 * What one waiver claim is worth to your season.
 *
 * Both sides run from one seed and one fixture list, so the two leagues
 * differ by the claim and by nothing else — the same reason the trade page
 * evaluates a trade as a re-run of one league rather than as two separate
 * rankings.
 *
 * The delta is the number to show. The absolute odds here are computed at
 * a lower trial count than the season itself and will not match the Power
 * page to the decimal, which is why they are not offered as a headline.
 */
export function claimWorth(
    input: SeasonInput,
    myKey: string,
    withClaim: LeagueRoster['roster'],
    /**
     * The odds without the claim, where the caller already has them.
     *
     * Every page that prices a claim has just computed this league's
     * season, and the unchanged half of the comparison is exactly that
     * number — same trials, same seed, same fixtures. Passing it in halves
     * the cost of each claim and, more usefully, makes the "before" here
     * the same number the Power page prints rather than a second estimate
     * of it.
     */
    baseline?: number | null,
    seed = 23,
): ClaimWorth | null {
    if (input.remaining <= 0 || input.teams.length < 2) return null;
    const before = baseline
        ?? seasonOdds(input, null, SEASON_TRIALS, seed).odds?.get(myKey)?.odds;
    const after = seasonOdds(input, { key: myKey, roster: withClaim },
        SEASON_TRIALS, seed).odds?.get(myKey)?.odds;
    if (before == null || after == null) return null;
    return { before, after, delta: after - before };
}
