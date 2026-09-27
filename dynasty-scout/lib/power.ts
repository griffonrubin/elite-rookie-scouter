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
 * How far a rooting swing has to move before it is worth printing, in
 * rate points.
 *
 * Measured, and the guess going in was half of it. Eight seeds over the
 * same twelve-team league move a single game's swing by up to 3.9 points,
 * which is far worse than the headline's own 1.5 — for a reason worth
 * stating rather than papering over. Each branch is drawn from roughly
 * half the seasons, and the thing being measured is small, so this is the
 * worst signal-to-noise of any number here.
 *
 * Which makes the floor the feature rather than a caveat on it. In a week
 * where nothing is at stake every game sits inside this, and the honest
 * report is that none of them matters — not six numbers under a point
 * arranged as though they were a ranking.
 */
export const ROOT_NOISE = 0.04;

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

/**
 * Where a roster's rate lands it by the end of the regular season.
 *
 * A win rate is the right way to rank rosters and the wrong way to talk
 * about a season. "Fifty-four per cent" is a fact about a simulated week;
 * "eight and six, and you need nine" is the thing an owner is actually
 * deciding against, and the two are the same number wearing different
 * clothes. Showing only the first is why a power table reads as trivia.
 *
 * The rate is the chance of beating an unknown opponent, which is what every
 * remaining week holds — the schedule is not modelled, so this is a team's
 * strength carried forward rather than a prediction of its fixtures. That
 * assumption is worth stating on the page and is the honest one available:
 * whose schedule is soft is exactly what a power ranking is trying not to
 * measure.
 */
export interface SeasonOutlook {
    /** Regular-season weeks still to play. */
    remaining: number;
    /** Wins already banked, where the platform reports them. */
    wonSoFar: number;
    lostSoFar: number;
    /** Expected wins from here, and the total they add to. */
    winsToCome: number;
    projectedWins: number;
    projectedLosses: number;
    /**
     * An eighty per cent band on the final win total.
     *
     * Fourteen weeks at fifty-four per cent is seven and a half wins, and it
     * is also anywhere from five to ten. A projected record printed without
     * that band invites a reader to plan around a number that a coin would
     * move two games either way, which is the opposite of what this page is
     * for.
     */
    low: number;
    high: number;
}

export function seasonOutlook(
    winRate: number,
    remaining: number,
    record?: PowerTeam['record'],
): SeasonOutlook {
    const wonSoFar = record?.wins ?? 0;
    const lostSoFar = (record?.losses ?? 0) + (record?.ties ?? 0);
    const left = Math.max(0, remaining);
    const winsToCome = winRate * left;
    // Binomial, because each remaining week is one independent game against
    // an opponent of unknown strength. 1.28 sd either side is the middle
    // eighty per cent, which is wide enough to be honest and narrow enough
    // to mean something.
    const sd = Math.sqrt(left * winRate * (1 - winRate));
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const total = wonSoFar + winsToCome;
    return {
        remaining: left,
        wonSoFar, lostSoFar,
        winsToCome: r1(winsToCome),
        projectedWins: Math.round(total),
        projectedLosses: Math.round(lostSoFar + (left - winsToCome)),
        low: Math.max(wonSoFar, Math.round(total - 1.28 * sd)),
        high: Math.min(wonSoFar + left, Math.round(total + 1.28 * sd)),
    };
}

/**
 * The question a projected record is standing in for.
 *
 * "Eight and six" is better than a win rate and it is still not the answer,
 * because eight and six makes the playoffs in one league and misses in
 * another, and the owner asking already knows which. What they want is the
 * share of seasons that end with them still playing.
 *
 * Every remaining week is played rather than assumed: the teams are shuffled
 * into pairs and each pair settled on the head-to-head rate the round robin
 * already produced. That matters more than it sounds. Carrying each team's
 * rate forward independently — a binomial per team, which is what the
 * projected record does — lets every team in the league finish 9-5, and a
 * league where everybody wins nine is not a league. Pairing conserves the
 * wins, so somebody's good season is somebody else's bad one, which is the
 * only way a finishing position means anything.
 *
 * The schedule is the league's own where the platform will give a complete
 * one, and drawn at random each trial where it will not. Those are
 * different claims and the page says which is in use, because they differ
 * by more than the caveat suggests: a random schedule is every team's
 * fixtures averaged, so it systematically understates the best and worst
 * runs home — the two cases an owner is actually asking about. Six weeks
 * against the top three rosters is not the mean schedule and no number of
 * trials makes it one.
 *
 * A partial fixture list is refused upstream rather than patched, because
 * simulating the weeks a platform happened to return and dropping the rest
 * gives a number that is specific, confident and a fraction of a season.
 */
/** One other game this week, and what its result does to your season. */
export interface RootingInterest {
    /** The two teams in the fixture. */
    home: string;
    away: string;
    /**
     * How often the home side won it, across the same seasons.
     *
     * On the page it is what turns two conditionals into a game somebody
     * can read — a swing of eight points matters differently when the
     * side you need is a coin flip than when it is a 15% shot. It is also
     * what lets a check reconcile the two branches against the headline,
     * which is the only thing that would notice a cross-tabulation
     * indexed one row out.
     */
    homeWins: number | null;
    /** Your playoff odds across the seasons where each of them won it. */
    oddsIfHome: number | null;
    oddsIfAway: number | null;
    /** The gap between those two, which is what the game is worth to you. */
    swing: number | null;
}

