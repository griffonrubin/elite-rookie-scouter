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
    // Every roster's own lineup. The matchup fixture carries three of them,
    // and a team with no starters has no matchup for the page to simulate —
    // which silently removed the half of Start/Sit this check is about.
    const starters = new Map(F.rosters[LEAGUE_ID].map(r => [r.roster_id, r]));
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
/** Ids asked for with the full box score, so a re-fetch is visible. */
let detailCalls = [];
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
page.on('request', r => {
    const u = r.url();
    if (!u.includes('/api/redraft/startsit')) return;
    const q = new URL(u).searchParams;
    if (q.get('detail') === '1') {
        detailCalls.push((q.get('ids') ?? '').split(',').filter(Boolean).length);
    }
});
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

/**
 * There was an assertion here that a page which never mentions a schedule
 * must not pay for one. It was made of Start/Sit, then of the Waiver Wire,
 * then of Team Analysis, and each move was because that page had
 * legitimately begun reading a fixture list. Team Analysis now reads one
 * too — it shows your own season at the top — so the claim has no page
 * left that it is true of, and moving it a fourth time would be looking
 * for somewhere it still passes rather than for something worth
 * asserting.
 *
 * Deleted rather than moved, as the last move said it should be. What
 * survives is the invariant that actually protects the reader: the
 * schedule is bought once a session, however many pages want it — asserted
 * below, twice, from two different directions.
 */
step(1, 'the season is bought once, on whichever page is opened first');
await page.goto(`${BASE}/in-season/team`, { waitUntil: 'domcontentloaded' });
await connect();
await page.waitForTimeout(12000);
const firstPage = [...new Set(weekCalls)].sort((a, b) => a - b);
const times = new Map();
for (const w of weekCalls) times.set(w, (times.get(w) ?? 0) + 1);
assert('every regular-season week is read',
    firstPage.length === PLAYOFFS - 1
    && firstPage[0] === 1 && firstPage[firstPage.length - 1] === PLAYOFFS - 1,
    `weeks ${firstPage[0]}–${firstPage[firstPage.length - 1]}, `
    + `${firstPage.length} of ${PLAYOFFS - 1}`);
/**
 * Once each, except this week.
 *
 * The snapshot asks for the current week on its own — it needs this
 * week's opponent whether or not anything wants a fixture list — so week
 * eight is fetched twice and every other week once. Asserting a flat
 * count of fourteen fails on that overlap, which is legitimate; what is
 * worth catching is a second pass over the whole season, and that shows
 * up as a week other than this one being asked for twice.
 */
const repeated = [...times.entries()].filter(([w, n]) => n > 1 && w !== WEEK);
assert('and no week is read twice, bar the one the snapshot needs anyway',
    repeated.length === 0 && (times.get(WEEK) ?? 0) <= 2,
    repeated.length
        ? `weeks ${repeated.map(([w, n]) => `${w}×${n}`).join(', ')} repeated`
        : `${weekCalls.length} calls, week ${WEEK} twice`);
assert('and no playoff week is', !firstPage.some(w => w >= PLAYOFFS));

step(2, 'and Start/Sit, which reads one too, does not buy it again');
weekCalls = [];
await page.getByRole('link', { name: 'Start/Sit' }).first().click();
await page.waitForTimeout(12000);
assert('nothing is refetched', weekCalls.length === 0, `${weekCalls.length} calls`);

step('2b', 'and it says what the week is worth');
/**
 * The three numbers have to be a set: what you are if you win, what you
 * are if you lose, and where you actually stand — which must sit between
 * them, because it is those two weighted by a probability.
 */
await page.getByText(/is worth/i).first().waitFor({ timeout: 40000 });
const stakes = await page.locator('body').innerText();
const num = (re) => {
    const m = stakes.match(re);
    return m ? Number(m[1]) : NaN;
};
const ifWin = num(/If you win\s*\n?\s*(\d+)%/i);
const ifLose = num(/If you lose\s*\n?\s*(\d+)%/i);
const stand = num(/As things stand[^\n]*\n?\s*(\d+)%/i);
const worth = num(/is worth\s*\n?\s*(\d+) pts of playoff odds/i);
console.log(`      win ${ifWin}% · lose ${ifLose}% · now ${stand}% · worth ${worth}`);
assert('winning is better than losing', ifWin > ifLose, `${ifWin} vs ${ifLose}`);
assert('where you stand is between the two',
    stand >= ifLose && stand <= ifWin, `${ifLose} ≤ ${stand} ≤ ${ifWin}`);
assert('and the stake is the gap between them',
    Math.abs(worth - (ifWin - ifLose)) <= 1,
    `${worth} against ${ifWin - ifLose}`);

step('2c', 'the detailed rows survive the league-wide fetch');
/**
 * Two fetches race on this page: its own two rosters with full box scores,
 * and — behind the season odds — every roster in the league without them.
 * Both start from an empty cache and overlap on every player the page is
 * about, so whichever lands second wins, and a slim reply arriving late
 * strips the box scores out from under a page that has already drawn them.
 *
 * Asserted through the cache rather than through the DOM, which is the
 * only reliable signal here: if the detailed rows were downgraded, coming
 * back to this page has to buy them again, and that second request is
 * visible. A DOM assertion on the box score passed against the bug,
 * because the columns are drawn from the position rather than from the
 * data and appear either way.
 */
const detailBefore = detailCalls.length;
await page.getByRole('link', { name: 'Waiver Wire' }).first().click();
await page.waitForTimeout(5000);
await page.getByRole('link', { name: 'Start/Sit' }).first().click();
await page.getByText(/is worth/i).first().waitFor({ timeout: 40000 });
await page.waitForTimeout(3000);
assert('coming back does not have to buy them again',
    detailCalls.length === detailBefore,
    detailCalls.length === detailBefore
        ? `${detailBefore} detailed requests, none repeated`
        : `${detailCalls.length - detailBefore} re-fetched — a slim reply `
          + 'overwrote the detailed rows');

step('2d', 'every other page reuses what Start/Sit already bought');
weekCalls = [];
await page.getByRole('link', { name: 'Power Rankings' }).first().click();
await page.waitForTimeout(9000);
const got = [...new Set(weekCalls)].sort((a, b) => a - b);
assert('the schedule is not bought twice', got.length === 0,
    `${weekCalls.length} refetched`);

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

step(4, 'and a round trip does not buy it a third time');
weekCalls = [];
await page.getByRole('link', { name: 'Team Analysis' }).first().click();
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
