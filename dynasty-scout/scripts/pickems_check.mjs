/**
 * Spreads, and the claim the page is built on.
 *
 * The page's thesis is a number — favourites cover about 49% of the time —
 * and a thesis that arrives from the database has to be checked against the
 * database rather than against a screenshot. So this asserts the arithmetic
 * as well as the rendering: that every bucket's cover rate sits in the band
 * the page says it does, that the straight-up rate climbs monotonically
 * through the buckets (which is the other half of the argument), and that
 * the market price and the historical rate agree on most of this week's
 * games, since "they agree" is the finding being reported.
 *
 * Plus the thing a confidence pool actually needs: that the points column is
 * a permutation of 1..n ordered by win probability, because a pool scored
 * that way is maximised by exactly that ordering and getting it backwards
 * would be worse than not offering it.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:3090';

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

step(1, 'the calibration says what the page claims it says');
const api = await (await fetch(`${BASE}/api/redraft/pickems?week=1`)).json();
console.log(`      ${api.calibration.length} buckets, `
    + `${api.overall.games.toLocaleString()} games, `
    + `${api.overall.fromSeason}–${api.overall.toSeason}`);
assert('there are buckets to read', api.calibration.length >= 8,
    String(api.calibration.length));
assert('the overall cover rate is a coin flip',
    Math.abs(api.overall.favCoverRate - 0.5) < 0.03,
    `${(api.overall.favCoverRate * 100).toFixed(1)}%`);
const covers = api.calibration.map(c => c.favCoverRate);
console.log('      cover by bucket: '
    + api.calibration.map(c => `${c.label} ${(c.favCoverRate * 100).toFixed(0)}%`).join(', '));
assert('and so is every bucket', covers.every(c => c > 0.44 && c < 0.56),
    covers.map(c => (c * 100).toFixed(1)).join(','));
assert('every bucket has enough games to say so',
    api.calibration.every(c => c.coverSample >= 100),
    api.calibration.map(c => c.coverSample).join(','));

step(2, 'the other half: straight up is highly predictable');
const wins = api.calibration.map(c => c.favWinRate);
console.log('      win by bucket:   '
    + api.calibration.map(c => `${c.label} ${(c.favWinRate * 100).toFixed(0)}%`).join(', '));
assert('a pick is a coin flip', Math.abs(wins[0] - 0.5) < 0.06,
    `${(wins[0] * 100).toFixed(1)}%`);
assert('two touchdowns is not', wins[wins.length - 1] > 0.85,
    `${(wins[wins.length - 1] * 100).toFixed(1)}%`);
// Allowing one inversion: these are samples, and 3 sits on a key number.
const drops = wins.filter((w, i) => i > 0 && w < wins[i - 1]).length;
assert('and it climbs with the line', drops <= 1, `${drops} inversions`);
assert('the two series genuinely separate',
    wins[wins.length - 1] - covers[covers.length - 1] > 0.3,
    `${(wins[wins.length - 1] * 100).toFixed(0)}% vs `
    + `${(covers[covers.length - 1] * 100).toFixed(0)}%`);

step(3, 'the market and the history agree');
const withBoth = api.games.filter(g => g.favWinProb != null && g.history);
const gaps = withBoth.map(g => Math.abs(g.favWinProb - g.history.favWinRate));
const worst = Math.max(...gaps);
const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
console.log(`      ${withBoth.length} priced games; median gap `
    + `${(median * 100).toFixed(1)}pp, worst ${(worst * 100).toFixed(1)}pp`);
assert('most games are priced', withBoth.length >= 10, String(withBoth.length));
// This is the claim in the page's own copy, so it has to hold or the copy
// has to change.
assert('they usually agree within a few points', median < 0.05,
    `${(median * 100).toFixed(1)}pp`);

step(4, 'every game is a real, paired game');
assert('sixteen games in week 1', api.games.length === 16, String(api.games.length));
assert('nobody plays themselves', api.games.every(g => g.home !== g.away));
assert('every game has two distinct sides',
    new Set(api.games.flatMap(g => [g.home, g.away])).size === api.games.length * 2);
assert('the favourite is one of the two teams',
    api.games.every(g => g.favourite == null
        || g.favourite === g.home || g.favourite === g.away),
    api.games.filter(g => g.favourite && g.favourite !== g.home && g.favourite !== g.away)
        .map(g => g.gameId).join(','));
assert('the two win probabilities add to one',
    api.games.every(g => g.homeWinProb == null || g.awayWinProb == null
        || Math.abs(g.homeWinProb + g.awayWinProb - 1) < 0.02),
    api.games.filter(g => g.homeWinProb != null
        && Math.abs(g.homeWinProb + g.awayWinProb - 1) >= 0.02)
        .map(g => `${g.gameId} ${(g.homeWinProb + g.awayWinProb).toFixed(3)}`).join(', '));
assert('the favourite is the side the market likes',
    api.games.every(g => g.favWinProb == null || g.favWinProb >= 0.5),
    api.games.filter(g => g.favWinProb != null && g.favWinProb < 0.5)
        .map(g => `${g.gameId} ${g.favWinProb}`).join(','));
assert('implied team totals add to the game total',
    api.games.every(g => g.totalLine == null || g.homeTotal == null
        || Math.abs(g.homeTotal + g.awayTotal - g.totalLine) < 0.51),
    api.games.filter(g => g.totalLine != null && g.homeTotal != null
        && Math.abs(g.homeTotal + g.awayTotal - g.totalLine) >= 0.51)
        .map(g => g.gameId).join(','));

step(5, 'the page opens on the picks');
const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1300 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(`${BASE}/in-season/pickems`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: /most confident first/i }).waitFor({ timeout: 25000 });
await page.waitForTimeout(1200);
let t = await page.locator('body').innerText();
assert("Pick'ems is a real tab, not a Soon tag",
    await page.getByRole('link', { name: /pick.ems/i }).count() === 1);

/**
 * The sheet rows, and only those.
 *
 * There used to be two tables of the same sixteen games — a ranked sheet and
 * a kickoff-ordered card — which is the opposite of straightforward and made
 * every page-wide selector count thirty-two rows. One table now, ordered
 * three ways.
 */
