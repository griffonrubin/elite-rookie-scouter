/**
 * The season leaves the main thread — and still arrives when it cannot.
 *
 * Ranking twelve rosters over twenty thousand seasons is most of a second
 * of arithmetic, and it used to run where the page does: on Power the
 * table appeared in 458ms with a 377ms task frozen in the middle of it.
 * In a worker it is 412ms and nothing blocks at all.
 *
 * Two things to hold, and only one of them is the speed. The other is that
 * the fallback works. A worker can fail to exist — an old browser, a
 * bundler that will not take the import, a policy that blocks the
 * constructor — and the season is not optional: a Power page with no
 * ranking is not a slower page, it is a broken one. So this runs the page
 * twice, once with `Worker` taken away, and insists on the same table both
 * times.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Den Fantasy Football League 1';

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/**
 * One run of the page, with or without a worker to run the season in.
 *
 * Returns when the ranking is up, with the long tasks that happened
 * between picking a team and seeing it — which is the window the season
 * used to block.
 */
async function run({ withWorker }) {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } });
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
    page.setDefaultTimeout(30000);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));

    if (!withWorker) {
        // Taken away before any of the app's code runs, which is the state
        // a browser without one presents.
        await page.addInitScript(() => {
            Object.defineProperty(window, 'Worker', { value: undefined, configurable: true });
        });
    }
    await page.addInitScript(() => {
        window.__t0 = 0;
        window.__long = [];
        new PerformanceObserver(l => {
            for (const e of l.getEntries()) {
                if (e.startTime >= window.__t0) window.__long.push(Math.round(e.duration));
            }
        }).observe({ entryTypes: ['longtask'] });
    });

    await page.goto(`${BASE}/in-season/power`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
    await page.getByRole('button', { name: /^find$/i }).click();
    await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().waitFor({ timeout: 25000 });
    await page.evaluate(() => { window.__t0 = performance.now(); window.__long = []; });

    const rows = page.locator('section')
        .filter({ has: page.getByRole('heading', { name: /every roster against every other/i }) })
        .locator('> ul > li > button[aria-expanded]');
    const t0 = Date.now();
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
    await rows.nth(11).waitFor({ timeout: 40000 });
    const ms = Date.now() - t0;
    await page.waitForTimeout(1500);
    const long = await page.evaluate(() => window.__long);
    const odds = await page.locator('body').innerText();
    const count = await rows.count();
    /**
     * The ranking as the page renders it: place and team, in order.
     *
     * Read off the rows rather than scraped out of the body text, which
     * is how an assertion ends up comparing two lists of stray digits and
     * passing because they happen to match.
     */
    const order = await rows.evaluateAll(els => els.map(e => {
        const kids = [...e.children];
        return `${kids[0]?.textContent?.trim() ?? '?'} ${
            kids[1]?.querySelector('span')?.textContent?.trim() ?? '?'}`;
    }));
    await ctx.close();
    return { ms, long, count, odds, order, errs };
}

step(1, 'with a worker, the league is ranked and nothing blocks');
const on = await run({ withWorker: true });
console.log(`      twelve rows in ${on.ms}ms; long tasks: ${on.long.join(', ') || 'none'}`);
assert('every team is ranked', on.count === 12, String(on.count));
assert('the odds are on the page', /% to make the playoffs|playoff odds|chance of/i.test(on.odds));
/**
 * A ceiling rather than a stopwatch. The season is the largest single
 * computation this app does and it is the one thing that must not run
 * here; anything above a dropped frame or two means it came back.
 */
assert('the main thread is not blocked by it',
    on.long.reduce((s, x) => s + x, 0) < 150, `${on.long.reduce((s, x) => s + x, 0)}ms`);
assert('nothing blew up', on.errs.length === 0, on.errs.join(' | '));

step(2, 'without one, the same league is ranked anyway');
const off = await run({ withWorker: false });
console.log(`      twelve rows in ${off.ms}ms; long tasks: ${off.long.join(', ') || 'none'}`);
assert('every team is still ranked', off.count === 12, String(off.count));
assert('the odds are still on the page',
    /% to make the playoffs|playoff odds|chance of/i.test(off.odds));
assert('nothing blew up', off.errs.length === 0, off.errs.join(' | '));
/**
 * The fallback is allowed to be slow — it is the old behaviour — but it
 * has to be the same answer. A league ranked one way here and another way
 * there is worse than either.
 */
console.log('      ' + on.order.join(' | '));
assert('and it is the same ranking, team for team',
    on.order.length === 12 && on.order.join('|') === off.order.join('|'),
    on.order.join('|') === off.order.join('|') ? '' : off.order.join(' | '));

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery step passed');
process.exit(fails.length ? 1 : 0);
