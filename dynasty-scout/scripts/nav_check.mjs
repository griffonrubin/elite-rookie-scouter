/**
 * What it costs to walk around the In Season section.
 *
 * Every page in it asks about the same league in the same week, and each one
 * used to ask from scratch: five requests to Sleeper on every mount plus a
 * re-download of the same hundred and seventy players. Four navigations came
 * to twenty Sleeper calls and two thirds of a megabyte, all of it answers
 * the browser already had, and the reader watched a spinner for each one.
 *
 * So this measures the section rather than a page. It is the only check that
 * can catch a cache that has stopped caching — every per-page suite passes
 * either way, because a page that refetches everything is still correct.
 *
 * And it pins the other half of a cache, which is that the reload button has
 * to actually reload. A cache nobody can clear is a bug with better latency.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Den Fantasy Football League 1';

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } });

let sleeperCalls = 0;
await ctx.route('**/api/sleeper/**', route => {
    sleeperCalls++;
    const u = new URL(route.request().url()).pathname.replace('/api/sleeper', '');
    const j = o => route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(o) });
    if (u.includes('/state/nfl')) return j({ week: 1, display_week: 1 });
    if (/\/user\/[^/]+\/leagues/.test(u)) return j(F.leagues);
    if (/\/user\/txmossad$/.test(u)) return j(F.user);
    if (/\/user\/[^/]+$/.test(u)) return route.fulfill({ status: 404, body: 'null' });
    let m;
    if ((m = u.match(/\/league\/(\d+)\/rosters/))) return j(F.rosters[m[1]] ?? []);
    if ((m = u.match(/\/league\/(\d+)\/users/))) return j(F.users[m[1]] ?? []);
    if ((m = u.match(/\/league\/(\d+)\/matchups\//))) return j(F.matchups[m[1]] ?? []);
    if ((m = u.match(/\/league\/(\d+)$/))) return j(F.leagueDetail[m[1]] ?? null);
    return j(null);
});
await ctx.route('https://api.sleeper.app/**', r => r.abort());

const page = await ctx.newPage();
page.setDefaultTimeout(40000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
let ssCalls = 0, ssBytes = 0;
page.on('response', async r => {
    if (!r.url().includes('/api/redraft/startsit')) return;
    ssCalls++;
    try { ssBytes += (await r.body()).length; } catch { /* body already gone */ }
});

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const PAGES = [
    ['Power Rankings', /every roster against every other/i],
    ['Trade Analyzer', /Pick a player from either|what it does to each side/i],
    ['Team Analysis',  /what each starter is holding up/i],
    ['Waiver Wire',    /Out of \d+ free agents/i],
    ['Start\\/Sit',     /slot by slot/i],
];

step(1, 'connect once');
await page.goto(`${BASE}/in-season/power`, { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 30000 });
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click({ timeout: 30000 });
await page.getByRole('heading', { name: /every roster against every other/i })
    .waitFor({ timeout: 40000 });
console.log(`      connected after ${sleeperCalls} Sleeper calls, `
    + `${(ssBytes / 1024).toFixed(0)}KB of player data`);
assert('connecting costs something', sleeperCalls > 0 && ssBytes > 0,
    `${sleeperCalls} calls, ${(ssBytes / 1024).toFixed(0)}KB`);

step(2, 'now walk the whole section');
sleeperCalls = 0; ssCalls = 0; ssBytes = 0;
for (const [label, ready] of PAGES) {
    const before = { s: sleeperCalls, c: ssCalls, b: ssBytes };
    const t0 = Date.now();
    await page.getByRole('link', { name: new RegExp(`^${label}$`) }).click();
    await page.getByText(ready).first().waitFor({ timeout: 40000 });
    console.log(`      ${label.replace('\\', '').padEnd(16)} ${String(Date.now() - t0).padStart(5)}ms  `
        + `${sleeperCalls - before.s} sleeper, ${ssCalls - before.c} startsit, `
        + `${((ssBytes - before.b) / 1024).toFixed(0)}KB`);
}
// A page renders its heading before its fetch settles, so counting at the
// moment the text appears undercounts the last navigation. Let the network
// go quiet first, or this check reports a cache that is better than it is.
await page.waitForTimeout(3500);
console.log(`      ${PAGES.length} navigations: ${sleeperCalls} Sleeper calls, `
    + `${ssCalls} startsit calls, ${(ssBytes / 1024).toFixed(0)}KB`);
// The league does not change between two clicks of a nav bar.
assert('the league is not refetched on every page', sleeperCalls === 0,
    `${sleeperCalls} calls`);
// Team Analysis wants every rostered player where Power wanted the
// starters, and Start/Sit wants box scores nobody else asked for — so two
// top-ups are expected across five pages. Five would mean no cache at all.
assert('players are fetched once, not once per page', ssCalls <= 3,
    `${ssCalls} requests`);
assert('and the section costs well under a megabyte to walk',
    ssBytes < 400 * 1024, `${(ssBytes / 1024).toFixed(0)}KB`);

step(3, 'a cache nobody can clear is a bug with better latency');
sleeperCalls = 0; ssCalls = 0;
await page.locator('button[title="Reload the lineup"]').first().click();
await page.waitForTimeout(4000);
console.log(`      after reload: ${sleeperCalls} sleeper calls, ${ssCalls} startsit calls`);
assert('reload really reloads the league', sleeperCalls > 0, `${sleeperCalls} calls`);
assert('and the player data with it', ssCalls > 0, `${ssCalls} calls`);
await page.getByText(/slot by slot/i).first().waitFor({ timeout: 40000 });
assert('the page still renders after a reload', true);

step(4, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
