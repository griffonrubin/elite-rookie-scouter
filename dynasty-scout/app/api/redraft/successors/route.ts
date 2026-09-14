/**
 * If he goes down, who takes the work — and can you have him.
 *
 * The published handcuff charts answer the first half by reading a depth
 * chart, which is a claim about a coach's stated intention rather than about
 * what happened. This answers it by reading the game logs of the weeks the
 * starter was not there, which is the only evidence that exists. The two
 * disagree often enough to matter: Tampa Bay's listed backup gained a point
 * a game across Bucky Irving's seven absences and the man listed nowhere
 * gained six and a half.
 *
 * The second half is the one no chart can answer at all, because it depends
 * on your league. A successor already on somebody's bench is information;
 * one sitting on waivers is a move. So the route says where he is, and the
 * page can sort by the thing that is actually actionable.
 *
 * lib/successor does the measuring. This gathers the logs and answers "is he
 * still on that team", which the logs cannot know — last season's backup may
 * have signed elsewhere in March, and naming him would be the right answer
 * to a question nobody asked.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
    contingencyFor, inheritanceIndex, MIN_ABSENCE, notable,
    type Inheritance, type WeekRow,
} from '@/lib/successor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEASON = 2026;
/**
 * How far back the evidence reaches.
 *
 * Three seasons, which is a compromise rather than a finding. Reaching
 * further buys sample on the players who have been somewhere a long time and
 * spends it on rosters that no longer exist — the 2022 backup is usually
 * gone, and where he is not, his 2022 usage was earned behind a different
 * line under a different coordinator. Three keeps the current staff for most
 * teams.
 */
const FROM_SEASON = SEASON - 2;

/** Enough ids for a full roster and its bench, not enough to scan the league. */
const MAX_IDS = 40;

export interface SuccessorOut {
    id: number;
    name: string;
    slug: string | null;
    /** Where he plays now, which the game logs cannot say. */
    team: string | null;
    /** Whether that is still the team whose work he was measured absorbing. */
    stillThere: boolean;
    /** Whether he is claimable in a redraft league at all. */
    inPool: boolean;
    games: number;
    pointsOut: number;
    pointsIn: number | null;
    lift: number | null;
    absorbed: number | null;
}

export interface ContingencyOut {
    playerId: number;
    name: string;
    position: string | null;
    team: string | null;
    missed: number;
    played: number;
    ownPoints: number;
    ownTouches: number;
    /** Still on the team, enough games to read, best first. */
    successors: SuccessorOut[];
    /**
     * Everyone the measurement found, before the filters — so a page can say
     * "the two men who picked this up have both moved on" rather than
     * showing an empty row that reads like missing data.
     */
    measured: number;
    /**
     * He has game logs in the window, just none with this team — so there is
     * nothing to measure and the reason is a transfer rather than a gap.
     */
    newToTeam: boolean;
}

export interface InheritanceOut {
    /** The free agent this is about. */
    playerId: number;
    /** Whose absence he was measured covering, biggest opening first. */
    from: {
        id: number;
        name: string;
        missed: number;
        played: number;
        points: number;
        games: number;
        pointsOut: number;
        lift: number | null;
        absorbed: number | null;
    }[];
}

/**
 * Two questions off one measurement.
 *
 * `ids` asks it forwards — these are my men, who replaces them — and is what
 * Team Analysis wants. `inherits` asks it backwards — these are the free
 * agents, whose absence does each one cover — and is what a waiver page
 * wants, because that is the difference between a four-point projection
 * worth a bench spot and one that is not.
 */
/**
 * Ids out of a query parameter, and nothing else.
 *
 * `''.split(',')` is `['']`, `Number('')` is `0`, and `Number.isFinite(0)` is
 * true — so an absent parameter parses to a list of one id rather than to an
 * empty list. With two modes sharing a route that stopped being harmless:
 * every request carried `inherits=[0]`, took the second path, and Team
 * Analysis went quietly blank. A positive integer is the only thing a player
 * id can be, so that is what this accepts.
 */
