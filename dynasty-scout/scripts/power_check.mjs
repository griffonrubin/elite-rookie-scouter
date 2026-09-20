/**
 * Power rankings, against a real twelve-team league.
 *
 * A league-wide feature cannot be checked on a fixture nobody owns: it has
 * to resolve twelve real rosters, match a hundred and eight starters against
 * our own player table, and put a name on every row. The six-team fixture
 * this file used to run against hid the two things that actually break —
 * that the start/sit endpoint takes fewer ids than twelve lineups contain,
 * and that the round robin grows as the square of the league.
 *
 * It also pins the week-one behaviour. Every record in the real league is
 * 0-0 with nothing scored, and a plain sort over identical values hands out
 * first through twelfth in roster order — which is how the luck column came
 * to read "five better off than the roster" about a league that had not
 * played a game. Nothing may claim a gap here.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

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
    if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/))) return j(matchupsFor(F, m[1], Number(m[2])));
    if ((m = u.match(/\/league\/(\d+)$/))) return j(F.leagueDetail[m[1]] ?? null);
    return j(null);
});
await ctx.route('https://api.sleeper.app/**', r => r.abort());

const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));

/**
 * What this page actually downloads.
 *
 * Ranking twelve rosters needs one number per player, and the endpoint was
 * sending the full eighteen-column box score for every rostered player in
 * the league — 1.7MB to use 0.4MB of it, with game logs at 92% of the
 * payload. A page that reads only `points` off a log row has no business
 * asking for `interceptions`.
 */
const payload = { bytes: 0, calls: 0, logKeys: new Set(), rows: 0 };
page.on('response', async r => {
    if (!r.url().includes('/api/redraft/startsit')) return;
    payload.calls++;
    try {
        const body = await r.text();
        payload.bytes += body.length;
        for (const p of (JSON.parse(body).players ?? [])) {
            for (const l of (p.logs ?? [])) {
                payload.rows++;
                for (const k of Object.keys(l)) payload.logKeys.add(k);
            }
        }
    } catch { /* a body already consumed is not a finding */ }
});
const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

/** The team rows, which are the only expanding buttons on the page. */
const teamRows = () => page.locator('section')
    .filter({ has: page.getByRole('heading', { name: /every roster against every other/i }) })
    .locator('> ul > li > button[aria-expanded]');

