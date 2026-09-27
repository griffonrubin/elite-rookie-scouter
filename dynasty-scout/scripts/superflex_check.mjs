/**
 * The whole section, driven as a superflex half-PPR league.
 *
 * Every browser check in this repository connects the same twelve-team,
 * one-quarterback, full-PPR fixture, and the last three commits were all
 * about leagues that are none of those things. A correction nobody drives
 * through the pages is a correction that works in a unit test — and the
 * failures worth finding here are the ones that only appear when a real
 * league is an unusual shape: a kicker column in a league with no kicker
 * slot, a quarterback ranked against the wrong replacement level, a lineup
 * with a slot the board cannot name.
 *
 * The fixture is a real twelve-roster league with its lineup and scoring
 * replaced: nine starters including a superflex, no kicker, no defence, half
 * a point a catch. That is the shape the user reported being in, which is
 * how it was chosen.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-superflex.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Superflex Half PPR';

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 }, deviceScaleFactor: 1.5 });
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
page.setDefaultTimeout(40000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

/** Whatever the waiver endpoint last said about this league's shape. */
let waiverPayload = null;
page.on('response', async r => {
    if (r.url().includes('/api/redraft/waivers') && r.ok()) {
        try { waiverPayload = await r.json(); } catch { /* raced */ }
    }
});

async function connect(path) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const user = page.getByPlaceholder(/sleeper username/i);
    if (await user.count()) {
        await user.fill('txmossad');
        await page.getByRole('button', { name: /^find$/i }).click();
        await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click();
        await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
    }
    await page.waitForTimeout(8000);
}

step(1, 'the lineup knows what a superflex slot is');
await connect('/redraft/start-sit');
assert('no page errors', errs.length === 0, errs[0] ?? '');
const board = await page.locator('body').innerText();
assert('the superflex slot is on the board',
    /SUPER[_ ]?FLEX/i.test(board), (board.match(/SUPER[_ ]?FLEX/i) ?? ['absent'])[0]);
/**
 * Every slot on the board carries a name a reader recognises.
 *
 * A board that meets a slot it does not know can render it blank or as a raw
 * id and still look fine, which is the failure a standard fixture can never
 * show — all nine of its slots are ones the code was written around.
 *
 * Read off the slot cells rather than off the page text. The first version
 * of this searched the whole body for "slot" followed by a number and
 * matched the heading — "SLOT BY SLOT" then "2 slots worth a second look" —
 * because `\s*` crosses a newline. It failed a page that was correct, which
 * is the more expensive kind of wrong assertion: it sends you looking for a
 * bug in the thing that works.
 */
const KNOWN = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'FLEX',
    'SUPERFLEX', 'SUPER_FLEX', 'WRRB_FLEX', 'REC_FLEX']);
const slotCells = await page.locator('button[aria-expanded] > span:first-child, '
    + 'button > span:first-child').evaluateAll(
    els => els.map(e => (e.textContent ?? '').trim()).filter(Boolean));
const boardSlots = slotCells.filter(t => t.length <= 12 && /^[A-Za-z_/ ]+$/.test(t));
const unnamed = slotCells.filter(t => /^\s*$/.test(t) || /^\d+$/.test(t));
assert('no slot cell is blank or a bare id', unnamed.length === 0,
    unnamed.length ? JSON.stringify(unnamed.slice(0, 4)) : `${slotCells.length} cells read`);
assert('and the superflex one is among the names the board knows',
    boardSlots.some(t => KNOWN.has(t.toUpperCase().replace(/\s+/g, '_'))),
    boardSlots.slice(0, 12).join(' '));

step('1b', 'and every man on the board can legally fill the slot he is in');
/**
 * The assertion that caught this file's own first draft.
 *
 * Building the fixture, I replaced the league's slots with a superflex
 * lineup and left the platform's starters alone — so the eighth starter, a
 * kicker, landed in the superflex slot and the ninth, a defence, landed in
 * the flex. The page rendered it faithfully, because a board's job is to
 * show the lineup the platform reports.
 *
 * Which made the screenshot look like an app bug and was not one. It is
 * still worth asserting: a slot holding somebody who cannot fill it means
 * either the fixture is lying or the board has lost track of the lineup, and
 * both are worth failing over.
 */
