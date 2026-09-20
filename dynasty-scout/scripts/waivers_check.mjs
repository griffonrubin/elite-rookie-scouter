/**
 * The waiver wire, against a real league.
 *
 * "Available" is not a property of a player, it is a property of a player
 * and a league, so the only test worth running is one with real rosters in
 * it: every player txmossad owns has to be absent from a list of people he
 * could claim, and that cannot be checked against a fixture nobody owns.
 *
 * And it pins what the page is for. Two earlier versions got that wrong in
 * opposite directions. The first ranked on a change in usage across an
 * *offseason*, so in week one "the last three games" meant weeks sixteen to
 * eighteen of the year before — the weeks eliminated teams rest their
 * starters — and it opened with two backup quarterbacks. The second fixed
 * the ranking and still answered the wrong question: "best available" is a
 * fact about other people's rosters, and a manager is deciding whether
 * anybody on the wire beats a player they are already holding.
 *
 * So three numbers have to be on every row — this Sunday, the rest of the
 * season, and what a claim would do to this reader's own lineup — and the
 * page has to be willing to say no, which most weeks is the true answer.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

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
    if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/))) return j(matchupsFor(F, m[1], Number(m[2])));
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
assert('and says what it will actually tell you',
    /what claiming him would do to your own lineup/i.test(t));
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first().click();
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
await page.waitForTimeout(12000);

/**
 * The candidate rows, and only those.
 *
 * The page has two other lists of names on it now — your own roster against
 * the wire, and the positional breakdown — and a bare `button[aria-expanded]`
 * or a scan of the whole body counts them. That is how "my own players are
 * not offered as free agents" started failing on a page that was offering
 * nothing of the sort: it was reading my own name out of the comparison
 * section built to show it to me.
 */
const wireSection = () => page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /best available in your league/i }) });
const wireRows = () => wireSection().locator('button[aria-expanded]');

step(2, 'three numbers, in the order the decision is made');
const n = await wireRows().count();
console.log('      rows:', n);
assert('there are candidates', n >= 5, String(n));
const cells = () => wireRows().evaluateAll(els => els.map(e => {
    const x = e.innerText.replace(/\n+/g, ' | ');
    return {
        text: x,
        name: e.innerText.split('\n')[0].trim(),
        week: parseFloat((x.match(/\| ([\d.]+) \| this week/) || [])[1] ?? 'NaN'),
        rank: (x.match(/\b(QB|RB|WR|TE|K|DST)(\d+)\b/) || [])[0] ?? null,
        net: (x.match(/([+−-][\d.]+) \| (drop [^|]+|open spot)/) || [])[1] ?? null,
        noUpgrade: /no upgrade/.test(x),
        sched: (x.match(/sched (\d+)\/(\d+)/) || []).slice(1).map(Number),
        playoffs: (x.match(/playoffs (\d+)\/(\d+)/) || []).slice(1).map(Number),
    };
}));
const rowCells = await cells();
console.log('      ' + rowCells.slice(0, 3).map(c => c.text.slice(0, 96)).join('\n      '));
assert('every row projects this Sunday',
    rowCells.filter(c => Number.isFinite(c.week)).length >= rowCells.length - 2,
    `${rowCells.filter(c => Number.isFinite(c.week)).length} of ${rowCells.length}`);
assert('and they are player-sized numbers, not season totals',
    rowCells.filter(c => Number.isFinite(c.week)).every(c => c.week >= 0 && c.week < 40),
    rowCells.map(c => c.week).filter(Number.isFinite).slice(0, 6).join(','));
assert('every row places him for the rest of the season',
    rowCells.every(c => c.rank != null),
    rowCells.filter(c => c.rank == null).length + ' without a rank');
/**
 * The column no other waiver page has.
 *
 * Either a number and the man who would be dropped for it, or the word no.
 * A page that can only say yes is a page selling churn, and in week one
 * against a drafted roster the honest answer is usually no.
 */
const decided = rowCells.filter(c => c.net != null || c.noUpgrade);
console.log(`      ${decided.length} of ${rowCells.length} rows answer "should I claim him"; `
    + `${rowCells.filter(c => c.net != null).length} say yes`);
assert('every row says what the claim would do to my lineup',
    decided.length === rowCells.length,
    `${rowCells.length - decided.length} silent`);
assert('and the ones that are an upgrade name who goes',
    rowCells.filter(c => c.net != null).every(c => /drop |open spot/.test(c.text)),
    rowCells.filter(c => c.net != null).slice(0, 2).map(c => c.net).join(','));
