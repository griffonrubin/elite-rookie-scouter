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

/**
 * One game, with the points and the usage that produced them.
 *
 * The points are what the projection is built from; the usage is what says
 * whether those points are about to change. A back losing snaps has the same
 * history as one gaining them right up to the week it matters.
 */
export interface GameLog {
    season: number;
    week: number;
    points: number;
    opponent: string | null;
    targets: number | null;
    carries: number | null;
    /** Share of the team's targets, 0-1. */
    target_share: number | null;
    /** Share of the team's offensive snaps, 0-1. */
    snap_share: number | null;
    /**
     * Weighted opportunity rating: 1.5 x target share + 0.7 x air yards
     * share. An index, not a share — it runs negative and above 1, because
     * team air yards can be small or negative on a night of screens, so it
     * must never be rendered as a percentage.
     */
    wopr: number | null;
    receptions: number | null;
    pass_attempts: number | null;
    /** The box score itself, so the points can be taken apart. */
    rush_yards: number | null;
    rush_tds: number | null;
    rec_yards: number | null;
    rec_tds: number | null;
    pass_yards: number | null;
    pass_tds: number | null;
    interceptions: number | null;
}

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
    logs: GameLog[];
    /** PPR implied by this week's prop market, when the books priced them. */
    market_points: number | null;
    market_markets: number | null;
    market_books: number | null;
    /** The injury report, when this player is on it this week. */
    report_status: string | null;
    practice_status: string | null;
    injury: string | null;
    /** What this week's opponent allowed to this position last season. */
    def_allowed: number | null;
    def_league_avg: number | null;
    def_sample: number | null;
    /** Last full season's usage and efficiency, for the head-to-head. */
    usage: {
        games: number;
        targets_per_game: number | null;
        carries_per_game: number | null;
        target_share: number | null;
        wopr: number | null;
        snap_share: number | null;
        yards_per_touch: number | null;
        epa_per_play: number | null;
    } | null;
}


/** One row per defence per position: what they give up, and over how many. */
interface DefRow { defense: string; position: string; allowed: number; n: number }

/**
 * The defence-vs-position table, computed once rather than per request.
 *
 * What each defence allowed per player-game at each position, computed here
 * rather than scraped: the weekly table already carries the opponent on
 * every row, so this is the same games read from the other side. Last season
 * only — a defence two games into a new year has told us almost nothing, and
 * the model shrinks by sample size anyway.
 *
 * This one has no player filter — it aggregates the whole weekly table and
 * comes back identical for every user, every roster and every slot, and it
 * was being recomputed on each load. It only changes when the daily pass
 * loads new weekly stats, so an hour is a conservative life for it: the
 * numbers behind it are a season's worth of games, and the model shrinks
 * them by sample size anyway.
 */
let defCache: { at: number; rows: DefRow[] } | null = null;
const DEF_TTL_MS = 60 * 60 * 1000;

