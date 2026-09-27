/**
 * The handcuff panel, against a real league.
 *
 * The engine check proves the measurement; this one proves the page makes it
 * usable, which is a separate claim and the one that fails quietly. Three
 * things have to hold for a reader to act on it: the successor named has to
 * still be on the team he was measured on, his availability has to be
 * correct in *this* league rather than in the abstract, and the sample size
 * has to be on the page beside the number it qualifies.
 *
 * The third is the one worth automating. A number with its sample hidden is
 * the failure mode of every handcuff chart published, and it is invisible in
 * a screenshot — the page looks better without it.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

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
    if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/))) return j(matchupsFor(F, m[1], Number(m[2])));
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

// What the route was asked and what it answered, so the page's claims can be
// checked against the measurement rather than against themselves.
let payload = null;
page.on('response', async r => {
    if (r.url().includes('/api/redraft/successors') && r.ok()) {
        try { payload = await r.json(); } catch { /* raced a navigation */ }
    }
});

step(1, 'connect the twelve-team league');
await page.goto(`${BASE}/in-season/team`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click({ timeout: 25000 });
await page.waitForTimeout(6000);
assert('no page errors', errs.length === 0, errs[0] ?? '');

const panel = page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /if he goes down/i }) });
assert('the panel is on the page', await panel.count() === 1);

const rows = panel.locator('> ul > li');
const n = await rows.count();
assert('every man on the roster has a row', n >= 10, `${n} rows`);

step(2, 'it answered off a measurement, not off a chart');
assert('the route was called and answered', !!payload,
    payload ? `${payload.players.length} players, ${payload.fromSeason}–${payload.season}` : 'no response');
const withSucc = (payload?.players ?? []).filter(p => p.successors.length > 0);
assert('some of the roster has a measured successor', withSucc.length >= 2,
    withSucc.map(p => `${p.name}→${p.successors[0].name}`).slice(0, 4).join(', '));

step(3, 'the successor named is still on the team he was measured on');
/**
 * The filter that makes this usable rather than merely true. Last year's
 * backup who signed elsewhere in March is the right answer to a question
 * nobody asked, and naming him would be worse than naming nobody.
 */
const moved = withSucc.flatMap(p =>
    p.successors.filter(s => !s.stillThere || s.team !== p.team)
        .map(s => `${s.name} ${s.team} ≠ ${p.team}`));
assert('nobody named has left', moved.length === 0, moved.join('; ') || 'all current');

step(4, 'the sample size is beside every number it qualifies');
const text = await panel.innerText();
const claims = [...text.matchAll(/(\d+\.\d)\s*a game over (\d+)/g)];
assert('each scoring line carries its game count', claims.length >= 2,
    claims.slice(0, 3).map(c => `${c[1]} over ${c[2]}`).join(', '));
assert('and no count is below the floor the engine states',
    claims.every(c => Number(c[2]) >= (payload?.minAbsence ?? 2)),
    `min ${Math.min(...claims.map(c => Number(c[2])))}, floor ${payload?.minAbsence}`);

step(5, 'availability is this league, not the abstract');
/**
 * The claim a reader acts on. A successor said to be on waivers must not be
 * on one of the twelve rosters the fixture holds, and one said to be taken
 * must be — checked against the league payload rather than against the page
 * that wrote it.
 */
const rostered = new Set();
for (const [, list] of Object.entries(F.rosters)) {
    for (const r of list) for (const pid of (r.players ?? [])) rostered.add(String(pid));
}
const ids = await panel.locator('a[href^="/redraft/players/"]').evaluateAll(
    els => els.map(e => e.getAttribute('href')));
assert('the successors link to their profiles', ids.length >= 2, `${ids.length} links`);

/**
 * Every named man carries a label, and every label is right.
 *
 * Checked against the fixture's own rosters rather than against the page,
 * and by count rather than by finding one of each: which states appear
 * depends on who happens to be measured this week, and an assertion that
 * needs a rostered successor to exist fails the day the data improves.
 */
const named = (payload?.players ?? []).flatMap(p => p.successors);
const labels = await panel.locator('li li > span:last-child').evaluateAll(
    els => els.map(e => e.textContent.trim()));
assert('every named successor carries a state', labels.length === named.length,
    `${labels.length} labels for ${named.length} successors`);
const wrong = labels.filter(l => !/^(on waivers|yours already|rostered · .+)$/.test(l));
assert('and every state is one of the three', wrong.length === 0, wrong.join('; '));

