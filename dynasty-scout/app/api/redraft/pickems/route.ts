/**
 * This week's games, and what a line like each one has historically meant.
 *
 * Two rows per game come out of `vegas_game_lines` — one per side — and a
 * pick'em reader thinks in games, so they are paired here rather than in the
 * browser. Each game carries the bucket its spread falls in, so the market's
 * number and the historical one sit side by side and a reader can see for
 * themselves whether the two agree.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SEASON = 2026;

interface LineRow {
    week: number;
    game_id: string;
    team: string;
    opponent: string;
    is_home: number;
    gameday: string | null;
    spread: number | null;
    total_line: number | null;
    implied_team_total: number | null;
    moneyline: number | null;
    win_prob: number | null;
}

interface CalRow {
    bucket: number;
    label: string;
    games: number;
    fav_wins: number;
    ties: number;
    fav_covers: number;
    pushes: number;
    overs: number;
    totalled: number;
    from_season: number | null;
    to_season: number | null;
}

/** A spread bucket, as rates rather than as counts. */
export interface CalibrationBucket {
    bucket: number;
    label: string;
    games: number;
    /** Share of games the favourite won, ties excluded. */
    favWinRate: number;
    /** Share the favourite covered, pushes excluded. */
    favCoverRate: number;
    /** Share that went over the total, where one was posted. */
    overRate: number | null;
    /** Games behind the cover rate, which is the one people will argue with. */
    coverSample: number;
}

export interface PickemGame {
    gameId: string;
    week: number;
    gameday: string | null;
    home: string;
    away: string;
    /** The home line: negative when the home side is favoured. */
    spread: number | null;
    favourite: string | null;
    /** Points the favourite is giving. */
    laying: number | null;
    totalLine: number | null;
    homeTotal: number | null;
    awayTotal: number | null;
    /** De-vigged market probability that the favourite wins. */
    favWinProb: number | null;
    homeWinProb: number | null;
    awayWinProb: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
    /** What lines this size have done, historically. */
    history: CalibrationBucket | null;
}

export interface PickemsResponse {
    season: number;
    week: number;
    weeks: number[];
    games: PickemGame[];
    calibration: CalibrationBucket[];
    /** Every completed game behind the calibration, as one line. */
    overall: {
        games: number;
        favCoverRate: number;
        fromSeason: number | null;
        toSeason: number | null;
    } | null;
}

const rateRows = (rows: CalRow[]): CalibrationBucket[] => rows.map(r => ({
    bucket: r.bucket,
    label: r.label,
    games: r.games,
    favWinRate: r.games - r.ties > 0 ? r.fav_wins / (r.games - r.ties) : 0,
    favCoverRate: r.games - r.pushes > 0 ? r.fav_covers / (r.games - r.pushes) : 0,
    overRate: r.totalled > 0 ? r.overs / r.totalled : null,
    coverSample: r.games - r.pushes,
}));

export async function GET(req: NextRequest) {
    const asked = Number(req.nextUrl.searchParams.get('week') ?? '0');

    const [weekRows, calRows] = await Promise.all([
        query<{ week: number }>(
            `SELECT DISTINCT week FROM vegas_game_lines
              WHERE season = $1 ORDER BY week`, [SEASON]),
        query<CalRow>('SELECT * FROM vegas_spread_calibration ORDER BY bucket'),
    ]);
    const weeks = weekRows.map(w => w.week);
    if (weeks.length === 0) {
        return NextResponse.json({
            season: SEASON, week: 1, weeks: [], games: [],
            calibration: [], overall: null,
        } satisfies PickemsResponse);
    }
    const week = weeks.includes(asked) ? asked : weeks[0];

    const lines = await query<LineRow>(
        `SELECT week, game_id, team, opponent, is_home, gameday, spread,
                total_line, implied_team_total, moneyline, win_prob
           FROM vegas_game_lines
          WHERE season = $1 AND week = $2`, [SEASON, week]);

    const calibration = rateRows(calRows);
    /** The bucket a spread of this size falls in. */
    const bucketFor = (mag: number | null): CalibrationBucket | null => {
        if (mag == null) return null;
        // Buckets are stored by their lower edge, so the last one at or below
        // this magnitude is the one it belongs to.
        let hit: CalibrationBucket | null = null;
        for (const c of calibration) if (mag >= c.bucket) hit = c;
        return hit;
    };

    const byGame = new Map<string, LineRow[]>();
    for (const l of lines) {
        byGame.set(l.game_id, [...(byGame.get(l.game_id) ?? []), l]);
    }

    const games: PickemGame[] = [];
    for (const [gameId, sides] of byGame) {
        const home = sides.find(s => s.is_home) ?? null;
        const away = sides.find(s => !s.is_home) ?? null;
        // A game missing one of its two rows cannot be paired, and half a
        // game is worse than no game.
        if (!home || !away) continue;
        const spread = home.spread;
        const laying = spread == null ? null : Math.abs(spread);
        const favourite = spread == null || spread === 0
            ? null
            : (spread < 0 ? home.team : away.team);
        const favWinProb = favourite == null ? null
            : (favourite === home.team ? home.win_prob : away.win_prob);
        games.push({
            gameId, week, gameday: home.gameday,
            home: home.team, away: away.team,
            spread, favourite, laying,
            totalLine: home.total_line,
            homeTotal: home.implied_team_total,
            awayTotal: away.implied_team_total,
            favWinProb,
            homeWinProb: home.win_prob,
            awayWinProb: away.win_prob,
            homeMoneyline: home.moneyline,
            awayMoneyline: away.moneyline,
            history: bucketFor(laying),
        });
    }
    // Kickoff order, which is the order a reader fills a card in.
    games.sort((a, b) => (a.gameday ?? '').localeCompare(b.gameday ?? '')
        || a.gameId.localeCompare(b.gameId));

    const totalGames = calRows.reduce((a, r) => a + r.games - r.pushes, 0);
    const totalCovers = calRows.reduce((a, r) => a + r.fav_covers, 0);
    const overall = totalGames > 0 ? {
        games: totalGames,
        favCoverRate: totalCovers / totalGames,
        fromSeason: Math.min(...calRows.map(r => r.from_season ?? Infinity)),
        toSeason: Math.max(...calRows.map(r => r.to_season ?? -Infinity)),
    } : null;

    return NextResponse.json({
        season: SEASON, week, weeks, games, calibration, overall,
    } satisfies PickemsResponse);
}
