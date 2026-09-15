/**
 * The fixture list, end to end, and what it costs the pages that do not
 * want one.
 *
 * Sleeper publishes no schedule endpoint, so reading a league's fixtures
 * means one request per week — fourteen of them. That is a fair price for
 * the page that ranks a run home and an absurd one for the four pages that
 * never mention a schedule, and the first version of this charged all of
 * them: Start/Sit, Waivers and Team Analysis each waited on fourteen
 * requests none of them reads, because the fetch sat inside the league
 * snapshot every page shares.
 *
 * That is invisible in a diff, invisible in a type error, and invisible in
 * a screenshot. The only thing that catches it is counting the requests a
 * page makes, so that is what this does — on the page that should make
 * none, and then on the page that should make them all.
 *
 * It also drives the two panels the fixtures are for. A league is mocked
 * at week eight with seven weeks of real scores behind it and seven weeks
 * of fixtures ahead, which is the only state in which both panels have
 * anything to say.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const F = JSON.parse(fs.readFileSync(
    new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE_ID = '1388633751839309824';
const LEAGUE = 'Den Fantasy Football League 1';
const WEEK = 8, PLAYOFFS = 15;

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

/**
 * A full round robin for the twelve rosters, circle method, so every week
 * pairs everybody exactly once — which is the condition the app refuses to
 * simulate without.
 */
const IDS = F.rosters[LEAGUE_ID].map(r => r.roster_id);
const STRENGTH = Object.fromEntries(IDS.map((id, i) => [id, 132 - i * 2.6]));
let seed = 11;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const schedule = {};
{
    const ring = IDS.slice();
    for (let w = 1; w < PLAYOFFS; w++) {
        schedule[w] = [];
        for (let i = 0; i < ring.length / 2; i++) {
            schedule[w].push([ring[i], ring[ring.length - 1 - i]]);
        }
        ring.splice(1, 0, ring.pop());
    }
}
/** Sleeper's shape: one row per roster, two rows sharing a matchup_id. */
function matchupsFor(week) {
    const starters = new Map(
        (F.matchups[LEAGUE_ID] ?? []).map(m => [m.roster_id, m]));
    const rows = [];
    schedule[week].forEach(([a, b], i) => {
        for (const id of [a, b]) {
            const src = starters.get(id);
            rows.push({
                roster_id: id,
                matchup_id: i + 1,
                starters: src?.starters ?? null,
                players: src?.players ?? null,
                // Scores only for weeks that have been played. A week
                // ahead reads nil, which the all-play maths must skip
                // rather than count as a goalless draw.
                points: week < WEEK
                    ? Math.round((STRENGTH[id] + (rand() - 0.5) * 44) * 100) / 100
                    : 0,
            });
        }
    });
    return rows;
}

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });

let weekCalls = [];
await ctx.route('**/api/sleeper/**', route => {
    const u = new URL(route.request().url()).pathname.replace('/api/sleeper', '');
    const j = o => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/state/nfl')) return j({ week: WEEK, display_week: WEEK });
    if (/\/user\/[^/]+\/leagues/.test(u)) return j(F.leagues);
    if (/\/user\/txmossad$/.test(u)) return j(F.user);
    if (/\/user\/[^/]+$/.test(u)) return route.fulfill({ status: 404, body: 'null' });
    let m;
    if ((m = u.match(/\/league\/(\d+)\/rosters/))) return j(F.rosters[m[1]] ?? []);
    if ((m = u.match(/\/league\/(\d+)\/users/))) return j(F.users[m[1]] ?? []);
    if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/))) {
        weekCalls.push(Number(m[2]));
        return j(m[1] === LEAGUE_ID ? matchupsFor(Number(m[2])) : []);
    }
    if ((m = u.match(/\/league\/(\d+)$/))) {
        const d = F.leagueDetail[m[1]];
        return j(d ? { ...d, settings: { ...d.settings, playoff_week_start: PLAYOFFS } } : null);
    }
    return j(null);
});
await ctx.route('https://api.sleeper.app/**', r => r.abort());

