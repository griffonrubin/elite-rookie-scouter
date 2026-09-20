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
const calls = [];
page.on('response', r => {
    if (r.url().includes('/api/redraft/startsit')) {
        calls.push({ status: r.status(), n: (new URL(r.url()).searchParams.get('ids') || '').split(',').length });
    }
});
/**
 * The verdict's headline is playoff odds where the rest of the season can
 * be played out and the win rate where it cannot — a week-only horizon, a
 * season already over, a platform that gave no fixture list. Both are real
 * states of this page, so the check matches either rather than pinning
 * itself to whichever one the fixture happens to produce: an assertion
 * written to one wording fails the day the other is correct, and reads
 * like a bug in the page.
 */
const HEADLINES = /[^\n]*pts of (playoff odds|win rate)[^\n]*/g;
const DELTAS = /([−+-][\d.]+) pts of (?:playoff odds|win rate)/g;
const VERDICT_WORDS =
    /(clearly|a little) (better|worse) off|a (materially|slightly) (better|worse) season/g;
const BETTER = /better off|better season/;
const WORSE = /worse off|worse season/;

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

/** The two roster panels, mine first. */
const panel = n => page.locator('section').filter({ has: page.locator('h3') }).nth(n);
const rowsIn = n => panel(n).locator('button[aria-pressed]');
/**
 * Players in the offer, counted inside the rosters they come from.
 *
 * Counted page-wide this used to be the same number, which made it look
 * like a fine way to ask. It is not a fact about the page, it is a fact
 * about nothing else on the page having a pressed state — and the moment
 * the horizon toggle did, three assertions started reporting a trade with
 * one player in it as a trade with two.
 */
const inOffer = async () =>
    await rowsIn(0).evaluateAll(e => e.filter(x =>
        x.getAttribute('aria-pressed') === 'true').length)
    + await rowsIn(1).evaluateAll(e => e.filter(x =>
        x.getAttribute('aria-pressed') === 'true').length);
const bodyText = () => page.locator('body').innerText();

/**
 * The verdict for *this* trade, not the one before it.
 *
 * The heading alone stopped meaning anything once the league moved to a
 * worker: the previous answer stays on screen, dimmed, while the new one
 * runs, so waiting for the heading returned in 56ms with somebody else's
 * numbers under it — and the timer that reported 56ms was reporting the
 * speed of rendering a stale result. `aria-busy` is the page's own signal
 * that the number showing belongs to the selection showing.
 */
const verdictSettled = async () => {
    const heading = page.getByRole('heading', { name: /what it does to each side/i });
    await heading.waitFor({ timeout: 30000 });
    await page.locator('[aria-busy="false"]').filter({ has: heading })
        .waitFor({ timeout: 30000 });
};

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
assert('nothing is selected yet', await inOffer() === 0, String(await inOffer()));
t = await bodyText();
assert('and it asks for a pick', /Pick a player from either roster/i.test(t));

step('5b', 'offers found, not waited for');
/**
 * The analyser prices a trade you have already thought of, which is the
 * second half of the job. The hard part is noticing that the manager in
 * eighth is two deep at tight end and starting a nine-point receiver while
 * you are the other way round — nobody reads eleven rosters looking for
 * that, so the trades that get made are the ones somebody happened to think
 * of.
 */
const finder = page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /offers both sides gain from/i }) });
assert('the finder is there', await finder.count() === 1);
const finderText = await finder.innerText();
assert('it says how wide it searched',
    /one-for-one and two-for-one against \d+ rosters/i.test(finderText),
    (finderText.match(/against \d+ rosters/i) || ['(unstated)'])[0]);
assert('and that both sides have to gain, not just me',
    /both starting lineups improve/i.test(finderText));