const sheet = () => page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /most confident first/i }) });
const pickRows = () => sheet().locator('button[aria-expanded]');

step('5b', 'the answer first: a stack rank, because that is how the pool scores');
const readRows = () => pickRows().evaluateAll(els => els.map(e => {
    const x = e.innerText.replace(/\n+/g, ' | ');
    return {
        text: x,
        pts: parseInt(x, 10),
        pick: (x.match(/^\d+ \| ([A-Z]{2,3})/) || [])[1] ?? null,
        mkt: parseFloat((x.match(/\| ([\d.]+)% \|/) || [])[1] ?? 'NaN'),
        hist: parseFloat((x.match(/([\d.]+)% \| [\d,]+ games/) || [])[1] ?? 'NaN'),
        n: parseInt(((x.match(/([\d,]+) games/) || [])[1] ?? '').replace(/,/g, ''), 10),
        ats: parseFloat((x.match(/([\d.]+)% \| (coin flip|beats −110)/) || [])[1] ?? 'NaN'),
    };
}));
let rows = await readRows();
console.log('      ' + rows.slice(0, 3).map(r => r.text.slice(0, 78)).join('\n      '));
assert('every game is on the sheet', rows.length === api.games.length,
    `${rows.length} of ${api.games.length}`);
const pts = rows.map(r => r.pts);
assert('the points are a permutation of one to n',
    new Set(pts).size === pts.length && Math.min(...pts) === 1
        && Math.max(...pts) === rows.length, pts.join(','));
assert('and they count down the page', pts.every((p, i) => i === 0 || p < pts[i - 1]),
    pts.join(','));
assert('with the most confident pick worth the most',
    rows.every((r, i) => i === 0 || !(r.mkt > rows[i - 1].mkt + 0.05)),
    rows.map(r => r.mkt).join(','));

