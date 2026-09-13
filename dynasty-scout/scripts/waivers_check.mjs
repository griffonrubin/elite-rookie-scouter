/**
 * The waiver wire, against a real league.
 *
 * "Available" is not a property of a player, it is a property of a player
 * and a league, so the only test worth running is one with real rosters in
 * it: every player txmossad owns has to be absent from a list of people he
 * could claim, and that cannot be checked against a fixture nobody owns.
 *
 * It also pins which of the two lists the page is giving. Ranking on a
 * change in usage is the whole premise, and it needs a season behind it: the
 * first version compared the last three games with the five before them
 * across an *offseason*, so in week one "recent" meant weeks sixteen to
 * eighteen of the year before — the weeks eliminated teams rest their
 * starters. It opened with two backup quarterbacks and a back averaging two
 * points, and looked like no waiver page anywhere, which was not a sign it
 * had found something.
 *
 * So in September the page must say plainly that it is ranking the way
 * everyone else does and why, and the list must be full of names a reader
 * would recognise from any other site. The trend half is pinned in
 * scripts/waiver_rank_check, which can build a season the database has not
 * played yet.
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
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
await page.waitForTimeout(9000);

step(2, 'it lists available players, and says what ordered them');
const rows = page.locator('button[aria-expanded]');
const n = await rows.count();
console.log('      rows:', n);
assert('there are candidates', n >= 5, String(n));
t = await page.locator('body').innerText();
console.log('      ' + (await rows.first().innerText()).replace(/\n+/g, ' | '));
assert('the free-agent pool is sized', /Out of [\d,]+ free agents/.test(t),
    (t.match(/Out of [\d,]+ free agents/)||[])[0]);

/**
 * Which list this is. The page has two and they answer different questions,
 * so whichever it gives has to be named rather than implied.
 */
const trendMode = /Rising roles, free in your league/i.test(t);
console.log(`      mode: ${trendMode ? 'trend' : 'projection'}`);
if (trendMode) {
    assert('each row shows before and after', /→/.test(t));
    assert('and the ranking is explained', /change in snaps and touches/i.test(t));
} else {
    assert('the heading does not claim a trend it has not got',
        /Best available in your league/i.test(t));
    assert('each row carries the number it was ranked on',
        /(above|below) a startable/i.test(t),
        (t.match(/[^\n]*(above|below) a startable[^\n]*/)||['(no gap shown)'])[0]);
    /**
     * In weeks, on both halves of the sentence.
     *
     * Eleven points across a season is two thirds of a point on a Sunday, so
     * a reader shown the season number acts on a gap that is not there — and
     * a season total printed beside a weekly gap is worse again, because the
     * big number makes the small one look like a rounding error when it is
     * the entire finding.
     */
    assert('and states it a week at a time, on both sides',
        /[\d.]+ a week · [\d.]+ (above|below)/i.test(t),
        (t.match(/[\d.]+ a week · [^\n]*/)||['(season units)'])[0]);
    assert('with no season total left mixed in beside it', !/\d{3} pts/.test(t),
        (t.match(/[^\n]*\d{3} pts[^\n]*/)||['clean'])[0]);
    assert('the ranking is explained rather than asserted',
        /last player at that position anybody in a twelve-team league starts/i.test(t));
    /**
     * And why it is not the trend list. "Nothing better to answer it with"
     * is the honest reason; a page that silently degrades is worse than one
     * that never had the feature.
     */
    assert('and why it is not the other one',
        /needs \d+ games behind him/i.test(t),
        (t.match(/[^\n]*needs \d+ games behind him[^\n]*/)||['(not said)'])[0]);
    assert('naming how far off it is',
        /no free agent has played one yet|free agents? (has|have) that so far/i.test(t));
}

/**
 * The complaint that caused all this: the list looked like nobody else's.
 *
 * Not checkable against a list of names — they move every time projections
 * refresh — but checkable as shape. Every other site's combined waiver list
 * is backs, receivers and tight ends; it is not eight quarterbacks, and it
 * is certainly not four kickers and four defences, which is what value over
 * replacement gives you if you let it, because almost every startable kicker
 * is unrostered.
 */
const top = await rows.evaluateAll(els => els.slice(0, 20).map(e => {
    const m = e.innerText.match(/\n\s*(QB|RB|WR|TE|K|DST)\s*·/);
    return m ? m[1] : '?';
}));
const count = p => top.filter(x => x === p).length;
console.log('      top twenty by position: '
    + ['RB','WR','TE','QB','K','DST'].map(p => `${p} ${count(p)}`).join('  '));