const offers = await finder.locator('ul > li button').evaluateAll(els => els.map(e => {
    const x = e.innerText.replace(/\n+/g, ' | ');
    const m = x.match(/\+([\d.]+) you \| \+([\d.]+) them/);
    return { text: x, mine: m ? +m[1] : NaN, theirs: m ? +m[2] : NaN };
}));
console.log(`      ${offers.length} offers`);
for (const o of offers.slice(0, 3)) console.log('      ' + o.text.slice(0, 88));
if (offers.length === 0) {
    // A drafted league in week one usually has no trade that helps both, and
    // saying so is the right answer — a finder that always finds something
    // is a finder that has stopped checking.
    assert('an empty list explains itself rather than showing nothing',
        /nothing here improves both lineups/i.test(finderText),
        finderText.slice(0, 80));
} else {
    assert('every offer names both gains', offers.every(o =>
        Number.isFinite(o.mine) && Number.isFinite(o.theirs)),
        offers.map(o => `${o.mine}/${o.theirs}`).join(' '));
    assert('and both of them are real', offers.every(o => o.mine > 0 && o.theirs > 0),
        offers.map(o => `${o.mine}/${o.theirs}`).join(' '));
    /**
     * The weeks that decide a season, on both sides of the offer.
     *
     * A deal even on points that moves you from the hardest playoff
     * schedule at the position to the easiest is not an even deal, and the
     * points cannot say so — they are a season average and these are three
     * particular weeks.
     */
    const sched = offers[0].text.match(/playoffs (\d+)\/(\d+)/g) ?? [];
    console.log('      playoff schedules on the offer: ' + sched.join(' → '));
    assert('both sides carry their playoff schedule', sched.length >= 2,
        sched.join(' '));
    assert('ranked against the whole league at that position',
        sched.every(x => {
            const [r, of] = x.match(/(\d+)\/(\d+)/).slice(1).map(Number);
            return of >= 30 && r >= 1 && r <= of;
        }), sched.join(' '));
    assert('ranked on the smaller of the two', offers.every((o, i) =>
        i === 0 || Math.min(o.mine, o.theirs)
            <= Math.min(offers[i - 1].mine, offers[i - 1].theirs) + 0.05),
        offers.map(o => Math.min(o.mine, o.theirs)).join(','));
    /**
     * Clicking one has to load it, partner included — the analyser priced
     * against whoever happened to be selected would be pricing a different
     * trade from the one on screen.
     */
    const team = offers[0].text.split(' | ')[0].trim();
    await finder.locator('ul > li button').first().click();
    await verdictSettled();
    await page.waitForTimeout(1200);
    const after = await bodyText();
    assert('clicking an offer loads it into the analyser', await inOffer() >= 2,
        String(await inOffer()));
    assert('and switches to that manager',
        (await page.locator('#trade-partner').inputValue()).length > 0
        && new RegExp(team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .test(after), team);
    assert('and the analyser agrees it helps me', BETTER.test(after),
        (after.match(VERDICT_WORDS) || []).join(','));
    await page.getByRole('button', { name: /^clear$/i }).click();
    await page.waitForTimeout(800);
}

step(6, 'a one-sided gift is priced');
// The top row of my roster is my best player by expected points.
const myBest = (await rowsIn(0).first().innerText()).split('\n')[0].trim();
/**
 * Click to verdict, and nothing else.
 *
 * The settle wait used to sit inside this timer, so the assertion was
 * measuring its own sleep: eight hundred of the three thousand milliseconds
 * it allowed were the test waiting on itself, and the budget had been
 * calibrated around that. A timer that includes a fixed sleep does not fail
 * when the page slows down, it fails when somebody changes the sleep.
 */
const t0 = Date.now();
await rowsIn(0).first().click();
await verdictSettled();
const ms = Date.now() - t0;
// Settled afterwards, for the assertions below that read the rendered text.
await page.waitForTimeout(800);
console.log(`      verdict in ${ms}ms after giving away ${myBest}`);
t = await bodyText();
const mineDelta = parseFloat((t.match(/Jebdaddybush — you\s*\n?\s*([−+-][\d.]+) pts/) || [])[1]
    ?.replace('−', '-') ?? 'NaN');
console.log('      ' + (t.match(HEADLINES) || []).join(' | '));
assert('giving away my best player makes me worse', mineDelta < 0, String(mineDelta));
assert('and it says so in words', WORSE.test(t),
    (t.match(VERDICT_WORDS) || []).join(','));
/**
 * And it says so in the currency that decides anything.
 *
 * Matching either wording above is what keeps this check honest across
 * horizons; on its own it would also pass the day the odds quietly stopped
 * being computed and every verdict fell back to the rate. This league has
 * fourteen weeks left, so there is no honest reason for the season not to
 * be played out.
 */
assert('the verdict is given in playoff odds, not only in win rate',
    /pts of playoff odds/.test(t) && /to make the playoffs/.test(t),
    (t.match(/\d+% → \d+% to make the playoffs/g) || []).join(' | ') || 'none');
assert('and the working is still shown', /win rate/.test(t));
/**
 * What the click actually costs, measured rather than inherited.
 *
 * Twenty thousand trials over twelve rosters is 388ms of arithmetic; the
 * rest is React. Against a production build the click takes about 1.4
 * seconds, which is the number a reader experiences, and it did not move
 * when the finder was added — 1419ms before, 1425ms after.
 *
 * This check runs against the dev server, where it is roughly twice that,
 * because StrictMode double-invokes every useMemo: the finder's sweep and
 * the positional profiles each run once for nothing on every render. So the
 * budget below is a dev-mode budget and is written down as one. The previous
 * three-second figure looked stricter and was not — eight hundred
 * milliseconds of it were this test sleeping inside its own timer.
 */
assert('the answer arrives quickly enough to keep trying offers', ms < 3200,
    `${ms}ms in dev; 1425ms against a build`);

step('6b', 'a trade is a season, not a Sunday');
/**
 * Nobody trades for one week.
 *
 * Priced on this Sunday the answer moves for reasons a trade cannot: a man
 * on a bye is worth nothing, so acquiring him reads as giving a player away
 * for free, and a soft matchup makes whoever you receive look like a steal
 * for seven days. Both invert on Tuesday. The week is kept because one case
 * is real — a must-win before the playoffs — but it is not the default and
 * the page has to say which it used.
 */
/**
 * The horizon control, and only it.
 *
 * `button[aria-pressed]` is not unique to it — roster rows and position
 * filters press too — so the bare selector reads a selected player as the
 * current horizon. It happens to give the right answer today, which is the
 * kind of test that fails a year from now for a reason nobody can see.
 */
const horizonOn = () => page.locator('button[aria-pressed="true"]')
    .filter({ hasText: /rest of season|this week/i });
const tradeHorizon = await horizonOn().allInnerTexts();
console.log('      horizon: ' + tradeHorizon.join(', '));
assert('it prices the rest of the season by default',
    tradeHorizon.some(x => /rest of season/i.test(x)), tradeHorizon.join(','));
assert('and says so under the verdict',
    /nobody trades for one Sunday/i.test(t),
    (t.match(/[^\n]*nobody trades for one Sunday[^\n]*/i) || ['(not said)'])[0]);
assert('the roster numbers are labelled to match',
    /expected points in a typical week from here/i.test(t),
    (t.match(/each name is expected points[^,]*/i) || ['(unlabelled)'])[0]);
assert('without still claiming a trade costs you this Sunday\'s lineup',
    !/what a trade costs you is\s*this Sunday/i.test(t.replace(/\s+/g, ' ')));
// And the price really does change with the horizon.
await page.getByRole('button', { name: /^this week$/i }).click();
await page.waitForTimeout(3500);
const weekT = await bodyText();
const weekDelta = parseFloat((weekT.match(/Jebdaddybush — you\s*\n?\s*([−+-][\d.]+) pts/) || [])[1]
    ?.replace('−', '-') ?? 'NaN');
console.log(`      giving ${myBest} away: ${mineDelta} over the season, `
    + `${weekDelta} this week`);
assert('the week view labels itself', /misleading for everything else/i.test(weekT));
assert('and prices the same offer differently', weekDelta !== mineDelta,
    `${mineDelta} vs ${weekDelta}`);
assert('but still says giving away your best player hurts', weekDelta < 0,
    String(weekDelta));
await page.getByRole('button', { name: /rest of season/i }).click();
await page.waitForTimeout(3500);
t = await bodyText();

step(7, 'the lineup consequence is shown, not just the value');
assert('my lineup panel is there', /Jebdaddybush[’']s lineup/i.test(t),
    (t.match(/\b[\w ]+[’']s lineup/gi) || ['(no panel)']).join(' | '));
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
const line = (t.match(HEADLINES) || []);
console.log(`      swapping ${myBest} for ${theirBest}`);
console.log('      ' + line.join(' | '));
assert('two players are now in the trade', await inOffer() === 2,
    String(await inOffer()));
assert('both sides still get a verdict', line.length >= 2, line.join(' | '));
assert('the two sides move in opposite directions', (() => {
    const ds = (t.match(DELTAS) || []).map(x => parseFloat(x.replace('−', '-')));
    return ds.length >= 2 && Math.sign(ds[0]) !== Math.sign(ds[1]);
})(), (t.match(DELTAS) || []).join(','));

step(10, 'clearing it puts the page back');
await page.getByRole('button', { name: /^clear$/i }).click();
await page.waitForTimeout(600);
t = await bodyText();
assert('nothing is selected', await inOffer() === 0, String(await inOffer()));
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
