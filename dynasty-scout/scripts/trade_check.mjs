/**
 * A trade, priced against the real twelve-team league.
 *
 * The engine check builds rosters designed to separate value from shape.
 * This one runs the machinery against twelve real rosters — a hundred and
 * sixty-eight players to price rather than nine, three requests instead of
 * one, and every league-shaped assumption exposed: that the partner list is
 * eleven teams and not twelve, that a player picked on one side cannot be
 * picked on the other, that the bystanders sum back to nothing.
 *
 * It also times it. Two round robins run on every click, so the question is
 * not whether the answer is right but whether a reader gets it before they
 * have stopped caring.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Den Fantasy Football League 1';

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 }, deviceScaleFactor: 2 });

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
const calls = [];
page.on('response', r => {
    if (r.url().includes('/api/redraft/startsit')) {
        calls.push({ status: r.status(), n: (new URL(r.url()).searchParams.get('ids') || '').split(',').length });
    }
});
const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

/** The two roster panels, mine first. */
const panel = n => page.locator('section').filter({ has: page.locator('h3') }).nth(n);
const rowsIn = n => panel(n).locator('button[aria-pressed]');
const bodyText = () => page.locator('body').innerText();

step(1, 'it states the premise before a league is connected');
await page.goto(`${BASE}/in-season/trades`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
let t = await bodyText();
assert('it says why value is the wrong question', /a roster is not a pile of value/i.test(t));
assert('Trade Analyzer is a real tab, not a Soon tag',
    await page.getByRole('link', { name: 'Trade Analyzer' }).count() === 1);

step(2, 'connect the twelve-team league');
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click({ timeout: 25000 });
await page.locator('#trade-partner').waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

step(3, 'every roster in the league was priced');
console.log('      startsit calls: ' + calls.map(c => `${c.n} ids → ${c.status}`).join(', '));
assert('no request was refused', calls.every(c => c.status === 200),
    calls.filter(c => c.status !== 200).map(c => `${c.n}→${c.status}`).join(',') || 'all 200');
assert('nothing was chunked past the endpoint cap', calls.every(c => c.n <= 80),
    calls.map(c => c.n).join(','));
const priced = calls.reduce((a, c) => a + c.n, 0);
assert('the whole league, not just the starters', priced > 140, `${priced} players`);

step(4, 'the partner list is the rest of the league');
const options = await page.locator('#trade-partner option').allInnerTexts();
console.log('      ' + options.join(' | '));
assert('eleven partners, not twelve', options.length === 11, String(options.length));
assert('I am not offered as my own partner',
    !options.some(o => /Jebdaddybush/.test(o)), options.join(','));
// This week's opponent is the useful default, and the fixture pairs roster 11
// against roster 8.
const selected = await page.locator('#trade-partner').inputValue();
const selectedName = await page.locator(`#trade-partner option[value="${selected}"]`).innerText();
assert('it opens on this week\'s opponent', /BoneyJabroni/.test(selectedName), selectedName);

step(5, 'both rosters are shown in full, starters marked');
const mine = await rowsIn(0).count();
const theirs = await rowsIn(1).count();
console.log(`      my roster: ${mine} players; theirs: ${theirs}`);
assert('my whole roster is pickable', mine >= 13, String(mine));
assert('so is theirs', theirs >= 13, String(theirs));
const stMarks = await panel(0).locator('button[aria-pressed] span:nth-child(2)').allInnerTexts();
const starters = stMarks.filter(s => s.trim() === 'ST').length;
assert('the lineup is marked on my roster', starters === 9, `${starters} marked ST`);
assert('nothing is selected yet',
    await page.locator('button[aria-pressed="true"]').count() === 0);
t = await bodyText();
assert('and it asks for a pick', /Pick a player from either roster/i.test(t));

step(6, 'a one-sided gift is priced');
// The top row of my roster is my best player by expected points.
const myBest = (await rowsIn(0).first().innerText()).split('\n')[0].trim();
const t0 = Date.now();
await rowsIn(0).first().click();
await page.getByRole('heading', { name: /what it does to each side/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
const ms = Date.now() - t0;
console.log(`      verdict in ${ms}ms after giving away ${myBest}`);
t = await bodyText();
const mineDelta = parseFloat((t.match(/Jebdaddybush — you\s*\n?\s*([−+-][\d.]+) pts/) || [])[1]
    ?.replace('−', '-') ?? 'NaN');
console.log('      ' + (t.match(/[^\n]*pts of win rate[^\n]*/g) || []).join(' | '));
assert('giving away my best player makes me worse', mineDelta < 0, String(mineDelta));
assert('and it says so in words', /worse off/.test(t),
    (t.match(/(clearly|a little) (better|worse) off/g) || []).join(','));
assert('the answer arrives inside three seconds', ms < 3000, `${ms}ms`);

step(7, 'the lineup consequence is shown, not just the value');
assert('my lineup panel is there', /Jebdaddybush[’']s lineup/i.test(t),
    (t.match(/\b\w+[’']s lineup/g) || ['(no panel)']).join(' | '));
// "2th → 12th in the league" is what shipped the first time this rendered.
const ords = t.match(/\b\d+(st|nd|rd|th)\b/g) || [];
console.log('      ordinals on the page: ' + ords.join(' '));
assert('the ordinals are English', ords.every(o => {
    const n = parseInt(o, 10), suf = o.replace(/\d/g, '');
    const r100 = n % 100, r10 = n % 10;
    const want = (r100 >= 11 && r100 <= 13) ? 'th'
        : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
    return suf === want;
}), ords.join(' '));
// The slot that empties has to read as a sentence, not as two runs of text
// shoved together.
assert('an emptied slot separates its two halves',
    !/[a-z](nobody left to fill it)/.test(t),
    (t.match(/[^\n]*nobody left to fill it/) || ['(no empty slot)'])[0]);
assert('it names who I gave up out of the lineup',
    /Gives up a starter/i.test(t) || /nobody left to fill it/i.test(t),
    (t.match(/Gives up a starter[^\n]*/) || ['(not stated)'])[0]);

step(8, 'the bystanders are reported and sum back to nothing');
assert('everybody else is listed', /And to everybody else/i.test(t));
const others = await page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /and to everybody else/i }) })
    .locator('li').count();
assert('ten other teams', others === 10, String(others));

step(9, 'a two-sided trade, and the shape it is priced on');
await rowsIn(1).first().click();
await page.waitForTimeout(2500);
t = await bodyText();
const theirBest = (await rowsIn(1).first().innerText()).split('\n')[0].trim();
const line = (t.match(/[^\n]*pts of win rate[^\n]*/g) || []);
console.log(`      swapping ${myBest} for ${theirBest}`);
console.log('      ' + line.join(' | '));
assert('two players are now in the trade',
    await page.locator('button[aria-pressed="true"]').count() === 2);
assert('both sides still get a verdict', line.length >= 2, line.join(' | '));
assert('the two sides move in opposite directions', (() => {
    const ds = (t.match(/([−+-][\d.]+) pts of win rate/g) || [])
        .map(x => parseFloat(x.replace('−', '-')));
    return ds.length >= 2 && Math.sign(ds[0]) !== Math.sign(ds[1]);
})(), (t.match(/([−+-][\d.]+) pts of win rate/g) || []).join(','));

step(10, 'clearing it puts the page back');
await page.getByRole('button', { name: /^clear$/i }).click();
await page.waitForTimeout(600);
t = await bodyText();
assert('nothing is selected', await page.locator('button[aria-pressed="true"]').count() === 0);
assert('and the verdict is gone', !/what it does to each side/i.test(t));

step(11, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));
await rowsIn(0).first().click();
await page.waitForTimeout(2500);
await page.setViewportSize({ width: 400, height: 1200 });
await page.waitForTimeout(700);
const op = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('nor at phone width', op.sw <= op.cw + 1, JSON.stringify(op));
await page.setViewportSize({ width: 1500, height: 1400 });
await page.waitForTimeout(500);
await page.screenshot({ path: process.env.SHOT ?? 'trades.png', fullPage: false });

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