const TAKES = {
    QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DST'], DST: ['DST'],
    FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};
/**
 * Positions come from the database, not from the page.
 *
 * The first version of this read them out of each row's second line, which
 * on this board says "vs BAL 6.8 leaky" and carries no position at all — so
 * every lookup returned an empty string, every comparison was skipped, and
 * the assertion reported nine slots checked while checking nothing. A test
 * that cannot fail is worse than no test, because it is counted.
 */
const { default: Database } = await import('better-sqlite3');
const db = new Database('dynasty_scout.db', { readonly: true });
const posByName = new Map(db.prepare(
    'SELECT full_name, position FROM players WHERE position IS NOT NULL')
    .all().map(r => [String(r.full_name), String(r.position).toUpperCase()]));
db.close();

const rows = await page.locator('button[aria-expanded]').evaluateAll(els => els.map(e => {
    const spans = [...e.querySelectorAll('span')].map(s => (s.textContent ?? '').trim());
    return spans.filter(Boolean).slice(0, 8);
}));
/**
 * The name is whichever span the database recognises, not a fixed index: the
 * row nests, so index one is a wrapper holding the name and the matchup line
 * run together — "Jalen Hurtsvs WAS 9.4 soft" — which matches nothing.
 */
const placed = rows
    .map(r => ({
        slot: (r[0] ?? '').toUpperCase().replace(/\s+/g, '_'),
        name: r.slice(1).find(t => posByName.has(t)) ?? '',
    }))
    .filter(r => TAKES[r.slot] && posByName.has(r.name));
assert('the board named players the database knows', placed.length >= 7,
    `${placed.length} of ${rows.length} rows matched a known player`);
const illegal = placed.filter(r => !TAKES[r.slot].includes(posByName.get(r.name)));
assert('every starter is eligible for his slot', illegal.length === 0,
    illegal.length
        ? illegal.map(r => `${r.slot}←${r.name} (${posByName.get(r.name)})`).join(', ')
        : placed.map(r => `${r.slot}=${posByName.get(r.name)}`).join(' '));

step(2, 'and the page says which scoring these numbers are in');
assert('half PPR is stated rather than assumed',
    /half ppr/i.test(board), (board.match(/Half PPR|PPR|Standard/i) ?? ['nothing'])[0]);

step(3, 'the waiver wire is measured against this league, not a standard one');
await connect('/in-season/waivers');
assert('the endpoint was told the shape', !!waiverPayload?.leagueShaped,
    `leagueShaped ${waiverPayload?.leagueShaped}`);
assert('and worked out the quarterbacks it starts',
    (waiverPayload?.started?.QB ?? 0) >= 18,
    `QB ${waiverPayload?.started?.QB} started, replacement `
    + `${Math.round(waiverPayload?.replacement?.QB ?? 0)}`);
assert('while knowing it fields no kicker or defence',
    Array.isArray(waiverPayload?.unplayed)
    && waiverPayload.unplayed.includes('K') && waiverPayload.unplayed.includes('DST'),
    JSON.stringify(waiverPayload?.unplayed));

step(4, 'and a position with no slot is answered, not ranked');
await page.getByRole('button', { name: /^K$/ }).first().click();
await page.waitForTimeout(2500);
const kicker = await page.locator('body').innerText();
assert('it says the league starts none',
    /starts no K|no slot to put one in/i.test(kicker),
    (kicker.match(/This league starts no [^.]*/) ?? ['not said'])[0]);
assert('rather than listing kickers above a replacement it does not have',
    !/a week above a startable K/i.test(kicker), 'no phantom value');

step(5, 'nothing blew up anywhere in the section');
for (const path of ['/in-season/team', '/in-season/power', '/in-season/trades']) {
    await connect(path);
    const t = await page.locator('body').innerText();
    assert(`${path} rendered`, t.length > 400, `${t.length} chars`);
}
assert('no page errors across the section', errs.length === 0, errs.slice(0, 2).join(' | '));
const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert('no horizontal overflow', over <= 1, `${over}px`);

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
