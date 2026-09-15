/**
 * Who is available, ranked by whether their job is growing — when there is
 * a season to read that off.
 *
 * Every waiver list ranks free agents by rest-of-season projection, which is
 * a restatement of who was good in August. The players worth claiming are
 * the ones whose opportunity has changed since — a back who has gone from
 * six carries to fifteen over three weeks is the pickup, and his projection
 * will not know that for another fortnight. That is what this ranks on, and
 * scripts/formweight_check measures it holding up: a snap share up ten
 * points over three games predicts a player beating his own season average
 * by a point, where one down ten falls nearly a point short.
 *
 * But the same measurement found the other half, and the first version of
 * this page ignored it. Across an *offseason* recency is not signal, it is
 * noise — a five-game average predicts the next September worse than a whole
 * season does, and worst of all for the players whose last five games looked
 * least like their season. Which is exactly who a change-ranked list
 * surfaces.
 *
 * The window used to reach back a season, so in week one "the last three
 * games" meant weeks sixteen to eighteen of the year before: the weeks
 * eliminated teams rest their starters. It put two backup quarterbacks and a
 * running back averaging two points in the top four, because their snap
 * share had tripled in garbage time. No other waiver page in the world
 * looked like that, and it was not because this one had found something.
 *
 * So the trend is computed from *this* season only, and where there is not
 * enough of it the page says so and ranks the way everyone else does. Week
 * one has no usage to read; pretending otherwise was the bug.
 *
 * This file gathers, lib/waiverRank orders. The split is so the trend path
 * can be tested in September, when the database cannot produce one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
    MIN_TREND_GAMES, RECENT, STARTED, WINDOW,
    positionRanks, positionShape, rankWaivers, replacementBaseline,
    startersByPosition, type WaiverRow,
} from '@/lib/waiverRank';
import { eligibleForSlot } from '@/lib/lineup';

export type { WaiverRow, WaiverMode } from '@/lib/waiverRank';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEASON = 2026;

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
    /**
     * How many candidates come back.
     *
     * Bigger than it looks like it needs to be, because the page ranks these
     * on the rest of the season and then re-sorts them on this week's
     * projection in the browser — which it can only do over the rows it
     * holds. Sixty is comfortably past the point where a free agent is worth
     * a roster spot in any league, so the two orderings agree about who is
     * on the page even when they disagree about the order.
     */
    const limit = Math.min(90, Math.max(5, Number(url.searchParams.get('limit') ?? '60')));
    /**
     * One position, ranked against itself.
     *
     * Filtering the top forty in the browser looks equivalent and is not.
     * Trend is ranked across every position at once, and a league's forty
     * biggest movers are mostly backs and receivers — on txmossad's league
     * they were twelve backs, fifteen receivers, ten quarterbacks and three
     * tight ends, with no kicker or defence at all. So the position buttons
     * for K and DST showed an empty list while free agents at both sat in
     * the pool, and "my only tight end has nobody behind him, show me tight
     * ends" answered with three.
     */
    /**
     * The shape of the league asking, because replacement level is a fact
     * about it rather than about football.
     *
     * Without these the answer assumed a twelve-team, one-quarterback league
     * — and in a superflex league nearly every team starts two quarterbacks,
     * so the replacement quarterback is around the twenty-fourth and not the
     * twelfth. Measured against QB12 every claimable quarterback reads as far
     * below a startable one, which is precisely backwards on the wire where
     * streaming them is half the point.
     *
     * Absent, the old constants still apply, so a caller that does not know
     * its league gets the same answer it always did.
     */
    const slots = (url.searchParams.get('slots') ?? '')
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 40);
    const teamsRaw = Number(url.searchParams.get('teams') ?? '0');
    const teams = Number.isFinite(teamsRaw) && teamsRaw >= 2 && teamsRaw <= 32
        ? Math.round(teamsRaw) : 0;

    const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
    const asked = (url.searchParams.get('pos') ?? '').toUpperCase();
    const pos = POSITIONS.has(asked) ? asked : null;

    // This season only. Reaching back a season put the weeks eliminated
    // teams rest their starters into "recent", which is the worst evidence
    // in the database about next September and the reason this list used to
    // look like nobody else's.
    //
    // Touches count pass attempts for a quarterback: carries plus receptions
    // is a number about somebody else's job, and reporting a starting
    // quarterback's usage as "1.0 → 2.7 touches" is how two backups came to
    // sit in the top four.
    const trendP = query<Record<string, number | null>>(
        `WITH ranked AS (
             SELECT w.player_id, w.fantasy_points_ppr AS pts,
                    COALESCE(w.offense_pct, 0) AS snaps,
                    CASE WHEN p.position = 'QB'
                         THEN COALESCE(w.pass_attempts, 0) + COALESCE(w.carries, 0)
                         ELSE COALESCE(w.carries, 0) + COALESCE(w.receptions, 0)
                    END AS touches,
                    ROW_NUMBER() OVER (PARTITION BY w.player_id
                                       ORDER BY w.season DESC, w.week DESC) AS rn
               FROM nfl_player_week w
               JOIN players p ON p.id = w.player_id
              WHERE w.season_type = 'REG' AND w.season = ${SEASON}
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
        proj_points: number | null;
    }>(
        `SELECT p.id, p.slug, p.full_name, p.position, p.nfl_team,
                (SELECT AVG(pr.proj_points) FROM projections pr
                  WHERE pr.player_id = p.id AND pr.season = ${SEASON}
                    AND pr.scraped_at = (SELECT MAX(scraped_at) FROM projections
                                          WHERE player_id = p.id AND season = ${SEASON}
                                            AND source = pr.source)
                ) AS proj_points
           FROM players p
          WHERE p.redraft_pool = 1
            AND p.position IN ('QB','RB','WR','TE','K','DST')`, []);

    /**
     * The pool is never filtered in SQL, and the position filter is applied
     * after everything that needs the whole league has been worked out.
     *
     * It used to filter in the query, with a note arguing that a baseline
     * drawn from tight ends alone is still the twelfth tight end. That was
     * true of the baseline and stopped being true the moment the league's
     * own shape got derived from the pool: asked for quarterbacks, the pool
     * held only quarterbacks, so every other position came back with zero
     * players, zero starters, and a page telling a superflex manager his
     * league does not field receivers. The numbers that describe a league
     * have to be computed from all of it.
     */
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
        // A player with nothing logged this season is not trendable, but he
        // is still claimable — so he stays in the pool for the projection
        // ranking and is simply not eligible for the other one.
        const games = t ? Number(t.games) : 0;
        const team = p.nfl_team?.toUpperCase() ?? null;
        const line = team ? lineByTeam.get(team) : undefined;
        rows.push({
            id: p.id, slug: p.slug, full_name: p.full_name,
            position: p.position, nfl_team: p.nfl_team,
            games,
            snap_now: t ? n(t.snap_now) : null, snap_before: t ? n(t.snap_before) : null,
            touches_now: t ? n(t.touches_now) : null,
            touches_before: t ? n(t.touches_before) : null,
            points_now: t ? n(t.points_now) : null,
            points_before: t ? n(t.points_before) : null,
            proj_points: p.proj_points != null ? Number(p.proj_points) : null,
            // Both filled by the ranking, since both are relative to the
            // whole pool rather than to the free agents in it.
            over_replacement: null,
            pos_rank: null,
            implied_team_total: line?.implied_team_total ?? null,
            spread: line?.spread ?? null,
            opponent: line?.opponent ?? null,
            on_bye: !!team && !line,
            teammate_out: team ? outByTeam.get(team) ?? null : null,
        });
    }

    const leagueShaped = slots.length > 0 && teams > 0;
    const started = leagueShaped
        ? startersByPosition(slots, teams, pool, eligibleForSlot)
        : STARTED;
    /**
     * A position this league does not field is worth nothing in it, and that
     * has to be said rather than computed around.
     *
     * Deriving the counts introduced the case: the user's league starts no
     * kicker and no defence, so both come back as zero, and value over
     * replacement against a baseline of nothing is the player's whole
     * projection — which would have printed every kicker as a hundred and
     * fifty points above a startable one in a league that cannot start any.
     * Ranking them against the old constants instead would be quieter and
     * just as wrong: it would answer for a league the reader is not in.
     */
    const unplayed = leagueShaped
        ? Object.keys(started).filter(p => !started[p])
        : [];
    const baseline = replacementBaseline(pool, started);
    /**
     * Now the filter, over rows rather than over the query — after the
     * baseline, the starter counts and the positional depth, all of which
     * are facts about the whole league.
     */
    const atPosition = pos
        ? rows.filter(r => (r.position ?? '').toUpperCase() === pos) : rows;
    const { mode, trendable, players } = rankWaivers(
        atPosition, baseline, pos, positionRanks(pool));

    return NextResponse.json({
        week, season: SEASON,
        considered: atPosition.length,
        /** Which position this list was ranked within, when it was one. */
        position: pos,
        /** What the order means, so the page can say it rather than imply it. */
        mode,
        /** How many of the pool have a season behind them worth reading. */
        trendable,
        minTrendGames: MIN_TREND_GAMES,
        /**
         * Where the replacement line landed at each position.
         *
         * Sent because the projection ranking is otherwise a list of negative
         * numbers with nothing to measure them against: "eleven below" is
         * only meaningful beside "the twelfth tight end projects a hundred
         * and sixty-three".
         */
        replacement: Object.fromEntries(baseline),
        /**
         * And how many starters that line was drawn at, so a reader in an
         * unusual league can see the page knew what shape it was in rather
         * than wondering why its quarterbacks look different from everyone
         * else's.
         */
        started,
        leagueShaped,
        /** Positions this league fields no slot for, so the page can say so. */
        unplayed,
        /**
         * And how deep the wire is at each position.
         *
         * The combined list is ranked across positions, so it comes out
         * lopsided whenever a league's rosters are — and a lopsided list
         * reads as a broken one, which is how this page came to be looked at
         * again. Sent so the page can show the shape instead of leaving a
         * reader to infer it from a column of tight ends.
         */
        byPosition: positionShape(rows, baseline),
        players: players.slice(0, limit),
    });
}