step(1, 'it says what it is before a league is connected');
await page.goto(`${BASE}/in-season/power`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
let t = await page.locator('body').innerText();
assert('the premise is stated up front', /ranking of teams rather/i.test(t));
assert('Power Rankings is a real tab, not a Soon tag',
    await page.getByRole('link', { name: 'Power Rankings' }).count() === 1);

step(2, 'connect the twelve-team league');
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().waitFor({ timeout: 25000 });
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click();
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().waitFor({ timeout: 25000 });
/**
 * The clock stops when the table is there, not when the test wakes up.
 *
 * The settle wait used to sit inside this timer, so 1.5 of the seconds it
 * reported were the test sleeping — a figure that moves when somebody
 * changes the sleep and not when the page changes. Measured properly the
 * table lands in about four hundred milliseconds; this was printing 2.0s.
 */
const t0 = Date.now();
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
await teamRows().first().waitFor({ timeout: 30000 });
console.log(`      table painted ${Date.now() - t0}ms after picking a team`);
// Settled afterwards, for the assertions below that read rendered text.
await page.waitForTimeout(1500);

step(3, 'every team in the league is ranked');
const n = await teamRows().count();
assert('twelve rows', n === 12, String(n));
t = await page.locator('body').innerText();
assert('the pairing count is stated', /12 teams · 66 pairings/.test(t),
    (t.match(/\d+ teams · \d+ pairings/) || [])[0]);
/**
 * The cells of each row, read as cells.
 *
 * Scraping these out of one run-together textContent turned "Irishman57"
 * into a 57% win rate and "Aekz48" into 4841.9 — a test that failed for its
 * own reasons and would have hidden the real one.
 */
const cells = () => teamRows().evaluateAll(els => els.map(e => {
    const kids = [...e.children];
    return {
        rank: kids[0]?.textContent?.trim() ?? '',
        name: kids[1]?.querySelector('span')?.textContent?.trim() ?? '',
        note: kids[1]?.textContent?.trim() ?? '',
        rate: parseFloat((kids[3]?.textContent?.match(/([\d.]+)%/) || [])[1] ?? 'NaN'),
        // Found by what the cell says it is rather than by where it sits.
        // Adding a projected-finish column between the rate and the score
        // moved every index after it, and an index-addressed test does not
        // fail on that — it silently starts reading "8–6" as an expected
        // score and asserting that eight is a plausible lineup total.
        pts: parseFloat(e.querySelector('[title^="Mean simulated score"]')
            ?.textContent?.trim() ?? 'NaN'),
        finish: e.querySelector('[title*="expected from"]')?.textContent?.trim() ?? '',
        luck: e.querySelector('[title*="in the standings"]')?.textContent?.trim() ?? '',
    };
}));
const rowCells = await cells();
const ranks = rowCells.map(c => c.rank);
// Competition numbering: shared places repeat and the next place skips, so
// "1,2,3,=4,=4,6" is correct and "1,2,3,4,5,6" against two rosters a tenth
// of a point apart is not.
const nums = ranks.map(r => parseInt(r.replace('=', ''), 10));
console.log('      ' + ranks.join(' '));
assert('twelve places, weakly increasing', nums.length === 12
    && nums.every((v, i) => i === 0 || v >= nums[i - 1]), ranks.join(','));
assert('no place is ahead of its row', nums.every((v, i) => v <= i + 1), ranks.join(','));
assert('a shared place is marked with = on every row that shares it',
    nums.every((v, i) => (nums.filter(x => x === v).length > 1)
        === ranks[i].startsWith('=')), ranks.join(','));

step(4, 'the rows are real teams with real names');
const names = rowCells.map(c => c.name);
console.log('      ' + names.join(' | '));
// Every owner in the real league, by team name where they set one and by
// handle where they did not.
const expected = ['Jebdaddybush', 'TEAM JRABB', 'Just a Boutte Coker', 'Saquon Deez',
    'Aekz48', 'mwinnier', 'BoneyJabroni', 'joeyraker', 'Irishman57',
    'bigstick13', 'DenBobcatDad', 'hiryebourbonguy'];
const missing = expected.filter(e => !names.some(nm => nm.includes(e)));
assert('every owner in the league appears', missing.length === 0,
    missing.join(', ') || 'all twelve');
assert('my own team is marked', names.some(nm => /Jebdaddybush — you/.test(nm)),
    names.find(nm => /you/.test(nm)) ?? 'not marked');

step(5, 'the win rates are a ranking, not noise');
const rates = rowCells.map(c => c.rate);
console.log('      ' + rates.map(r => r.toFixed(1) + '%').join(' '));
assert('every row has a rate', rates.every(r => !Number.isNaN(r)));
assert('rates fall with rank', rates.every((r, i) => i === 0 || r <= rates[i - 1] + 1e-9),
    rates.join(' '));
assert('they span the league rather than clustering at even',
    rates[0] - rates[11] > 8, `${rates[0]} to ${rates[11]}`);
// Each team plays eleven others, so the mean rate across the league is 50%
// by construction — a table that does not average out is double-counting.
const mean = rates.reduce((a, c) => a + c, 0) / rates.length;
assert('the league averages 50%', Math.abs(mean - 50) < 0.5, `${mean.toFixed(2)}%`);

step('5b', 'the expected scores are fantasy scores');
const pts = rowCells.map(c => c.pts);
console.log('      ' + pts.join(' '));
// A nine-man PPR lineup lands somewhere around a hundred points. Twenty-four
// is what the page showed when it ranked the league off the seven players one
// surviving request happened to price, and no assertion about ranking order
// or symmetry noticed — they were all internally consistent about nonsense.
assert('every lineup has an expected score', pts.every(p => !Number.isNaN(p)));
assert('a full lineup scores like a full lineup',
    pts.every(p => p > 70 && p < 220), `${Math.min(...pts)} to ${Math.max(...pts)}`);
assert('nobody is ranked off a lineup we could not price',
    !/of \d+ priced/.test(t) && !/Left out of the ranking/.test(t),
    (t.match(/[^\n]*of \d+ priced[^\n]*|Left out of the ranking[^\n]*/) || ['all priced'])[0]);

step('5c', 'an empty starting slot is reported as a lineup, not as missing data');
// Aekz48 starts eight of nine — no kicker — which is why that row is low.
// A reader who cannot see that is looking at an unexplained bad team.
const short = rowCells.filter(c => /starting \d+ of \d+ slots/.test(c.note));
console.log('      ' + (short.map(c => `${c.name}: ${c.note.replace(/\s+/g, ' ')}`).join(' | ') || 'every team fields a full lineup'));
assert('the team starting eight of nine says so', short.length === 1, String(short.length));
assert('and it is Aekz48, who has no kicker',
    short[0]?.name === 'Aekz48', short[0]?.name ?? 'nobody');
assert('and it is still ranked rather than dropped',
    names.includes('Aekz48') && !/Left out of the ranking/.test(t));

step('5d', 'it downloads what it reads, and no more');
console.log(`      ${payload.calls} requests, `
    + `${(payload.bytes / 1024 / 1024).toFixed(2)}MB, ${payload.rows} log rows`);
console.log(`      log row keys: ${[...payload.logKeys].sort().join(', ')}`);
assert('the whole league was fetched', payload.rows > 1000, String(payload.rows));
// Four fields is what a simulation reads off a log row.
assert('log rows carry only what a simulation reads',
    [...payload.logKeys].sort().join(',') === 'opponent,points,season,week',
    [...payload.logKeys].sort().join(','));
assert('so the page is under a megabyte', payload.bytes < 1024 * 1024,
    `${(payload.bytes / 1024 / 1024).toFixed(2)}MB`);

step('5e', 'it is a power ranking, not this Sunday with a power ranking\'s title');
/**
 * The complaint that produced the horizon.
 *
 * Ranked on this week's inputs a roster drops four places because three of
 * its starters are on a bye, and recovers them next week without a single
 * transaction. What the page owes a reader is which question it answered,
 * and a projected record — "fifty-four per cent" is a fact about a simulated
 * week, "eight and six, and you need nine" is the thing being decided
 * against.
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
const horizonPressed = await horizonOn().allInnerTexts();
console.log('      horizon: ' + horizonPressed.join(', '));
assert('it opens on the rest of the season',
    horizonPressed.some(x => /rest of season/i.test(x)), horizonPressed.join(','));
assert('and says how many weeks that is',
    /rest of season · \d+ wk/i.test(horizonPressed.join(' ')), horizonPressed.join(','));
assert('the table names the horizon it ranked on',
    /every roster against every other, rest of season/i.test(t),
    (t.match(/every roster against every other[^\n]*/i) || ['(unnamed)'])[0]);