export interface PlayoffOdds {
    key: string;
    /** Share of simulated seasons finishing inside the cut. */
    odds: number;
    /** Median final seed, and the middle eighty per cent of them. */
    seed: number;
    seedLow: number;
    seedHigh: number;
    /** Median final win total. */
    wins: number;
    /**
     * The same odds, among only the seasons where this team won — or lost —
     * the first of its remaining weeks.
     *
     * What this Sunday is actually worth, which is the question a start/sit
     * decision is downstream of and which nothing on the page could answer.
     * Four points of playoff odds says the lineup barely matters; twenty
     * says it is the week the season turns on, and the two feel identical
     * while you are setting it.
     *
     * Read off the same run rather than re-simulated with the result forced,
     * for two reasons. It is one simulation instead of twenty-four. And it
     * cannot disagree with the headline: the odds above are these two
     * averaged by how often each happens, by construction rather than by
     * both being roughly right.
     *
     * Null for a team with no fixture that week, which in an odd league is
     * somebody every week.
     */
    oddsIfWin: number | null;
    oddsIfLose: number | null;
    /**
     * How often this team wins that week, on the round-robin rate.
     *
     * Carried so the two conditionals can be read as the arithmetic they
     * are — the headline is these two weighted by this — and so a reader
     * can tell a twenty-point swing they will probably collect from a
     * twenty-point swing they probably will not.
     *
     * Not the number the Start/Sit page shows. That one is simulated from
     * the two actual lineups against this week's opponents, lines and byes,
     * and is the better estimate of this Sunday; this one is the rate the
     * rest of this table is built on, and using anything else here would
     * make the three numbers in this row stop adding up.
     */
    winsThisWeek: number | null;
    /**
     * What every other game this week is worth to this team.
     *
     * The half of the question the conditionals above cannot reach. They
     * say what winning your own game does; they are silent on the five
     * other games being played, which is most of what a Sunday afternoon
     * is once your own is decided. A bubble team's season can turn more
     * on which of two rivals wins than on its own result, and until this
     * there was nowhere to see that.
     *
     * It costs nothing to know: the simulation already plays every fixture
     * of every trial, so this is the seasons it has already run, counted a
     * second way.
     */
    rooting: RootingInterest[];
}

