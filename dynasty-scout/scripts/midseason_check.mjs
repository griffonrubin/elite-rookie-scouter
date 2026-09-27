/**
 * A league with something at stake, which week one can never be.
 *
 * The fixture is a real twelve-team league in week one: nobody has played
 * a game, every record is 0-0, and no race is contested at any week. That
 * is a legitimate state and several checks pin it deliberately — "week one
 * claims no luck gap" exists for exactly that reason. It also means whole
 * branches of the app can only ever be exercised empty. The rooting panel
 * correctly reports that no other game this week is worth wanting, and the
 * line on Start/Sit that names the game you should be watching correctly
 * never appears, and neither has ever been seen with anything in it.
 *
 * So this presents the same league in November. Nothing in the fixture
 * changes: the mock serves records on the rosters, a later week from the
 * state endpoint, and the schedule already covers fourteen weeks — which
 * is all a platform sends, and all the app reads. Four teams on six wins
 * for the last two places, four weeks left, and now the games the reader
 * is not playing in are worth real playoff odds.
 *
 * The two pages have to agree about them, which is the point: the panel on
 * Power and the one line on Start/Sit read the same field off the same
 * run, and if they ever name different games the reader has been told to
 * root for two different results on one Sunday.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Den Fantasy Football League 1';
const ID = '1388633751839309824';
const WEEK = 11;

/**
 * Ten games played, and a cut line four teams are fighting over.
 *
 * Roster 11 is the reader's. It sits on six wins with three others, for
 * two places — which is the shape that makes somebody else's game worth
 * watching. Points-for descends with roster id so the tiebreak is
 * deterministic and this check does not depend on which way a coin fell.
 */
const WINS = { 1: 8, 2: 8, 3: 7, 4: 7, 5: 6, 6: 6, 7: 4, 8: 6, 9: 3, 10: 3, 11: 6, 12: 2 };

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } });
await ctx.route('**/api/sleeper/**', route => {
    const u = new URL(route.request().url()).pathname.replace('/api/sleeper', '');
    const j = o => route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(o) });
    if (u.includes('/state/nfl')) return j({ week: WEEK, display_week: WEEK });
    if (/\/user\/[^/]+\/leagues/.test(u)) return j(F.leagues);
    if (/\/user\/txmossad$/.test(u)) return j(F.user);
    if (/\/user\/[^/]+$/.test(u)) return route.fulfill({ status: 404, body: 'null' });
    let m;
    if ((m = u.match(/\/league\/(\d+)\/rosters/))) {
        const rs = F.rosters[m[1]] ?? [];
        if (m[1] !== ID) return j(rs);
        return j(rs.map(r => {
            const w = WINS[r.roster_id] ?? 5;
            return { ...r, settings: { ...r.settings, wins: w, losses: (WEEK - 1) - w,
                ties: 0, fpts: 1100 + (13 - r.roster_id) * 9, fpts_decimal: 0,
                fpts_against: 1100, fpts_against_decimal: 0 } };
        }));
    }
    if ((m = u.match(/\/league\/(\d+)\/users/))) return j(F.users[m[1]] ?? []);
    if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/)))
        return j(matchupsFor(F, m[1], Number(m[2])));
    if ((m = u.match(/\/league\/(\d+)$/))) return j(F.leagueDetail[m[1]] ?? null);
    return j(null);
});
await ctx.route('https://api.sleeper.app/**', r => r.abort());

const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));

step(1, `connect the league in week ${WEEK}, four teams on six wins`);
await page.goto(`${BASE}/in-season/power`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
await page.getByRole('button', { name: /^find$/i }).click();
await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click({ timeout: 25000 });
const root = page.locator('[data-panel="rooting"]');
await root.waitFor({ timeout: 40000 });
await page.waitForTimeout(4000);
/**
 * Read off the panel under test, not off the page.
 *
 * The page carries a week picker, so "week 11 appears somewhere in the
 * body" is satisfied at every week of the season — an assertion that
 * passes whatever the app is doing. The rooting panel names the week it
 * is answering about, and that is the week being simulated.
 */
const heading = (await root.locator('h3').first().innerText()).toLowerCase();
assert(`the panel is answering about week ${WEEK}`,
    heading.includes(`week ${WEEK}`), heading);
/**
 * And the records arrived, which is not "some digits are on the page":
 * the reader's own row has to read six wins, or the race this check is
 * built around is not the one being simulated.
 */
const mine = await page.locator('li').filter({ hasText: 'Jebdaddybush' })
    .first().innerText();
assert('my record is the one the mock served', /\b6[–-]4\b/.test(mine),
    (mine.match(/\b\d+[–-]\d+\b/) || ['(no record)'])[0]);

step(2, 'the rooting panel has something in it');
const games = await root.locator('li [data-game]').allInnerTexts();
const text = await root.innerText();
console.log('      ' + text.split('\n').filter(Boolean).slice(2, 5).join(' | ').slice(0, 160));
assert('at least one game clears the noise floor', games.length > 0,
    games.length === 0 ? text.split('\n').filter(Boolean)[2]?.slice(0, 80) ?? '' : '');
if (games.length > 0) {
    assert('every listed game names both teams',
        games.every(t => / v /.test(t)), games.join(' / '));
    assert('and none of them is my own game',
        !games.some(t => /Jebdaddybush/.test(t)), games.join(' / '));
    const ends = await root.locator('li [data-end]').count();
    assert('each has two ends to read', ends === games.length * 2,
        `${ends} ends for ${games.length} games`);
}

step(3, 'and Start/Sit names the same one');
/**
 * The same field, off the same cached run, rendered by two components
 * that have never met. If they name different games somebody has been
 * told to root for two results on one Sunday.
 */
await page.getByRole('link', { name: 'Start/Sit' }).first().click();
await page.waitForURL(u => u.pathname === '/redraft/start-sit', { timeout: 30000 });
await page.waitForTimeout(5000);
const note = page.locator('[data-note="elsewhere"]');
const has = await note.count();
if (games.length === 0) {
    assert('nothing on Power means nothing here either', has === 0,
        has ? await note.innerText() : '');
} else {
    assert('Start/Sit says which game to watch', has === 1, String(has));
    const line = has ? (await note.innerText()).replace(/\s+/g, ' ') : '';
    console.log('      ' + line.slice(0, 180));
    /**
     * Power lists the biggest swing first, so the game named here must be
     * the one at the top of that list — read as the two team names rather
     * than by position, which would pass on a list of one.
     */
    const top = games[0].split(' v ').map(t => t.trim());
    assert('and it is the game Power puts first',
        top.every(n => line.includes(n)), `${top.join(' v ')} against "${line.slice(0, 90)}"`);
    assert('it says what the game is worth', /\d+ points of playoff odds/.test(line),
        line.slice(0, 60));
}
assert('nothing blew up', errs.length === 0, errs.join(' | '));

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery step passed');
process.exit(fails.length ? 1 : 0);
