/**
 * The betting market, refreshed from the server.
 *
 * The market is the input every projection here starts from: `lib/startSit.ts`
 * moves a player's mean on their team's implied total and the game script
 * implied by the spread. That only works if the lines are current, and until
 * now nothing in production refreshed them — the cron read `vegas_game_lines`
 * to work out which week it was and never wrote a row, so the table held
 * whichever snapshot was last loaded by hand and every projection on the site
 * was quietly running on stale odds.
 *
 * This is the daily-pass twin of scrapers/redraft/vegas_lines.py, held to the
 * same arithmetic; scripts/vegas_parity.mts runs both against one fixture so
 * the two cannot drift apart.
 *
 * Free, and no key: nflverse publishes the closing (or current, for unplayed
 * games) spread, total and moneylines for every scheduled game as a CSV on
 * GitHub — the same file the D/ST loader already reads.
 */
import { getDb, query } from '@/lib/db';
import { parseCsv } from '@/lib/availability';

const GAMES_URL =
    'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const UA = 'Mozilla/5.0 (compatible; DyCharts/1.0)';

/** Standard deviation of an NFL game's final margin — the constant that turns
    a point spread into a win probability when no moneyline was posted. */
const MARGIN_SD = 13.5;

/** Abbreviations other sources use for teams nflverse names differently. */
const TEAM_ALIASES: Record<string, string> = {
    JAC: 'JAX', WSH: 'WAS', LA: 'LAR', STL: 'LAR',
    SD: 'LAC', OAK: 'LV', ARZ: 'ARI', BLT: 'BAL',
    CLV: 'CLE', HST: 'HOU', SL: 'LAR',
};

export function normTeam(team: string | undefined | null): string | null {
    if (!team) return null;
    const t = String(team).trim().toUpperCase();
    return TEAM_ALIASES[t] ?? t;
}

const num = (v: string | undefined): number | null => {
    if (v == null || v === '' || v === 'NA') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const round = (n: number, places: number) => {
    const f = 10 ** places;
    return Math.round(n * f) / f;
};

/** American odds to their implied probability, vig included. */
export function moneylineProb(ml: number | null): number | null {
    if (ml == null || ml === 0) return null;
    return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

/** The error function, which Math does not provide. Abramowitz & Stegun 7.1.26
    — good to ~1e-7, far inside the precision a point spread deserves. */
function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * z);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
        - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return sign * y;
}

/** P(win) for a team getting `spread` points, negative = favoured. */
export function spreadWinProb(spread: number | null): number | null {
    if (spread == null) return null;
    return 0.5 * (1 + erf(-spread / (MARGIN_SD * Math.SQRT2)));
}

/**
 * De-vigged (home, away) win probabilities, or the spread model.
 *
 * Both moneylines priced makes the book's margin measurable and the split
 * exact. Without them the spread is all there is, read through a normal
 * model on the final margin.
 */
export function winProbabilities(
    homeMl: number | null, awayMl: number | null, homeSpread: number | null,
): [number | null, number | null] {
    const ph = moneylineProb(homeMl), pa = moneylineProb(awayMl);
    if (ph && pa) {
        const total = ph + pa;
        return [round(ph / total, 4), round(pa / total, 4)];
    }
    const p = spreadWinProb(homeSpread);
    if (p == null) return [null, null];
    return [round(p, 4), round(1 - p, 4)];
}

export interface GameLineRow {
    week: number;
    gameId: string;
    team: string;
    opponent: string;
    isHome: number;
    gameday: string | null;
    spread: number | null;
    totalLine: number | null;
    impliedTeamTotal: number | null;
    impliedOppTotal: number | null;
    moneyline: number | null;
    winProb: number | null;
}

