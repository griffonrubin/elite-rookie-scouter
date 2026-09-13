/**
 * What a roster is good at, against the eleven rosters it has to beat.
 *
 * A depth table says what each of your starters is holding up. It cannot say
 * whether your receivers are the best in the league or the worst, and that is
 * the question an owner asks first — not "how good is this player" but "where
 * do I stand, and what should I be trying to buy".
 *
 * Every measure here is therefore a *percentile against the league*, never a
 * raw total. Ninety-four points a week from receivers means nothing on its
 * own; best of twelve means something, and it is the only form in which a
 * quarterback score and a receiver score can be put on the same axis without
 * lying. Radar charts get a bad name for exactly that reason — arbitrary
 * axes at arbitrary scales — and a common percentile scale is the one case
 * where the shape is honest.
 */
import type { Outcome } from '@/lib/startSit';
import { bestLineup, type TradeRosterPlayer } from '@/lib/trade';

export const PROFILE_AXES = ['now', 'season', 'upside', 'floor', 'depth'] as const;
export type ProfileAxis = (typeof PROFILE_AXES)[number];

export const AXIS_LABEL: Record<ProfileAxis, string> = {
    now: 'This week',
    season: 'Rest of season',
    upside: 'Upside',
    floor: 'Floor',
    depth: 'Depth',
};

export const AXIS_NOTE: Record<ProfileAxis, string> = {
    now: 'What your best lineup scores this Sunday, opponents and byes included. '
        + 'The only axis that moves week to week.',
    season: 'What it scores in a typical week from here, with no opponent, line or '
        + 'bye in it — the roster rather than the calendar.',
    upside: 'How far your starters can beat their own projections: the gap between '
        + 'their eightieth percentile week and their average one, added up. A team '
        + 'that needs to win four of six wants this high.',
    floor: 'And how far they can fall short — their twentieth percentile week, added '
        + 'up. A team protecting a lead in the standings wants this high.',
    depth: 'What survives an injury: the average points your lineup keeps when a '
        + 'starter is removed and the bench fills in. Low here is one hamstring '
        + 'from a lost season.',
};

export interface TeamMeasures {
    key: string;
    name: string;
    /** Per-week points from the starters at each position. */
    byPosition: Record<string, number>;
    /** The five roster qualities, in raw units before ranking. */
    axes: Record<ProfileAxis, number>;
}

export interface TeamProfile extends TeamMeasures {
    /** 0..100 against the league, per position and per axis. */
    positionPct: Record<string, number>;
    axisPct: Record<ProfileAxis, number>;
    /** 1 is best in the league. */
    positionRank: Record<string, number>;
    axisRank: Record<ProfileAxis, number>;
}

/**
 * One team's raw measures.
 *
 * Positions are credited to whoever actually fills a slot, flex included: a
 * team playing three backs gets all three counted at running back, which is
 * what "strong at running back" means to the person who set that lineup.
 */
export function measureTeam(
    key: string,
    name: string,
    roster: TradeRosterPlayer[],
    slots: string[],
    seasonOf: (id: number) => Outcome | null,
    weekOf: (id: number) => Outcome | null,
): TeamMeasures {
    const mean = (id: number) => seasonOf(id)?.mean ?? 0;
    const lineup = bestLineup(slots, roster, mean)
        .filter((id): id is number => id != null);
    const byId = new Map(roster.map(p => [p.id, p]));

    const byPosition: Record<string, number> = {};
    for (const id of lineup) {
        const pos = (byId.get(id)?.position ?? '').toUpperCase();
        byPosition[pos] = (byPosition[pos] ?? 0) + mean(id);
    }

    const sum = (f: (o: Outcome) => number, of: (id: number) => Outcome | null) =>
        lineup.reduce((t, id) => {
            const o = of(id);
            return t + (o ? f(o) : 0);
        }, 0);

    const season = sum(o => o.mean, seasonOf);
    const weekLineup = bestLineup(slots, roster, id => weekOf(id)?.mean ?? 0)
        .filter((id): id is number => id != null);
    const now = weekLineup.reduce((t, id) => t + (weekOf(id)?.mean ?? 0), 0);

    /**
     * Depth as what survives, rather than as bench points.
     *
     * Counting the bench rewards hoarding: four spare kickers is not depth.
     * What matters is how much of the lineup is still standing when a
     * starter goes, which is the same removal the depth table does — one
     * starter out, the bench fills in, and the question is what is left.
     */
    let kept = 0;
    for (const id of lineup) {
        const without = bestLineup(slots, roster.filter(p => p.id !== id), mean)
            .filter((x): x is number => x != null)
            .reduce((t, x) => t + mean(x), 0);
        kept += season > 0 ? without / season : 0;
    }
    const depth = lineup.length ? (kept / lineup.length) * 100 : 0;

    return {
        key, name, byPosition,
        axes: {
            now: Math.round(now * 10) / 10,
            season: Math.round(season * 10) / 10,
            upside: Math.round((sum(o => o.ceiling - o.mean, seasonOf)) * 10) / 10,
            floor: Math.round(sum(o => o.floor, seasonOf) * 10) / 10,
            depth: Math.round(depth * 10) / 10,
        },
    };
}

/**
 * Rank the league on every measure, and turn each rank into a percentile.
 *
 * A percentile rather than a normalised value, because the distance between
 * teams is not the point and is easy to overstate: on a raw axis a league
 * where every roster is within four points a week would draw one team at the
 * edge and another at the centre, which is a picture of noise. Rank spreads
 * evenly by construction, and the raw number is printed beside it for anyone
 * who wants to know how close it really was.
 */
export function rankLeague(teams: TeamMeasures[]): TeamProfile[] {
    const n = teams.length;
    const pctOf = (values: Map<string, number>) => {
        const sorted = [...values.entries()].sort((a, b) => b[1] - a[1]);
        const rank = new Map<string, number>();
        const pct = new Map<string, number>();
        sorted.forEach(([key, v], i) => {
            // Ties share the better rank rather than being ordered by
            // whatever the array happened to hold first.
            const first = sorted.findIndex(([, w]) => w === v);
            rank.set(key, first + 1);
            pct.set(key, n > 1 ? Math.round(((n - 1 - first) / (n - 1)) * 100) : 50);
        });
        return { rank, pct };
    };

    const positions = [...new Set(teams.flatMap(t => Object.keys(t.byPosition)))];
    const posRanked = new Map(positions.map(p => [p,
        pctOf(new Map(teams.map(t => [t.key, t.byPosition[p] ?? 0])))]));
    const axisRanked = new Map(PROFILE_AXES.map(a => [a,
        pctOf(new Map(teams.map(t => [t.key, t.axes[a]])))]));

    return teams.map(t => ({
        ...t,
        positionPct: Object.fromEntries(positions.map(p =>
            [p, posRanked.get(p)!.pct.get(t.key) ?? 50])),
        positionRank: Object.fromEntries(positions.map(p =>
            [p, posRanked.get(p)!.rank.get(t.key) ?? 0])),
        axisPct: Object.fromEntries(PROFILE_AXES.map(a =>
            [a, axisRanked.get(a)!.pct.get(t.key) ?? 50])) as Record<ProfileAxis, number>,
        axisRank: Object.fromEntries(PROFILE_AXES.map(a =>
            [a, axisRanked.get(a)!.rank.get(t.key) ?? 0])) as Record<ProfileAxis, number>,
    }));
}