step(6, 'two independent numbers, not one blended one');
/**
 * The whole argument of the page. A single figure would be more convenient
 * and would hide the only thing on the row worth arguing with: where the
 * market and twenty-seven seasons of games disagree, and over how many.
 */
assert('every row carries the market price',
    rows.every(r => Number.isFinite(r.mkt)), String(rows.filter(r => !Number.isFinite(r.mkt)).length));
assert('and what lines that size have actually done',
    rows.every(r => Number.isFinite(r.hist)), String(rows.filter(r => !Number.isFinite(r.hist)).length));
assert('with the games behind it, so a rate is not mistaken for a fact',
    rows.every(r => r.n > 0), rows.map(r => r.n).slice(0, 4).join(','));
const shown = rows.map(r => Math.abs(r.mkt - r.hist));
console.log(`      market against record: worst gap ${Math.max(...shown).toFixed(1)}pp`);
assert('the two usually agree, which is worth seeing rather than assuming',
    shown.filter(g => g < 5).length >= rows.length - 2,
    `${shown.filter(g => g < 5).length} of ${rows.length} within 5pp`);
/**
 * And the spread column says the quiet part on every row rather than in a
 * chart a reader passes once: the line is priced to be a coin flip.
 */
assert('every row prices the spread separately from the winner',
    rows.every(r => Number.isFinite(r.ats)), String(rows.filter(r => !Number.isFinite(r.ats)).length));
assert('and calls it against the price of a standard bet',
    /coin flip|beats −110/.test(rows[0].text), rows[0].text.slice(0, 70));

step(7, 'the working, for anyone who wants to check it');
await pickRows().first().click();
await page.waitForTimeout(700);
const audit = await sheet().locator('div').filter({ hasText: /what the book is charging/i })
    .first().innerText();
console.log('      ' + audit.replace(/\n+/g, ' | ').slice(0, 190));
assert('both prices are shown', /moneyline/i.test(audit));
assert('and what each one implies on its own', /implies [\d.]+%/.test(audit),
    (audit.match(/implies [\d.]+%/g) || []).join(' '));
assert('the margin is named rather than silently removed',
    /more than one hundred by [\d.]+ points/i.test(audit),
    (audit.match(/more than one hundred by [^\n]*/i) || ['(hidden)'])[0].slice(0, 90));
assert('and the division that removes it is stated',
    /each side divided by the two added together/i.test(audit));
assert('the bucket behind the historical rate is defined',
    /spreads in this bucket/i.test(audit) && /games counted/i.test(audit));
assert('with an error bar on it, because a rate is not a fact',
    /give or take [\d.]+ points/i.test(audit),
    (audit.match(/give or take [^\n]*/i) || ['(none)'])[0]);
assert('and the break-even price a bet has to clear',
    /52\.4% to break even/i.test(audit) || /against 52\.4%/i.test(audit),
    (audit.match(/[^\n]*break even[^\n]*/i) || ['(not stated)'])[0].slice(0, 90));
await pickRows().first().click();

step('7b', 'three orders, and only one of them renumbers the sheet');
const order = async label => {
    await sheet().getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).click();
    await page.waitForTimeout(700);
    return readRows();
};
const byMarket = rows.map(r => r.pick);
const byRecord = await order('The record');
console.log('      by the record: ' + byRecord.slice(0, 3).map(r => `${r.pts}:${r.pick}`).join(' '));
assert('the record is a different question and gets different numbers',
    byRecord.map(r => r.pick).join() !== byMarket.join()
        || byRecord.every(r => Number.isFinite(r.hist)),
    byRecord.slice(0, 3).map(r => r.pick).join(','));
assert('and is still a permutation of one to n',
    new Set(byRecord.map(r => r.pts)).size === byRecord.length,
    byRecord.map(r => r.pts).join(','));
const byKickoff = await order('Kickoff');
console.log('      by kickoff:    ' + byKickoff.slice(0, 3).map(r => `${r.pts}:${r.pick}`).join(' '));
/**
 * Looking at Thursday is not asking for different picks. A page that
 * renumbers itself when you change how you look at it is a page that
 * changes its advice for no reason.
 */
