/**
 * How long the page makes you wait, and what it is doing.
 *
 * "It feels slow" has a cause and a budget. This drives the real flow
 * against the real roster and reports the wall clock from picking a team to
 * the board appearing, split into main-thread blocking and time in requests
 * — the two want opposite fixes, and guessing which one it is has been wrong
 * every time so far.
 *
 * Where it went, the last time this was looked at:
 *   5430ms across three long tasks. rankSwaps simulated every bench-and-
 *   starter pair to answer a question the slot board had already answered,
 *   79% of the compute; and one whole pass ran against empty data before the
 *   fetch landed, rendering a board from nothing. 839ms in one task.
 *
 * The headline is the board's own clock, not the driver's. Playwright
 * cannot observe the DOM while the main thread is busy, so a long task
 * *after* the board renders still shows up in its wall clock — which once
 * had this reporting 857ms for a board the page had put up at 367ms. The
 * in-page mark is what somebody actually waited; the wall clock is kept
 * beside it, because the gap between the two is main-thread blocking and
 * that is worth seeing.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });

await ctx.route('**/api/sleeper/**', route => {
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
page.setDefaultTimeout(25000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

/**
 * The slot rows, and only those.
 *
 * `button[aria-expanded]` used to be unique to the slot board. Bench and
 * opponent rows open now too, so the bare selector silently started counting
 * fifteen extra rows as lineup slots — a test that would have kept passing
 * had it asserted anything looser than an exact shape.
 */
const slotRows = () => page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /slot by slot/i }) })
    .locator('button[aria-expanded]');

await page.addInitScript(() => {
    window.__t0 = 0;
    window.__long = [];
    new PerformanceObserver(l => {
        for (const e of l.getEntries()) window.__long.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
    // When the ninth slot row is in the DOM, on the page's own clock.
    // Polled rather than observed: a MutationObserver fires inside the
    // long task that is the thing being measured.
    window.__board = null;
    setInterval(() => {
        if (window.__board == null
            && document.querySelectorAll('section button[aria-expanded]').length >= 9) {
            window.__board = Math.round(performance.now() - window.__t0);
        }
    }, 16);
    window.__api = [];
    const of = window.fetch;
    window.fetch = async (...a) => {
        const u = String(a[0]); const t = performance.now();
        const r = await of(...a);
        if (u.includes('/api/')) window.__api.push(
            { u: u.replace(/^.*\/api/, '/api').slice(0, 52), ms: Math.round(performance.now() - t) });
        return r;
    };
});
await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().click();
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().waitFor({ timeout: 20000 });
await page.evaluate(() => {
    window.__t0 = performance.now(); window.__long = []; window.__api = []; window.__board = null;
});
const t3 = Date.now();
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
await page.locator('section').filter({ has: page.getByRole('heading', { name: /slot by slot/i }) })
    .locator('button[aria-expanded]').nth(8).waitFor({ timeout: 40000 });
const wall = Date.now() - t3;
// Long enough to catch what runs *after* the board, which is the whole
// point of putting it there: the league-wide simulation is a second of
// main-thread blocking and a report that stopped before it would say the
// page cost a third of what it does.
await page.waitForTimeout(3000);
const r = await page.evaluate(() => (
    { long: window.__long, api: window.__api, board: window.__board }));
console.log(`\n      team -> board, on the page's clock: ${r.board ?? '?'} ms`);
console.log(`      wall clock as the driver saw it: ${wall} ms`);
console.log(`      long tasks (>50ms): ${r.long.join(', ')}`);
console.log(`      blocked on main thread: ${r.long.reduce((s, x) => s + x, 0)} ms in ${r.long.length} tasks`);
console.log('      api calls:');
for (const c of r.api) console.log(`        ${String(c.ms).padStart(5)} ms  ${c.u}`);
console.log(`      unaccounted: ${wall - r.long.reduce((s,x)=>s+x,0) - r.api.reduce((s,c)=>s+c.ms,0)} ms`);

// A ceiling rather than a stopwatch: the exact figure moves with the
// machine, but a second is the point at which somebody stops believing the
// click registered, and the board has no excuse for taking one — it renders
// off two rosters this page fetched for itself. Everything league-wide
// comes after.
const BUDGET_MS = 1000;
const seen = r.board ?? wall;
if (seen > BUDGET_MS) {
    console.log(`\n      OVER BUDGET — ${seen}ms against ${BUDGET_MS}ms`);
    await b.close();
    process.exit(1);
}
console.log(`      within the ${BUDGET_MS}ms budget`);
await b.close();
