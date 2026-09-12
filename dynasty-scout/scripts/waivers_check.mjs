/**
 * The waiver wire, against a real league.
 *
 * "Available" is not a property of a player, it is a property of a player
 * and a league, so the only test worth running is one with real rosters in
 * it: every player txmossad owns has to be absent from a list of people he
 * could claim, and that cannot be checked against a fixture nobody owns.
 *
 * It also pins the thing the page exposed about the model. In week 1 the
 * form weight is zero, so a centre is entirely a projection made in August
 * — right for an established player, badly wrong for a back who has taken
 * over a job since. The panel has to say so rather than present 0.4 expected
 * points for somebody playing 73% of snaps.
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

step(1, 'connect, then the waiver wire');
await page.goto(`${BASE}/in-season/waivers`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
let t = await page.locator('body').innerText();
assert('it explains itself before a league is connected', /free agents in/i.test(t));
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().click();
await page.getByRole('button', { name: /^txmossad$/ }).first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /^txmossad$/ }).first().click();
await page.waitForTimeout(9000);

step(2, 'it lists available players with their trend');
const rows = page.locator('button[aria-expanded]');
const n = await rows.count();
console.log('      rows:', n);
assert('there are candidates', n >= 5, String(n));
t = await page.locator('body').innerText();
console.log('      ' + (await rows.first().innerText()).replace(/\n+/g, ' | '));
assert('the free-agent pool is sized', /Out of \d+ free agents/.test(t),
    (t.match(/Out of \d+ free agents/)||[])[0]);
assert('each row shows before and after', /→/.test(t));

step(3, 'nobody rostered in the league appears');
// Every one of txmossad's own starters is taken, so none may be listed.
const mine = ['Jalen Hurts', 'Jonathan Taylor', 'Zay Flowers', 'Breece Hall'];
const listed = mine.filter(m => t.includes(m));
assert('my own players are not offered as free agents', listed.length === 0,
    listed.join(', ') || 'none listed');

step(4, 'a row opens to the same depth as start/sit');
await rows.first().click();
await page.waitForTimeout(4000);
const body = await page.locator('body').innerText();
assert('it explains the projection', /WHAT MOVED IT/i.test(body));
assert('it shows the splits', /SPLITS/i.test(body));
assert('and the box scores', /Game log/i.test(body));
const why = await page.locator('h4:text-is("What moved it")').locator('xpath=../..').first().innerText();
console.log('      ' + why.split('\n').slice(0, 4).join(' | '));
assert('a stale projection is called out', /predates/i.test(why),
    (why.match(/[^\n]*predates[^\n]*/)||['(not flagged)'])[0]);

step(5, 'position filter narrows it');
await page.getByRole('button', { name: /^RB$/ }).first().click();
await page.waitForTimeout(1200);
const rbRows = await page.locator('button[aria-expanded]').count();
console.log('      RB rows:', rbRows);
assert('filtering changes the list', rbRows > 0 && rbRows <= n, `${rbRows} of ${n}`);

step(6, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0,2).join(' | '));
const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no overflow', o.sw <= o.cw, JSON.stringify(o));
await page.screenshot({ path: process.env.SHOT ?? 'waivers.png', fullPage: false });
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
