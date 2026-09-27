/**
 * Five pages, one season, one number.
 *
 * Every In Season page prices its own decision in playoff odds: Power
 * prints them, Start/Sit asks what this Sunday is worth against them,
 * Team puts them at the top of the roster, and Waivers and Trades price a
 * change as the gap between two of them. The comment on `seasonOdds` says
 * why that has to be one computation rather than five — "a page saying a
 * week is worth twenty-three points beside a page saying twenty-four,
 * with nothing to tell a reader which to believe" — and nothing anywhere
 * asserted it.
 *
 * It is not a property that holds for free. The run is cached per league,
 * per week, per horizon, per scoring, and a page reaching the cache with
 * a key built even slightly differently gets its own run from its own
 * seed and quotes its own number. That is a difference of a point or two,
 * which is exactly the size that looks like a rounding artefact and is
 * in fact two different simulations.
 *
 * So this walks the pages the way a reader does — one browser, one
 * session, navigating rather than reloading, which is the case the cache
 * exists for — and holds them to the same percentage.
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

/**
 * How many times the league's own players were fetched.
 *
 * The other half of "one computation": a page that recomputed the season
 * would have had to refetch the hundred and seventy rows to do it, so a
 * second league-wide burst is the same bug seen from the network.
 */
const wide = [];
page.on('response', r => {
    const u = r.url();
    if (!u.includes('/api/redraft/startsit')) return;
    const n = (new URL(u).searchParams.get('ids') || '').split(',').length;
    if (n > 40) wide.push(n);
});

step(1, 'connect the league on Start/Sit');
await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click({ timeout: 25000 });

/** The one number, wherever this page chose to put it. */
async function odds(label) {
    const el = page.locator('[data-my-odds]').first();
    await el.waitFor({ timeout: 40000 });
    const v = Number(await el.getAttribute('data-my-odds'));
    console.log(`      ${label.padEnd(12)} ${v}%`);
    return v;
}

const seen = {};
seen['start-sit'] = await odds('Start/Sit');

step('1b', 'Start/Sit weights the same season with its own week');
/**
 * The one page that is allowed to differ, and the bound it has to
 * respect.
 *
 * "As things stand" here is not the season table's number. It is the
 * season's two conditionals — the same run, the same seed — weighted by
 * this page's own win probability for the week, which is simulated from
 * both actual lineups against this week's opponent, byes and injury
 * reports rather than taken from a round-robin rate. That is a better
 * estimate of one Sunday and it moves the answer by a point or so.
 *
 * Which is exactly the size that reads as a bug, so the bound is the
 * thing to assert rather than equality: a weighted average of the two
 * conditionals cannot fall outside them. If it ever does, the weighting
 * is wrong, and no amount of it being "a different estimate" would
 * explain it.
 */
const lose = Number(await page.locator('[data-odds-lose]').first()
    .getAttribute('data-odds-lose'));
const win = Number(await page.locator('[data-odds-win]').first()
    .getAttribute('data-odds-win'));
console.log(`      if you lose ${lose}%, if you win ${win}%, `
    + `as things stand ${seen['start-sit']}%`);
assert('as things stand lies between the two conditionals',
    seen['start-sit'] >= Math.min(lose, win) - 1
    && seen['start-sit'] <= Math.max(lose, win) + 1,
    `${seen['start-sit']} against ${lose}–${win}`);
assert('and the page says why it is not the Power page\'s number',
    /same run Power Rankings/.test(await page.locator('body').innerText()));

step(2, 'then walk to the other pages, as a reader would');
/**
 * Navigated rather than reloaded on purpose. A reload throws away the
 * module cache and every page would compute its own season — which would
 * pass this check while proving nothing about the thing it is here for.
 */
for (const [label, href] of [
    ['Power', '/in-season/power'],
    ['Team', '/in-season/team'],
    ['Start/Sit', '/redraft/start-sit'],
]) {
    await page.getByRole('link', { name: label === 'Power' ? 'Power Rankings'
        : label === 'Team' ? 'Team Analysis' : 'Start/Sit' }).first().click();
    await page.waitForURL(u => u.pathname === href, { timeout: 30000 });
    await page.waitForTimeout(1500);
    seen[label === 'Start/Sit' ? 'start-sit (again)' : label.toLowerCase()] =
        await odds(label);
}

step(3, 'and the pages that quote the season quote the same one');
const values = Object.values(seen);
assert('every page reports my playoff odds', values.length === 4
    && values.every(Number.isFinite), JSON.stringify(seen));
/**
 * Power and Team print the season table's own number and have no reason
 * to differ by anything. A point between these two is two simulations.
 */
assert('Power and Team agree to the digit', seen.power === seen.team,
    JSON.stringify(seen));
/**
 * And the same page twice in one session is the cache doing its job: a
 * second visit that recomputed would land on its own seed and its own
 * answer.
 */
assert('and Start/Sit says the same thing on the way back',
    seen['start-sit'] === seen['start-sit (again)'], JSON.stringify(seen));

step(4, 'because it was computed once');
console.log(`      league-wide fetches: ${wide.length ? wide.join(', ') : 'none'}`);
/**
 * One burst, not one per page. The league is chunked, so "one burst" is a
 * handful of requests that happen once — four pages each fetching the
 * league would be four times that, and would mean four runs behind four
 * numbers that happen to agree.
 */
assert('the league was fetched once, not once per page', wide.length <= 4,
    `${wide.length} league-wide requests`);
assert('nothing blew up', errs.length === 0, errs.join(' | '));

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery step passed');
process.exit(fails.length ? 1 : 0);
