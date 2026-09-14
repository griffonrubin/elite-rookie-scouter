/**
 * Whether the spread means what the page says it means.
 *
 * formweight_check measured the model's centre and found it sound. Nothing
 * has ever measured its width, and the width is what the start/sit page
 * actually sells: a floor, a ceiling, a likely range of 89.9 to 148.4, and a
 * sixty-one per cent chance of winning the week. Those are claims about a
 * distribution, and a distribution is right or wrong in a way a point
 * estimate is not — a projection that is four points off is merely
 * inaccurate, but an interval that says sixty per cent and contains the
 * answer thirty per cent of the time is lying about how much it knows.
 *
 * The claim is exact and therefore checkable. `floor` is the twentieth
 * percentile and `ceiling` the eightieth, so across enough player-weeks the
 * actual score should land between them three times in five. More
 * demanding still: the actual's position *within* the predicted distribution
 * should be spread evenly across the range. A model that is too confident
 * piles outcomes at both ends; one that hedges piles them in the middle.
 * Either is invisible in a coverage figure that happens to land on sixty.
 *
 * What is measured here is the model driven by game logs alone, because the
 * database holds no Vegas lines before this season and no historical season
 * projections. That is the half that sets the width — floor and ceiling come
 * from the player's own sample rescaled to his centre — while the lines and
 * the market move the centre. So this tests the shape claim honestly and
 * leaves the context adjustments to formweight_check and vegas_parity.
 */
import { query } from '../lib/db';
import { buildOutcome, type GameLog, type PlayerInputs } from '../lib/startSit';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

/**
 * How much history before a week is worth predicting from.
 *
 * Four, which is where the model itself starts using a player's own sample
 * for the shape rather than a prior. Below it the interval is a positional
 * assumption and testing it would be testing the assumption, which is a
 * different and less interesting question.
 */
const MIN_HISTORY = 4;

step(1, 'every week a player had four games behind him');
const rows = await query<{
    player_id: number; position: string; season: number; week: number; points: number;
}>(`SELECT w.player_id, w.position, w.season, w.week,
           w.fantasy_points_ppr AS points
      FROM nfl_player_week w
     WHERE w.season_type = 'REG' AND w.season IN (2024, 2025)
       AND w.position IN ('QB','RB','WR','TE')
     ORDER BY w.player_id, w.season, w.week`, []);

const byPlayer = new Map<number, typeof rows>();
for (const r of rows) {
    const at = byPlayer.get(r.player_id);
    if (at) at.push(r); else byPlayer.set(r.player_id, [r]);
}
console.log(`        ${rows.length.toLocaleString()} player-weeks across `
    + `${byPlayer.size} players`);

interface Case {
    position: string;
    actual: number;
    mean: number;
    floor: number;
    ceiling: number;
    /** Where the actual fell inside the predicted distribution, 0 to 1. */
    pit: number;
}

const cases: Case[] = [];
for (const [playerId, games] of byPlayer) {
    for (let i = MIN_HISTORY; i < games.length; i++) {
        const target = games[i];
        // Strictly before, which is the whole discipline of a backtest: the
        // model may know nothing the page would not have known on Saturday.
        const logs: GameLog[] = games.slice(0, i).map(g => ({
            season: g.season, week: g.week, points: g.points,
        } as GameLog));
        const inputs: PlayerInputs = {
            playerId, position: target.position,
            logs,
            seasonProjection: null,
        };
        const o = buildOutcome(inputs, target.season);
        if (!Number.isFinite(o.mean) || o.ceiling <= o.floor) continue;
        /**
         * The actual's percentile in the predicted distribution, read off the
         * two points the model publishes. Linear between them and linear in
         * the tails at the same local rate, which is crude in the extremes
         * and exact where three fifths of the mass is — and the extremes are
         * only ever used here to say "outside", never how far outside.
         */
        const span = o.ceiling - o.floor;
        const pit = target.points <= o.floor
            ? Math.max(0, 0.20 - (o.floor - target.points) / span * 0.20)
            : target.points >= o.ceiling
                ? Math.min(1, 0.80 + (target.points - o.ceiling) / span * 0.20)
                : 0.20 + (target.points - o.floor) / span * 0.60;
        cases.push({
            position: target.position, actual: target.points,
            mean: o.mean, floor: o.floor, ceiling: o.ceiling, pit,
        });
    }
}
assert('there is enough to measure', cases.length > 2000,
    `${cases.length.toLocaleString()} backtested weeks`);

step(2, 'the sixty per cent interval contains sixty per cent');
const inside = cases.filter(c => c.actual >= c.floor && c.actual <= c.ceiling);
const coverage = inside.length / cases.length;
console.log(`        floor to ceiling caught ${(coverage * 100).toFixed(1)}% `
    + `of ${cases.length.toLocaleString()} weeks; the claim is 60%`);
/**
 * Five points of slack either way. Tighter would be measuring the sample
 * rather than the model — sixty per cent of four thousand draws has a
 * standard error under one point, but a season of football is not four
 * thousand independent draws and a band that tight would flag a quiet year.
 */
assert('within five points of the claim', Math.abs(coverage - 0.60) <= 0.05,
    `${(coverage * 100).toFixed(1)}%`);

