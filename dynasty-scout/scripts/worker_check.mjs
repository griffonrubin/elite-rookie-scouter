/**
 * The season leaves the main thread — and still arrives when it cannot.
 *
 * Ranking twelve rosters over twenty thousand seasons is most of a second
 * of arithmetic, and it used to run where the page does: on Power the
 * table appeared in 458ms with a 377ms task frozen in the middle of it.
 * In a worker it is 412ms and nothing blocks at all.
 *
 * The lineup board is the same story on the page people actually open.
 * Ranking nine slots against a fifteen-man bench is 154ms, the matchup
 * another 59ms, and in the browser that was a 425ms task on every team
 * picked and a 152ms one on every bench candidate clicked — the freeze
 * landing precisely when somebody is trying things. Off the thread both
 * are zero, and the board arrives about ninety milliseconds later, which
 * is the trade and it is worth making.
 *
 * Two things to hold, and only one of them is the speed. The other is that
 * the fallback works. A worker can fail to exist — an old browser, a
 * bundler that will not take the import, a policy that blocks the
 * constructor — and neither of these is optional: a Power page with no
 * ranking is not a slower page, it is a broken one, and a Start/Sit page
 * with no board is not a page at all. So each runs twice, once with
 * `Worker` taken away, and has to give the same answer both times.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

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
        if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/))) return j(matchupsFor(F, m[1], Number(m[2])));
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

/**
 * The same two questions of the lineup board.
 *
 * Returns when the slot board is up, with the long tasks that happened
 * between picking a team and seeing it, and the board itself read as
 * text — because "it rendered" is not the assertion. The assertion is
 * that the worker and this thread rank the same nine slots the same way.
 */
async function board({ withWorker }) {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } });
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
        if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/)))
            return j(matchupsFor(F, m[1], Number(m[2])));
        if ((m = u.match(/\/league\/(\d+)$/))) return j(F.leagueDetail[m[1]] ?? null);
        return j(null);
    });
    await ctx.route('https://api.sleeper.app/**', r => r.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    if (!withWorker) {
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
        /**
         * When the page first says each of these, on its own clock.
         *
         * Polled rather than read at the end, because the thing being
         * checked is what the page says *while* it is working — and by
         * the time a driver can ask, it has stopped.
         */
        window.__said = {};
        setInterval(() => {
            try {
                const t = document.body?.innerText || '';
                /*
                 * One clock reading per tick, not one per phrase.
                 * Timestamping each check as it ran made two things that
                 * appeared in the same render a millisecond apart, purely
                 * in the order this loop happens to test them — which is
                 * enough to fail an assertion that one did not precede the
                 * other, at random, about one run in three.
                 */
                const now = Math.round(performance.now() - window.__t0);
                const at = k => { if (window.__said[k] == null) window.__said[k] = now; };
                if (/Every slot is already the one/.test(t)) at('verdict');
                if (/Working out every slot/.test(t)) at('working');
                if (/Set a lineup to see this/.test(t)) at('no-lineup');
                const h = [...document.querySelectorAll('h2,h3')].find(
                    e => /slot by slot/i.test(e.textContent || ''));
                const n = h?.closest('section')
                    ?.querySelectorAll('button[aria-expanded]').length ?? 0;
                if (n >= 9) at('rows');
            } catch { /* a page mid-render is not a finding */ }
        }, 16);
    });
    await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
    await page.getByRole('button', { name: /^find$/i }).click();
    await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().waitFor({ timeout: 25000 });
    await page.evaluate(() => {
        window.__t0 = performance.now(); window.__long = []; window.__said = {};
    });
    const t0 = Date.now();
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
    /**
     * The slot rows, and only those. `button[aria-expanded]` is not unique
     * to the board — bench and opponent rows open too — so it is scoped to
     * the section whose heading says what it is.
     */
    const slots = page.locator('section')
        .filter({ has: page.getByRole('heading', { name: /slot by slot/i }) })
        .locator('button[aria-expanded]');
    await slots.nth(8).waitFor({ timeout: 40000 });
    const ms = Date.now() - t0;
    await page.waitForTimeout(2500);
    const long = await page.evaluate(() => window.__long);
    /**
     * The board as it reads: slot, who is in it, and the call.
     *
     * Compared between the two runs rather than merely counted, because
     * the failure this is here to catch is a worker that answers — just
     * differently from the page it replaced.
     */
    const rows = await slots.evaluateAll(els => els.map(
        e => (e.textContent || '').replace(/\s+/g, ' ').trim()));
    // Then a bench candidate, which used to freeze the page every time.
    await page.evaluate(() => { window.__t0 = performance.now(); window.__long = []; });
    await slots.nth(1).click();
    await page.waitForTimeout(900);
    const cands = page.locator('section')
        .filter({ has: page.getByRole('heading', { name: /slot by slot/i }) })
        .locator('button[aria-pressed]');
    let clickLong = [];
    const n = await cands.count();
    if (n > 0) {
        await page.evaluate(() => { window.__t0 = performance.now(); window.__long = []; });
        await cands.nth(Math.min(1, n - 1)).click();
        await page.waitForTimeout(2500);
        clickLong = await page.evaluate(() => window.__long);
    }
    const picked = await page.locator('[aria-pressed="true"]').count();
    const said = await page.evaluate(() => window.__said);
    await ctx.close();
    return { ms, long, rows, clickLong, candidates: n, picked, said, errs };
}

