import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Everything the start/sit model needs about a set of players.
 *
 * One round trip rather than three, because the page asks about a whole
 * lineup at once and the three pieces are useless apart: the weekly logs
 * give the shape, the projection gives the level, and the week's game line
 * gives the tilt.
 */

const SEASON = 2026;

export interface StartSitPlayer {
    id: number;
    slug: string;
    full_name: string;
    position: string | null;
    nfl_team: string | null;
    /** Season projection, averaged across whichever sources have one. */
    proj_points: number | null;
    /** This week's environment for the player's team. */
    implied_team_total: number | null;
    spread: number | null;
    opponent: string | null;
    on_bye: boolean;
    logs: { season: number; week: number; points: number; opponent: string | null }[];
    /** Last full season's usage and efficiency, for the head-to-head. */
    usage: {
        games: number;
        targets_per_game: number | null;
        carries_per_game: number | null;
        target_share: number | null;
        wopr: number | null;
        yards_per_touch: number | null;
        epa_per_play: number | null;
    } | null;
}

export async function GET(req: NextRequest) {
    const idsParam = req.nextUrl.searchParams.get('ids') ?? '';
    const week = Number(req.nextUrl.searchParams.get('week') ?? '1');
    const ids = idsParam.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return NextResponse.json({ players: [] });
    if (ids.length > 80) {
        return NextResponse.json({ error: 'too many players' }, { status: 400 });
    }
    if (!Number.isInteger(week) || week < 1 || week > 22) {
        return NextResponse.json({ error: 'bad week' }, { status: 400 });
    }

    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    const base = await query<{
        id: number; slug: string; full_name: string;
        position: string | null; nfl_team: string | null; proj_points: number | null;
    }>(
        `SELECT p.id, p.slug, p.full_name, p.position, p.nfl_team,
                (SELECT AVG(pr.proj_points) FROM projections pr
                  WHERE pr.player_id = p.id AND pr.season = ${SEASON}
                    AND pr.scraped_at = (SELECT MAX(scraped_at) FROM projections
                                          WHERE player_id = p.id AND season = ${SEASON}
                                            AND source = pr.source)
                ) AS proj_points
           FROM players p
          WHERE p.id IN (${ph})`, ids);

    // Weekly logs, most recent two seasons — the shape estimate never reaches
    // further back than that and the rows add up quickly.
    const logs = await query<{
        player_id: number; season: number; week: number;
        points: number; opponent: string | null;
    }>(
        `SELECT player_id, season, week, fantasy_points_ppr AS points, opponent
           FROM nfl_player_week
          WHERE player_id IN (${ph}) AND season_type = 'REG'
            AND season >= ${SEASON - 2}
          ORDER BY season, week`, ids);

    // This week's line for every team, so a player's own row is a lookup.
    const lines = await query<{
        team: string; opponent: string; spread: number | null;
        implied_team_total: number | null;
    }>(
        `SELECT team, opponent, spread, implied_team_total
           FROM vegas_game_lines
          WHERE season = ${SEASON} AND week = $1`, [week]);
    const lineByTeam = new Map(lines.map(l => [l.team.toUpperCase(), l]));

    // Usage is averaged over the last full season rather than a career:
    // a role from two years ago is a different player's role.
    const usageRows = await query<{
        player_id: number; games: number;
        tpg: number | null; cpg: number | null; tshare: number | null; wopr: number | null;
        ypt: number | null; epa: number | null;
    }>(
        `SELECT player_id,
                COUNT(*) AS games,
                AVG(targets) AS tpg,
                AVG(carries) AS cpg,
                AVG(target_share) AS tshare,
                AVG(wopr) AS wopr,
                CASE WHEN SUM(carries + receptions) > 0
                     THEN SUM(rush_yards + rec_yards) * 1.0 / SUM(carries + receptions)
                     END AS ypt,
                CASE WHEN COUNT(*) > 0
                     THEN AVG(COALESCE(rush_epa,0) + COALESCE(rec_epa,0) + COALESCE(pass_epa,0))
                     END AS epa
           FROM nfl_player_week
          WHERE player_id IN (${ph}) AND season_type = 'REG' AND season = ${SEASON - 1}
          GROUP BY player_id`, ids);
    const usageByPlayer = new Map(usageRows.map(u => [u.player_id, u]));

    const logsByPlayer = new Map<number,
        { season: number; week: number; points: number; opponent: string | null }[]>();
    for (const l of logs) {
        const arr = logsByPlayer.get(l.player_id);
        if (arr) arr.push({ season: l.season, week: l.week, points: l.points, opponent: l.opponent });
        else logsByPlayer.set(l.player_id,
            [{ season: l.season, week: l.week, points: l.points, opponent: l.opponent }]);
    }

    const players: StartSitPlayer[] = base.map(p => {
        const line = p.nfl_team ? lineByTeam.get(p.nfl_team.toUpperCase()) : undefined;
        return {
            id: p.id, slug: p.slug, full_name: p.full_name,
            position: p.position, nfl_team: p.nfl_team,
            proj_points: p.proj_points != null ? Number(p.proj_points) : null,
            implied_team_total: line?.implied_team_total ?? null,
            spread: line?.spread ?? null,
            opponent: line?.opponent ?? null,
            // No line for this team this week means no game — a bye, which the
            // model has to treat as a zero rather than an unknown.
            on_bye: !!p.nfl_team && !line,
            logs: logsByPlayer.get(p.id) ?? [],
            usage: (() => {
                const u = usageByPlayer.get(p.id);
                if (!u) return null;
                const n = (v: number | null) => (v == null ? null : Number(v));
                return {
                    games: Number(u.games),
                    targets_per_game: n(u.tpg), carries_per_game: n(u.cpg),
                    target_share: n(u.tshare), wopr: n(u.wopr),
                    yards_per_touch: n(u.ypt), epa_per_play: n(u.epa),
                };
            })(),
        };
    });

    return NextResponse.json({ week, season: SEASON, players });
}