const marketPts = new Map(rows.map(r => [r.pick, r.pts]));
assert('sorting by kickoff reorders without renumbering',
    byKickoff.every(r => marketPts.get(r.pick) === r.pts),
    byKickoff.slice(0, 4).map(r => `${r.pick}:${r.pts}≠${marketPts.get(r.pick)}`).join(' '));
assert('and it really is a different order',
    byKickoff.map(r => r.pick).join() !== byMarket.join(),
    byKickoff.slice(0, 3).map(r => r.pick).join(','));
await order('The market');
rows = await readRows();

step(8, 'the evidence behind the spread column, below the picks rather than above');
t = await page.locator('body').innerText();
assert('the thesis is stated with its number',
    new RegExp(`${(api.overall.favCoverRate * 100).toFixed(1)}%`).test(t),
    (t.match(/covered[^\n]{0,40}/) || ['(not stated)'])[0]);
assert('the sample is named', /regular-season games/.test(t));
const svg = page.locator('svg[role="img"]').first();
assert('the chart is there', await svg.count() === 1);
const label = await svg.getAttribute('aria-label');
assert('and described for a reader who cannot see it',
    /cover the spread stays near half/i.test(label ?? ''), (label ?? '').slice(0, 60) + '…');
const legend = page.locator('figure > div').first();
const labels = await legend.locator('span').filter({ hasText: /favourite/ }).allInnerTexts();
console.log('      legend: ' + labels.join(' | '));
assert('a legend names both series outside the scroller',
    labels.length === 2 && labels.some(l => /wins/.test(l)) && labels.some(l => /covers/.test(l)),
    labels.join(' | '));
const dots = await svg.locator('circle').count();
assert('a dot per bucket per series', dots === api.calibration.length * 2,
    `${dots} for ${api.calibration.length} buckets`);
await svg.locator('rect').nth(2).hover();
await page.waitForTimeout(400);
const cap = await page.locator('figcaption').first().innerText();
console.log('      hover: ' + cap.replace(/\n/g, ' '));
assert('hovering names the bucket and its counts', /games/.test(cap) && /covered/.test(cap), cap);

step('8b', 'a different week is a different sheet');
await page.getByRole('button', { name: /^7$/ }).click();
await page.waitForTimeout(2000);
const n7 = await pickRows().count();
console.log(`      week 7: ${n7} games`);
assert('week 7 has its own games', n7 > 0 && n7 <= 16, String(n7));
await page.getByRole('button', { name: /^1$/ }).click();
await page.waitForTimeout(1500);

step(9, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));
await page.setViewportSize({ width: 400, height: 1200 });
await page.waitForTimeout(600);
const op = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('nor at phone width', op.sw <= op.cw + 1, JSON.stringify(op));
// The column headers are desktop-only, so on a phone two stacked bars would
// otherwise be two unexplained percentages one above the other.
const phone = await pickRows().first().innerText();
console.log('      phone row: ' + phone.replace(/\n+/g, ' | '));
assert('a phone row names both probabilities, since the headers are desktop-only',
    /market [\d.]+%/i.test(phone) && /record [\d.]+%/i.test(phone),
    phone.replace(/\n+/g, ' | '));
assert('and still leads with the confidence points',
    /^\d+\n/.test(phone), phone.split('\n')[0]);
// Text inside a viewBox scales with the frame, so a label that is legible on
// a desktop can render at four pixels here.
const smallest = await page.locator('svg[role="img"] text').evaluateAll(els =>
    Math.min(...els.filter(e => e.getBoundingClientRect().height > 0)
        .map(e => e.getBoundingClientRect().height)));
console.log(`      smallest visible chart label: ${smallest.toFixed(1)}px`);
assert('no chart text is rendered too small to read', smallest >= 8,
    `${smallest.toFixed(1)}px`);
await page.setViewportSize({ width: 1500, height: 1300 });
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^1$/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: process.env.SHOT ?? 'pickems.png', fullPage: false });

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