function idsFrom(raw: string | null): number[] {
    return (raw ?? '').split(',')
        .map(Number)
        .filter(n => Number.isInteger(n) && n > 0);
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const inheritIds = idsFrom(url.searchParams.get('inherits'));
    if (inheritIds.length > 0) return inherits(inheritIds);

    const ids = idsFrom(url.searchParams.get('ids'));
    if (ids.length === 0) {
        return NextResponse.json({ error: 'no ids' }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
        return NextResponse.json({ error: 'too many ids' }, { status: 400 });
    }

    const idList = ids.join(',');
    /**
     * Skippers: a team defence has no successor, and no weekly rows either.
     * Left in, it produced a row saying "no games logged" about the Baltimore
     * Ravens, which is true of the table and false of the Ravens.
     */
    const subjects = (await query<{
        id: number; full_name: string; position: string | null; nfl_team: string | null;
    }>(`SELECT id, full_name, position, nfl_team FROM players WHERE id IN (${idList})`, []))
        .filter(s => (s.position ?? '').toUpperCase() !== 'DST');

    const teams = [...new Set(subjects.map(s => s.nfl_team?.toUpperCase())
        .filter((t): t is string => !!t))];
    if (teams.length === 0) {
        return NextResponse.json({ season: SEASON, fromSeason: FROM_SEASON, players: [] });
    }

    const teamList = teams.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
    /**
     * Touches, meaning the work this position's job consists of.
     *
     * Carries plus targets for everybody but a quarterback, whose job is
     * throwing — counting only his carries made the measurement useless
     * exactly where it is cleanest. Tanner McKee took over three weeks of
     * Jalen Hurts and scored thirteen a game doing it; against carries alone
     * he registered as absorbing four per cent of the work and fell under
     * the floor. A backup quarterback absorbs essentially all of it or none,
     * and the attempts say which.
     */
    const rows = await query<WeekRow>(
        `SELECT w.player_id, p.full_name, w.position, w.team, w.season, w.week,
                w.fantasy_points_ppr AS points,
                CASE WHEN w.position = 'QB'
                     THEN COALESCE(w.pass_attempts, 0) + COALESCE(w.carries, 0)
                     ELSE COALESCE(w.carries, 0) + COALESCE(w.targets, 0)
                END AS touches
           FROM nfl_player_week w
           JOIN players p ON p.id = w.player_id
          WHERE w.season_type = 'REG'
            AND w.season BETWEEN ${FROM_SEASON} AND ${SEASON}
            AND UPPER(w.team) IN (${teamList})
          ORDER BY w.season, w.week`, []);

    /**
     * Who has logs somewhere else in the window, which separates two cases a
     * reader must not see merged.
     *
     * A man traded in March has no weeks with his new team and nothing here
     * can be measured about him — but "no games logged" is the wrong way to
     * say it, because it reads as a rookie or a gap in the data rather than
     * as a receiver who spent two seasons somewhere else. DJ Moore on Buffalo
     * is the case: three years of logs, none of them Buffalo's.
     */
    const elsewhere = new Set<number>();
    if (ids.length > 0) {
        const seen = await query<{ player_id: number }>(
            `SELECT DISTINCT player_id FROM nfl_player_week
              WHERE season_type = 'REG'
                AND season BETWEEN ${FROM_SEASON} AND ${SEASON}
                AND player_id IN (${idList})`, []);
        for (const r of seen) elsewhere.add(Number(r.player_id));
    }

    const byTeam = new Map<string, WeekRow[]>();
    for (const r of rows) {
        const t = (r.team ?? '').toUpperCase();
        const at = byTeam.get(t);
        if (at) at.push(r); else byTeam.set(t, [r]);
    }

    const reports = subjects.map(s => {
        const team = s.nfl_team?.toUpperCase() ?? null;
        const teamRows = team ? byTeam.get(team) ?? [] : [];
        return { subject: s, contingency: contingencyFor(s.id, teamRows) };
    });

    // Where every named successor plays now, in one pass rather than per row.
    const mentioned = [...new Set(reports.flatMap(r =>
        (r.contingency?.successors ?? []).map(x => x.id)))];
    const whereNow = new Map<number, {
        slug: string | null; nfl_team: string | null; redraft_pool: number | null;
    }>();
    if (mentioned.length > 0) {
        const found = await query<{
            id: number; slug: string | null; nfl_team: string | null;
            redraft_pool: number | null;
        }>(`SELECT id, slug, nfl_team, redraft_pool FROM players
             WHERE id IN (${mentioned.join(',')})`, []);
        for (const f of found) whereNow.set(Number(f.id), f);
    }

    const players: ContingencyOut[] = reports.map(({ subject, contingency }) => {
        const team = subject.nfl_team?.toUpperCase() ?? null;
        if (!contingency) {
            return {
                playerId: subject.id, name: subject.full_name,
                position: subject.position, team,
                missed: 0, played: 0, ownPoints: 0, ownTouches: 0,
                successors: [], measured: 0,
                newToTeam: elsewhere.has(subject.id),
            };
        }
        const successors: SuccessorOut[] = contingency.successors
            .filter(notable)
            .map(s => {
                const now = whereNow.get(s.id);
                return {
                    id: s.id, name: s.name,
                    slug: now?.slug ?? null,
                    team: now?.nfl_team ?? null,
                    stillThere: !!now?.nfl_team && !!team
                        && now.nfl_team.toUpperCase() === team,
                    inPool: now?.redraft_pool === 1,
                    games: s.games,
                    pointsOut: s.pointsOut,
                    pointsIn: s.pointsIn,
                    lift: s.lift,
                    absorbed: s.absorbed,
                };
            })
            .filter(s => s.stillThere);
        return {
            playerId: subject.id, name: subject.full_name,
            position: subject.position, team,
            missed: contingency.missed, played: contingency.played,
            ownPoints: contingency.ownPoints, ownTouches: contingency.ownTouches,
            successors,
            measured: contingency.successors.filter(notable).length,
            newToTeam: false,
        };
    });

    return NextResponse.json({
        season: SEASON,
        fromSeason: FROM_SEASON,
        minAbsence: MIN_ABSENCE,
        players,
    });
}

/**
 * How many free agents one request will price.
 *
 * The waiver page holds sixty candidates and re-sorts them in the browser,
 * so all sixty have to carry the answer or the column appears and disappears
 * as the reader changes the order.
 */
const MAX_INHERIT_IDS = 90;

async function inherits(ids: number[]) {
    if (ids.length > MAX_INHERIT_IDS) {
        return NextResponse.json({ error: 'too many ids' }, { status: 400 });
    }
    const idList = ids.join(',');
    const subjects = await query<{ id: number; nfl_team: string | null }>(
        `SELECT id, nfl_team FROM players WHERE id IN (${idList})`, []);

    const teams = [...new Set(subjects.map(s => s.nfl_team?.toUpperCase())
        .filter((t): t is string => !!t))];
    if (teams.length === 0) {
        return NextResponse.json({ season: SEASON, fromSeason: FROM_SEASON, players: [] });
    }
    const teamList = teams.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
    const rows = await query<WeekRow>(
        `SELECT w.player_id, p.full_name, w.position, w.team, w.season, w.week,
                w.fantasy_points_ppr AS points,
                CASE WHEN w.position = 'QB'
                     THEN COALESCE(w.pass_attempts, 0) + COALESCE(w.carries, 0)
                     ELSE COALESCE(w.carries, 0) + COALESCE(w.targets, 0)
                END AS touches
           FROM nfl_player_week w
           JOIN players p ON p.id = w.player_id
          WHERE w.season_type = 'REG'
            AND w.season BETWEEN ${FROM_SEASON} AND ${SEASON}
            AND UPPER(w.team) IN (${teamList})
          ORDER BY w.season, w.week`, []);

    const byTeam = new Map<string, WeekRow[]>();
    for (const r of rows) {
        const t = (r.team ?? '').toUpperCase();
        const at = byTeam.get(t);
        if (at) at.push(r); else byTeam.set(t, [r]);
    }
    // One index per team, not one per candidate: thirty teams carry sixty
    // candidates, and building it per candidate would redo the same team's
    // absence arithmetic a dozen times over.
    const indexes = new Map<string, Map<number, Inheritance[]>>();
    for (const [team, teamRows] of byTeam) indexes.set(team, inheritanceIndex(teamRows));

    /**
     * The men whose absence still exists to be covered.
     *
     * Measured on a team he has left, an inheritance is a fact about last
     * season's roster. Checked here rather than in the index because the
     * index reads game logs, which do not know where anybody plays now.
     */
    const stillOn = new Map<number, string>();
    const mentioned = [...new Set([...indexes.values()]
        .flatMap(ix => [...ix.values()].flat().map(i => i.fromId)))];
    if (mentioned.length > 0) {
        const found = await query<{ id: number; nfl_team: string | null }>(
            `SELECT id, nfl_team FROM players WHERE id IN (${mentioned.join(',')})`, []);
        for (const f of found) {
            if (f.nfl_team) stillOn.set(Number(f.id), f.nfl_team.toUpperCase());
        }
    }

    const players: InheritanceOut[] = [];
    for (const s of subjects) {
        const team = s.nfl_team?.toUpperCase() ?? null;
        const ix = team ? indexes.get(team) : undefined;
        const list = ix?.get(s.id) ?? [];
        const from = list
            .filter(i => stillOn.get(i.fromId) === team)
            .map(i => ({
                id: i.fromId, name: i.fromName,
                missed: i.fromMissed, played: i.fromPlayed, points: i.fromPoints,
                games: i.as.games, pointsOut: i.as.pointsOut,
                lift: i.as.lift, absorbed: i.as.absorbed,
            }));
        if (from.length > 0) players.push({ playerId: s.id, from });
    }

    return NextResponse.json({
        season: SEASON, fromSeason: FROM_SEASON, minAbsence: MIN_ABSENCE, players,
    });
}