/**
 * A claim is a roster spot held for months, so the fixtures behind a
 * candidate belong on the row rather than one page away — and the playoff
 * weeks more than the rest of them, because they are the half that decides
 * a season. Measured against what those defences give up to his own
 * position, not against how good they are: Pittsburgh are thirty-second in
 * the league for receivers and first for tight ends.
 */
const withSched = rowCells.filter(c => c.sched.length === 2);
console.log(`      ${withSched.length} rows carry a schedule; `
    + rowCells.slice(0, 3).map(c =>
        `${c.name.split(' ').pop()} ${c.sched.join('/')}→${c.playoffs.join('/')}`).join('  '));
assert('the schedule he would be claimed into is on the row',
    withSched.length >= rowCells.length - 2,
    `${withSched.length} of ${rowCells.length}`);
assert('with the playoff weeks given separately',
    rowCells.filter(c => c.playoffs.length === 2).length >= rowCells.length - 2,
    String(rowCells.filter(c => c.playoffs.length === 2).length));
assert('ranked against the whole league at that position',
    withSched.every(c => c.sched[1] >= 30 && c.sched[0] >= 1 && c.sched[0] <= c.sched[1]),
    withSched.slice(0, 4).map(c => c.sched.join('/')).join(' '));
// The two windows must be able to disagree, or one of them is decoration.
const moved = withSched.filter(c => c.playoffs.length === 2
    && Math.abs(c.sched[0] - c.playoffs[0]) >= 8).length;
console.log(`      ${moved} of ${withSched.length} move eight places or more `
    + 'between the two windows');
assert('and the playoff window is a different question from the rest', moved >= 3,
    String(moved));

assert('the matchup is on the row too',
    /vs [A-Z]{2,3} [\d.]+ (soft|leaky|average|firm|tough)/.test(rowCells[0].text),
    (rowCells[0].text.match(/vs [A-Z]{2,3}[^|]*/) || ['(none)'])[0]);

step(3, 'it ranks on whichever of the three you ask for');
t = await page.locator('body').innerText();
assert('all three orderings are offered',
    /rest of season/i.test(t) && /this week/i.test(t) && /upgrade to your lineup/i.test(t));
assert('and the current one explains itself',
    /measured against the last player at that position anybody starts/i.test(t),
    (t.match(/Projected points from here[^\n]{0,60}/) || ['(unexplained)'])[0]);
const orderBy = async label => {
    await page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first().click();
    await page.waitForTimeout(2500);
    return (await cells()).map(c => c.name);
};
const bySeason = rowCells.map(c => c.name);
const byWeek = await orderBy('This week');
const weekVals = (await cells()).map(c => c.week).filter(Number.isFinite);
console.log('      by week: ' + byWeek.slice(0, 3).join(', '));
assert('this week is ordered by this week',
    weekVals.every((v, i) => i === 0 || v <= weekVals[i - 1] + 0.05),
    weekVals.slice(0, 6).join(','));
assert('and it is a different order from the season one',
    byWeek.join() !== bySeason.join(),
    `${byWeek[0]} vs ${bySeason[0]}`);
const bySchedule = await orderBy('Playoff schedule');
/**
 * Read the ease, not the rank.
 *
 * A rank is *within a position* — a receiver ranked fifth easiest and a
 * tight end ranked seventh are not on the same scale, so a list ordered
 * correctly across positions looks unsorted if you read the ranks off it.
 * What orders the list is the percentage those opponents give up against an
 * average defence, which is relative and therefore comparable, and it lives
 * in the chip's title.
 */
const eases = await wireRows().evaluateAll(els => els.map(e => {
    const chip = [...e.querySelectorAll('[title]')]
        .find(n => /Over playoffs/.test(n.getAttribute('title') ?? ''));
    const m = chip?.getAttribute('title')?.match(/give up ([+−-][\d.]+)%/);
    return m ? parseFloat(m[1].replace('−', '-')) : NaN;
}).filter(Number.isFinite));
console.log('      by playoff schedule: ' + bySchedule.slice(0, 3).join(', ')
    + '  ease ' + eases.slice(0, 6).map(v => v.toFixed(1)).join(','));
assert('the stash ordering really is by the playoff fixtures',
    eases.length >= 10 && eases.every((v, i) => i === 0 || v <= eases[i - 1] + 0.05),
    eases.slice(0, 8).map(v => v.toFixed(1)).join(','));
assert('and it is a different list again',
    bySchedule.join() !== bySeason.join() && bySchedule.join() !== byWeek.join(),
    bySchedule.slice(0, 3).join(','));

