/**
 * A league's own fixture list, and the two questions it answers that a
 * power ranking cannot.
 *
 * The ranking deliberately refuses to know the schedule: whose opponents
 * are soft is exactly what "rank the rosters" is trying not to measure. But
 * an owner deciding whether to buy or sell has two more questions, and both
 * of them are about the calendar rather than the roster.
 *
 *   Has my record been earned?  A five-and-three team that has been outscored
 *   by the league every week is a three-and-five team that has not been found
 *   out yet, and it is the single most common reason a season falls apart in
 *   November. Points scored against the whole league each week — the all-play
 *   record — separates the two, because it is the record of a team that played
 *   everybody instead of one opponent.
 *
 *   Is the run home hard?  Six weeks against the three best rosters is a
 *   different season from six weeks against the three worst, and the fixture
 *   list is known: both platforms publish it and neither app reads it.
 *
 * Nothing here guesses. Where a platform will not give a complete fixture
 * list the schedule is declared unusable and the caller falls back to the
 * random pairing it already had, which is honest and is not silently worse.
 */

/** One meeting, by team key rather than platform id. */
export interface LeagueGame {
    week: number;
    home: string;
    away: string;
    /** Points scored, where the week has been played. Null before it has. */
    homePoints?: number | null;
    awayPoints?: number | null;
}

/**
 * Whether a fixture list can be simulated against.
 *
 * A half-delivered schedule is worse than none: simulating the three weeks
 * a platform happened to return and dropping the other five produces a
 * playoff number that looks specific and is a fraction of a season. So the
 * bar is every week complete — each team paired exactly once per week,
 * every week in the range present — and anything short of it sends the
 * caller back to random pairing.
 *
 * An odd league is the one exception: somebody sits out each week, which is
 * what a bye in a league of that shape is, so one unpaired team per week is
 * allowed for.
 */
export function scheduleUsable(
    games: LeagueGame[],
    keys: string[],
    fromWeek: number,
    throughWeek: number,
): boolean {
    if (throughWeek < fromWeek) return false;
    const known = new Set(keys);
    if (known.size < 2) return false;
    const perWeek = Math.floor(known.size / 2);
    const byWeek = new Map<number, LeagueGame[]>();
    for (const g of games) {
        if (g.week < fromWeek || g.week > throughWeek) continue;
        if (!known.has(g.home) || !known.has(g.away) || g.home === g.away) continue;
        const list = byWeek.get(g.week);
        if (list) list.push(g); else byWeek.set(g.week, [g]);
    }
    for (let w = fromWeek; w <= throughWeek; w++) {
        const list = byWeek.get(w);
        if (!list || list.length !== perWeek) return false;
        // Each team at most once, or it is not a week of fantasy football.
        const seen = new Set<string>();
        for (const g of list) {
            if (seen.has(g.home) || seen.has(g.away)) return false;
            seen.add(g.home); seen.add(g.away);
        }
    }
    return true;
}

/**
 * The fixture list as an opponent-per-week lookup, which is what a
 * simulation wants.
 *
 * Returned as indices into the caller's team order rather than keys, so the
 * inner loop of a ten-thousand-trial season is array reads. -1 marks a team
 * with no opponent that week.
 */
export function pairingTable(
    games: LeagueGame[],
    keys: string[],
    fromWeek: number,
    throughWeek: number,
): Int32Array {
    const n = keys.length;
    const weeks = Math.max(0, throughWeek - fromWeek + 1);
    const table = new Int32Array(n * weeks).fill(-1);
    const index = new Map(keys.map((k, i) => [k, i]));
    for (const g of games) {
        if (g.week < fromWeek || g.week > throughWeek) continue;
        const a = index.get(g.home), b = index.get(g.away);
        if (a == null || b == null || a === b) continue;
        const w = g.week - fromWeek;
        table[w * n + a] = b;
        table[w * n + b] = a;
    }
    return table;
}

/** What a team's remaining fixtures look like. */
export interface ScheduleStrength {
    key: string;
    /** Opponents still to come, in week order. */
    opponents: { week: number; key: string; expected: number }[];
    /** Mean expected points of those opponents. */
    meanOpponent: number;
    /** 1 is the hardest run home. Shared where teams are level. */
    rank: number;
    /** The same for weeks already played, so the two can be compared. */
    playedMeanOpponent: number | null;
    playedRank: number | null;
}

/**
 * Rank every team by the rosters it still has to play.
 *
 * Opponent strength is expected points rather than record, for the reason
 * the power ranking exists at all: a team's record is partly its own
 * schedule, so ranking your schedule by your opponents' records measures
 * their schedules too. Expected points is a claim about the roster.
 */
export function scheduleStrength(
    teams: { key: string; expected: number }[],
    games: LeagueGame[],
    fromWeek: number,
    throughWeek: number,
): Map<string, ScheduleStrength> {
    const expectedOf = new Map(teams.map(t => [t.key, t.expected]));
    const ahead = new Map<string, { week: number; key: string; expected: number }[]>();
    const behind = new Map<string, number[]>();
    for (const t of teams) { ahead.set(t.key, []); behind.set(t.key, []); }

    const push = (me: string, them: string, week: number) => {
        const opp = expectedOf.get(them);
        if (opp == null || !expectedOf.has(me)) return;
        if (week >= fromWeek && week <= throughWeek) {
            ahead.get(me)!.push({ week, key: them, expected: opp });
        } else if (week < fromWeek) {
            behind.get(me)!.push(opp);
        }
    };
    for (const g of games) {
        if (g.week > throughWeek) continue;
        push(g.home, g.away, g.week);
        push(g.away, g.home, g.week);
    }

    const mean = (xs: number[]) =>
        xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
    const rows = teams.map(t => {
        const opponents = (ahead.get(t.key) ?? []).sort((a, b) => a.week - b.week);
        return {
            key: t.key,
            opponents,
            meanOpponent: mean(opponents.map(o => o.expected)) ?? 0,
            playedMeanOpponent: mean(behind.get(t.key) ?? []),
            rank: 0,
            playedRank: null as number | null,
        };
    });

    rankBy(rows, r => (r.opponents.length > 0 ? r.meanOpponent : null),
        (r, v) => { r.rank = v ?? 0; });
    rankBy(rows, r => r.playedMeanOpponent, (r, v) => { r.playedRank = v; });
    return new Map(rows.map(r => [r.key, r]));
}