assert('no kicker or defence in the combined list', count('K') + count('DST') === 0,
    `${count('K')} kickers, ${count('DST')} defences`);
assert('not a list of quarterbacks', count('QB') <= 8, `${count('QB')} of 20`);
assert('it is mostly the positions every other waiver page lists',
    count('RB') + count('WR') + count('TE') >= 10,
    `${count('RB') + count('WR') + count('TE')} of 20`);

/**
 * And the list explains its own shape.
 *
 * A combined list ranked across positions comes out lopsided whenever a
 * league's rosters are, and this one does: twelve teams rostering one tight
 * end each leaves the thirteenth-best tight end in the game free while every
 * useful back is owned. That is the most actionable thing on the page. Shown
 * as a list of names it reads as a bug — which is exactly how it was
 * reported — so the shape is drawn rather than left to be inferred.
 */
if (!trendMode) {
    const panel = page.locator('h3:text-is("Where the value is")')
        .locator('xpath=../..').first();
    const depth = panel.locator('button');
    const bars = await depth.count();
    const strip = await panel.innerText();
    console.log('      ' + strip.replace(/\n+/g, ' | '));
    assert('the wire is broken down by position',
        bars >= 4 && bars <= 6, `${bars} positions`);
    assert('each says how many are startable and by how much a week',
        /[+−][\d.]+ · (\d+ startable|none startable)/.test(strip),
        (strip.match(/[+−][\d.]+ · [^\n]*/)||['(not shown)'])[0]);
    // Clicking a bar is the point: the finding is only half a tool if a
    // reader cannot act on it.
    await depth.filter({ hasText: /^TE/ }).first().click();
    await page.waitForTimeout(2500);
    const pressedNow = await page.locator('button[aria-pressed="true"]').allInnerTexts();
    assert('and a position can be opened from it', pressedNow.includes('TE'),
        pressedNow.join(','));
    /**
     * The contradiction the strip would otherwise create.
     *
     * It counts kickers and defences, and in most leagues they are the only
     * positions with a startable free agent — so a reader sees "3 startable"
     * against K and then no kicker anywhere in the list beneath it. Saying
     * why is the difference between a considered omission and a bug.
     */
    assert('and the positions it counts but does not list say why',
        /Kickers and defences are counted here and left out/i.test(strip),
        (strip.match(/Kickers and defences[^.]*\./)||['(unexplained)'])[0]);
    await page.getByRole('button', { name: /^ALL$/ }).first().click();
    await page.waitForTimeout(2500);
}

step(3, 'nobody rostered in the league appears, injured reserve included');
// Every one of txmossad's own starters is taken, so none may be listed.
const mine = ['Jalen Hurts', 'Jonathan Taylor', 'Zay Flowers', 'Breece Hall'];
const listed = mine.filter(m => t.includes(m));
assert('my own players are not offered as free agents', listed.length === 0,
    listed.join(', ') || 'none listed');
/**
 * The count is the assertion, because the names on IR change with the league.
 *
 * The snapshot has two lists and only one of them is the roster: `slots`
 * holds the spots that can take a lineup, so it drops injured reserve and
 * the taxi squad on purpose — you cannot start those men. Reading it as
 * "who is taken" offered three of this league's stashed players as free
 * agents, and because the ranking is on value over replacement the best of
 * them led the list. A waiver page whose top recommendation cannot be
 * claimed by anyone is worse than no waiver page.
 */
const rostered = new Set();
for (const r of Object.values(F.rosters['1388633751839309824'])) {
    for (const pid of (r.players ?? [])) rostered.add(String(pid));
}
const considered = Number((t.match(/Out of ([\d,]+) free agents/) || [])[1]
    ?.replace(/,/g, ''));
console.log(`      ${rostered.size} on rosters, ${considered} offered as free`);
assert('every rostered id is held out, not just the startable ones',
    considered > 0 && considered <= 1332 - rostered.size + 2,
    `${considered} free against ${rostered.size} rostered`);

step(4, 'a row opens to the same depth as start/sit');
await rows.first().click();
await page.waitForTimeout(4000);
const body = await page.locator('body').innerText();
assert('it explains the projection', /WHAT MOVED IT/i.test(body));
assert('it shows the splits', /SPLITS/i.test(body));
assert('and the box scores', /Game log/i.test(body));
const why = await page.locator('h4:text-is("What moved it")').locator('xpath=../..').first().innerText();
console.log('      ' + why.split('\n').slice(0, 4).join(' | '));
/**
 * The disagreement is flagged, and flagged the right way round.
 *
 * This used to assert the word "predates", from copy that told readers the
 * projection was stale and to prefer the recent log. scripts/formweight_check
 * measured that over two seasons and it is backwards: a five-game average
 * predicts the next week worse than a season average, and worst of all for
 * the players who look exactly like this one. So the panel now flags the gap
 * and points at the usage — and the test checks it does not go back to
 * recommending the log.
 *
 * Whether the gap is flagged at all depends on the player who happens to top
 * the list, so only the direction is asserted unconditionally: the copy must
 * never go back to telling a reader to chase the recent log, in any mode, on
 * any row.
 */
