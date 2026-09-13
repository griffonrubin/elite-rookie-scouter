/**
 * Replacement cost, against a real roster.
 *
 * The engine check builds a roster designed to make a projection and a
 * replacement cost disagree. This one runs it against twelve real rosters,
 * where the interesting question is whether the answer stays legible when
 * nobody built the fixture to make a point: does a real bench actually cover
 * anybody, does the page name the man who covers him, and does the ordering
 * differ from a projection at all.
 *
 * It also checks the thing an owner would spot first — that the starters
 * listed are the starters, and that the man said to be covering somebody is
 * really on the roster and really eligible for the slot.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Den Fantasy Football League 1';

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });

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
const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const depthRows = () => page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /what each starter is holding up/i }) })
    .locator('> ul > li');

step(1, 'it says why a projection is the wrong number');
await page.goto(`${BASE}/in-season/team`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
let t = await page.locator('body').innerText();
assert('the premise is stated', /what he is worth to you/i.test(t));
assert('Team Analysis is a real tab, not a Soon tag',
    await page.getByRole('link', { name: 'Team Analysis' }).count() === 1);

step(2, 'connect the twelve-team league');
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
const t0 = Date.now();
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click({ timeout: 25000 });
await page.getByRole('heading', { name: /what each starter is holding up/i })
    .waitFor({ timeout: 30000 });
await page.waitForTimeout(900);
console.log(`      report in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

step(3, 'every starting slot is priced');
const rows = await depthRows().evaluateAll(els => els.map(e => {
    const k = [...e.children];
    return {
        slot: k[0]?.textContent?.trim() ?? '',
        name: k[1]?.querySelector('span')?.textContent?.trim() ?? '',
        cost: parseFloat((k[2]?.textContent?.match(/([\d.]+) pts of win rate/) || [])[1] ?? '0'),
        note: k[2]?.textContent?.trim() ?? '',
        drop: parseFloat((k[3]?.textContent?.match(/−([\d.]+)/) || [])[1] ?? 'NaN'),
        behind: k[4]?.textContent?.trim() ?? '',
    };
}));
for (const r of rows) {
    console.log(`      ${r.slot.padEnd(5)} ${r.name.padEnd(22)} `
        + `${String(r.cost).padStart(5)}pp  −${r.drop} pts  ${r.behind}`);
}
assert('nine rows for nine slots', rows.length === 9, String(rows.length));
assert('the slots are the league\'s shape',
    rows.map(r => r.slot).sort().join(',')
        === ['DEF', 'FLEX', 'K', 'QB', 'RB', 'RB', 'TE', 'WR', 'WR'].sort().join(','),
    rows.map(r => r.slot).join(','));
assert('every row names a player', rows.every(r => r.name.length > 2),
    rows.map(r => r.name).join('|'));

step(4, 'sorted by what it costs, not by who is best');
assert('costs fall down the list',
    rows.every((r, i) => i === 0 || r.cost <= rows[i - 1].cost + 1e-9),
    rows.map(r => r.cost).join(','));
assert('the lineup drop is a real number for every row',
    rows.every(r => !Number.isNaN(r.drop)), rows.map(r => r.drop).join(','));
// The claim the page is built on: this ordering is not the projection's.
// If a real roster happens to agree, that is worth seeing in the log rather
// than failing — but the two should not be identical on twelve men.
const byDrop = [...rows].sort((a, b) => b.drop - a.drop).map(r => r.name);
const byCost = rows.map(r => r.name);
const same = byDrop.join('|') === byCost.join('|');
console.log(`      by points lost:    ${byDrop.slice(0, 4).join(', ')}`);
console.log(`      by cost of losing: ${byCost.slice(0, 4).join(', ')}`);
console.log(`      the two orderings are ${same ? 'identical' : 'different'}`);
assert('the top of the list is somebody real', byCost[0].length > 2, byCost[0]);

step(5, 'the man said to be covering him is really behind him');
const covered = rows.filter(r => /covered by|lineup shuffles/.test(r.behind));
const uncovered = rows.filter(r => /nobody can fill the slot/.test(r.behind));
console.log(`      ${covered.length} covered, ${uncovered.length} uncovered`);
assert('every row says either who covers him or that nobody does',
    covered.length + uncovered.length === rows.length,
    `${covered.length} + ${uncovered.length} of ${rows.length}`);
const bareSlots = uncovered.map(r => r.slot).sort();
console.log(`      uncovered slots: ${bareSlots.join(', ') || 'none'}`);

/**
 * Which slots *should* be bare, read off the roster rather than guessed.
 *
 * The first version of this hardcoded QB, K and DEF and failed, because
 * txmossad has one tight end too — the test was wrong and the page was
 * right. So the expectation now comes from the same roster the page is
 * reading: the Trade Analyzer lists it grouped by position, and a position
 * with exactly one player in it is a position with nobody behind him.
 */