assert('the week is not taken off the page, only off the default',
    await page.getByRole('button', { name: /^this week$/i }).count() > 0);
/**
 * And the question a projected record is standing in for.
 *
 * Eight and six makes the playoffs in one league and misses in another, and
 * the owner asking already knows which. The invariant worth checking on a
 * rendered page is the one that makes the number trustworthy: exactly six
 * teams make a six-team playoff in every simulated season, so the column
 * has to sum to six. It only does because the weeks are paired.
 */
assert('the cut is stated, not assumed silently',
    /make the playoffs/i.test(t) && /top \d+ · \d+ wk/i.test(t),
    (t.match(/(assuming )?top \d+[^\n]*make the playoffs/i)
        || t.match(/top \d+ · \d+ wk/i) || ['(unstated)'])[0]);
const finishes = await teamRows().evaluateAll(els => els.map(e => {
    const m = e.innerText.match(/(\d+|>99|<1)%\n(\d+)–(\d+) · (\d+)(?:st|nd|rd|th)/);
    return m ? {
        odds: m[1] === '>99' ? 99.5 : m[1] === '<1' ? 0.5 : +m[1],
        w: +m[2], l: +m[3], seed: +m[4],
    } : null;
}).filter(Boolean));
console.log('      ' + finishes.slice(0, 5)
    .map(f => `${f.odds}% ${f.w}-${f.l} seed ${f.seed}`).join('  '));
assert('every row gets playoff odds', finishes.length === 12, String(finishes.length));
const oddsSum = finishes.reduce((a, f) => a + f.odds, 0) / 100;
console.log(`      the column sums to ${oddsSum.toFixed(2)} places`);
assert('and the column sums to the places the league has',
    Math.abs(oddsSum - 6) < 0.2, oddsSum.toFixed(2));
assert('each projected record adds up to the season',
    finishes.every(f => f.w + f.l === 14), finishes.map(f => f.w + f.l).join(','));
assert('odds fall with the ranking',
    finishes.every((f, i) => i === 0 || f.odds <= finishes[i - 1].odds + 3),
    finishes.map(f => f.odds).join(','));
assert('and the seeds are a league, running one to twelve',
    finishes[0].seed < finishes[finishes.length - 1].seed,
    finishes.map(f => f.seed).join(','));