step(3, 'and it is wrong in both directions equally');
/**
 * A coverage figure hides which tail is at fault. An interval that sits too
 * low catches sixty per cent while missing high twice as often as low, which
 * is the difference between "wide enough" and "in the right place".
 */
const below = cases.filter(c => c.actual < c.floor).length;
const above = cases.filter(c => c.actual > c.ceiling).length;
console.log(`        ${(100 * below / cases.length).toFixed(1)}% fell short of the floor, `
    + `${(100 * above / cases.length).toFixed(1)}% cleared the ceiling; 20% each is the claim`);
assert('the misses are not lopsided',
    Math.abs(below - above) / cases.length < 0.08,
    `${Math.abs(100 * (below - above) / cases.length).toFixed(1)} points apart`);

step(4, 'the whole distribution, not just the two points it publishes');
/**
 * The demanding test. If the model's distribution is honest then the actual's
 * percentile within it is uniform, so every tenth of the range holds a tenth
 * of the weeks. Piling up at the ends is overconfidence; piling up in the
 * middle is hedging. Both pass a coverage check that happens to land on
 * sixty.
 *
 * Run only where the percentile means anything, which is not everywhere. A
 * floor is clamped at zero because points cannot be negative, and for a
 * fringe player the honest floor *is* zero — so a week where the floor was
 * zero and he scored zero is at or below the twentieth percentile with no
 * way to say how far. That is a tenth of every week here, and the first
 * version of this check binned them all at exactly 0.20 and then failed the
 * model for the spike it had created itself.
 */
const wellDefined = cases.filter(c => c.floor > 0.0001 && c.actual > 0.0001);
console.log(`        ${wellDefined.length.toLocaleString()} of ${cases.length.toLocaleString()} `
    + 'weeks have a percentile worth reading; the rest are a floor of zero '
    + 'against a score of zero');
const bins = new Array(10).fill(0);
for (const c of wellDefined) bins[Math.min(9, Math.floor(c.pit * 10))]++;
const expected = wellDefined.length / 10;
for (let i = 0; i < 10; i++) {
    const share = bins[i] / wellDefined.length;
    const bar = '#'.repeat(Math.round(share * 120));
    console.log(`        ${String(i * 10).padStart(3)}-${String(i * 10 + 10).padEnd(3)} `
        + `${(share * 100).toFixed(1).padStart(5)}%  ${bar}`);
}
/**
 * And this is as far as the instrument reaches, which is worth saying rather
 * than papering over — asserting more than it can measure would be the exact
 * overconfidence this file exists to correct.
 *
 * The model publishes two points, so a percentile between them is a linear
 * read of a distribution that is not linear: fantasy scoring is
 * right-skewed, the density is higher just above the floor than just under
 * the ceiling, and a straight line between the two necessarily over-fills
 * the lower bins. Below the floor it reaches further still — points stop at
 * zero, so "far below a low floor" does not exist and the bottom tenth can
 * never fill.
 *
 * Both effects are visible above and neither is a fault in the model. What
 * the histogram is good for is a gross pile-up: a tenth of the range holding
 * a quarter of the weeks would mean outcomes massing where the model called
 * them rare, and no amount of skew explains that.
 */
const interior = bins.slice(2, 8);
const interiorTotal = interior.reduce((a, b) => a + b, 0);
const worst = Math.max(...interior.map(b => b / interiorTotal));
assert('no tenth of the stated interval holds a quarter of it',
    worst < 0.25, `fullest sixth holds ${(worst * 100).toFixed(1)}%`);

/**
 * The one shape claim the two points do support. A right-skewed
 * distribution has its mass below its mean, so more than half of weeks
 * should come in under it — and how much more is a fact about football
 * rather than about the model, so it is printed with a wide band around it
 * rather than pinned.
 */
const underMean = cases.filter(c => c.actual < c.mean).length / cases.length;
console.log(`        ${(underMean * 100).toFixed(1)}% of weeks came in under the `
    + 'stated mean, which a right-skewed distribution should');
assert('the mean sits above the typical week, as a skewed one must',
    underMean > 0.50 && underMean < 0.65, `${(underMean * 100).toFixed(1)}%`);

step(5, 'by position, since one can hide inside the average');
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const at = cases.filter(c => c.position === pos);
    if (at.length < 200) continue;
    const cov = at.filter(c => c.actual >= c.floor && c.actual <= c.ceiling).length / at.length;
    const lo = at.filter(c => c.actual < c.floor).length / at.length;
    console.log(`        ${pos}  ${(cov * 100).toFixed(1)}% inside  `
        + `(${(lo * 100).toFixed(1)}% low, ${(100 * (1 - cov - lo)).toFixed(1)}% high)  `
        + `n=${at.length.toLocaleString()}`);
}
const perPos = ['QB', 'RB', 'WR', 'TE']
    .map(p => cases.filter(c => c.position === p))
    .filter(a => a.length >= 200)
    .map(a => a.filter(c => c.actual >= c.floor && c.actual <= c.ceiling).length / a.length);
assert('no position is more than eight points off the claim',
    perPos.every(c => Math.abs(c - 0.60) <= 0.08),
    perPos.map(c => `${(c * 100).toFixed(0)}%`).join(' '));

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
