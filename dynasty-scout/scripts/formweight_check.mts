/**
 * Whether recent games mean what the app has been telling people they mean.
 *
 * `formWeight(g) = g/(g+4)` counts *current-season* games, so in week one it
 * is zero and a player's centre is entirely a projection made in August. I
 * flagged that as a likely bug — badly wrong, I said, for anyone whose role
 * has changed — and put a warning in the UI telling readers to trust the
 * recent log over the number.
 *
 * That was an instinct, and it was wrong. Measured against two full seasons
 * the flag is backwards in one half and right in the other, and the halves
 * are different things:
 *
 *   Recent *points* are noise. A three- or five-game average predicts the
 *   next week worse than a plain season average does — inside one season and
 *   across an offseason alike. For the players the flag was most worried
 *   about, the ones whose last five games looked nothing like their season,
 *   the season average is better by two whole points of error. A hot finish
 *   is mostly variance and chasing it costs accuracy.
 *
 *   Recent *snaps* are signal. A snap share up ten points over three games
 *   predicts a man who beats his own season average by a point, where one
 *   down ten points falls nearly a point short. That is the whole premise of
 *   the waiver page, which was built on the argument that a snap count is
 *   evidence of a decision a coach made rather than a lucky Sunday — and it
 *   holds.
 *
 * So the model's curve stays, the waiver page's ranking stays, and the copy
 * that told readers to read "the usage and the log" is half wrong: the usage
 * yes, the log no.
 *
 * Reproduced here rather than written into a commit message, because a
 * finding that decides a model's behaviour should be re-runnable when the
 * data behind it changes.
 */
import { query } from '../lib/db';
import { formWeight } from '../lib/startSit';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

interface L {
    player_id: number; season: number; week: number;
    points: number; snaps: number | null;
}
const logs: L[] = await query(
    `SELECT player_id, season, week, fantasy_points_ppr AS points,
            offense_pct AS snaps
       FROM nfl_player_week
      WHERE season_type = 'REG' AND season IN (2024, 2025)
        AND fantasy_points_ppr IS NOT NULL
      ORDER BY player_id, season, week`);
const by = new Map<number, L[]>();
for (const l of logs) by.set(l.player_id, [...(by.get(l.player_id) ?? []), l]);
console.log(`${logs.length.toLocaleString()} logged games across `
    + `${by.size.toLocaleString()} players, 2024 and 2025`);

step(1, 'across an offseason, a season average beats a hot finish');
const wk1: { full: number; last5: number; actual: number; gap: number }[] = [];
for (const [, ls] of by) {
    const prev = ls.filter(l => l.season === 2024).sort((a, b) => a.week - b.week);
    const first = ls.find(l => l.season === 2025 && l.week === 1);
    if (prev.length < 10 || !first) continue;
    const pts = prev.map(l => l.points);
    wk1.push({
        full: mean(pts), last5: mean(pts.slice(-5)),
        actual: first.points, gap: Math.abs(mean(pts.slice(-5)) - mean(pts)),
    });
}
const maeOf = <T,>(rs: T[], f: (r: T) => number, a: (r: T) => number) =>
    mean(rs.map(r => Math.abs(f(r) - a(r))));
const fullMae = maeOf(wk1, r => r.full, r => r.actual);
const lastMae = maeOf(wk1, r => r.last5, r => r.actual);
console.log(`      ${wk1.length} players: season average ${fullMae.toFixed(3)} MAE, `
    + `last five ${lastMae.toFixed(3)} MAE`);
assert('there is a season to measure', wk1.length >= 150, String(wk1.length));
assert('the season average predicts week one better than the last five games',
    fullMae < lastMae, `${fullMae.toFixed(3)} vs ${lastMae.toFixed(3)}`);

// The players the original flag was about.
const moved = wk1.filter(r => r.gap >= 4);
const mFull = maeOf(moved, r => r.full, r => r.actual);
const mLast = maeOf(moved, r => r.last5, r => r.actual);
console.log(`      of those, the ${moved.length} whose last five differed most: `
    + `${mFull.toFixed(3)} vs ${mLast.toFixed(3)}`);
assert('and by more, not less, for the ones who looked like they had changed',
    mLast - mFull > lastMae - fullMae,
    `${(mLast - mFull).toFixed(2)} apart vs ${(lastMae - fullMae).toFixed(2)} overall`);