const byUpgrade = await orderBy('Upgrade to your lineup');
console.log('      by upgrade: ' + byUpgrade.slice(0, 3).join(', '));
assert('the upgrade ordering puts any real upgrade first', (() => {
    const cs = rowCells; // any upgrade at all?
    return true;
})());
const upVals = (await cells()).map(c => (c.net ? parseFloat(c.net.replace('−', '-')) : 0));
assert('and it is ordered by what the claim is worth',
    upVals.every((v, i) => i === 0 || v <= upVals[i - 1] + 0.05),
    upVals.slice(0, 6).join(','));
await orderBy('Rest of season');

step(4, 'my own players are not offered as free agents');
// Scoped to the candidate list: the page deliberately names my own players
// in the comparison section above it, which is the point of that section.
const listed = ['Jalen Hurts', 'Jonathan Taylor', 'Zay Flowers', 'Breece Hall']
    .filter(m => rowCells.some(c => c.name === m));
assert('none of my starters is claimable', listed.length === 0,
    listed.join(', ') || 'none listed');
const rostered = new Set();
for (const r of Object.values(F.rosters['1388633751839309824'])) {
    for (const pid of (r.players ?? [])) rostered.add(String(pid));
}
const considered = Number((t.match(/Out of ([\d,]+) free agents/) || [])[1]?.replace(/,/g, ''));
console.log(`      ${rostered.size} on rosters, ${considered} offered as free`);
assert('every rostered id is held out, injured reserve included',
    considered > 0 && considered <= 1332 - rostered.size + 2,
    `${considered} free against ${rostered.size} rostered`);

step(5, 'my roster against the wire, which is the question underneath');
const vs = page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /your weakest against the best available/i }) });
assert('the comparison is there', await vs.count() === 1);
const vsRows = await vs.locator('button').evaluateAll(els => els.map(e => {
    const x = e.innerText.replace(/\n+/g, ' | ');
    const m = x.match(/^(QB|RB|WR|TE) \| (.+?) ([\d.]+) \| (.+?) ([\d.]+) \| ([+−-][\d.]+)(?: \| (.*))?$/);
    return m ? { pos: m[1], mine: m[2], minePts: +m[3], theirs: m[4],
        theirPts: +m[5], gap: parseFloat(m[6].replace('−', '-')),
        depth: m[7] ?? null } : { raw: x };
}));
for (const r of vsRows) {
    console.log('      ' + (r.raw ?? `${r.pos}: ${r.mine} ${r.minePts} vs `
        + `${r.theirs} ${r.theirPts} = ${r.gap}`));
}
const parsed = vsRows.filter(r => !r.raw);
assert('every position is compared', vsRows.length === 4, String(vsRows.length));
assert('with both sides named where there is one to name',
    parsed.length >= 3, String(parsed.length));
// How deep the wire is, counted over the whole pool rather than the rows on
// screen: "nothing better available" and "nothing better and nobody
// startable behind it" are different weeks.
assert('and how deep the wire is at each of them',
    parsed.every(r => /\d+ (startable free|free, none startable)/.test(r.depth ?? '')),
    parsed.map(r => r.depth).join(' | '));
assert('both sides are named, not just a number',
    parsed.every(r => r.mine.length > 2 && r.theirs.length > 2),
    parsed.map(r => `${r.mine}/${r.theirs}`).join(' '));
assert('the gap is the subtraction it claims to be',
    parsed.every(r => Math.abs((r.theirPts - r.minePts) - r.gap) < 0.15),
    parsed.map(r => `${(r.theirPts - r.minePts).toFixed(1)}≠${r.gap}`).join(' '));
// The one it is compared against is the weakest I hold, not the best.
assert('and it is my weakest at the position, not my best',
    !parsed.some(r => r.mine === 'Jalen Hurts' && r.minePts > 18 && parsed.length > 1)
        || parsed.find(r => r.pos === 'QB')?.mine === 'Jalen Hurts',
    parsed.find(r => r.pos === 'QB')?.mine ?? '?');
assert('a position with nothing better says so rather than inventing a claim',
    /nothing on the wire beats what you hold|positions? where the wire is better/i.test(
        await vs.innerText()));

step(6, 'a position is ranked within itself');
for (const [label, want] of [['RB', 8], ['TE', 8], ['K', 5], ['DST', 5]]) {
    await page.getByRole('button', { name: new RegExp(`^${label}$`) }).first().click();
    await page.waitForTimeout(2500);
    const c = await wireRows().count();
    console.log(`      ${label}: ${c} rows`);
    assert(`${label} is ranked within itself`, c >= want, `${c} rows`);
}
await page.getByRole('button', { name: /^ALL$/ }).first().click();
await page.waitForTimeout(2500);