// Moving the cut has to move the answer, or the control is decoration.
const cutBefore = finishes.map(f => f.odds);
await page.getByLabel(/how many teams make the playoffs/i).selectOption('4');
await page.waitForTimeout(2500);
// Anchored on the line beneath it, as the first scrape is. A bare
// /(\d+)%\n/ finds the "9%" inside the rate column's "57.9%" and reports
// every roster at nine per cent — a match that is not wrong so much as
// somewhere else entirely.
const cutAfter = await teamRows().evaluateAll(els => els.map(e => {
    const m = e.innerText.match(/(\d+|>99|<1)%\n(\d+)–(\d+) · \d+(?:st|nd|rd|th)/);
    return m ? (m[1] === '>99' ? 99.5 : m[1] === '<1' ? 0.5 : +m[1]) : null;
}).filter(x => x != null));
const sum4 = cutAfter.reduce((a, v) => a + v, 0) / 100;
console.log(`      at a four-team cut the column sums to ${sum4.toFixed(2)}`);
assert('a narrower cut is a harder cut', sum4 < oddsSum - 1, sum4.toFixed(2));
assert('and it still sums to the places on offer', Math.abs(sum4 - 4) < 0.2,
    sum4.toFixed(2));
assert('with the middle of the table losing the most',
    cutBefore[5] - cutAfter[5] > cutBefore[0] - cutAfter[0],
    `${cutBefore[5]}→${cutAfter[5]} vs ${cutBefore[0]}→${cutAfter[0]}`);
await page.getByLabel(/how many teams make the playoffs/i).selectOption('6');
await page.waitForTimeout(2500);
// Switching horizons has to change the answer, or the setting is decoration.
await page.getByRole('button', { name: /^this week$/i }).click();
await page.waitForTimeout(3500);
const weekText = await page.locator('body').innerText();
const weekOrder = await teamRows().evaluateAll(els =>
    els.map(e => (e.innerText.split('\n')[1] ?? '').trim()));
console.log('      this week: ' + weekOrder.slice(0, 3).join(', '));
assert('the week view says it is a matchup preview',
    /matchup preview rather than a judgement/i.test(weekText));
assert('and drops the projected finish, which is not a thing for one Sunday',
    !/wk left/i.test(weekText));
assert('the two horizons do not produce the same table',
    weekOrder.join() !== names.join(),
    `${weekOrder.slice(0, 3).join(', ')} vs ${names.slice(0, 3).join(', ')}`);
await page.getByRole('button', { name: /rest of season/i }).click();
await page.waitForTimeout(3500);
t = await page.locator('body').innerText();

step(6, 'week one claims no luck gap');
assert('no team is called lucky or unlucky', !/better off than the roster|worse off than the roster/.test(t),
    (t.match(/[\w ]+(better|worse) off than the roster/) || ['none claimed'])[0]);
assert('and it says why', /Nobody in this league has played yet/.test(t));
assert('the empty column is not headed', !/Record vs roster/.test(t));
assert('no 0-0 · 0 pts filler', !/0-0 · 0 pts/.test(t));

step(7, 'a row opens to head-to-head rates');
await teamRows().first().click();
await page.waitForTimeout(600);
const open = page.locator('li', { has: page.locator('h4') }).first();
const h4 = await page.locator('h4').first().innerText();
assert('it names the team it is about', /against each team/i.test(h4), h4);
const h2h = await page.locator('h4').first().locator('xpath=../ul/li').all();
assert('eleven opponents, not twelve', h2h.length === 11, String(h2h.length));
const pcts = await Promise.all(h2h.map(async l => (await l.innerText()).replace(/\n/g, ' ')));
console.log('      ' + pcts.slice(0, 4).join(' | '));
assert('sorted best matchup first', (() => {
    const v = pcts.map(x => parseInt(x.match(/(\d+)%/)?.[1] ?? '-1', 10));
    return v.every((x, i) => i === 0 || x <= v[i - 1]);
})(), pcts.map(x => x.match(/(\d+)%/)?.[1]).join(','));
assert('the top team does not appear against itself',
    !pcts.some(x => x.includes(names[0].replace(' — you', ''))));

step(8, 'the table agrees with itself both ways round');
// The row that opened says it beats team X at p; opening X has to say it
// beats this one at 100 - p. One run per trial rather than one per pairing
// is what makes that true, and it is the thing a reader will check.
const first = names[0].replace(' — you', '');
const oppName = (pcts[3].match(/^(.*?)\s+\d+%$/) || [])[1]?.trim();
const oppPct = parseInt(pcts[3].match(/(\d+)%/)[1], 10);
await teamRows().first().click();
const oppRow = teamRows().filter({ hasText: oppName }).first();
await oppRow.click();
await page.waitForTimeout(600);
const back = await page.locator('h4').first().locator('xpath=../ul/li')
    .filter({ hasText: first }).first().innerText();