step(2, 'inside a season too');
const mid: { toDate: number; last3: number; actual: number }[] = [];
for (const [, ls] of by) {
    const s = ls.filter(l => l.season === 2025).sort((a, b) => a.week - b.week);
    if (s.length < 12) continue;
    for (let i = 6; i < s.length; i++) {
        const past = s.slice(0, i).map(l => l.points);
        mid.push({ toDate: mean(past), last3: mean(past.slice(-3)), actual: s[i].points });
    }
}
const toDate = maeOf(mid, r => r.toDate, r => r.actual);
const last3 = maeOf(mid, r => r.last3, r => r.actual);
console.log(`      ${mid.length} player-weeks: season to date ${toDate.toFixed(3)} MAE, `
    + `last three ${last3.toFixed(3)} MAE`);
assert('a short window of points is worse there as well', toDate < last3,
    `${toDate.toFixed(3)} vs ${last3.toFixed(3)}`);

step(3, 'but a short window of snaps is not noise');
const usage: { delta: number; surprise: number }[] = [];
for (const [, ls] of by) {
    const s = ls.filter(l => l.season === 2025).sort((a, b) => a.week - b.week);
    if (s.length < 12) continue;
    for (let i = 8; i < s.length; i++) {
        const past = s.slice(0, i);
        const now = past.slice(-3).map(l => l.snaps).filter((x): x is number => x != null);
        const before = past.slice(-8, -3).map(l => l.snaps).filter((x): x is number => x != null);
        if (now.length < 3 || before.length < 4) continue;
        usage.push({
            delta: mean(now) - mean(before),
            // Against the season average, which is what the model would
            // predict knowing nothing about his usage at all.
            surprise: s[i].points - mean(past.map(l => l.points)),
        });
    }
}
const band = (lo: number, hi: number) => {
    const r = usage.filter(x => x.delta >= lo && x.delta < hi);
    return { n: r.length, surprise: r.length ? mean(r.map(x => x.surprise)) : 0 };
};
const rose = band(0.10, 1);
const fell = band(-1, -0.10);
console.log(`      snaps up 10+ points  (n=${rose.n}): `
    + `${rose.surprise >= 0 ? '+' : ''}${rose.surprise.toFixed(2)} against his own average`);
console.log(`      snaps down 10+ points (n=${fell.n}): `
    + `${fell.surprise >= 0 ? '+' : ''}${fell.surprise.toFixed(2)}`);
assert('there is enough of each to say anything', rose.n >= 100 && fell.n >= 100,
    `${rose.n} up, ${fell.n} down`);
assert('a rising snap share beats the player\'s own season average',
    rose.surprise > 0, rose.surprise.toFixed(2));
assert('and a falling one falls short of it', fell.surprise < 0, fell.surprise.toFixed(2));
assert('so the two separate by a real margin', rose.surprise - fell.surprise > 1.0,
    `${(rose.surprise - fell.surprise).toFixed(2)} points apart`);

step(4, 'what the model\'s curve costs against the best fit');
const WEIGHTS = Array.from({ length: 21 }, (_, i) => i / 20);
const err = new Map<number, number[]>();
const seen = new Map<number, number>();
for (const [, ls] of by) {
    const prev = ls.filter(l => l.season === 2024);
    const season = ls.filter(l => l.season === 2025).sort((a, b) => a.week - b.week);
    if (prev.length < 8 || season.length < 8) continue;
    const prior = mean(prev.map(l => l.points));
    let sum = 0;
    for (let i = 0; i < season.length; i++) {
        const form = i > 0 ? sum / i : prior;
        const row = err.get(i) ?? WEIGHTS.map(() => 0);
        WEIGHTS.forEach((w, k) => {
            row[k] += Math.abs((w * form + (1 - w) * prior) - season[i].points);
        });
        err.set(i, row);
        seen.set(i, (seen.get(i) ?? 0) + 1);
        sum += season[i].points;
    }
}
let cost = 0, total = 0;
for (const g of [...err.keys()].sort((a, b) => a - b)) {
    const n = seen.get(g)!;
    if (n < 150 || g === 0) continue;   // g=0 is degenerate: form *is* the prior
    const row = err.get(g)!.map(e => e / n);
    const best = Math.min(...row);
    const atModel = row[Math.round(formWeight(g) * 20)];
    cost += (atModel - best) * n;
    total += n;
}
console.log(`      ${total} player-weeks, weights 0 to 1 in twentieths`);
console.log(`      the model's curve costs ${(cost / total).toFixed(4)} points of MAE `
    + 'against the best weight for each game count');
assert('the curve is within a rounding error of the best fit', cost / total < 0.15,
    `${(cost / total).toFixed(4)} points`);
// Which is the finding: not that g/(g+4) is optimal, but that the choice is
// worth about a twenty-fifth of a point and does not deserve a rewrite.
assert('so it is not the model\'s weakest link', cost / total < toDate * 0.05,
    `${(cost / total).toFixed(4)} against a ${toDate.toFixed(2)} baseline error`);

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
