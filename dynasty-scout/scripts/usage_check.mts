/**
 * The usage strip's reading of a window.
 *
 * Two hazards found in the real table, both of which would have shipped as
 * plausible-looking nonsense:
 *
 *   air_yards_share runs from -0.5 to 1.32 and wopr from -0.22 to 1.52, so
 *   neither is a share and neither may ever be rendered as a percentage.
 *
 *   the usage aggregate was pinned to `season = SEASON - 1`, which is right
 *   in September and quietly wrong by November — the same bug the points
 *   sample had already been fixed for.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (label: string, pass: boolean, extra = '') => {
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) failed++;
};

const db = new Database('dynasty_scout.db', { readonly: true });

console.log('\n== the columns are what the UI thinks they are ==');
const r = db.prepare(`SELECT
    MIN(target_share) tsMin, MAX(target_share) tsMax,
    MIN(offense_pct) snMin, MAX(offense_pct) snMax,
    MIN(air_yards_share) ayMin, MAX(air_yards_share) ayMax,
    MIN(wopr) wpMin, MAX(wopr) wpMax
  FROM nfl_player_week`).get() as Record<string, number>;
// These two are rendered as percentages, so they have to actually be shares.
ok('target_share is a share', r.tsMin >= 0 && r.tsMax <= 1,
    `${r.tsMin}..${r.tsMax}`);
ok('snap share is a share', r.snMin >= 0 && r.snMax <= 1, `${r.snMin}..${r.snMax}`);
// These two are not, which is why the strip never shows them as one.
ok('air_yards_share is NOT a share', r.ayMin < 0 || r.ayMax > 1, `${r.ayMin}..${r.ayMax}`);
ok('wopr is NOT a share', r.wpMin < 0 || r.wpMax > 1, `${r.wpMin}..${r.wpMax}`);

console.log('\n== the window is rolling, not pinned to a season ==');
const route = readFileSync('app/api/redraft/startsit/route.ts', 'utf8');
// Scoped to the usage aggregate, not the whole file. Defence-vs-position is
// pinned to last season on purpose and says why — a defence two games into a
// new year has told us nothing — so a blanket "no season pins" assertion
// fails on a decision that was correct.
const usageQuery = route.slice(route.indexOf('AVG(target_share)'));
const usageWhere = usageQuery.slice(0, usageQuery.indexOf('GROUP BY'));
ok('the usage window is rolling, not one season',
    /season >= /.test(usageWhere) && !/season = /.test(usageWhere),
    usageWhere.split('\n').find(l => l.includes('season'))?.trim() ?? '');
ok('usage travels with the logs query', /offense_pct AS snap_share/.test(route));

console.log('\n== the trend threshold ==');
// Re-stating the component's rule so a change to it has to be deliberate.
const RECENT = 3;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const dir = (series: number[], kind: 'share' | 'count') => {
    const now = mean(series.slice(-RECENT));
    const before = series.slice(0, -RECENT);
    if (before.length < 2) return 0;
    const delta = now - mean(before);
    const floor = kind === 'share' ? 0.04 : 0.8;
    return Math.abs(delta) < floor ? 0 : delta > 0 ? 1 : -1;
};
ok('a real carry collapse reads down',
    dir([18, 19, 17, 20, 18, 11, 10, 12], 'count') === -1);
ok('a one-carry wobble reads flat',
    dir([16, 17, 16, 17, 16, 17, 16, 16], 'count') === 0);
ok('a snap share collapse reads down',
    dir([0.85, 0.88, 0.84, 0.86, 0.87, 0.62, 0.58, 0.61], 'share') === -1);
ok('a two-point snap wobble reads flat',
    dir([0.75, 0.77, 0.74, 0.76, 0.75, 0.77, 0.74, 0.76], 'share') === 0);
ok('a rising role reads up',
    dir([4, 5, 6, 5, 7, 13, 14, 15], 'count') === 1);
// Too short a window must not invent a direction from two games.
ok('three games is not a trend', dir([10, 12, 11], 'count') === 0);

console.log(failed ? `\n${failed} FAILED` : '\nall usage checks passed');
process.exit(failed ? 1 : 0);
