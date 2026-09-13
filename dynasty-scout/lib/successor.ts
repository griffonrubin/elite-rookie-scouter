/**
 * Who actually takes the work when a player is out — measured, not asserted.
 *
 * Every site ships a handcuff chart, and every one of them is a depth chart
 * with a column added: this team's starter, this team's backup, an average
 * draft position beside each. It is a claim about who the coach says is
 * second on the list, which is not the question. The question is who got the
 * carries the week the starter did not dress, and that is a fact sitting in
 * the game logs that nobody bothers to read out.
 *
 * It reads differently when you do. Tampa Bay's chart last season put
 * Rachaad White behind Bucky Irving, and White did pick the work up — six
 * points a game to eleven and a half across the seven games Irving missed.
 * But Sean Tucker, who is on no chart anywhere, went from two points a game
 * to nearly ten across the same seven. A chart that names one of those two
 * has told you half of what happened.
 *
 * So this takes the weeks a team played, subtracts the weeks the player
 * appeared in, and calls what is left the games he missed — no injury report
 * needed, because a report says a man was questionable and a game log says
 * he was not there. Then every teammate at his position is measured twice,
 * once across those weeks and once across the weeks they played together,
 * and the difference is what the absence was worth to him.
 *
 * Two honesties the charts do not need and this does.
 *
 * The evidence is last year's and the depth chart is this year's, so a
 * teammate who has since moved on is worse than useless — he is the right
 * answer to a question nobody is asking. Successors are therefore filtered
 * to men still on the team, by the caller, who knows where everyone plays
 * now.
 *
 * And the samples are small. A back who missed two games gives two games of
 * evidence, and two games of a running back is nearly nothing. The count
 * travels with every number here rather than being averaged away, because
 * "eleven and a half points across seven games" and "eleven and a half
 * points across one" are different claims and a reader has to be able to
 * tell them apart.
 */

/** One player's line in one game. */
export interface WeekRow {
    player_id: number;
    full_name: string;
    position: string | null;
    team: string;
    season: number;
    week: number;
    points: number;
    touches: number;
}

/**
 * How many games of absence before naming somebody the successor.
 *
 * Two, which is low and deliberately so. The alternative to a two-game
 * sample is not a better sample, it is silence — a third of starters miss
 * nothing at all and most of the rest miss one or two. Reporting the number
 * with its sample size beside it lets a reader discount it; refusing to
 * report it decides for them, which is the opposite of the point.
 */
export const MIN_ABSENCE = 2;

/**
 * And how much of the work a man has to have picked up before he is one.
 *
 * Without a floor the list fills with bodies. Across Bucky Irving's seven
 * absences the third and fourth names measured are Josh Williams and Owen
 * Wright, at six tenths of a point and three tenths — they were active, so
 * they appear, and naming them alongside Sean Tucker says they are the same
 * kind of answer.
 *
 * The floor is the workload and only the workload, which took a wrong turn to
 * arrive at. The first version let a man through on his scoring instead, and
 * the scoring floor promoted Justin Jefferson to Jordan Addison's successor:
 * he averaged twenty-two across the two weeks Addison missed, six and a half
 * above his own average, and picked up none of Addison's targets. He is not
 * the handcuff, he is the other starter having two good weeks — and a list
 * that names him is measuring coincidence. Absorbed work cannot be
 * coincidental in the same way, because it is the starter's own touches being
 * counted into somebody else's column.
 */
export const MIN_ABSORBED = 0.15;

/** Whether a measured teammate is a successor or merely a man who dressed. */
export function notable(s: Successor): boolean {
    return s.games >= MIN_ABSENCE && (s.absorbed ?? 0) >= MIN_ABSORBED;
}

export interface Successor {
    id: number;
    name: string;
    /** Games played in the starter's absence. */
    games: number;
    /** His scoring across those games. */
    pointsOut: number;
    /** And across the games the two played together; null if there were none. */
    pointsIn: number | null;
    /** The difference, which is what the absence was worth to him. */
    lift: number | null;
    touchesOut: number;
    touchesIn: number | null;
    /**
     * The share of the starter's own touches this man picked up.
     *
     * Not a share of anything that sums to one. The offence does not
     * necessarily run the same number of plays without its starter, and work
     * leaves the position entirely — so two backs can absorb 0.4 and 0.3 of
     * a missing back's touches and the remaining 0.3 can simply not exist.
     * That gap is worth seeing, so it is left visible rather than
     * normalised away.
     */
    absorbed: number | null;
}

