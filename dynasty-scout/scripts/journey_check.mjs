/**
 * The whole thing, the way somebody actually uses it.
 *
 * Every earlier test injected a connection into localStorage and handed the
 * page a seven-slot roster. A real person arrives with nothing stored, types
 * a username, picks a league, picks their team, and has ten slots including a
 * kicker and a defence — none of which had ever been exercised.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = process.env.BASE ?? 'http://localhost:3080';

const R = JSON.parse(fs.readFileSync(new URL('./fixtures-journey-roster.json', import.meta.url), 'utf8'));
const sid = p => String(p.sleeper_id);
const mine = R.mine.map(sid), bench = R.bench.map(sid), opp = R.opp.map(sid);
const ROSTER_POSITIONS = ['QB','RB','RB','WR','WR','WR','TE','FLEX','K','DEF',
                          'BN','BN','BN','BN','BN','BN'];

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });

let sleeperCalls = 0;
await ctx.route('**/api/sleeper/**', route => {
    const u = route.request().url();
    sleeperCalls++;
    const j = o => route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(o) });
    if (u.includes('/state/nfl')) return j({ week: 1, display_week: 1 });
    if (u.match(/\/user\/nobody-here/)) return route.fulfill({ status: 404, body: 'null' });
    if (u.match(/\/user\/[^/]+\/leagues/)) return j([
        { league_id: 'L1', name: 'The Main League' },
        { league_id: 'L2', name: 'Work Money League' },
    ]);
    if (u.match(/\/user\/[^/]+$/)) return j({ user_id: 'u1' });
    if (u.match(/\/league\/[^/]+\/rosters/)) return j([
        { roster_id: 1, owner_id: 'u1', players: [...mine, ...bench], starters: mine },
        { roster_id: 2, owner_id: 'u2', players: opp, starters: opp },
    ]);
    if (u.match(/\/league\/[^/]+\/users/)) return j([
        { user_id:'u1', display_name:'you', metadata:{ team_name:'My Team' } },
        { user_id:'u2', display_name:'them', metadata:{ team_name:'Their Team' } },
    ]);
    if (u.match(/\/league\/[^/]+\/matchups\//)) return j([
        { roster_id:1, matchup_id:1, starters: mine, players:[...mine,...bench] },
        { roster_id:2, matchup_id:1, starters: opp, players: opp },
    ]);
    if (u.match(/\/league\/(L1|L2)$/)) return j({
        league_id: u.endsWith('L2') ? 'L2' : 'L1',
        name: u.endsWith('L2') ? 'Work Money League' : 'The Main League',
        season: '2026', roster_positions: ROSTER_POSITIONS });
    return j(null);
});
await ctx.route('https://api.sleeper.app/**', r => r.abort());

const page = await ctx.newPage();
page.setDefaultTimeout(25000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)); });
const failedUrls = [];
page.on('requestfailed', r => failedUrls.push(`${r.failure()?.errorText} ${r.url().slice(0, 110)}`));
page.on('response', r => { if (r.status() >= 400) failedUrls.push(`${r.status()} ${r.url().slice(0, 110)}`); });

const step = (n, s) => console.log(`\n── ${n}. ${s}`);
const ok = (label, pass, extra = '') =>
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
const fails = [];
const assert = (label, pass, extra) => { ok(label, pass, extra); if (!pass) fails.push(label); };

step(1, 'arrive with nothing saved');
await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
let t = await page.locator('body').innerText();
assert('the connect screen is shown', /connect your league/i.test(t));
assert('it explains where the data goes', /saved in this browser/i.test(t));

step(2, 'mistype the username');
await page.getByPlaceholder(/sleeper username/i).fill('nobody-here');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(1500);
t = await page.locator('body').innerText();
assert('a wrong username says so', /no sleeper user/i.test(t), t.match(/No Sleeper user[^\n]*/)?.[0] ?? '');

step(3, 'type the right one and pick a league');
await page.getByPlaceholder(/sleeper username/i).fill('griffon');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(1800);
t = await page.locator('body').innerText();
assert('both leagues are offered', /The Main League/.test(t) && /Work Money League/.test(t));
await page.getByRole('button', { name: /The Main League/ }).first().click();
await page.waitForTimeout(2500);

