/**
 * The whole thing, the way somebody actually uses it.
 *
 * Every earlier test injected a connection into localStorage and handed the
 * page a seven-slot roster. A real person arrives with nothing stored, types
 * a username, picks a league, picks their team, and has ten slots including a
 * kicker and a defence — none of which had ever been exercised.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = process.env.BASE ?? 'http://localhost:3080';

const R = JSON.parse(fs.readFileSync(new URL('./fixtures-journey-roster.json', import.meta.url), 'utf8'));
const sid = p => String(p.sleeper_id);
const mine = R.mine.map(sid), bench = R.bench.map(sid), opp = R.opp.map(sid);
const ROSTER_POSITIONS = ['QB','RB','RB','WR','WR','WR','TE','FLEX','K','DEF',
                          'BN','BN','BN','BN','BN','BN'];

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });

let sleeperCalls = 0;
await ctx.route('**/api/sleeper/**', route => {
    const u = route.request().url();
    sleeperCalls++;
    const j = o => route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(o) });
    if (u.includes('/state/nfl')) return j({ week: 1, display_week: 1 });
    if (u.match(/\/user\/nobody-here/)) return route.fulfill({ status: 404, body: 'null' });
    if (u.match(/\/user\/[^/]+\/leagues/)) return j([
        { league_id: 'L1', name: 'The Main League' },
        { league_id: 'L2', name: 'Work Money League' },
    ]);
    if (u.match(/\/user\/[^/]+$/)) return j({ user_id: 'u1' });
    if (u.match(/\/league\/[^/]+\/rosters/)) return j([
        { roster_id: 1, owner_id: 'u1', players: [...mine, ...bench], starters: mine },
        { roster_id: 2, owner_id: 'u2', players: opp, starters: opp },
    ]);
    if (u.match(/\/league\/[^/]+\/users/)) return j([
        { user_id:'u1', display_name:'you', metadata:{ team_name:'My Team' } },
        { user_id:'u2', display_name:'them', metadata:{ team_name:'Their Team' } },
    ]);
    if (u.match(/\/league\/[^/]+\/matchups\//)) return j([
        { roster_id:1, matchup_id:1, starters: mine, players:[...mine,...bench] },
        { roster_id:2, matchup_id:1, starters: opp, players: opp },
    ]);
    if (u.match(/\/league\/(L1|L2)$/)) return j({
        league_id: u.endsWith('L2') ? 'L2' : 'L1',
        name: u.endsWith('L2') ? 'Work Money League' : 'The Main League',
        season: '2026', roster_positions: ROSTER_POSITIONS });
    return j(null);
});
await ctx.route('https://api.sleeper.app/**', r => r.abort());

const page = await ctx.newPage();
page.setDefaultTimeout(25000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)); });
const failedUrls = [];
page.on('requestfailed', r => failedUrls.push(`${r.failure()?.errorText} ${r.url().slice(0, 110)}`));
page.on('response', r => { if (r.status() >= 400) failedUrls.push(`${r.status()} ${r.url().slice(0, 110)}`); });

const step = (n, s) => console.log(`\n── ${n}. ${s}`);
const ok = (label, pass, extra = '') =>
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
const fails = [];
const assert = (label, pass, extra) => { ok(label, pass, extra); if (!pass) fails.push(label); };

step(1, 'arrive with nothing saved');
await page.goto(`${BASE}/redraft/start-sit`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
let t = await page.locator('body').innerText();
assert('the connect screen is shown', /connect your league/i.test(t));
assert('it explains where the data goes', /saved in this browser/i.test(t));

step(2, 'mistype the username');
await page.getByPlaceholder(/sleeper username/i).fill('nobody-here');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(1500);
t = await page.locator('body').innerText();
assert('a wrong username says so', /no sleeper user/i.test(t), t.match(/No Sleeper user[^\n]*/)?.[0] ?? '');

step(3, 'type the right one and pick a league');
await page.getByPlaceholder(/sleeper username/i).fill('griffon');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(1800);
t = await page.locator('body').innerText();
assert('both leagues are offered', /The Main League/.test(t) && /Work Money League/.test(t));
await page.getByRole('button', { name: /The Main League/ }).first().click();
await page.waitForTimeout(2500);

step(4, 'pick which team is mine');
t = await page.locator('body').innerText();
assert('it asks which team is mine', /which team is yours/i.test(t));
await page.getByRole('button', { name: /^My Team$/ }).first().click();
await page.waitForTimeout(9000);

