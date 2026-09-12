/**
 * Who is available, ranked by whether their job is growing.
 *
 * Every waiver list ranks free agents by rest-of-season projection, which is
 * a restatement of who was good in August. The players worth claiming are
 * the ones whose opportunity has changed since — a back who has gone from
 * six carries to fifteen over three weeks is the pickup, and his projection
 * will not know that for another fortnight.
 *
 * So this ranks on the change in usage rather than the level of it, and
 * reports both halves so a reader can see a rise off a tiny base for what it
 * is. It also needs the league: "available" means nobody in *your* league
 * has him, which is the only definition that matters, so the caller sends
 * the ids that are taken.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEASON = 2026;
/** Games in the recent bucket, and in the comparison behind it. */
const RECENT = 3;
const WINDOW = 8;

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
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week') ?? '1');
    if (!Number.isFinite(week) || week < 1 || week > 22) {
        return NextResponse.json({ error: 'bad week' }, { status: 400 });
    }
    const taken = (url.searchParams.get('taken') ?? '')
        .split(',').map(Number).filter(Number.isFinite);
    if (taken.length > 800) {
        return NextResponse.json({ error: 'too many taken ids' }, { status: 400 });
    }
    const limit = Math.min(60, Math.max(5, Number(url.searchParams.get('limit') ?? '40')));

    // Two seasons, because in September the change worth seeing is the one
    // between last year's role and this year's.
    const trendP = query<Record<string, number | null>>(
        `WITH ranked AS (
             SELECT player_id, fantasy_points_ppr AS pts,
                    COALESCE(offense_pct, 0) AS snaps,
                    COALESCE(carries, 0) + COALESCE(receptions, 0) AS touches,
                    ROW_NUMBER() OVER (PARTITION BY player_id
                                       ORDER BY season DESC, week DESC) AS rn
               FROM nfl_player_week
              WHERE season_type = 'REG' AND season >= ${SEASON - 1}
         )
         SELECT player_id,
                COUNT(*) AS games,
                AVG(CASE WHEN rn <= ${RECENT} THEN snaps END) AS snap_now,
                AVG(CASE WHEN rn > ${RECENT} THEN snaps END) AS snap_before,
                AVG(CASE WHEN rn <= ${RECENT} THEN touches END) AS touches_now,
                AVG(CASE WHEN rn > ${RECENT} THEN touches END) AS touches_before,
                AVG(CASE WHEN rn <= ${RECENT} THEN pts END) AS points_now,
                AVG(CASE WHEN rn > ${RECENT} THEN pts END) AS points_before
           FROM ranked
          WHERE rn <= ${WINDOW}
          GROUP BY player_id`, []);

    const poolP = query<{
        id: number; slug: string; full_name: string;
        position: string | null; nfl_team: string | null;
    }>(
        `SELECT id, slug, full_name, position, nfl_team
           FROM players
          WHERE redraft_pool = 1 AND position IN ('QB','RB','WR','TE','K','DST')`, []);

    const linesP = query<{
        team: string; opponent: string; spread: number | null;
        implied_team_total: number | null;
    }>(
        `SELECT team, opponent, spread, implied_team_total
           FROM vegas_game_lines
          WHERE season = ${SEASON} AND week = $1`, [week]);

    // A door opens when somebody ahead is out, so the report is part of the
    // answer rather than a footnote to it.
    const outP = query<{ player_id: number; nfl_team: string | null; full_name: string }>(
        `SELECT i.player_id, p.nfl_team, p.full_name
           FROM nfl_player_injury i
           JOIN players p ON p.id = i.player_id
          WHERE i.season = ${SEASON} AND i.week = $1
            AND i.report_status IN ('Out', 'Doubtful')`, [week]);

    const [trend, pool, lines, out] = await Promise.all([trendP, poolP, linesP, outP]);

    const byId = new Map(trend.map(t => [Number(t.player_id), t]));
    const lineByTeam = new Map(lines.map(l => [l.team.toUpperCase(), l]));
    const outByTeam = new Map<string, string>();
    for (const o of out) {
        if (o.nfl_team) outByTeam.set(o.nfl_team.toUpperCase(), o.full_name);
    }
    const takenSet = new Set(taken);

    const n = (v: number | null | undefined) => (v == null ? null : Number(v));
    const rows: WaiverRow[] = [];
    for (const p of pool) {
        if (takenSet.has(p.id)) continue;
        const t = byId.get(p.id);
        // No games in the window is not a rising role, it is an unknown, and
        // an unknown at the top of a waiver list is noise.
        if (!t || Number(t.games) < 4) continue;
        const team = p.nfl_team?.toUpperCase() ?? null;
        const line = team ? lineByTeam.get(team) : undefined;
        rows.push({
            id: p.id, slug: p.slug, full_name: p.full_name,
            position: p.position, nfl_team: p.nfl_team,
            games: Number(t.games),
            snap_now: n(t.snap_now), snap_before: n(t.snap_before),
            touches_now: n(t.touches_now), touches_before: n(t.touches_before),
            points_now: n(t.points_now), points_before: n(t.points_before),
            implied_team_total: line?.implied_team_total ?? null,
            spread: line?.spread ?? null,
            opponent: line?.opponent ?? null,
            on_bye: !!team && !line,
            teammate_out: team ? outByTeam.get(team) ?? null : null,
        });
    }

    /**
     * Rank on the change, with the level as a tiebreak.
     *
     * Snaps carry the most weight because they are the least noisy signal of
     * a decision a coach has made, and touches next. Points are in there but
     * quietly: a single 30-point week moves an average by ten and says less
     * about next Sunday than four extra carries does.
     */
    const score = (r: WaiverRow) => {
        const d = (a: number | null, b: number | null) =>
            a == null || b == null ? 0 : a - b;
        return d(r.snap_now, r.snap_before) * 40
            + d(r.touches_now, r.touches_before) * 1.5
            + d(r.points_now, r.points_before) * 0.3
            + (r.points_now ?? 0) * 0.1;
    };
    rows.sort((a, b) => score(b) - score(a));

    return NextResponse.json({
        week, season: SEASON,
        considered: rows.length,
        players: rows.slice(0, limit),
    });
}
