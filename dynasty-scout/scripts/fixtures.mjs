/**
 * The fixture file, rendered the way the platform would return it.
 *
 * `fixtures-real-leagues.json` stores this league's schedule as the pairs
 * themselves — a round robin is eighty-four numbers — rather than as a
 * hundred and sixty-eight Sleeper matchup objects each carrying the same
 * roster again. Turning the one into the other is the mock's job, and this
 * is the one copy of it.
 *
 * Falls back to the captured `matchups` for any league with no schedule,
 * which is the state every league was in before this existed: three
 * rosters of one week, enough to open the page on the right opponent and
 * not enough to be a fixture list.
 */

/** One week of a league, as `/league/{id}/matchups/{week}` returns it. */
export function matchupsFor(F, leagueId, week) {
    const weeks = F.schedule?.[leagueId];
    if (!weeks?.length) return F.matchups?.[leagueId] ?? [];
    const pairs = weeks[(week - 1) % weeks.length];
    if (!pairs) return F.matchups?.[leagueId] ?? [];
    const byRoster = new Map((F.rosters?.[leagueId] ?? []).map(r => [r.roster_id, r]));
    return pairs.flatMap(([a, b], i) => [a, b].map(rid => ({
        roster_id: rid,
        matchup_id: i + 1,
        starters: byRoster.get(rid)?.starters ?? [],
        players: byRoster.get(rid)?.players ?? [],
    })));
}
