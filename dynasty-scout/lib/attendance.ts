/**
 * Attendance for everybody, loaded once and held.
 *
 * Separate from lib/durability for the same reason defenceTotals is separate
 * from defence: the math is imported by a client component and the query is
 * not. Putting them in one file pulled better-sqlite3 into the browser
 * bundle, which fails the build rather than shipping — the good outcome, and
 * still a reason the split is structural rather than tidy.
 */
import { query } from '@/lib/db';
import type { Attendance } from '@/lib/durability';
/**
 * Attendance for everybody, in one pass, held for an hour.
 *
 * The shape of the query matters more than it looks. Written the obvious way
 * — a correlated subquery counting a player's team-weeks inside the select —
 * it re-evaluates the team-week list once per stint, thirteen hundred times,
 * and takes five and a half seconds. The same answer as one left join grouped
 * once takes twenty-eight milliseconds.
 *
 * That is not a micro-optimisation, and the difference was not caught by
 * reading it. At five seconds a profile, Next's prefetching of the successor
 * links on Team Analysis saturated the server, and clicking through to the
 * waiver wire from that page simply stopped working — a navigation failure
 * three pages away from the query that caused it.
 *
 * The hour is because attendance changes once a week at most and a reader
 * paging through the board asks for it on every player.
 */

export function attendanceSql(from: number, to: number): string {
    return `
      WITH teamweeks AS (
        SELECT DISTINCT season, UPPER(team) AS team, week
          FROM nfl_player_week
         WHERE season_type = 'REG' AND season BETWEEN ${from} AND ${to}
      ), stint AS (
        SELECT w.player_id, w.season, UPPER(w.team) AS team,
               MIN(w.week) AS first_wk, COUNT(*) AS played
          FROM nfl_player_week w
         WHERE w.season_type = 'REG' AND w.season BETWEEN ${from} AND ${to}
         GROUP BY w.player_id, w.season, UPPER(w.team)
      ), after AS (
        SELECT s.player_id, s.season, s.team, s.played,
               COUNT(tw.week) AS weeks_after
          FROM stint s
          LEFT JOIN teamweeks tw
            ON tw.season = s.season AND tw.team = s.team AND tw.week > s.first_wk
         GROUP BY s.player_id, s.season, s.team, s.played
      )
      SELECT a.player_id, p.position,
             SUM(a.played) AS played,
             SUM(a.weeks_after - (a.played - 1)) AS missed
        FROM after a
        JOIN players p ON p.id = a.player_id
       WHERE p.redraft_pool = 1
       GROUP BY a.player_id, p.position
    `;
}

const ATTENDANCE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; rows: Attendance[] }>();

export function clearAttendanceCache() {
    cache.clear();
}

export async function loadAttendance(from: number, to: number): Promise<Attendance[]> {
    const key = `${from}:${to}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ATTENDANCE_TTL_MS) return hit.rows;

    const raw = await query<Record<string, any>>(attendanceSql(from, to), []);
    const rows: Attendance[] = raw.map(a => ({
        playerId: Number(a.player_id),
        position: a.position ?? null,
        played: Number(a.played),
        missed: Number(a.missed),
    }));
    cache.set(key, { at: Date.now(), rows });
    return rows;
}