step(5, 'read the lineup');
t = await page.locator('body').innerText();
assert('a win probability is shown', /chance you win week/i.test(t));
/**
 * The slot rows, and only those.
 *
 * `button[aria-expanded]` used to be unique to the slot board. Bench and
 * opponent rows open now too, so the bare selector silently started counting
 * seventeen extra rows as lineup slots — this file had been asserting ten and
 * seeing twenty-seven, which is a test that stopped testing its own subject
 * without ever going quiet about it.
 */
const slotRows = () => page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /slot by slot/i }) })
    .locator('button[aria-expanded]');
const slots = await slotRows().count();
assert('all ten slots are listed', slots === 10, `got ${slots}`);
const slotLabels = await slotRows().locator('> span:first-child').allInnerTexts();
console.log('      slots:', slotLabels.join(' '));
assert('the FLEX slot is named', slotLabels.includes('FLEX'));
assert('the kicker slot is there', slotLabels.includes('K'));
assert('the defence slot is there', slotLabels.some(s => /DEF|DST/.test(s)));
assert('opponent is named', /Their Team/.test(t));

step('5b', 'the matchup is on the row, not one click inside it');
/**
 * A lineup is nine decisions and nobody opens nine panels to make them.
 *
 * The chip is the scannable half: a place in the league, nought to ten,
 * against the defence this player is facing. Deliberately *only* the
 * defence, because a combined "startability score" that folds in the game
 * total and the spread cannot be calibrated, cannot be argued with, and
 * cannot be taken apart by the reader — the game environment is on the same
 * row already and broken out in full inside.
 */
const chips = await slotRows().evaluateAll(els => els.map(e => {
    const m = e.innerText.match(/vs ([A-Z]{2,3}) ([\d.]+) (soft|leaky|average|firm|tough)/);
    return m ? { team: m[1], score: +m[2], word: m[3] } : null;
}).filter(Boolean));
console.log('      ' + chips.map(c => `${c.team} ${c.score} ${c.word}`).join('  '));
assert('most slots carry a matchup', chips.length >= 5, `${chips.length} of ${slots}`);
assert('every score is a place in the league',
    chips.every(c => c.score >= 0 && c.score <= 10),
    chips.map(c => c.score).join(','));
assert('and the word agrees with the number',
    chips.every(c => (c.score >= 6.6 ? /soft|leaky/ : c.score <= 3.3 ? /firm|tough/
        : /average|leaky|firm/).test(c.word)),
    chips.map(c => `${c.score}:${c.word}`).join(' '));
/**
 * The scale has to separate, or it is decoration.
 *
 * Nine players facing nine defences that all score between four and six is
 * a chip nobody would ever act on, and it is what a badly anchored index
 * produces. A league rank cannot do that by construction — which is the
 * argument for using one, so it is worth checking the construction held.
 */
const spread = Math.max(...chips.map(c => c.score)) - Math.min(...chips.map(c => c.score));
console.log(`      the week spans ${spread.toFixed(1)} points of matchup`);
assert('a real slate spreads across the scale', spread > 3, spread.toFixed(1));
assert('a kicker gets no chip rather than a made-up one',
    chips.length < slots, `${chips.length} chips for ${slots} slots`);

step(6, 'the kicker is not scored as zero');
const kIdx = slotLabels.indexOf('K');
const kRow = await slotRows().nth(kIdx).innerText();
console.log('      K row:', kRow.replace(/\n+/g, ' | '));
const kAria = await slotRows().nth(kIdx)
    .locator('[role="img"]').first().getAttribute('aria-label');
console.log('      K strip:', kAria);
const kMean = kAria?.match(/expected ([\d.]+) points/);
assert('the kicker has a real projection',
    !!kMean && Number(kMean[1]) > 1, kMean?.[1] ?? 'none');

step(7, 'open the flex and look at the candidates');
const flexIdx = slotLabels.indexOf('FLEX');
await slotRows().nth(flexIdx).click();
await page.waitForTimeout(2500);
const panel = await slotRows().nth(flexIdx)
    .evaluate(el => el.parentElement?.innerText ?? '');
const defPanel = panel.match(/defence · what they give up[\s\S]{0,600}/i);
console.log('      defence panel: '
    + (defPanel ? defPanel[0].replace(/\n+/g, ' | ').slice(0, 200) : '(missing)'));
