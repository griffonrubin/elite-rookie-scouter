/**
 * League strength, by simulation rather than by points scored.
 *
 * Every power ranking is points scored with a paragraph attached, which
 * early in a season is a ranking of who drew the softest schedule. Points
 * scored is a fact about what happened; it is not a claim about a roster,
 * and the two come apart hardest in exactly the weeks anybody cares.
 *
 * So each roster plays every other roster thousands of times and is ranked
 * on how often it wins. That is a statement about the team rather
 * than the calendar, and it makes the interesting number available: the gap
 * between how good a roster is and how well it has done. Three-and-nothing
 * with the sixth-best roster is a fact about the schedule, and knowing which
 * one you are is worth more than a number that conflates them.
 */
import { SimPlayer, drawLineup, makeRng } from '@/lib/startSit';

export interface PowerTeam {
    key: string;
    name: string;
    /** The starting lineup, already resolved to simulation inputs. */
    lineup: SimPlayer[];
    /**
     * Players the team has actually put in its lineup, which `lineup` may
     * fall short of.
     *
     * A roster we could only price half of is not a weak roster, and ranking
     * it as one is worse than leaving it out: an unpriced lineup is a free
     * win for all eleven other teams, so it corrupts every row and not just
     * its own. Defaults to the lineup length, i.e. assume full coverage.
     */
    filled?: number;
    /**
     * Slots the league's format gives every team.
     *
     * Different from `filled` when somebody has left a slot empty, which is
     * a fact about that team rather than a gap in our data — and the reason
     * their row is low, so it is worth saying which it is.
     */
    slots?: number;
    record?: {
        wins: number; losses: number; ties: number;
        pointsFor: number; pointsAgainst: number;
    };
}

export interface PowerRow {
    key: string;
    name: string;
    /** Share of simulated games won against every other roster in the league. */
    winRate: number;
    /** Mean simulated score for this lineup. */
    expected: number;
    /** Rank by winRate, 1 is strongest. Shared where the gap is inside the noise. */
    rank: number;
    /** True when at least one other roster shares this rank. */
    tied: boolean;
    /** Rank by actual points scored, where the platform reports it. */
    pointsRank: number | null;
    /** Rank by wins, where the platform reports it. */
    recordRank: number | null;
    /**
     * How many places the record sits above the roster: positive means the
     * standings flatter the team, negative means they have been robbed.
     *
     * Null when the record cannot say — nobody has played yet, or every team
     * is level, in which case there is no ordering to compare against. Zero
     * when the strength rank falls inside the team's tie group, because a
     * record that cannot separate two teams is not evidence about either.
     */
    luckGap: number | null;
    record?: PowerTeam['record'];
    /** Head-to-head win rates against each other team, by key. */
    against: Record<string, number>;
    /** Lineup slots priced, filled by the owner, and offered by the format. */
    priced: number;
    filled: number;
    slots: number;
}

/** A roster left out of the ranking, and why. */
export interface PowerGap {
    key: string;
    name: string;
    priced: number;
    filled: number;
}

export interface PowerResult {
    rows: PowerRow[];
    /** Teams too thinly priced to rank — named rather than silently dropped. */
    unranked: PowerGap[];
}

/**
 * How far apart two win rates have to be before the order between them is
 * real, in rate points.
 *
 * Measured rather than guessed. Twelve near-identical rosters ranked from
 * eight different Monte Carlo seeds at 20,000 trials each move by up to
 * 1.2 rate points and by two whole places, so a table that prints 45.8%
 * ninth and 45.7% tenth is inventing a distinction its own randomness would
 * reverse on the next seed. Buying the precision instead does not work:
 * 60,000 trials halves the swing and triples the cost to half a second of
 * blocked main thread, which is worse than admitting the tie.
 *
 * Teams inside this of each other therefore share a rank. Set a little
 * above the 1.2 points measured, because that measurement is the worst case
 * of one fixture and a floor that sits exactly on it is a floor that a
 * different league walks through.
 */
export const POWER_NOISE = 0.015;

/**
 * How much of a lineup has to be priced before ranking it is honest.
 *
 * Three quarters, so a single unmatched player does not remove a team from
 * its own league, but a roster we mostly failed to read stays out.
 */
const COVERAGE = 0.75;

/**
 * Rank a league by round-robin simulation.
 *
 * Simulating each pairing separately draws both rosters afresh, so a
 * twelve-team league draws every lineup eleven times over — sixty-six
 * pairings, a hundred and thirty-two lineups, for twelve distinct rosters.
 * Instead every roster is drawn once per trial and all sixty-six pairs are
 * settled on that same week, which is the trick `slotWinProbs` already uses
 * on one slot: eleven times fewer draws, and the pairwise estimates are
 * unbiased exactly as before, since two rosters are independent whether
 * their draws are reused or not.
 *
 * Sharing the draws also buys something. Every team is judged against the
 * same simulated weeks rather than against its own private run of luck, so
 * the ranking is a comparison rather than twelve comparisons stapled
 * together — and the table is symmetric by construction, which two
 * independent runs per pair would not guarantee.
 */
