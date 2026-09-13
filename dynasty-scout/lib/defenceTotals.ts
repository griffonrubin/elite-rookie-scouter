/**
 * One loader for what defences give up, shared by everything that asks.
 *
 * The model reads it to move a projection and the page reads it to explain
 * that move, and if those two ever came from separate queries they would
 * eventually disagree — a rating that contradicts the number printed beside
 * it is worse than no rating. So there is one aggregation and one cache.
 *
 * Cached for an hour because it is the same answer for every user, every
 * roster and every slot, and it only changes when the daily pass loads new
 * weekly stats.
 */
import { query } from '@/lib/db';
import {
    DEFENCE_POSITIONS, MIN_CURRENT_GAMES,
    type DefencePosition, type DefenceTotals,
} from '@/lib/defence';

interface Raw {
    defense: string; position: string; season: number; games: number;
    points: number; carries: number; rush_yards: number; rush_tds: number;
    targets: number; receptions: number; rec_yards: number; rec_tds: number;
    pass_attempts: number; pass_yards: number; pass_tds: number;
    interceptions: number;
}

let cache: { at: number; season: number; rows: DefenceTotals[] } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function loadDefenceTotals(season: number): Promise<DefenceTotals[]> {
    if (cache && cache.season === season && Date.now() - cache.at < TTL_MS) {
        return cache.rows;
    }
    /**
     * Per team-game, both seasons at once.
     *
     * The inner grouping is the whole point: summing a position's output
     * within a game and then averaging over games measures what a defence
     * concedes on a Sunday. Averaging over player-games instead divides by
     * how many players it happened to face, so a defence that keeps meeting
     * committee backfields reads as stingy while conceding exactly as much —
     * the two orderings disagree by up to eleven places across the league.
     */
    const rows = await query<Raw>(
        `SELECT defense, position, season, COUNT(*) AS games,
                AVG(points) AS points,
                AVG(carries) AS carries, AVG(rush_yards) AS rush_yards,
                AVG(rush_tds) AS rush_tds, AVG(targets) AS targets,
                AVG(receptions) AS receptions, AVG(rec_yards) AS rec_yards,
                AVG(rec_tds) AS rec_tds, AVG(pass_attempts) AS pass_attempts,
                AVG(pass_yards) AS pass_yards, AVG(pass_tds) AS pass_tds,
                AVG(interceptions) AS interceptions
           FROM (
             SELECT opponent AS defense, position, season, game_id,
                    SUM(fantasy_points_ppr) AS points,
                    SUM(COALESCE(carries, 0)) AS carries,
                    SUM(COALESCE(rush_yards, 0)) AS rush_yards,
                    SUM(COALESCE(rush_tds, 0)) AS rush_tds,
                    SUM(COALESCE(targets, 0)) AS targets,
                    SUM(COALESCE(receptions, 0)) AS receptions,
                    SUM(COALESCE(rec_yards, 0)) AS rec_yards,
                    SUM(COALESCE(rec_tds, 0)) AS rec_tds,
                    SUM(COALESCE(pass_attempts, 0)) AS pass_attempts,
                    SUM(COALESCE(pass_yards, 0)) AS pass_yards,
                    SUM(COALESCE(pass_tds, 0)) AS pass_tds,
                    SUM(COALESCE(interceptions, 0)) AS interceptions
               FROM nfl_player_week
              WHERE season IN (${season - 1}, ${season})
                AND season_type = 'REG'
                AND opponent IS NOT NULL
                AND fantasy_points_ppr IS NOT NULL
                AND position IN ('QB','RB','WR','TE')
              GROUP BY opponent, position, season, game_id
           ) g
          GROUP BY defense, position, season`, []);

    const n = (v: unknown) => Number(v ?? 0);
    const key = (d: string, p: string) => `${d}|${p}`;
    const bySeason = new Map<number, Map<string, Raw>>();
    for (const r of rows) {
        const m = bySeason.get(Number(r.season)) ?? new Map<string, Raw>();
        m.set(key(r.defense, r.position), r);
        bySeason.set(Number(r.season), m);
    }
    const current = bySeason.get(season) ?? new Map<string, Raw>();
    const previous = bySeason.get(season - 1) ?? new Map<string, Raw>();

    /**
     * This year where there is enough of it, last year otherwise.
     *
     * Chosen per defence rather than for the whole league, because teams
     * play different numbers of games by week four and a league-wide switch
     * would read one defence on four games and its neighbour on three. The
     * season used travels with every row so the page can say which it is
     * looking at instead of leaving a reader to assume.
     */
    const totals: DefenceTotals[] = [];
    const defences = new Set<string>();
    for (const m of [current, previous]) {
        for (const r of m.values()) defences.add(r.defense);
    }
    for (const defense of defences) {
        for (const position of DEFENCE_POSITIONS) {
            const cur = current.get(key(defense, position));
            const prev = previous.get(key(defense, position));
            const pick = cur && n(cur.games) >= MIN_CURRENT_GAMES ? cur : prev;
            if (!pick) continue;
            totals.push({
                defense, position: position as DefencePosition,
                season: Number(pick.season), games: n(pick.games),
                points: n(pick.points),
                carries: n(pick.carries), rushYards: n(pick.rush_yards),
                rushTds: n(pick.rush_tds), targets: n(pick.targets),
                receptions: n(pick.receptions), recYards: n(pick.rec_yards),
                recTds: n(pick.rec_tds), passAttempts: n(pick.pass_attempts),
                passYards: n(pick.pass_yards), passTds: n(pick.pass_tds),
                interceptions: n(pick.interceptions),
            });
        }
    }
    cache = { at: Date.now(), season, rows: totals };
    return totals;
}

/** How many defences the league has, for a rank to be out of. */
export const defenceCount = (rows: DefenceTotals[]) =>
    new Set(rows.map(r => r.defense)).size;