// Sleeper ids, because the fixture speaks in those and the payload in ours.
// Read straight from the database rather than through the app, so the page's
// own matching is not what is checking the page's own matching.
const { default: Database } = await import('better-sqlite3');
const db = new Database('dynasty_scout.db', { readonly: true });
const sleeperOf = {};
if (named.length) {
    const rows = db.prepare(
        `SELECT id, sleeper_id FROM players WHERE id IN (${named.map(() => '?').join(',')})`
    ).all(...named.map(s => s.id));
    for (const r of rows) sleeperOf[r.id] = String(r.sleeper_id ?? '');
}
db.close();
const mismatched = [];
for (let i = 0; i < named.length; i++) {
    const sid = sleeperOf[named[i].id];
    if (!sid) continue;                       // not matched to the platform at all
    const held = rostered.has(sid);
    const saysFree = labels[i] === 'on waivers';
    if (held === saysFree) mismatched.push(`${named[i].name}: ${labels[i]}`);
}
assert('a man on one of the twelve rosters is never called free',
    mismatched.length === 0, mismatched.join('; ') || `${named.length} checked`);

step(6, 'the four silences are told apart, rather than merged into one');
/**
 * "He has never been hurt" is the best news on the page, "he just signed
 * here" is a limit of the method, "nobody took the work" is a finding about
 * the offence, and only the fourth is missing data. A page that prints one
 * sentence for all four is the page every handcuff chart already is.
 */
assert('the no-evidence cases are written out',
    /has not missed a game|picked up enough of the work|since left the team/i.test(text),
    (text.match(/has not missed a game|picked up enough of the work|since left the team/i) ?? [''])[0]);

const newcomers = (payload?.players ?? []).filter(p => p.newToTeam);
if (newcomers.length > 0) {
    assert('a man new to his team is not called a man with no games',
        !new RegExp(`${newcomers[0].name}[\\s\\S]{0,120}no games logged`, 'i').test(text),
        newcomers.map(p => p.name).join(', '));
    assert('and the row says where his record actually is',
        new RegExp(`New to ${newcomers[0].team}`, 'i').test(text),
        `${newcomers.length} new to their team`);
} else {
    console.log('        no newcomers on this roster to check');
}

step('6b', 'the two questions the route answers stay apart');
/**
 * One route, two modes, and an absent parameter that parses to a list of one.
 * `''.split(',')` is `['']`, `Number('')` is 0, and `Number.isFinite(0)` is
 * true — so every request arrived carrying `inherits=[0]`, took the second
 * path, and this whole panel went blank with no error anywhere. Both modes
 * are asked directly, because the page can only show what the route sends
 * and a page check cannot tell "no successors" from "wrong branch".
 */
const probe = await page.evaluate(async ids => {
    const one = await (await fetch(`/api/redraft/successors?ids=${ids.join(',')}`)).json();
    const two = await (await fetch(`/api/redraft/successors?inherits=${ids.join(',')}`)).json();
    return { one, two };
}, (payload?.players ?? []).slice(0, 12).map(p => p.playerId));
assert('asking about my men answers about my men',
    (probe.one.players ?? []).length > 0
    && 'successors' in (probe.one.players[0] ?? {}),
    `${(probe.one.players ?? []).length} contingencies`);
assert('and asking the inverse answers the inverse',
    Array.isArray(probe.two.players)
    && (probe.two.players.length === 0 || 'from' in probe.two.players[0]),
    `${(probe.two.players ?? []).length} inheritances`);

step(7, 'and the panel is readable on a phone');
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert('no horizontal scroll at 390px', overflow <= 1, `${overflow}px over`);

/**
 * And the name is still on the page, which not overflowing does not imply.
 *
 * At 390px the first layout put the name in the flexible column beside a
 * fixed one holding a long row of numbers: nothing overflowed, nothing
 * errored, and every successor rendered as a coloured dot and some
 * statistics about nobody. A width check passes that happily, so the names
 * are counted and measured.
 */
const shown = await panel.locator('li li').evaluateAll(els => els.map(e => {
    // Skipping the coloured dot, which is the first child and aria-hidden —
    // it is exactly the element that was left standing when the name
    // collapsed, so selecting it would make this check pass on the bug.
    const name = e.querySelector(':scope > a, :scope > span:not([aria-hidden])');
    const r = name?.getBoundingClientRect();
    return { text: (name?.textContent ?? '').trim(), width: r ? Math.round(r.width) : 0 };
}));
assert('every successor name survives the narrow layout',
    shown.length > 0 && shown.every(x => x.text.length > 0 && x.width >= 40),
    shown.map(x => `${x.text || '∅'}@${x.width}px`).join(', '));

await panel.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await panel.screenshot({ path: '/tmp/contingency-phone.png' });
await page.setViewportSize({ width: 1500, height: 1400 });
await page.waitForTimeout(400);
await panel.screenshot({ path: '/tmp/contingency.png' });

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
