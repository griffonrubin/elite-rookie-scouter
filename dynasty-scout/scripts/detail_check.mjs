/**
 * Everything on the page that opens, opening.
 *
 * A number with no way to see behind it is an answer, not a tool. Every
 * player on this page — the one in the slot, the four who could replace him,
 * the bench, and the eleven on the other side of the matchup — has to open
 * to the same depth, and picking a replacement has to say what it would do
 * to the week rather than only which is better.
 *
 * Run against txmossad's real week-1 roster, because the shapes that break
 * this are real ones: a receiver on the injury report, a defence named by
 * abbreviation, thirty-four games spanning two seasons.
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

await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
await page.waitForTimeout(12000);

step(1, 'a candidate opens with its own week and the consequence');
await page.locator('button[aria-expanded]').nth(3).click();   // a WR slot
await page.waitForTimeout(2000);
const panel = page.locator('button[aria-expanded]').nth(3).locator('..');
const cands = panel.locator('button[aria-pressed]');
console.log('      candidates:', await cands.count());
await cands.nth(1).click();          // first non-current option
await page.waitForTimeout(3000);
const t1 = await panel.innerText();
assert('the swap names both players', /instead of/i.test(t1), (t1.match(/.*instead of.*/)||[])[0]);
assert('it shows what it changes', /What it changes/i.test(t1));
assert('win probability before and after', /Chance you win/i.test(t1));
assert('the candidate gets its own reasoning', (t1.match(/WHAT MOVED IT/gi) ?? []).length >= 2,
    `${(t1.match(/WHAT MOVED IT/gi) ?? []).length} panels`);
assert('and its own usage', (t1.match(/OPPORTUNITY/gi) ?? []).length >= 2);
console.log('      ', (t1.match(/Chance you win[\s\S]{0,60}/)||[])[0]?.replace(/\n/g,' '));

step(2, 'a bench player opens');
const bench = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Your bench$/i }) }).last();
const benchRows = bench.locator('button[aria-expanded]');
console.log('      bench rows:', await benchRows.count());
await benchRows.first().click();
await page.waitForTimeout(2500);
const bt = await bench.innerText();
assert('the bench player explains itself', /WHAT MOVED IT/i.test(bt));
assert('and offers a comparison', /Compare with someone/i.test(bt));

step(3, 'an opponent player opens');
const opp = page.locator('section').filter({ hasText: /starts/i }).last();
const oppRows = opp.locator('button[aria-expanded]');
console.log('      opponent rows:', await oppRows.count());
await oppRows.first().click();
await page.waitForTimeout(2500);
const ot = await opp.innerText();
assert('the opponent explains itself too', /WHAT MOVED IT/i.test(ot));


step(4, 'box scores are there to look at');
const log = panel.locator('summary', { hasText: /Game log/i }).first();
console.log('      log summaries in panel:', await panel.locator('summary').count());
await log.click();
await page.waitForTimeout(900);
const lt = await panel.innerText();
assert('a game log opens', /Game log/i.test(lt));
assert('it has box score columns', /Tgt|Car|Rec|ReYd|RuYd/.test(lt), (lt.match(/Wk[\s\S]{0,60}/)||[])[0]?.replace(/\n/g,' '));
assert('seasons are named', /20\d\d/.test(lt));
const rowCount = await panel.locator('table tbody tr').count();
console.log('      box score rows:', rowCount);
assert('several games listed', rowCount >= 5, String(rowCount));

step(5, 'the splits do the arithmetic off the log');
// Two panels by design — the starter's and the candidate's — so take the
// first and assert separately that the candidate got one of its own.
const splitPanels = panel.locator('h4:text-is("Splits")');
assert('the candidate gets its own splits, not just the starter',
    await splitPanels.count() >= 2, `${await splitPanels.count()} panels`);
const sp = await splitPanels.first().locator('xpath=../..').innerText();
console.log('      ' + sp.replace(/\n+/g, ' | ').slice(0, 200));
assert('recent form is averaged', /Last 3[\s\S]*Last 5/.test(sp));
assert('both seasons are named', /2026[\s\S]*2025|2025[\s\S]*2026/.test(sp));
assert('the baseline is stated', /across all \d+/.test(sp), (sp.match(/across all \d+/)||[])[0]);
// An average over one game is not a rate, and a season with no games yet is
// not a zero — the panel has to say so rather than print a number.
assert('a season with no games shows no number', /2026\s*—/.test(sp));
assert('the head-to-head is named or absent honestly',
    /vs [A-Z]{2,3}/.test(sp) && /(never faced them|in 20\d\d week \d+)/.test(sp),
    (sp.match(/vs [A-Z]{2,3}[\s\S]{0,60}/)||[])[0]?.replace(/\n/g,' '));

step(6, 'data points name themselves on hover');
// The dots are SVG circles now, not positioned spans, so the game name is a
// <title> child rather than a title attribute — one strip used to be twenty
// elements each carrying a box-shadow, and there are thirty of them.
const dot = panel.locator('svg circle').first();
const native = await dot.locator('title').evaluate(el => el.textContent ?? '');
assert('every dot carries its own game', /pts ·/.test(native), native);
await dot.hover();
await page.waitForTimeout(500);
const tip = await panel.innerText();
assert('hovering names it on the page too', /pts ·/.test(tip),
    (tip.match(/[\d.]+ pts · [^\n]*/) || [])[0] ?? '(no tooltip rendered)');

step(7, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0,2).join(' | '));
const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no overflow', o.sw <= o.cw, JSON.stringify(o));
await page.screenshot({ path: process.env.SHOT ?? 'detail.png', fullPage: true });
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