/** Dense ranking, hardest first, with level teams sharing a place. */
function rankBy<T>(rows: T[], of: (r: T) => number | null,
    set: (r: T, rank: number | null) => void) {
    const scored = rows.filter(r => of(r) != null)
        .sort((a, b) => of(b)! - of(a)!);
    let place = 0;
    scored.forEach((r, i) => {
        if (i === 0 || of(r)! < of(scored[i - 1])!) place = i + 1;
        set(r, place);
    });
    for (const r of rows) if (of(r) == null) set(r, null);
}

/** A record, and the record the same scores would have earned against everybody. */
export interface AllPlay {
    key: string;
    /** Weeks with a score on both sides. */
    played: number;
    /** Wins, ties counted as a half, against the whole league each week. */
    allPlayWins: number;
    allPlayGames: number;
    /** That as a rate, which is the win rate a neutral schedule would give. */
    rate: number;
    /** Wins actually banked in those same weeks. */
    actualWins: number;
    /** Wins the all-play rate says those scores were worth. */
    deservedWins: number;
    /**
     * Banked minus deserved. Positive is a record flattering the scores.
     *
     * Read against `sd`, never on its own: eight weeks of coin flips swing
     * a win and a half, so a one-win gap is not evidence of anything.
     */
    luck: number;
    /** One standard deviation of that gap, from the same rate. */
    sd: number;
    /** True when the gap clears 1.28 sd — the eighty per cent convention
        used everywhere else here — in either direction. */
    notable: boolean;
    /** Mean points scored and allowed across those weeks. */
    pointsFor: number;
    pointsAgainst: number;
}

/**
 * The all-play record: what every team's scores were worth against the
 * whole league rather than against the one opponent it drew.
 *
 * This is the measure a power ranking is a model of, computed from what
 * actually happened instead. Where the two agree the ranking is confirmed
 * by results; where they disagree the disagreement is itself the finding,
 * which is why both belong on the page.
 */
export function allPlay(games: LeagueGame[], keys: string[]): Map<string, AllPlay> {
    const known = new Set(keys);
    const byWeek = new Map<number, { key: string; points: number }[]>();
    const actual = new Map<string, number>();
    const forPts = new Map<string, number[]>();
    const againstPts = new Map<string, number[]>();
    for (const k of keys) { actual.set(k, 0); forPts.set(k, []); againstPts.set(k, []); }

    for (const g of games) {
        const hp = g.homePoints, ap = g.awayPoints;
        if (hp == null || ap == null) continue;
        if (!Number.isFinite(hp) || !Number.isFinite(ap)) continue;
        // A week neither side scored in has not been played; counting it as
        // a pair of nil-nil draws would dilute every rate in the table.
        if (hp === 0 && ap === 0) continue;
        if (!known.has(g.home) || !known.has(g.away)) continue;
        const list = byWeek.get(g.week) ?? [];
        list.push({ key: g.home, points: hp }, { key: g.away, points: ap });
        byWeek.set(g.week, list);
        actual.set(g.home, actual.get(g.home)! + (hp > ap ? 1 : hp === ap ? 0.5 : 0));
        actual.set(g.away, actual.get(g.away)! + (ap > hp ? 1 : hp === ap ? 0.5 : 0));
        forPts.get(g.home)!.push(hp); againstPts.get(g.home)!.push(ap);
        forPts.get(g.away)!.push(ap); againstPts.get(g.away)!.push(hp);
    }

    const wins = new Map<string, number>(keys.map(k => [k, 0]));
    const played = new Map<string, number>(keys.map(k => [k, 0]));
    const opponents = new Map<string, number>(keys.map(k => [k, 0]));
    for (const list of byWeek.values()) {
        for (const me of list) {
            let w = 0;
            for (const them of list) {
                if (them === me) continue;
                w += me.points > them.points ? 1 : me.points === them.points ? 0.5 : 0;
            }
            wins.set(me.key, wins.get(me.key)! + w);
            played.set(me.key, played.get(me.key)! + 1);
            opponents.set(me.key, opponents.get(me.key)! + list.length - 1);
        }
    }

    const avg = (xs: number[]) => xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
    const out = new Map<string, AllPlay>();
    for (const k of keys) {
        const n = played.get(k)!;
        const games_ = opponents.get(k)!;
        const rate = games_ > 0 ? wins.get(k)! / games_ : 0;
        const deserved = rate * n;
        const luck = (actual.get(k) ?? 0) - deserved;
        const sd = Math.sqrt(Math.max(0, n * rate * (1 - rate)));
        out.set(k, {
            key: k,
            played: n,
            allPlayWins: wins.get(k)!,
            allPlayGames: games_,
            rate,
            actualWins: actual.get(k) ?? 0,
            deservedWins: deserved,
            luck,
            sd,
            notable: n > 0 && sd > 0 && Math.abs(luck) >= 1.28 * sd,
            pointsFor: avg(forPts.get(k)!),
            pointsAgainst: avg(againstPts.get(k)!),
        });
    }
    return out;
}
