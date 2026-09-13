/**
 * Who every team plays for the rest of the year, and how hard that is for
 * each position.
 *
 * One response for the whole league, because it is the same answer for every
 * user and every roster — the same reason the defence profiles are served
 * once — and because the interesting comparison is between two players on
 * different teams.
 *
 * The schedule comes out of the same table the game lines live in: every
 * week has both sides of every game in it whether or not a price has been
 * posted yet, so November is known even though nobody has hung a number on
 * it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { DEFENCE_POSITIONS, rankDefences } from '@/lib/defence';
import { loadDefenceTotals } from '@/lib/defenceTotals';
import { playoffWeeks, scheduleStrength, type ScheduleGame } from '@/lib/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEASON = 2026;
/** Where the regular season ends when the caller does not say. */
const DEFAULT_PLAYOFF_WEEK = 15;

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const from = Math.max(1, Math.min(18, Number(url.searchParams.get('from') ?? '1')));
    const playoffStart = Math.max(2, Math.min(18,
        Number(url.searchParams.get('playoffWeek') ?? String(DEFAULT_PLAYOFF_WEEK))));

    const [rows, totals] = await Promise.all([
        query<ScheduleGame>(
            `SELECT team, week, opponent FROM vegas_game_lines
              WHERE season = ${SEASON} AND opponent IS NOT NULL
              ORDER BY team, week`, []),
        loadDefenceTotals(SEASON),
    ]);
    const cells = rankDefences(totals).map(c => ({
        defense: c.defense, position: c.position,
        points: c.points, pointsLeagueAvg: c.pointsLeagueAvg,
    }));

    const rest = Array.from({ length: playoffStart - from }, (_, i) => from + i)
        .filter(w => w >= 1 && w <= 18);
    const playoffs = playoffWeeks(playoffStart);
    const positions = [...DEFENCE_POSITIONS];

    return NextResponse.json({
        season: SEASON,
        /** The two windows, named so a page never has to guess what it drew. */
        restWeeks: rest,
        playoffWeeks: playoffs,
        rest: scheduleStrength(rows, cells, rest, positions),
        playoffs: scheduleStrength(rows, cells, playoffs, positions),
    });
}