const roster = await page.evaluate(async () => {
    const r = await fetch('/in-season/trades');
    return r.ok;
});
assert('the trade page is available to cross-check against', roster);
await page.goto(`${BASE}/in-season/trades`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /^Jebdaddybush$/i }).first()
    .waitFor({ timeout: 30000 }).catch(() => {});
await page.locator('#trade-partner').waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
const groups = await page.locator('section').filter({ has: page.locator('h3') }).first()
    .evaluate(el => {
        const out = {};
        for (const div of el.querySelectorAll('div')) {
            const head = div.firstElementChild;
            if (!head || head.tagName !== 'DIV') continue;
            const label = head.textContent?.trim() ?? '';
            const n = div.querySelectorAll('li').length;
            if (n > 0 && /^[A-Z]{1,3}$|^Other$/.test(label)) out[label] = n;
        }
        return out;
    });
console.log('      roster by position: '
    + Object.entries(groups).map(([k, v]) => `${k} ${v}`).join(', '));
const SLOT_POSITION = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DST' };
const expectedBare = [...new Set(rows.map(r => r.slot))]
    .filter(slot => groups[SLOT_POSITION[slot]] === 1)
    .sort();
console.log(`      positions with exactly one player: ${expectedBare.join(', ') || 'none'}`);
assert('exactly the one-deep slots are reported bare',
    bareSlots.join(',') === expectedBare.join(','),
    `page says ${bareSlots.join(',')}, roster says ${expectedBare.join(',')}`);
await page.goBack({ waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: /what each starter is holding up/i })
    .waitFor({ timeout: 30000 });
await page.waitForTimeout(700);
assert('an uncovered starter costs something',
    uncovered.every(r => r.cost > 0), uncovered.map(r => r.cost).join(','));
assert('nobody is said to be covered by himself',
    rows.every(r => !r.behind.includes(r.name)),
    rows.filter(r => r.behind.includes(r.name)).map(r => r.name).join(','));
/**
 * A receiver does not cover a running back.
 *
 * The first render said "covered by DJ Moore" under every covered row,
 * including two running backs — accurate arithmetic (he is the marginal
 * addition) and a misleading sentence. Where the newcomer enters a different
 * slot from the one that emptied, the row has to say so.
 */
const shuffles = rows.filter(r => /lineup shuffles/.test(r.behind));
const straight = rows.filter(r => /covered by/.test(r.behind));
console.log(`      ${straight.length} covered in place, ${shuffles.length} by a shuffle`);
for (const r of shuffles) console.log(`        ${r.slot}: ${r.behind}`);
assert('a newcomer at another slot is described as a shuffle, not as cover',
    shuffles.every(r => / in at [A-Z]+$/.test(r.behind)),
    shuffles.map(r => r.behind).join(' | '));
assert('and it names the slot he actually enters',
    shuffles.every(r => !new RegExp(` in at ${r.slot}$`).test(r.behind)),
    shuffles.map(r => `${r.slot} → ${r.behind}`).join(' | '));

step(6, 'the summary names the same players the table does');
t = await page.locator('body').innerText();
assert('every starter with nobody behind him is named in the summary',
    uncovered.every(r => new RegExp(`${r.name}[^\\n]*nobody behind`).test(t)
        || t.split('nobody behind')[0].includes(r.name)),
    uncovered.map(r => r.name).join(', '));
// The sub-line under each name is that player's own projection. It said
// "120 pts of lineup" on every row once — the whole lineup total, identical
// nine times, which told a reader nothing.
const projections = await depthRows().evaluateAll(els => els.map(e =>
    (e.children[1]?.textContent?.match(/([\d.]+) projected/) || [])[1]));
console.log('      projections: ' + projections.join(', '));
assert('each row shows that player\'s own projection',
    new Set(projections).size === projections.length, projections.join(','));
assert('and it is a player-sized number, not a lineup-sized one',
    projections.every(p => Number(p) > 0 && Number(p) < 40), projections.join(','));
assert('the headline rate is stated', /% against the league/.test(t),
    (t.match(/[\d.]+% against the league[^\n]*/) || ['(not stated)'])[0]);
assert('and the floor is explained', /moves by on its own/.test(t));

step(7, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));
await page.setViewportSize({ width: 400, height: 1200 });
await page.waitForTimeout(600);
const op = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('nor at phone width', op.sw <= op.cw + 1, JSON.stringify(op));
await page.setViewportSize({ width: 1500, height: 1200 });
await page.waitForTimeout(500);
await page.screenshot({ path: process.env.SHOT ?? 'team.png', fullPage: false });

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