async function defenceVsPosition(): Promise<DefRow[]> {
    if (defCache && Date.now() - defCache.at < DEF_TTL_MS) return defCache.rows;
    const rows = await query<{
        defense: string; position: string; allowed: number; n: number;
    }>(
        `SELECT opponent AS defense, position,
                AVG(fantasy_points_ppr) AS allowed, COUNT(*) AS n
           FROM nfl_player_week
          WHERE season = ${SEASON - 1} AND season_type = 'REG'
            AND opponent IS NOT NULL AND fantasy_points_ppr IS NOT NULL
          GROUP BY opponent, position`, []);
    defCache = { at: Date.now(), rows };
    return rows;
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
    // The same id list shifted by one, for queries that bind the week first.
    const ph2 = ids.map((_, i) => `$${i + 2}`).join(',');
    const baseP = query<{
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
    //
    // Usage rides along, on the same rolling window rather than a season of
    // its own: usage is the leading indicator of a projection built on past
    // points, and one pinned to last season cannot lead anything by November.
    const logsP = query<{
        player_id: number; season: number; week: number;
        points: number; opponent: string | null;
        targets: number | null; carries: number | null;
        target_share: number | null; snap_share: number | null;
        wopr: number | null; receptions: number | null;
        pass_attempts: number | null; rush_yards: number | null;
        rush_tds: number | null; rec_yards: number | null; rec_tds: number | null;
        pass_yards: number | null; pass_tds: number | null;
        interceptions: number | null;
    }>(
        `SELECT player_id, season, week, fantasy_points_ppr AS points, opponent,
                targets, carries, target_share, offense_pct AS snap_share, wopr,
                receptions, pass_attempts, rush_yards, rush_tds, rec_yards,
                rec_tds, pass_yards, pass_tds, interceptions
           FROM nfl_player_week
          WHERE player_id IN (${ph}) AND season_type = 'REG'
            AND season >= ${SEASON - 2}
          ORDER BY season, week`, ids);

    // This week's line for every team, so a player's own row is a lookup.
    const linesP = query<{
        team: string; opponent: string; spread: number | null;
        implied_team_total: number | null;
    }>(
        `SELECT team, opponent, spread, implied_team_total
           FROM vegas_game_lines
          WHERE season = ${SEASON} AND week = $1`, [week]);

    // This week's prop market, newest scrape only. A player priced twice in a
    // week has moved, and the older number is history rather than an opinion
    // to average in.
    const mktP = query<{
        player_id: number; ppr_points: number | null;
        markets_priced: number | null; books_priced: number | null;
    }>(
        `SELECT m.player_id, m.ppr_points, m.markets_priced, m.books_priced
           FROM nfl_player_market_projection m
          WHERE m.season = ${SEASON} AND m.week = $1 AND m.player_id IN (${ph2})
            AND m.scraped_at = (SELECT MAX(scraped_at)
                                  FROM nfl_player_market_projection
                                 WHERE player_id = m.player_id
                                   AND season = m.season AND week = m.week)`,
        [week, ...ids]);

    // This week's injury report. Most players are not on it at all, which is
    // the answer for them: silence means nobody has said otherwise.
    const injP = query<{
        player_id: number; report_status: string | null;
        practice_status: string | null; report_primary_injury: string | null;
    }>(
        `SELECT player_id, report_status, practice_status, report_primary_injury
           FROM nfl_player_injury
          WHERE season = ${SEASON} AND week = $1 AND player_id IN (${ph2})`,
        [week, ...ids]);

    const defP = defenceVsPosition();

    // Usage over the same rolling window as the logs rather than a career:
    // a role from two years ago is a different player's role.
    const usageRowsP = query<{
        player_id: number; games: number;
        tpg: number | null; cpg: number | null; tshare: number | null; wopr: number | null;
        snap: number | null;
        ypt: number | null; epa: number | null;
    }>(
        `SELECT player_id,
                COUNT(*) AS games,
                AVG(targets) AS tpg,
                AVG(carries) AS cpg,
                AVG(target_share) AS tshare,
                AVG(wopr) AS wopr,
                AVG(offense_pct) AS snap,
                CASE WHEN SUM(carries + receptions) > 0
                     THEN SUM(rush_yards + rec_yards) * 1.0 / SUM(carries + receptions)
                     END AS ypt,
                CASE WHEN COUNT(*) > 0
                     THEN AVG(COALESCE(rush_epa,0) + COALESCE(rec_epa,0) + COALESCE(pass_epa,0))
                     END AS epa
           FROM nfl_player_week
          WHERE player_id IN (${ph}) AND season_type = 'REG'
            AND season >= ${SEASON - 2}
          GROUP BY player_id`, ids);
    /**
     * One round trip instead of seven.
     *
     * These were awaited one after another, which is free against local
     * SQLite and the whole cost of the page against Postgres over a network:
     * none of them depends on another's result — every one is keyed off the
     * ids in the request — so the page was paying seven times the latency
     * for no reason at all.
     */
    const [base, logs, lines, mkt, inj, def, usageRows] = await Promise.all(
        [baseP, logsP, linesP, mktP, injP, defP, usageRowsP]);

    const lineByTeam = new Map(lines.map(l => [l.team.toUpperCase(), l]));
    const mktByPlayer = new Map(mkt.map(m => [m.player_id, m]));
    const injByPlayer = new Map(inj.map(i => [i.player_id, i]));
    const defByKey = new Map(def.map(d =>
        [`${d.defense.toUpperCase()}|${d.position}`, d]));
    // The league average for a position, so a rate has something to be
    // relative to. Weighted by player-games, which is what the cells are.
    const leagueAvg = new Map<string, number>();
    for (const d of def) {
        const prev = leagueAvg.get(d.position);
        const n = Number(d.n), a = Number(d.allowed);
        leagueAvg.set(d.position, prev == null ? a * n : prev + a * n);
    }
    const leagueN = new Map<string, number>();
    for (const d of def) {
        leagueN.set(d.position, (leagueN.get(d.position) ?? 0) + Number(d.n));
    }
    for (const [pos, total] of leagueAvg) {
        leagueAvg.set(pos, total / (leagueN.get(pos) || 1));
    }

    // Usage is averaged over the last full season rather than a career:
    const usageByPlayer = new Map(usageRows.map(u => [u.player_id, u]));

    const logsByPlayer = new Map<number, GameLog[]>();
    const n = (v: number | null) => (v == null ? null : Number(v));
    for (const l of logs) {
        const row = {
            season: l.season, week: l.week, points: l.points, opponent: l.opponent,
            targets: n(l.targets), carries: n(l.carries),
            target_share: n(l.target_share), snap_share: n(l.snap_share),
            wopr: n(l.wopr), receptions: n(l.receptions),
            pass_attempts: n(l.pass_attempts), rush_yards: n(l.rush_yards),
            rush_tds: n(l.rush_tds), rec_yards: n(l.rec_yards),
            rec_tds: n(l.rec_tds), pass_yards: n(l.pass_yards),
            pass_tds: n(l.pass_tds), interceptions: n(l.interceptions),
        };
        const arr = logsByPlayer.get(l.player_id);
        if (arr) arr.push(row);
        else logsByPlayer.set(l.player_id, [row]);
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
            market_points: mktByPlayer.get(p.id)?.ppr_points ?? null,
            market_markets: mktByPlayer.get(p.id)?.markets_priced ?? null,
            market_books: mktByPlayer.get(p.id)?.books_priced ?? null,
            report_status: injByPlayer.get(p.id)?.report_status ?? null,
            practice_status: injByPlayer.get(p.id)?.practice_status ?? null,
            injury: injByPlayer.get(p.id)?.report_primary_injury ?? null,
            ...(() => {
                const pos = (p.position ?? '').toUpperCase();
                const d = line?.opponent
                    ? defByKey.get(`${line.opponent.toUpperCase()}|${pos}`)
                    : undefined;
                const avg = leagueAvg.get(pos);
                return {
                    def_allowed: d ? Number(d.allowed) : null,
                    def_league_avg: avg ?? null,
                    def_sample: d ? Number(d.n) : null,
                };
            })(),
            logs: logsByPlayer.get(p.id) ?? [],
            usage: (() => {
                const u = usageByPlayer.get(p.id);
                if (!u) return null;
                const n = (v: number | null) => (v == null ? null : Number(v));
                return {
                    games: Number(u.games),
                    targets_per_game: n(u.tpg), carries_per_game: n(u.cpg),
                    target_share: n(u.tshare), wopr: n(u.wopr),
                    snap_share: n(u.snap),
                    yards_per_touch: n(u.ypt), epa_per_play: n(u.epa),
                };
            })(),
        };
    });

    return NextResponse.json({ week, season: SEASON, players });
}
