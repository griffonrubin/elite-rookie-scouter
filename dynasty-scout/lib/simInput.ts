/**
 * One player, one distribution, whichever page is asking.
 *
 * Four pages were each building this block themselves — the same twelve
 * context fields threaded from the same endpoint into the same
 * `buildOutcome` — and they had already drifted. Start/Sit resampled from a
 * rolling window of the last seventeen games; Power Rankings and the waiver
 * wire resampled from every log row they were sent. So the same player had a
 * differently-shaped week depending on which tab you opened, and a model
 * change would have had to be made in four places to reach them all.
 *
 * Start/Sit's window is the considered one and is what everything uses now.
 */
import { RedraftPlayer } from '@/lib/types';
import { buildOutcome, Outcome, SimPlayer, usableSample } from '@/lib/startSit';
import type { SampleGame } from '@/components/redraft/startsit/OutcomeStrip';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';

/**
 * How many games back the resampled shape reaches.
 *
 * A rolling window rather than "last season", which is right in September
 * and quietly wrong by November: a player would be nine games into a new
 * role with all nine excluded from the shape, resampled instead from a
 * season that no longer describes him. Seventeen games slides on its own —
 * mostly last year in week 1, mostly this year by midseason — and every dot
 * names its own season, so a mixed window still reads honestly.
 */
export const SAMPLE_GAMES = 17;

/**
 * Which question a page is asking of a player.
 *
 * `week` is this Sunday: the opponent's defence, the books' total for his
 * offence, the game script the spread implies, whether he is on a bye and
 * what the injury report says. Everything Start/Sit exists for.
 *
 * `season` is the rest of the year, and it is not the same question with a
 * bigger number on it — it is the same player with all of that stripped off.
 * A power ranking built on this week's inputs ranks a roster below a worse
 * one because three of its starters are on a bye, and calls the result a
 * statement about the team. It is a matchup preview with the wrong title. A
 * week-to-week matchup averages out over fourteen games; a bye that has
 * already been survived tells you nothing about November at all.
 *
 * The weekly injury report goes too, which is the debatable one. A man
 * listed Out on Friday is not eighty-five per cent likely to miss every
 * remaining week, and the report carries no flag for the injury that ends a
 * season — so counting it would be right about one player in twenty and
 * wrong about the rest. The pages say which horizon they are on so a reader
 * can go and look at the week when the week is what matters.
 */
export type Horizon = 'week' | 'season';

export interface SimInput {
    outcome: Outcome;
    /** The games behind the shape, oldest first, for plotting. */
    sample: SampleGame[];
}

/**
 * Build a player's week from what the start/sit endpoint returned.
 *
 * `data` may be missing — a player whose row never arrived still gets an
 * outcome, built from nothing, which is how a lineup renders a hole rather
 * than dropping a slot.
 */
export function simInputFor(
    player: Pick<RedraftPlayer, 'id' | 'position'>,
    data: StartSitPlayer | undefined,
    season: number,
    horizon: Horizon = 'week',
): SimInput {
    const logs = data?.logs ?? [];
    const weekly = horizon === 'week';
    const outcome = buildOutcome({
        playerId: player.id,
        position: player.position ?? '',
        seasonProjection: data?.proj_points ?? null,
        projectedGames: 17,
        logs,
        // A prop line is a price on one game. Over a season it is the wrong
        // instrument twice over: it is only quoted for this Sunday, and it
        // is only quoted for the players the books bother to price, so
        // letting it set the centre would move some rosters and not others
        // for a reason that has nothing to do with how good they are.
        marketProjection: weekly ? data?.market_points ?? null : null,
        marketMarkets: weekly ? data?.market_markets ?? null : null,
        context: weekly ? {
            impliedTeamTotal: data?.implied_team_total ?? null,
            spread: data?.spread ?? null,
            defenseAllowed: data?.def_allowed ?? null,
            defenseLeagueAvg: data?.def_league_avg ?? null,
            defenseSample: data?.def_sample ?? null,
            reportStatus: data?.report_status ?? null,
            practiceStatus: data?.practice_status ?? null,
            onBye: data?.on_bye ?? false,
        // Empty, deliberately: what is left is the player's own level from
        // his projection and his games, which is what a typical remaining
        // week looks like.
        } : {},
    }, season);
    const sample: SampleGame[] = logs
        .slice()
        .sort((x, y) => y.season - x.season || y.week - x.week)
        .slice(0, SAMPLE_GAMES)
        .map(l => ({ points: l.points, week: l.week, season: l.season, opponent: l.opponent }))
        .reverse();
    // A sample that cannot stand in for the player is not shown either.
    // nflverse scores no kicking, so a kicker's games are seventeen zeroes —
    // plotted as evidence they would say a nine-point kicker has never
    // scored.
    return {
        outcome,
        sample: usableSample(sample.map(g => g.points)) ? sample : [],
    };
}

/** The same thing as the simulator wants it: points only, no game metadata. */
export function simPlayerFrom(input: SimInput): SimPlayer {
    const points = input.sample.map(g => g.points);
    return { outcome: input.outcome, sample: points.length ? points : undefined };
}