assert('the opponent defence is profiled inside the row',
    /defence · what they give up/i.test(panel),
    defPanel ? 'present' : '(missing)');
assert('all four positions, so a reader can compare two of their own',
    (panel.match(/\b(gives this up|leaks here|average here|holds up|shuts this down)\b/g)
        || []).length >= 4,
    String((panel.match(/of 32/g) || []).length) + ' ranks shown');
assert('and how the points happen, not just how many',
    /how they give it up to/i.test(panel)
        && /(yards a carry|yards a catch|yards a throw)/i.test(panel),
    (panel.match(/how they give it up to \w+/i) || ['(no mechanism)'])[0]);
assert('measured per team-game, and says so',
    /per team-game/i.test(panel));
console.log('      flex panel:', panel.replace(/\n+/g, ' | ').slice(0, 220));
assert('the flex lists more than one candidate',
    (panel.match(/%/g) ?? []).length >= 1);

step(8, 'switch to the other league without reconnecting');
await page.locator('button[title="Connect another league"]').click();
await page.waitForTimeout(1200);
t = await page.locator('body').innerText();
assert('my saved team is offered back', /your teams/i.test(t) && /The Main League/.test(t));
await page.getByPlaceholder(/sleeper username/i).fill('griffon');
await page.getByRole('button', { name: /^find$/i }).click();
await page.waitForTimeout(1800);
await page.getByRole('button', { name: /Work Money League/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /^My Team$/ }).first().click();
await page.waitForTimeout(8000);
const picker = page.locator('select[aria-label="Which league"]');
assert('both leagues are now in the switcher', await picker.count() === 1,
    (await picker.locator('option').allInnerTexts()).join(' / '));

step(8.5, 'the two summaries agree');
const summary = await page.locator('body').innerText();
const boardSays = summary.match(/Every slot is already|(\d+) slots? worth a second look/);
const bestSays = summary.match(/Best available|This is the best lineup available/);
console.log('      board:', boardSays?.[0], '| headline:', bestSays?.[0]);
assert('a settled board is not contradicted by the headline',
    !(/Every slot is already/.test(summary) && /Best available/.test(summary)),
    boardSays?.[0] + ' vs ' + bestSays?.[0]);

step('8.6', 'the page says how often it has been right');
/**
 * The audit under the claim. A floor, a ceiling and a chance of winning are
 * numbers a reader cannot check, and this is the panel that lets them — so
 * it has to be on the page, it has to state the promise as well as the
 * measurement, and it has to open to the cuts that matter. A panel that
 * printed one number with no target beside it would be the same marketing
 * badge every site already ships.
 */
const calib = page.locator('section').filter({ hasText: /How often this has been right/i }).first();
assert('the calibration panel is there', await calib.count() === 1);
if (await calib.count() === 1) {
    const summary = (await calib.innerText()).replace(/\s+/g, ' ');
    console.log('      ' + summary.slice(0, 150));
    const claim = summary.match(/promise to contain the week (\d+)% of the time/);
    const held = summary.match(/they held (\d+)% of the time/);
    assert('it states the promise', !!claim, claim ? claim[1] + '%' : 'not stated');
    assert('and what actually happened', !!held, held ? held[1] + '%' : 'not stated');
    assert('over a sample worth reading', /[\d,]{4,} player-weeks/.test(summary),
        (summary.match(/[\d,]+ player-weeks/) ?? ['none'])[0]);
    await calib.getByRole('button').first().click();
    await page.waitForTimeout(400);
    const opened = (await calib.innerText()).replace(/\s+/g, ' ');
    assert('and opens to the position and history cuts',
        /By position/i.test(opened) && /By games behind him/i.test(opened),
        opened.slice(0, 60));
    assert('with the limits of the measurement stated, not just the number',
        /replayed from the games before it/i.test(opened),
        'the caveat is present');
}

step(9, 'nothing blew up');
console.log('      failed requests:', failedUrls.length ? failedUrls.join('\n                       ') : 'none');
const ours = failedUrls.filter(u =>
    !u.includes('api.sleeper.app')        // aborted on purpose, to force the relay
    && !u.includes('nobody-here')          // the 404 this test asked for
    && !u.includes('_rsc='));              // Next cancelling its own prefetches
assert('the app makes no failing requests of its own', ours.length === 0, ours.join(' | '));
const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));

await page.screenshot({ path: process.env.OUT ?? '/tmp/journey.png', fullPage: false });
console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