/** Both halves of one game, each from that team's own point of view. */
export function teamSides(g: Record<string, string>): GameLineRow[] {
    const home = normTeam(g.home_team), away = normTeam(g.away_team);
    // game_id is NOT NULL and half the row's identity, so a game without one
    // can neither be stored nor matched on a later pass.
    if (!home || !away || !g.game_id) return [];
    const total = num(g.total_line);
    // nfldata quotes spread_line as points the HOME team is favoured by; a
    // betting line is quoted the other way round, so flip the sign.
    const line = num(g.spread_line);
    const homeSpread = line != null ? -line : null;
    const awaySpread = line;

    let homeImplied: number | null = null, awayImplied: number | null = null;
    if (total != null && line != null) {
        homeImplied = round(total / 2 + line / 2, 2);
        awayImplied = round(total / 2 - line / 2, 2);
    }

    const homeMl = num(g.home_moneyline), awayMl = num(g.away_moneyline);
    const [pHome, pAway] = winProbabilities(homeMl, awayMl, homeSpread);

    const week = Math.trunc(num(g.week) ?? 0);
    const gameday = (g.gameday ?? '').trim() || null;
    const gameId = g.game_id;

    return [
        { week, gameId, team: home, opponent: away, isHome: 1, gameday,
          spread: homeSpread, totalLine: total, impliedTeamTotal: homeImplied,
          impliedOppTotal: awayImplied,
          moneyline: homeMl != null ? Math.trunc(homeMl) : null, winProb: pHome },
        { week, gameId, team: away, opponent: home, isHome: 0, gameday,
          spread: awaySpread, totalLine: total, impliedTeamTotal: awayImplied,
          impliedOppTotal: homeImplied,
          moneyline: awayMl != null ? Math.trunc(awayMl) : null, winProb: pAway },
    ];
}

export function buildRows(
    season: number, games: Record<string, string>[],
): GameLineRow[] {
    const out: GameLineRow[] = [];
    for (const g of games) {
        if (String(g.season) !== String(season)) continue;
        if (g.game_type !== 'REG') continue;
        out.push(...teamSides(g));
    }
    return out;
}

export interface VegasReport {
    status: 'ok' | 'failed';
    reason?: string;
    games?: number;
    priced?: number;
    rows?: number;
}

export async function refreshVegasLines(
    season: number, now = new Date(),
): Promise<VegasReport> {
    let games: Record<string, string>[];
    try {
        const res = await fetch(GAMES_URL, {
            headers: { 'User-Agent': UA }, cache: 'no-store',
            signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`${res.status} for games.csv`);
        games = parseCsv(await res.text());
    } catch (e) {
        return { status: 'failed', reason: String((e as Error)?.message ?? e) };
    }

    const rows = buildRows(season, games);
    if (rows.length === 0) {
        return { status: 'failed', reason: `no REG games for ${season}`, games: games.length };
    }
    const updatedAt = now.toISOString().slice(0, 19);

    // A game with no line yet still belongs in the table — the schedule is
    // what tells the cron which week it is, and a null implied total reads
    // correctly downstream as "not priced".
    for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const params: unknown[] = [];
        const values = chunk.map(r => {
            const b = params.length;
            params.push(season, r.week, r.gameId, r.team, r.opponent, r.isHome,
                r.gameday, r.spread, r.totalLine, r.impliedTeamTotal,
                r.impliedOppTotal, r.moneyline, r.winProb, updatedAt);
            return `(${Array.from({ length: 14 }, (_, k) => `$${b + k + 1}`).join(',')})`;
        });
        await getDb().prepare(
            `INSERT INTO vegas_game_lines (
                season, week, game_id, team, opponent, is_home, gameday,
                spread, total_line, implied_team_total, implied_opp_total,
                moneyline, win_prob, updated_at)
             VALUES ${values.join(',')}
             ON CONFLICT (season, game_id, team)
             DO UPDATE SET week = excluded.week,
               opponent = excluded.opponent, is_home = excluded.is_home,
               gameday = excluded.gameday, spread = excluded.spread,
               total_line = excluded.total_line,
               implied_team_total = excluded.implied_team_total,
               implied_opp_total = excluded.implied_opp_total,
               moneyline = excluded.moneyline, win_prob = excluded.win_prob,
               updated_at = excluded.updated_at`,
        ).run(params);
    }

    return {
        status: 'ok',
        games: games.length,
        priced: rows.filter(r => r.impliedTeamTotal != null).length / 2,
        rows: rows.length,
    };
}