step(3, 'the lineup board is ranked off the thread too');
const bOn = await board({ withWorker: true });
console.log(`      nine slots in ${bOn.ms}ms; long tasks: ${bOn.long.join(', ') || 'none'}`);
console.log(`      clicking a candidate: ${bOn.clickLong.join(', ') || 'none'}`);
assert('every slot is ranked', bOn.rows.length === 9, String(bOn.rows.length));
assert('the board does not block the page',
    bOn.long.reduce((s, x) => s + x, 0) < 150, `${bOn.long.reduce((s, x) => s + x, 0)}ms`);
assert('a candidate was there to click', bOn.candidates > 0, String(bOn.candidates));
assert('and clicking one previews without freezing',
    bOn.picked === 1 && bOn.clickLong.reduce((s, x) => s + x, 0) < 100,
    `${bOn.picked} selected, ${bOn.clickLong.reduce((s, x) => s + x, 0)}ms blocked`);
assert('nothing blew up', bOn.errs.length === 0, bOn.errs.join(' | '));

step('3b', 'and while it is working it says so, rather than guessing');
/**
 * The failure this exists for, which arrived with the worker and which
 * every other assertion here passed straight through.
 *
 * Moving the board off the thread opened half a second between the rows
 * landing and the ranking existing. In that gap `decisions` is empty —
 * and an empty board reads exactly like a board with nothing to change,
 * so the page announced that every slot was already the one the
 * simulation would pick, before the simulation had run. The headline did
 * the same thing the other way, telling somebody with a full legal
 * lineup to go and set one.
 *
 * Both are verdicts on work that has not happened, and neither could
 * exist before: the ranking used to be there in the same render or the
 * page had no lineup at all.
 */
console.log(`      first said at: ${JSON.stringify(bOn.said)}`);
assert('it never tells you to set a lineup you have already set',
    bOn.said['no-lineup'] == null,
    bOn.said['no-lineup'] == null ? '' : `said at ${bOn.said['no-lineup']}ms`);
assert('it says it is working while it works',
    bOn.said.working != null && bOn.said.working < (bOn.said.rows ?? Infinity),
    `working at ${bOn.said.working}, rows at ${bOn.said.rows}`);
assert('and no slot is called settled before the board exists',
    bOn.said.verdict == null || bOn.said.verdict >= (bOn.said.rows ?? 0),
    bOn.said.verdict == null ? 'never said'
        : `verdict at ${bOn.said.verdict}, rows at ${bOn.said.rows}`);

step(4, 'and without a worker it is the same board, slowly');
const bOff = await board({ withWorker: false });
console.log(`      nine slots in ${bOff.ms}ms; long tasks: ${bOff.long.join(', ') || 'none'}`);
assert('every slot is still ranked', bOff.rows.length === 9, String(bOff.rows.length));
assert('nothing blew up', bOff.errs.length === 0, bOff.errs.join(' | '));
/**
 * Slot for slot, call for call. A fallback that ranks a different lineup
 * is worse than no fallback: it means two readers on two browsers are
 * being told to start different players off the same data.
 */
const same = bOn.rows.length === bOff.rows.length
    && bOn.rows.every((r, i) => r === bOff.rows[i]);
assert('and it is the same board, slot for slot', same,
    same ? '' : bOn.rows.find((r, i) => r !== bOff.rows[i]) ?? '');

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery step passed');
process.exit(fails.length ? 1 : 0);