export function playoffOdds(
    rows: PowerRow[],
    remaining: number,
    spots: number,
    trials = 10000,
    seed = 41,
    /**
     * The league's own fixtures for the weeks being played, as
     * `pairingTable` builds them: opponent index per team per week, -1 for
     * a team idle that week. Undefined draws the schedule at random, which
     * is what this did before any platform was asked for one.
     */
    pairs?: Int32Array | null,
): Map<string, PlayoffOdds> {
    const out = new Map<string, PlayoffOdds>();
    const n = rows.length;
    if (n < 2) return out;
    const cut = Math.max(1, Math.min(n, spots));
    // Head-to-head rates as a flat matrix, so the inner loop is arithmetic.
    const index = new Map(rows.map((r, i) => [r.key, i]));
    const beat = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
        for (const [k, p] of Object.entries(rows[i].against)) {
            const j = index.get(k);
            if (j != null) beat[i * n + j] = p;
        }
    }
    const startWins = rows.map(r => (r.record?.wins ?? 0) + (r.record?.ties ?? 0) / 2);
    /**
     * The tiebreak, which in nearly every league is points scored.
     *
     * Points already banked plus what this roster expects from the weeks
     * left. Deterministic rather than drawn, because it only has to order
     * teams that finished level and drawing it would add noise to a
     * tiebreak rather than realism to a season.
     */
    const tieBreak = rows.map(r =>
        (r.record?.pointsFor ?? 0) + r.expected * remaining);

    const rng = makeRng(seed);
    const made = new Int32Array(n);
    const seeds: number[][] = rows.map(() => []);
    const winTotals: number[][] = rows.map(() => []);
    const order = new Int32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    const wins = new Float64Array(n);
    const rank = new Int32Array(n);
    /**
     * This week's result per team, and what became of the seasons either
     * way. -1 is a team with no fixture this week.
     */
    const firstResult = new Int8Array(n);
    const wonFirst = new Int32Array(n);
    const madeAfterWin = new Int32Array(n);
    const lostFirst = new Int32Array(n);
    const madeAfterLoss = new Int32Array(n);
    /**
     * Every team's season against every team's week, as two flat matrices.
     *
     * `watched[i * n + j]` is the seasons where j won this week, and
     * `watchedMade` the ones of those where i finished inside the cut. A
     * hundred and forty-four counters for a twelve-team league, touched
     * once per team per trial — the same order of work the loop above
     * already does, which is why this can be had for nothing.
     */
    const watched = new Int32Array(n * n);
    const watchedMade = new Int32Array(n * n);

    const real = pairs != null && pairs.length >= n * remaining;
    for (let t = 0; t < trials; t++) {
        for (let i = 0; i < n; i++) wins[i] = startWins[i];
        firstResult.fill(-1);
        for (let w = 0; w < remaining; w++) {
            const first = w === 0;
            if (real) {
                // The fixture list. Each pair is settled once — the team
                // with the lower index owns the game — or a league would
                // play every week twice and hand out two wins a fixture.
                for (let a = 0; a < n; a++) {
                    const b = pairs![w * n + a];
                    if (b < 0 || b <= a) continue;
                    const aWon = rng() < beat[a * n + b];
                    if (aWon) wins[a]++; else wins[b]++;
                    if (first) {
                        firstResult[a] = aWon ? 1 : 0;
                        firstResult[b] = aWon ? 0 : 1;
                    }
                }
                continue;
            }
            // Fisher-Yates, then pair off adjacent entries. With an odd
            // number of teams the last one sits the week out, which is what
            // a bye week in a league of that shape actually is.
            for (let i = n - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
            }
            for (let p = 0; p + 1 < n; p += 2) {
                const a = order[p];
                const b = order[p + 1];
                const aWon = rng() < beat[a * n + b];
                if (aWon) wins[a]++; else wins[b]++;
                if (first) {
                    firstResult[a] = aWon ? 1 : 0;
                    firstResult[b] = aWon ? 0 : 1;
                }
            }
        }
        for (let i = 0; i < n; i++) rank[i] = i;
        const arr = Array.from(rank);
        arr.sort((a, b) => (wins[b] - wins[a]) || (tieBreak[b] - tieBreak[a]));
        for (let place = 0; place < n; place++) {
            const i = arr[place];
            seeds[i].push(place + 1);
            winTotals[i].push(wins[i]);
            const through = place < cut;
            if (through) made[i]++;
            if (firstResult[i] === 1) {
                wonFirst[i]++; if (through) madeAfterWin[i]++;
            } else if (firstResult[i] === 0) {
                lostFirst[i]++; if (through) madeAfterLoss[i]++;
            }
            // And this team's season against everybody else's week.
            for (let j = 0; j < n; j++) {
                if (firstResult[j] !== 1) continue;
                watched[i * n + j]++;
                if (through) watchedMade[i * n + j]++;
            }
        }
    }

    const at = (xs: number[], q: number) =>
        xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1,
            Math.max(0, Math.floor(q * xs.length)))];
    /**
     * A conditional rate needs enough seasons under it to be a rate.
     *
     * A team that wins this week in nineteen trials out of ten thousand has
     * a conditional number and not an estimate, and printing it beside a
     * headline the reader trusts is worse than printing nothing.
     */
    const MIN_CONDITIONAL = 200;
    const share = (made_: number, of: number) =>
        of >= MIN_CONDITIONAL ? made_ / of : null;
    /**
     * This week's fixtures, settled once each.
     *
     * Read off the first week of the pairing table rather than rebuilt, so
     * the games listed are the games simulated. Without a real fixture
     * list the weeks were drawn at random and there is no such thing as
     * "this week's games" to root for, so the list is empty and the page
     * says why rather than inventing six matchups.
     */
    const fixtures: [number, number][] = [];
    if (real && remaining > 0) {
        for (let a = 0; a < n; a++) {
            const b = pairs![a];
            if (b >= 0 && b > a) fixtures.push([a, b]);
        }
    }

    for (let i = 0; i < n; i++) {
        const rooting: RootingInterest[] = fixtures.map(([a, bIdx]) => {
            // The seasons where the home side won, and where it did not,
            // which is the same thing as the away side winning: one game,
            // two branches, and every trial in exactly one of them.
            const homeWon = watched[i * n + a];
            const awayWon = watched[i * n + bIdx];
            const oddsIfHome = share(watchedMade[i * n + a], homeWon);
            const oddsIfAway = share(watchedMade[i * n + bIdx], awayWon);
            return {
                home: rows[a].key, away: rows[bIdx].key,
                homeWins: homeWon + awayWon > 0
                    ? homeWon / (homeWon + awayWon) : null,
                oddsIfHome, oddsIfAway,
                swing: oddsIfHome == null || oddsIfAway == null
                    ? null : oddsIfHome - oddsIfAway,
            };
        });
        out.set(rows[i].key, {
            key: rows[i].key,
            rooting,
            odds: made[i] / trials,
            seed: at(seeds[i], 0.5),
            seedLow: at(seeds[i], 0.1),
            seedHigh: at(seeds[i], 0.9),
            wins: at(winTotals[i], 0.5),
            oddsIfWin: share(madeAfterWin[i], wonFirst[i]),
            oddsIfLose: share(madeAfterLoss[i], lostFirst[i]),
            winsThisWeek: wonFirst[i] + lostFirst[i] > 0
                ? wonFirst[i] / (wonFirst[i] + lostFirst[i])
                : null,
        });
    }
    return out;
}