const flagged = /a long way from it/i.test(why);
console.log(`      projection-vs-log gap flagged: ${flagged}`);
if (flagged) {
    assert('and it points at the usage rather than the recent points',
        /usage is the part that carries/i.test(why),
        why.replace(/\n+/g, ' | ').slice(0, 160));
}
assert('the panel never tells a reader to prefer the log',
    !/predates/i.test(why) && !/read the usage and the log/i.test(why),
    (why.match(/[^\n]*(predates|read the usage and the log)[^\n]*/)||['clean'])[0]);

step(5, 'a position is ranked within itself, not filtered out of the top forty');
/**
 * The bug this replaces.
 *
 * Trend is ranked across every position at once, so a league's forty biggest
 * movers are mostly backs and receivers — on this league, twelve backs,
 * fifteen receivers, ten quarterbacks and three tight ends, with no kicker or
 * defence at all. Filtering those forty in the browser meant "show me tight
 * ends" answered with three while eighty-nine sat in the pool, and the
 * kicker button, had there been one, would always have been empty.
 */
// A defence is included now. It has no snap count and nothing to trend on,
// which is why it used to come back empty — but "the best available defence
// in your league" is a real question with a real answer whenever the ranking
// is on projections, and returning nothing to it was the page refusing to
// answer something it knew.
for (const [label, want] of [['RB', 8], ['TE', 8], ['K', 5], ['DST', 5]]) {
    await page.getByRole('button', { name: new RegExp(`^${label}$`) }).first().click();
    await page.waitForTimeout(2500);
    const rows = await page.locator('button[aria-expanded]').count();
    const body = await page.locator('body').innerText();
    const considered = (body.match(/Out of ([\d,]+) free agents/) || [])[1];
    console.log(`      ${label}: ${rows} rows from ${considered ?? '?'} considered`);
    assert(`${label} is ranked within itself`, rows >= want, `${rows} rows`);
}
// And whichever list a position comes back empty on, the page says why
// rather than showing a blank and letting a reader wonder if it looked.
await page.getByRole('button', { name: /^K$/ }).first().click();
await page.waitForTimeout(2500);
const kBody = await page.locator('body').innerText();
const kRows = await page.locator('button[aria-expanded]').count();
assert('a kicker list is ranked but never mixed into the combined one',
    kRows >= 5, `${kRows} rows`);
assert('and it is ranked against other kickers',
    /(above|below) a startable K|change in snaps/i.test(kBody),
    (kBody.match(/[^\n]*(above|below) a startable[^\n]*/) || ['(not shown)'])[0]);

step('5b', 'arriving with a position in the URL opens on it');
await page.goto(`${BASE}/in-season/waivers?pos=TE`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const pressed = await page.locator('button[aria-pressed="true"]').allInnerTexts();
console.log('      pressed filter: ' + pressed.join(', '));
assert('the tight end filter is already on', pressed.includes('TE'), pressed.join(','));
const teRows = await page.locator('button[aria-expanded]').count();
assert('and it is showing tight ends', teRows >= 8, `${teRows} rows`);

step('5c', 'a phone reader can tell whose number that is');
await page.goto(`${BASE}/in-season/waivers`, { waitUntil: 'domcontentloaded' });
await page.setViewportSize({ width: 390, height: 844 });
await page.getByText(/Out of \d+ free agents/).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
const phoneRow = await page.locator('button[aria-expanded]').first().innerText();
console.log('      ' + phoneRow.replace(/\n+/g, ' | '));
// The column headers are desktop-only, so a bare "21.25" beside a player's
// name reads as his projection when it is his team's implied total.
assert('the implied total says it is the team\'s', /team total/i.test(phoneRow),
    phoneRow.replace(/\n+/g, ' | '));
const o2 = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('and the row still fits a phone', o2.sw <= o2.cw + 1, JSON.stringify(o2));
await page.setViewportSize({ width: 1500, height: 1100 });
await page.waitForTimeout(600);

step(6, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0,2).join(' | '));
const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no overflow', o.sw <= o.cw, JSON.stringify(o));
await page.screenshot({ path: process.env.SHOT ?? 'waivers.png', fullPage: false });
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