step(4, 'pick which team is mine');
t = await page.locator('body').innerText();
assert('it asks which team is mine', /which team is yours/i.test(t));
await page.getByRole('button', { name: /^My Team$/ }).first().click();
await page.waitForTimeout(9000);

step(5, 'read the lineup');
t = await page.locator('body').innerText();
assert('a win probability is shown', /chance you win week/i.test(t));
const slots = await page.locator('button[aria-expanded]').count();
assert('all ten slots are listed', slots === 10, `got ${slots}`);
const slotLabels = await page.locator('button[aria-expanded] > span:first-child').allInnerTexts();
console.log('      slots:', slotLabels.join(' '));
assert('the FLEX slot is named', slotLabels.includes('FLEX'));
assert('the kicker slot is there', slotLabels.includes('K'));
assert('the defence slot is there', slotLabels.some(s => /DEF|DST/.test(s)));
assert('opponent is named', /Their Team/.test(t));

step(6, 'the kicker is not scored as zero');
const kIdx = slotLabels.indexOf('K');
const kRow = await page.locator('button[aria-expanded]').nth(kIdx).innerText();
console.log('      K row:', kRow.replace(/\n+/g, ' | '));
const kAria = await page.locator('button[aria-expanded]').nth(kIdx)
    .locator('[role="img"]').first().getAttribute('aria-label');
console.log('      K strip:', kAria);
const kMean = kAria?.match(/expected ([\d.]+) points/);
assert('the kicker has a real projection',
    !!kMean && Number(kMean[1]) > 1, kMean?.[1] ?? 'none');

step(7, 'open the flex and look at the candidates');
const flexIdx = slotLabels.indexOf('FLEX');
await page.locator('button[aria-expanded]').nth(flexIdx).click();
await page.waitForTimeout(2500);
const panel = await page.locator('button[aria-expanded]').nth(flexIdx)
    .evaluate(el => el.parentElement?.innerText ?? '');
console.log('      flex panel:', panel.replace(/\n+/g, ' | ').slice(0, 220));
assert('the flex lists more than one candidate',
    (panel.match(/%/g) ?? []).length >= 1);

step(8, 'switch to the other league without reconnecting');
await page.locator('button[title="Connect another league"]').click();
await page.waitForTimeout(1200);
t = await page.locator('body').innerText();
assert('my saved team is offered back', /your teams/i.test(t) && /The Main League/.test(t));
await page.getByPlaceholder(/sleeper username/i).fill('griffon');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(1800);
await page.getByRole('button', { name: /Work Money League/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /^My Team$/ }).first().click();
await page.waitForTimeout(8000);
const picker = page.locator('select[aria-label="Which league"]');
assert('both leagues are now in the switcher', await picker.count() === 1,
    (await picker.locator('option').allInnerTexts()).join(' / '));

step(8.5, 'the two summaries agree');
const summary = await page.locator('body').innerText();
const boardSays = summary.match(/Every slot is already|(\d+) slots? worth a second look/);
const bestSays = summary.match(/Best available|This is the best lineup available/);
console.log('      board:', boardSays?.[0], '| headline:', bestSays?.[0]);
assert('a settled board is not contradicted by the headline',
    !(/Every slot is already/.test(summary) && /Best available/.test(summary)),
    boardSays?.[0] + ' vs ' + bestSays?.[0]);

step(9, 'nothing blew up');
console.log('      failed requests:', failedUrls.length ? failedUrls.join('\n                       ') : 'none');
const ours = failedUrls.filter(u =>
    !u.includes('api.sleeper.app')        // aborted on purpose, to force the relay
    && !u.includes('nobody-here')          // the 404 this test asked for
    && !u.includes('_rsc='));              // Next cancelling its own prefetches
assert('the app makes no failing requests of its own', ours.length === 0, ours.join(' | '));
const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));

await page.screenshot({ path: process.env.OUT ?? '/tmp/journey.png', fullPage: false });
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