const page = await ctx.newPage();
page.setDefaultTimeout(40000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
if (process.env.DEBUG_FX) {
    page.on('response', r => {
        if (r.status() >= 400) console.log('      HTTP', r.status(), r.url().slice(-70));
    });
}

/**
 * Type the username, and keep typing until React has it.
 *
 * A fill that lands before hydration sets the DOM value and dispatches an
 * input event at nothing; React then hydrates and resets the field to its
 * own empty state, leaving Find disabled and the failure reading as a
 * missing button. Waiting a fixed two seconds is the same bet with better
 * odds, so this waits on the thing it actually needs — the button becoming
 * enabled — and types again if it has not.
 */
async function connect() {
    const find = page.getByRole('button', { name: /^find$/i });
    for (let i = 0; i < 8; i++) {
        try {
            await page.getByPlaceholder(/sleeper username/i)
                .fill('txmossad', { timeout: 8000 });
        } catch {
            // Not hydrated yet, or the field is not there at all — which on
            // a stale build is what a missing chunk looks like from here.
            console.log(`      attempt ${i}: no field yet`,
                errs.length ? `— ${errs[0].slice(0, 90)}` : '');
            await page.waitForTimeout(1500);
            continue;
        }
        try {
            await find.waitFor({ state: 'attached', timeout: 2000 });
            if (await find.isEnabled()) break;
        } catch { /* not hydrated yet */ }
        await page.waitForTimeout(1000);
    }
    await find.click();
    await page.getByRole('button', { name: new RegExp(LEAGUE) }).first()
        .click({ timeout: 30000 });
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first()
        .click({ timeout: 30000 });
}

step(1, 'Start/Sit asks for this week and no other');
await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
await connect();
await page.waitForTimeout(4000);
const beforeNav = weekCalls.slice();
assert('only the current week is fetched',
    beforeNav.length > 0 && beforeNav.every(w => w === WEEK),
    `weeks ${[...new Set(beforeNav)].join(',')} over ${beforeNav.length} calls`);

step(2, 'Power Rankings asks for the whole regular season');
weekCalls = [];
await page.getByRole('link', { name: 'Power Rankings' }).first().click();
await page.waitForTimeout(9000);
const got = [...new Set(weekCalls)].sort((a, b) => a - b);
assert('every regular-season week is read',
    got.length === PLAYOFFS - 1 && got[0] === 1 && got[got.length - 1] === PLAYOFFS - 1,
    `weeks ${got[0]}–${got[got.length - 1]}, ${got.length} of ${PLAYOFFS - 1}`);
assert('and no playoff week is', !got.some(w => w >= PLAYOFFS));

step(3, 'both panels are on the page, with something to say');
await page.getByRole('heading', { name: /earned, or not/i }).waitFor({ timeout: 30000 });
await page.getByRole('heading', { name: /the run home/i }).waitFor({ timeout: 30000 });
const body = await page.locator('body').innerText();
assert('the all-play panel names its window', /over 7 weeks/i.test(body),
    (body.match(/over \d+ weeks?/i) || [])[0]);
assert('the odds say they played the real fixtures',
    /your league.s own fixtures/i.test(body));
assert('and do not claim a random schedule', !/drawn at random instead/i.test(body));

const cells = await page.locator('li span[title^="Week"]').count();
assert('the strip is one cell per team per remaining week', cells === 12 * 7,
    `${cells} cells`);
const labels = await page.locator('li span[title^="Week"]').evaluateAll(
    els => [...new Set(els.map(e => e.textContent.trim()))]);
assert('every team has its own label', labels.length === 12, labels.join(' '));

step(4, 'a second visit does not buy the schedule twice');
weekCalls = [];
await page.getByRole('link', { name: 'Waiver Wire' }).first().click();
await page.waitForTimeout(3000);
await page.getByRole('link', { name: 'Power Rankings' }).first().click();
await page.getByRole('heading', { name: /the run home/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);
assert('the fixtures are cached for the session', weekCalls.length === 0,
    `${weekCalls.length} refetched`);

step(5, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert('no horizontal overflow', over <= 1, `${over}px`);
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const overPhone = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert('nor at phone width', overPhone <= 1, `${overPhone}px`);
if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/power-phone.png`, fullPage: true });
    await page.setViewportSize({ width: 1400, height: 1100 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${process.env.SHOT_DIR}/power-wide.png`, fullPage: true });
}

await browser.close();
console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
