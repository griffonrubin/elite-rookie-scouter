/**
 * How hard the rest of the year is, for a position rather than for a team.
 *
 * Every site ships a strength of schedule and nearly all of them rank
 * opponents by how good those teams are overall, which is the wrong
 * question. A defence that cannot be run on and gives up everything through
 * the air is a brutal schedule for your back and a gift for your receiver,
 * and one number for both cannot say so. Seattle last season were last in
 * the league in yards a carry allowed and first in catches allowed to backs.
 *
 * So this is built on the defence profiles: for each of a team's remaining
 * opponents, what that defence concedes to this position against what an
 * average defence concedes, averaged over the weeks left and ranked across
 * the league. Byes are weeks with no opponent and are left out of the
 * average rather than counted as neutral — a bye is not an easy game, it is
 * no game, and the page says how many each player has.
 */

export interface ScheduleGame {
    team: string;
    week: number;
    opponent: string;
}

export interface SosRow {
    team: string;
    position: string;
    /** Weeks counted, and byes inside the window that were not. */
    games: number;
    byes: number;
    /**
     * Mean of what those opponents concede, against a league-average
     * defence, as a percentage. Positive is an easier schedule.
     */
    ease: number;
    /** 1 is the easiest schedule in the league at this position. */
    rank: number;
    of: number;
    /** The three hardest and easiest weeks, for a page that shows its work. */
    weeks: { week: number; opponent: string; ease: number | null }[];
}

export interface DefenceAllowed {
    defense: string;
    position: string;
    points: number;
    pointsLeagueAvg: number;
}

/**
 * Rank every team's remaining schedule, position by position.
 *
 * `weeks` is the window — the rest of the regular season, or the fantasy
 * playoff weeks, which are the ones that decide a season and the ones worth
 * trading against.
 */
export function scheduleStrength(
    games: ScheduleGame[],
    defence: DefenceAllowed[],
    weeks: number[],
    positions: string[],
): SosRow[] {
    const window = new Set(weeks);
    const teams = [...new Set(games.map(g => g.team))].sort();
    const allowed = new Map<string, DefenceAllowed>();
    for (const d of defence) allowed.set(`${d.defense}|${d.position}`, d);

    /**
     * The schedule indexed once, not re-filtered per team per position.
     *
     * Scanning the fixture list inside the loop is thirty-two teams times
     * four positions times two windows over every row in the league — eighty
     * million comparisons to answer a question about five hundred games, and
     * enough to take the dev server down with it.
     */
    const byTeam = new Map<string, ScheduleGame[]>();
    for (const g of games) {
        if (!window.has(g.week)) continue;
        byTeam.set(g.team, [...(byTeam.get(g.team) ?? []), g]);
    }
    for (const list of byTeam.values()) list.sort((a, b) => a.week - b.week);

    const out: SosRow[] = [];
    for (const position of positions) {
        const rows: SosRow[] = [];
        for (const team of teams) {
            const played = byTeam.get(team) ?? [];
            const seen = new Set(played.map(g => g.week));
            const byes = weeks.filter(w => !seen.has(w)).length;
            const detail = played.map(g => {
                const d = allowed.get(`${g.opponent}|${position}`);
                const ease = d && d.pointsLeagueAvg > 0
                    ? (d.points / d.pointsLeagueAvg - 1) * 100
                    : null;
                return { week: g.week, opponent: g.opponent, ease };
            });
            const priced = detail.map(d => d.ease).filter((e): e is number => e != null);
            rows.push({
                team, position,
                games: priced.length, byes,
                ease: priced.length
                    ? Math.round((priced.reduce((a, b) => a + b, 0) / priced.length) * 10) / 10
                    : 0,
                rank: 0, of: teams.length,
                weeks: detail,
            });
        }
        // Easiest first: a schedule of generous defences is rank one, which
        // is the direction a reader looking for somewhere to attack wants.
        // Ties share the better rank rather than being ordered by whichever
        // team the alphabet happened to put first.
        const order = [...rows].sort((a, b) => b.ease - a.ease);
        const firstAt = new Map<number, number>();
        order.forEach((r, i) => {
            if (!firstAt.has(r.ease)) firstAt.set(r.ease, i + 1);
            r.rank = firstAt.get(r.ease)!;
        });
        out.push(...rows);
    }
    return out;
}

/**
 * The weeks that decide a season.
 *
 * A schedule that is brutal in September and kind in December is a good
 * schedule, and one ranked over the whole rest of the year says the
 * opposite. The playoff window is where a trade should be aimed, so it is
 * computed separately rather than folded into an average that hides it.
 */
export function playoffWeeks(playoffWeekStart: number, rounds = 3): number[] {
    const start = Math.max(1, playoffWeekStart);
    return Array.from({ length: rounds }, (_, i) => start + i).filter(w => w <= 18);
}
