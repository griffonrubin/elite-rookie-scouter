/**
 * The journey against a real Sleeper account.
 *
 * The fixture below is txmossad's actual leagues, rosters and week-1
 * matchups, pulled from Sleeper through the production relay. Synthetic
 * rosters are tidy in ways real ones are not: this one carries a player on
 * injured reserve, a rival with an unset kicker slot the platform reports as
 * "0", a defence identified only by its team abbreviation, and a superflex
 * league alongside a standard one.
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

step(1, 'connect as txmossad');
await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(2000);
let t = await page.locator('body').innerText();
assert('the real leagues come back', /Den Fantasy Football League 1/.test(t) && /TBD/.test(t));

step(2, 'open the standard league and pick my team');
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
await page.waitForTimeout(11000);

step(3, 'the real lineup');
t = await page.locator('body').innerText();
const labels = await slotRows().locator('> span:first-child').allInnerTexts();
console.log('      slots:', labels.join(' '));
assert('nine slots, matching the league', labels.length === 9, `got ${labels.length}`);
assert('the shape is right', labels.join(' ') === 'QB RB RB WR WR TE FLEX K DEF', labels.join(' '));
// Named, not labelled. This used to check for the generic "The Opponent"
// fallback, which is what the page shows when the owner cannot be resolved
// — and with a fixture trimmed to three rosters, it could not be. The real
// league pairs roster 11 against roster 8 in week 1, so the panel has to
// say whose lineup it is.
assert('my real week-1 opponent is named', /BONEYJABRONI STARTS/i.test(t),
    (t.match(/[A-Z0-9' ]+ STARTS/i) || ['(no opponent panel)'])[0]);

step(4, 'the defence resolved from its abbreviation');
const defRow = await slotRows().nth(8).innerText();
console.log('      DEF row:', defRow.replace(/\n+/g, ' | '));
assert('the D/ST is a named team, not "BAL"',
    /Ravens|Baltimore/i.test(defRow), defRow.split('\n')[1] ?? '');

step(5, 'the player on injured reserve is not offered');
// Sleeper id 9753 — Zach Charbonnet — sits on this roster's `reserve` list.
// A player on IR cannot be started, so he must appear neither on the bench
// nor among a slot's candidates.
const IR_NAME = 'Zach Charbonnet';
await slotRows().nth(6).click();   // the FLEX
await page.waitForTimeout(2500);
const flexPanel = await slotRows().nth(6)
    .evaluate(el => el.parentElement?.innerText ?? '');
console.log('      FLEX candidates:', flexPanel.replace(/\n+/g, ' | ').slice(0, 200));
assert('the IR player is not a FLEX candidate', !flexPanel.includes(IR_NAME));

// 15 rostered, 9 starting, 1 on IR — so exactly five names are benchable.
// Scoped to the bench panel itself: a regex over the whole page once ran past
// the heading it meant to stop at and counted the opponent's starters too.
const benchPanel = page.locator('section').filter({
    has: page.getByRole('heading', { name: /^Your bench$/i }) }).last();
const benchNames = await benchPanel.locator('button span.font-semibold').allInnerTexts();
console.log('      bench:', benchNames.join(', '));
assert('five players on the bench', benchNames.length === 5,
    `${benchNames.length}: ${benchNames.join(', ')}`);
assert('the IR player is not on the bench', !benchNames.includes(IR_NAME));

/**
 * The same owner is picked by a different label in each league.
 *
 * Sleeper's team picker shows the team name where one is set and the handle
 * where it is not, and txmossad has named the team in the twelve-team league
 * only. Clicking "txmossad" everywhere used to work because the fixture had
 * been trimmed down to rosters with no metadata at all.
 */
step(6, 'switch to the superflex league');
await page.locator('button[title="Connect another league"]').click();
await page.waitForTimeout(1200);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /^TBD$/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /^txmossad$/ }).first().click();
await page.waitForTimeout(11000);
const sfLabels = await slotRows().locator('> span:first-child').allInnerTexts();
console.log('      superflex slots:', sfLabels.join(' '));
assert('SUPER_FLEX is a real slot', sfLabels.some(s => /SUPER/i.test(s)), sfLabels.join(' '));

step(7, 'a quarterback can fill the superflex');
const sfIdx = sfLabels.findIndex(s => /SUPER/i.test(s));
await slotRows().nth(sfIdx).click();
await page.waitForTimeout(2500);
const sfPanel = await slotRows().nth(sfIdx)
    .evaluate(el => el.parentElement?.innerText ?? '');
console.log('      SUPER_FLEX candidates:', sfPanel.replace(/\n+/g, ' | ').slice(0, 200));
assert('the superflex offers candidates', (sfPanel.match(/%/g) ?? []).length >= 1);

step(8, 'the best-ball league: two FLEX slots and no kicker or defence');
await page.locator('button[title="Connect another league"]').click();
await page.waitForTimeout(1200);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /Dallas Crew Fantasy/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /^txmossad$/ }).first().click();
await page.waitForTimeout(11000);
const bbLabels = await slotRows().locator('> span:first-child').allInnerTexts();
console.log('      best-ball slots:', bbLabels.join(' '));
assert('the shape is right', bbLabels.join(' ') === 'QB RB RB WR WR TE FLEX FLEX', bbLabels.join(' '));
assert('no kicker or defence slot', !bbLabels.some(s => /^(K|DEF|DST)$/i.test(s)));

// Two slots of the same kind is what broke the old engine: both FLEX rows
// nominated the same bench player, which is a move you cannot make. Nobody
// should be named twice on this board, as a starter or as a replacement.
const current = await slotRows().locator('span.font-semibold').allInnerTexts();
const alts = await slotRows().locator('span.text-muted-foreground\\/70').allInnerTexts();
console.log('      starting:', current.join(', '));
console.log('      nominated:', alts.join(', ') || '(none)');
assert('eight distinct starters', new Set(current).size === current.length, current.join(', '));
assert('nobody is nominated for two slots at once',
    new Set(alts).size === alts.length, alts.join(', '));

// Best ball has no start/sit decision in it: the platform scores your best
// lineup itself, so a board offering a swap is offering a move you cannot
// make. The page has to know that and say it.
const bb = await page.locator('body').innerText();
console.log('      says best ball:', /best ball/i.test(bb));
assert('the page says it is best ball', /best ball/i.test(bb));
assert('no slot is called a change', !/\bChange\b/.test(bb), bb.match(/.{0,40}Change.{0,40}/)?.[0] ?? '');
assert('nothing is nominated to start', alts.length === 0, alts.join(', '));

step(9, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));

await page.screenshot({ path: process.env.SHOT ?? 'real-journey.png', fullPage: false });
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