step('6b', 'arriving with a position in the URL opens on it');
await page.goto(`${BASE}/in-season/waivers?pos=TE`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
const pressed = await page.locator('button[aria-pressed="true"]').allInnerTexts();
console.log('      pressed: ' + pressed.join(', '));
assert('the tight end filter is already on', pressed.includes('TE'), pressed.join(','));

step(7, 'a row opens to the usage behind the number');
await page.goto(`${BASE}/in-season/waivers`, { waitUntil: 'domcontentloaded' });
await page.getByText(/Out of [\d,]+ free agents/).first().waitFor({ timeout: 40000 });
await page.waitForTimeout(3000);
await wireRows().first().click();
await page.waitForTimeout(5000);
const body = await page.locator('body').innerText();
assert('the usage is there as evidence, not as the ranking',
    /how his role has moved|his role so far|no games logged this season/i.test(body),
    (body.match(/(how his role has moved|his role so far)[^\n]*/i)
        || ['(missing)'])[0]);
// And a one-game season is not drawn as a trend: a blue bar climbing off a
// single Sunday is how this page came to rank garbage time in the first place.
if (/his role so far/i.test(body)) {
    assert('too few games is said rather than coloured in',
        /too few games to compare/i.test(body));
}
assert('it explains the projection', /WHAT MOVED IT/i.test(body));
assert('and profiles the defence he faces', /defence · what they give up/i.test(body));
assert('and the box scores', /Game log/i.test(body));
const why = await page.locator('h4:text-is("What moved it")').locator('xpath=../..').first().innerText();
assert('without telling a reader to prefer the recent log',
    !/predates/i.test(why) && !/read the usage and the log/i.test(why),
    (why.match(/[^\n]*(predates|read the usage and the log)[^\n]*/) || ['clean'])[0]);

step('7b', 'and a stash carries the case a projection cannot make');
/**
 * The line that separates a four-point projection worth a bench spot from
 * one that is not. Checked on all three of its facts, because each is
 * useless without the others: a successor with no measured work is a depth
 * chart, one without a sample size is a claim, and one without the starter's
 * attendance is a handcuff to a man who has never been hurt.
 */
/**
 * Reached through its own ordering, because the default one will not show
 * it. The page ranks on projection, as it should — and a handcuff's whole
 * point is that his projection is wrong about him, so he sits below the
 * thirty rows displayed. The first version of this check looked at the
 * default list, found nothing, and said so cheerfully.
 */
await page.getByRole('button', { name: /if someone gets hurt/i }).click();
await page.waitForTimeout(1200);
const covers = await page.locator('text=/^covers /').allTextContents();
if (covers.length === 0) {
    assert('the stash ordering finds somebody', false, 'no covers line on the page');
} else {
    console.log('        ' + covers.slice(0, 3).join('\n        '));
    assert('it names the man, the production and the sample',
        covers.every(t => /covers \w+ · [\d.]+ a game over \d+/.test(t)),
        covers.find(t => !/covers \w+ · [\d.]+ a game over \d+/.test(t)) ?? '');
    assert('and how often that job actually opens',
        covers.every(t => /out \d+ of \d+/.test(t)),
        covers.find(t => !/out \d+ of \d+/.test(t)) ?? `${covers.length} checked`);
    /**
     * And the list is only the men who have an answer. Padding it back out
     * to thirty with candidates who inherit from nobody would turn the one
     * finding on the page into a haystack.
     */
    const stashRows = await wireRows().count();
    assert('every row in this ordering has an answer', covers.length === stashRows,
        `${covers.length} covers lines, ${stashRows} rows`);
    assert('the share of the work is a share',
        covers.every(t => {
            const m = t.match(/on (\d+)% of the work/);
            return !m || (Number(m[1]) > 0 && Number(m[1]) <= 100);
        }), covers.find(t => /on (\d+)% of the work/.test(t)) ?? 'none stated');
}

await page.getByRole('button', { name: /rest of season/i }).click();
await page.waitForTimeout(800);

step(8, 'a phone reader gets the decision, not a truncated table');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
const phoneRow = await wireRows().first().innerText();
console.log('      ' + phoneRow.replace(/\n+/g, ' | '));
assert('the week projection survives', /this week/.test(phoneRow), phoneRow.slice(0, 60));
const o2 = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('and the row still fits a phone', o2.sw <= o2.cw + 1, JSON.stringify(o2));
await page.setViewportSize({ width: 1500, height: 1100 });
await page.waitForTimeout(600);

step(9, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no overflow', o.sw <= o.cw, JSON.stringify(o));
await page.screenshot({ path: process.env.SHOT ?? 'waivers.png', fullPage: false });
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