export interface Contingency {
    playerId: number;
    name: string;
    position: string | null;
    team: string | null;
    /** Team games missed, across every season in the logs. */
    missed: number;
    /** Team games he was there for. */
    played: number;
    /** His own scoring and workload when he plays. */
    ownPoints: number;
    ownTouches: number;
    /** Ranked by lift, the biggest beneficiary first. */
    successors: Successor[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * A player's missed games, and what his teammates did in them.
 *
 * `rows` must hold every game log for the player's team across whatever
 * seasons are being read, which is what makes the absence computable: a week
 * the team appears in and the player does not is a week he missed. Weeks
 * before his first appearance are not — a rookie drafted in April did not
 * miss the previous September, and a man traded in at the deadline did not
 * miss the first half.
 */
export function contingencyFor(playerId: number, rows: WeekRow[]): Contingency | null {
    const own = rows.filter(r => r.player_id === playerId);
    if (own.length === 0) return null;
    const first = own[0];

    // Only the seasons and team where this player actually appeared. A team
    // column that changes mid-career would otherwise count another roster's
    // weeks as absences.
    const stints = new Map<string, { season: number; team: string; from: number }>();
    for (const r of own) {
        const key = `${r.season}|${r.team}`;
        const at = stints.get(key);
        if (!at || r.week < at.from) stints.set(key, { season: r.season, team: r.team, from: r.week });
    }

    const missedWeeks: { season: number; team: string; week: number }[] = [];
    const playedWeeks: { season: number; team: string; week: number }[] = [];
    for (const { season, team, from } of stints.values()) {
        const teamWeeks = new Set(
            rows.filter(r => r.season === season && r.team === team).map(r => r.week));
        const mineWeeks = new Set(
            own.filter(r => r.season === season && r.team === team).map(r => r.week));
        for (const week of teamWeeks) {
            if (mineWeeks.has(week)) playedWeeks.push({ season, team, week });
            else if (week > from) missedWeeks.push({ season, team, week });
        }
    }

    const keyOf = (s: number, t: string, w: number) => `${s}|${t}|${w}`;
    const outKeys = new Set(missedWeeks.map(m => keyOf(m.season, m.team, m.week)));
    const inKeys = new Set(playedWeeks.map(m => keyOf(m.season, m.team, m.week)));

    const ownTouches = mean(own.map(r => r.touches));
    const byMate = new Map<number, { name: string; out: WeekRow[]; within: WeekRow[] }>();
    for (const r of rows) {
        if (r.player_id === playerId) continue;
        if ((r.position ?? '') !== (first.position ?? '')) continue;
        const k = keyOf(r.season, r.team, r.week);
        const isOut = outKeys.has(k), isIn = inKeys.has(k);
        if (!isOut && !isIn) continue;
        const at = byMate.get(r.player_id)
            ?? { name: r.full_name, out: [] as WeekRow[], within: [] as WeekRow[] };
        (isOut ? at.out : at.within).push(r);
        byMate.set(r.player_id, at);
    }

    const successors: Successor[] = [];
    for (const [id, at] of byMate) {
        if (at.out.length === 0) continue;
        const pointsOut = mean(at.out.map(r => r.points));
        const touchesOut = mean(at.out.map(r => r.touches));
        const hasIn = at.within.length > 0;
        const pointsIn = hasIn ? mean(at.within.map(r => r.points)) : null;
        const touchesIn = hasIn ? mean(at.within.map(r => r.touches)) : null;
        successors.push({
            id, name: at.name,
            games: at.out.length,
            pointsOut, pointsIn,
            lift: pointsIn == null ? null : pointsOut - pointsIn,
            touchesOut, touchesIn,
            absorbed: ownTouches > 0
                ? (touchesOut - (touchesIn ?? 0)) / ownTouches
                : null,
        });
    }

    /**
     * Biggest beneficiary first, which is the lift and not the level.
     *
     * A teammate who scores fifteen with the starter out and fifteen with him
     * in is not the successor, he is the other starter — and ranking on the
     * level puts him top of a list about somebody else's absence. Where
     * there is no lift to compute, because the two never shared a field, the
     * level is all there is and stands in for it.
     */
    successors.sort((a, b) => (b.lift ?? b.pointsOut) - (a.lift ?? a.pointsOut));

    return {
        playerId,
        name: first.full_name,
        position: first.position,
        team: [...stints.values()].sort((a, b) => b.season - a.season)[0]?.team ?? null,
        missed: missedWeeks.length,
        played: playedWeeks.length,
        ownPoints: mean(own.map(r => r.points)),
        ownTouches,
        successors,
    };
}