export function powerRank(teams: PowerTeam[], trials = 8000, seed = 23): PowerResult {
    const filledOf = (t: PowerTeam) => Math.max(t.filled ?? t.lineup.length, t.lineup.length);
    const slotsOf = (t: PowerTeam) => Math.max(t.slots ?? filledOf(t), filledOf(t));
    // Measured against what the owner fielded, not against the format: a
    // team that starts eight players is fielding eight, and that is a
    // decision rather than a hole in our data.
    const enough = (t: PowerTeam) =>
        t.lineup.length > 0 && t.lineup.length >= Math.ceil(filledOf(t) * COVERAGE);
    const live = teams.filter(enough);
    const unranked: PowerGap[] = teams.filter(t => !enough(t)).map(t => ({
        key: t.key, name: t.name, priced: t.lineup.length, filled: filledOf(t),
    }));
    if (live.length < 2) return { rows: [], unranked };

    const n = live.length;
    // One seed for the whole table, so the order is reproducible between
    // loads rather than shifting under the reader on a refresh. A caller can
    // vary it to measure how much of a ranking is Monte Carlo and how much
    // is roster — which is what sets the tie threshold below.
    const rng = makeRng(seed);
    const draw = new Float64Array(n);
    const sum = new Float64Array(n);
    // wins[i * n + j] is how often i outscored j, ties counted as a half to
    // each so the two directions always sum to the trial count.
    const wins = new Float64Array(n * n);

    for (let t = 0; t < trials; t++) {
        for (let i = 0; i < n; i++) {
            draw[i] = drawLineup(live[i].lineup, rng);
            sum[i] += draw[i];
        }
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (draw[i] > draw[j]) wins[i * n + j]++;
                else if (draw[j] > draw[i]) wins[j * n + i]++;
                else { wins[i * n + j] += 0.5; wins[j * n + i] += 0.5; }
            }
        }
    }

    const against: Record<string, Record<string, number>> = {};
    const totals = new Map<string, { wins: number; games: number }>();
    const expected = new Map<string, number>();
    for (let i = 0; i < n; i++) {
        const row: Record<string, number> = {};
        let won = 0;
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const p = wins[i * n + j] / trials;
            row[live[j].key] = p;
            won += p;
        }
        against[live[i].key] = row;
        totals.set(live[i].key, { wins: won, games: n - 1 });
        expected.set(live[i].key, sum[i] / trials);
    }

    /**
     * Rank, with ties kept as ties.
     *
     * In week one every record is 0-0 and every points total is zero, so a
     * plain sort hands out first through twelfth in roster order and the luck
     * column reads "five better off than the roster" off nothing at all. Each
     * team therefore gets the span of positions its tie group covers, and a
     * group that covers the whole league carries no information and is
     * dropped.
     */
    const rankBy = <T>(xs: T[], value: (x: T) => number | null) => {
        const m = new Map<T, { first: number; last: number }>();
        const scored = xs.filter(x => value(x) != null)
            .sort((p, q) => (value(q) ?? 0) - (value(p) ?? 0));
        let i = 0;
        while (i < scored.length) {
            let j = i;
            while (j + 1 < scored.length
                && value(scored[j + 1]) === value(scored[i])) j++;
            // Everybody level: nothing to compare a strength rank against.
            if (i === 0 && j === scored.length - 1 && scored.length > 1) return m;
            for (let k = i; k <= j; k++) m.set(scored[k], { first: i + 1, last: j + 1 });
            i = j + 1;
        }
        return m;
    };
    const byPoints = rankBy(live, t => t.record?.pointsFor ?? null);
    const byRecord = rankBy(live, t => t.record
        ? t.record.wins * 2 + t.record.ties
        : null);

    /** Where a strength rank sits relative to a tie group of record ranks. */
    const gapTo = (span: { first: number; last: number } | undefined, rank: number) => {
        if (!span) return null;
        if (rank > span.last) return rank - span.last;
        if (rank < span.first) return rank - span.first;
        return 0;
    };

    const ordered = [...live].sort((a, b) =>
        (totals.get(b.key)!.wins / totals.get(b.key)!.games)
        - (totals.get(a.key)!.wins / totals.get(a.key)!.games));

    // Ranks, with anything inside the measured noise sharing one. Compared
    // against the rate that opened the group rather than against the row
    // above, so a long gentle slope does not collapse into a single tie.
    const ranks: number[] = [];
    let groupRank = 1, groupRate = Infinity;
    ordered.forEach((t, i) => {
        const rate = totals.get(t.key)!.wins / totals.get(t.key)!.games;
        if (groupRate - rate > POWER_NOISE) { groupRank = i + 1; groupRate = rate; }
        else if (!Number.isFinite(groupRate)) { groupRate = rate; }
        ranks.push(groupRank);
    });

    const rows = ordered.map((t, i) => {
        const tot = totals.get(t.key)!;
        const rank = ranks[i];
        return {
            key: t.key, name: t.name,
            winRate: tot.games ? tot.wins / tot.games : 0,
            expected: Math.round((expected.get(t.key) ?? 0) * 10) / 10,
            rank,
            tied: ranks.filter(r => r === rank).length > 1,
            pointsRank: byPoints.get(t)?.first ?? null,
            recordRank: byRecord.get(t)?.first ?? null,
            luckGap: gapTo(byRecord.get(t), rank),
            record: t.record,
            against: against[t.key],
            priced: t.lineup.length,
            filled: filledOf(t),
            slots: slotsOf(t),
        };
    });
    return { rows, unranked };
}
