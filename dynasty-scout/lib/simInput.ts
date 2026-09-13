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
): SimInput {
    const logs = data?.logs ?? [];
    const outcome = buildOutcome({
        playerId: player.id,
        position: player.position ?? '',
        seasonProjection: data?.proj_points ?? null,
        projectedGames: 17,
        logs,
        marketProjection: data?.market_points ?? null,
        marketMarkets: data?.market_markets ?? null,
        context: {
            impliedTeamTotal: data?.implied_team_total ?? null,
            spread: data?.spread ?? null,
            defenseAllowed: data?.def_allowed ?? null,
            defenseLeagueAvg: data?.def_league_avg ?? null,
            defenseSample: data?.def_sample ?? null,
            reportStatus: data?.report_status ?? null,
            practiceStatus: data?.practice_status ?? null,
            onBye: data?.on_bye ?? false,
        },
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