const backPct = parseInt(back.match(/(\d+)%/)[1], 10);
console.log(`      ${first} beats ${oppName} ${oppPct}%; ${oppName} beats ${first} ${backPct}%`);
assert('the two directions sum to 100', Math.abs(oppPct + backPct - 100) <= 1,
    `${oppPct} + ${backPct}`);

step('8b', 'the league\'s own fixture list is the one being played');
/**
 * Nothing asserted this, and for a long time it was quietly false.
 *
 * The captured fixture carried three rosters of one week — enough to open
 * the page on the right opponent, not enough to be a schedule — so
 * `scheduleUsable` refused it and every run here took the degraded path:
 * weeks drawn at random, and the panel that weighs the week saying so in
 * as many words. Everything passed. The real branch, which is what every
 * reader with a connected league gets, was exercised nowhere outside the
 * model checks.
 */
const stake = await page.locator('[data-panel="at-stake"]').innerText();
assert('the weeks are the league\'s own, not drawn',
    /read from your platform/.test(stake) && !/would not give a fixture/.test(stake),
    /would not give a fixture/.test(stake) ? 'still drawing them at random' : '');

step('8c', 'and it says which of the other games you have a stake in');
/**
 * Two states, both correct, and the check has to accept either: a week
 * where some other game moves your season by more than the simulation's
 * own noise, and a week where none does. Week one of a season nobody has
 * played is firmly the second, and saying so is the panel working rather
 * than the panel empty — which is why the empty state is asserted to
 * explain itself rather than merely to exist.
 *
 * The populated state is not reachable from this fixture: nobody has
 * played a game, so every record is 0-0 and no race is contested at any
 * week. It is covered instead by rooting_check.mts, which builds a league
 * four deep on the cut line with two weeks left and asserts that a game
 * the reader is not playing in moves them past the floor.
 */
const root = page.locator('[data-panel="rooting"]');
assert('the panel is there', await root.count() === 1, String(await root.count()));
const rootText = await root.innerText();
console.log('      ' + rootText.split('\n').filter(Boolean)[2]?.slice(0, 120));
const games = await root.locator('li [data-game]').count();
if (games > 0) {
    const named = await root.locator('li [data-game]').allInnerTexts();
    assert('every game listed names both teams', named.every(t => / v /.test(t)),
        String(games));
    assert('and each has two ends to read',
        await root.locator('li [data-end]').count() === games * 2,
        `${await root.locator('li [data-end]').count()} ends for ${games} games`);
    // Asserted here rather than beside the empty case, where an empty list
    // satisfies it without checking anything.
    assert('and none of them is your own game',
        !named.some(t => /Jebdaddybush/.test(t)), named.join(' / '));
} else {
    assert('a week with nothing at stake says so, and why',
        /less than \d+ points/.test(rootText) && /own/.test(rootText),
        rootText.split('\n').filter(Boolean)[2]?.slice(0, 60) ?? '(nothing)');
}

step(9, 'nothing blew up');
assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('no horizontal overflow', o.sw <= o.cw, JSON.stringify(o));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
const op = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
assert('nor at phone width', op.sw <= op.cw + 1, JSON.stringify(op));

/**
 * And the chart is still a chart there.
 *
 * "No overflow" passed while the bars were eight pixels wide against the
 * right edge: the bar spanned all three columns of the phone grid and the
 * rate claimed the third of them in the same row, so the two collided and
 * the whole visualisation collapsed. Nothing overflowed, nothing errored,
 * every assertion passed, and the page was useless on the screen most of
 * these decisions get made on.
 */
const bars = await teamRows().locator('span[role="img"]')
    .evaluateAll(els => els.map(e => e.getBoundingClientRect().width));
console.log(`      bar track at 390px: ${Math.min(...bars).toFixed(0)}–`
    + `${Math.max(...bars).toFixed(0)}px across ${bars.length} rows`);
assert('every row still has a bar', bars.length === 12, String(bars.length));
assert('and the track is a track, not a sliver',
    Math.min(...bars) > 150, `${Math.min(...bars).toFixed(0)}px`);
const marks = await teamRows().locator('span[role="img"] > span:last-child')
    .evaluateAll(els => els.map(e => e.getBoundingClientRect().width));
console.log(`      widest mark: ${Math.max(...marks).toFixed(0)}px`);
assert('with marks a reader can compare', Math.max(...marks) > 40,
    `${Math.max(...marks).toFixed(0)}px`);
await page.setViewportSize({ width: 1500, height: 1200 });
await page.waitForTimeout(400);
await page.screenshot({ path: process.env.SHOT ?? 'power.png', fullPage: false });

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
