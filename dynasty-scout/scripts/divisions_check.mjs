/**
 * A league with divisions is told the odds do not model them.
 *
 * The simulation plays a single table: rank by wins, break ties on points,
 * take the top however-many. In a league split into divisions that is
 * usually not the rule — division winners take the first seeds — so a team
 * leading a weak division is understated and a strong team stuck behind one
 * is overstated, and every number downstream of the odds inherits it: what
 * this week is worth, what a claim is worth, who to root for.
 *
 * Modelling it needs the league's seeding rule, which is a platform setting
 * this cannot read, and a guessed rule producing confident odds is worse
 * than a stated assumption a reader can correct for. So it is said, and
 * this asserts that it is said — and, just as importantly, that it is not
 * said to the overwhelming majority of leagues that have one table and for
 * which the odds are simply right. A caveat that shows up everywhere is a
 * caveat nobody reads.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Den Fantasy Football League 1';
const ID = '1388633751839309824';

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/**
 * The same league, with and without divisions.
 *
 * Injected into the league detail rather than baked into the fixture,
 * because the fixture is a real league and it has one table. Both states
 * have to be checked and only one of them is real, so the unreal one is
 * built here where it is visible.
 */
async function run({ divisions, path }) {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } });
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
        if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/)))
            return j(matchupsFor(F, m[1], Number(m[2])));
        if ((m = u.match(/\/league\/(\d+)$/))) {
            const d = F.leagueDetail[m[1]];
            if (!d) return j(null);
            return j(divisions == null ? d
                : { ...d, settings: { ...d.settings, divisions } });
        }
        return j(null);
    });
    await ctx.route('https://api.sleeper.app/**', r => r.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
    await page.getByRole('button', { name: /^find$/i }).click();
    await page.getByRole('button', { name: new RegExp(LEAGUE) }).first().click({ timeout: 25000 });
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first().click({ timeout: 25000 });
    // Long enough for the season to come back from the worker, which is
    // what the note hangs off: no odds, nothing to caveat.
    await page.waitForTimeout(6000);
    const notes = await page.locator('[data-note="divisions"]').allInnerTexts();
    const body = await page.locator('body').innerText();
    await ctx.close();
    return { notes, body, errs };
}

step(1, 'four divisions, and the Power page says what that means');
const power = await run({ divisions: 4, path: '/in-season/power' });
console.log('      ' + (power.notes[0] ?? '(nothing)').replace(/\s+/g, ' ').slice(0, 150));
assert('the note is there, once', power.notes.length === 1, String(power.notes.length));
assert('it names how many there are', /4 divisions/.test(power.notes[0] ?? ''),
    (power.notes[0] ?? '').slice(0, 40));
assert('and says which way each team is wrong',
    /understates/.test(power.notes[0] ?? '') && /overstates/.test(power.notes[0] ?? ''));
// Said beside the number, not instead of it: a caveat that withheld the
// odds would make a league with divisions strictly worse off than one
// that was never told anything.
assert('the odds are still shown rather than withheld', /playoff/i.test(power.body));
assert('nothing blew up', power.errs.length === 0, power.errs.join(' | '));

step(2, 'and so does Start/Sit, which prices a lineup in those odds');
const ss = await run({ divisions: 4, path: '/redraft/start-sit' });
assert('the note is there too', ss.notes.length === 1, String(ss.notes.length));
assert('nothing blew up', ss.errs.length === 0, ss.errs.join(' | '));

step(3, 'a league with one table is told nothing');
/**
 * The half that keeps this honest. A caveat printed to every league is a
 * caveat every reader learns to skip, and the real fixture — a twelve-team
 * league with one table — must see none of it.
 */
const plain = await run({ divisions: null, path: '/in-season/power' });
assert('no note where there are no divisions', plain.notes.length === 0,
    plain.notes.join(' | '));
assert('the page is otherwise the same', /playoff/i.test(plain.body));
assert('nothing blew up', plain.errs.length === 0, plain.errs.join(' | '));

step(4, 'one division is not divisions');
/**
 * Sleeper reports a count, and some leagues carry 1. One division is a
 * single table with a name on it, and warning about it would be noise.
 */
const one = await run({ divisions: 1, path: '/in-season/power' });
assert('a single division says nothing either', one.notes.length === 0,
    one.notes.join(' | '));

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery step passed');
process.exit(fails.length ? 1 : 0);
