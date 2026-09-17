/**
 * The last week of the regular season, and the week after it.
 *
 * Every panel added this season assumes there are weeks left. There will
 * not be: the regular season ends, `remaining` goes to one and then to
 * zero, and three of the four panels on Power Rankings have nothing left
 * to say. That is correct — a run home with no weeks in it is not a run
 * home, and a Sunday that cannot change a seeding is not worth anything.
 *
 * What is not correct is vanishing. A page that drops three sections
 * between one Sunday and the next, with nothing where they were, is
 * indistinguishable from the page being broken — and that is exactly the
 * fault this app has shipped before and now has a sweep to catch. So the
 * pages have to say why, and this asserts that they do.
 *
 * Driven at three weeks against one league: mid-season, the last regular
 * week, and the first week of the playoffs.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const F = JSON.parse(fs.readFileSync(
    new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE_ID = '1388633751839309824';
const LEAGUE = 'Den Fantasy Football League 1';
const PLAYOFFS = 15;
const IDS = F.rosters[LEAGUE_ID].map(r => r.roster_id);
const STRENGTH = Object.fromEntries(IDS.map((id, i) => [id, 132 - i * 2.6]));

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const sched = {};
{
    const ring = IDS.slice();
    for (let w = 1; w < PLAYOFFS; w++) {
        sched[w] = [];
        for (let i = 0; i < ring.length / 2; i++) {
            sched[w].push([ring[i], ring[ring.length - 1 - i]]);
        }
        ring.splice(1, 0, ring.pop());
    }
}
const rosterOf = new Map(F.rosters[LEAGUE_ID].map(r => [r.roster_id, r]));

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'],
});

/** One run of the app with the clock set to `week`. */
async function at(week) {
    let seed = 11;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
    await ctx.route('**/api/sleeper/**', route => {
        const u = new URL(route.request().url()).pathname.replace('/api/sleeper', '');
        const j = o => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.includes('/state/nfl')) return j({ week, display_week: week });
        if (/\/user\/[^/]+\/leagues/.test(u)) return j(F.leagues);
        if (/\/user\/txmossad$/.test(u)) return j(F.user);
        if (/\/user\/[^/]+$/.test(u)) return route.fulfill({ status: 404, body: 'null' });
        let m;
        if ((m = u.match(/\/league\/(\d+)\/rosters/))) return j(F.rosters[m[1]] ?? []);
        if ((m = u.match(/\/league\/(\d+)\/users/))) return j(F.users[m[1]] ?? []);
        if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/))) {
            const w = Number(m[2]);
            if (m[1] !== LEAGUE_ID || !sched[w]) return j([]);
            return j(sched[w].flatMap(([a, b], i) => [a, b].map(id => ({
                roster_id: id, matchup_id: i + 1,
                starters: rosterOf.get(id)?.starters ?? null,
                players: rosterOf.get(id)?.players ?? null,
                points: w < week
                    ? Math.round((STRENGTH[id] + (rand() - 0.5) * 44) * 100) / 100
                    : 0,
            }))));
        }
        if ((m = u.match(/\/league\/(\d+)$/))) {
            const d = F.leagueDetail[m[1]];
            return j(d
                ? { ...d, settings: { ...d.settings, playoff_week_start: PLAYOFFS } }
                : null);
        }
        return j(null);
    });
    await ctx.route('https://api.sleeper.app/**', r => r.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(40000);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message.slice(0, 140)));
    await page.goto(`${BASE}/in-season/power`, { waitUntil: 'domcontentloaded' });
    const find = page.getByRole('button', { name: /^find$/i });
    for (let i = 0; i < 8; i++) {
        try {
            await page.getByPlaceholder(/sleeper username/i)
                .fill('txmossad', { timeout: 6000 });
            if (await find.isEnabled()) break;
        } catch { /* not hydrated */ }
        await page.waitForTimeout(1200);
    }
    await find.click();
    await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click();
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click();
    await page.waitForTimeout(16000);
    const text = await page.locator('body').innerText();
    const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (process.env.SHOT_DIR) {
        await page.screenshot({
            path: `${process.env.SHOT_DIR}/season-w${week}.png`, fullPage: true });
    }
    await ctx.close();
    return { text, over, errs };
}

step(1, `mid-season — week 8, six weeks to play`);
const mid = await at(8);
assert('the run home is there', /the run home/i.test(mid.text));
assert('the week is weighed', /what week 8 is worth/i.test(mid.text));
assert('and the record is judged', /earned, or not/i.test(mid.text));
assert('no page errors', mid.errs.length === 0, mid.errs[0] ?? 'none');

step(2, `the last week of the regular season — week ${PLAYOFFS - 1}`);
const last = await at(PLAYOFFS - 1);
assert('the run home is still there, with one week in it',
    /the run home/i.test(last.text));
assert('and that week is the one that decides it',
    new RegExp(`what week ${PLAYOFFS - 1} is worth`, 'i').test(last.text));
assert('no page errors', last.errs.length === 0, last.errs[0] ?? 'none');
assert('no horizontal overflow', last.over <= 1, `${last.over}px`);

step(3, `the playoffs — week ${PLAYOFFS}, nothing left to project`);
const done = await at(PLAYOFFS);
assert('the ranking is still there', /every roster against every other/i.test(done.text));
assert('the record is still judged', /earned, or not/i.test(done.text));
/**
 * The three that go quiet must say they have gone quiet. A section that
 * disappears between one Sunday and the next reads exactly like a page
 * that has broken, which is the fault this app has shipped before.
 */
assert('the page says the regular season is over',
    /regular season is over|no regular-season weeks left|the regular season has finished/i
        .test(done.text),
    (done.text.match(/[^\n]*regular season[^\n]*/i) || ['nothing said'])[0].slice(0, 90));
assert('no run home is claimed', !/the run home/i.test(done.text));
assert('and no week is weighed', !/is worth[\s\S]{0,40}playoff odds/i.test(done.text));
assert('no page errors', done.errs.length === 0, done.errs[0] ?? 'none');
assert('no horizontal overflow', done.over <= 1, `${done.over}px`);

await browser.close();
console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
