/**
 * Search, and picks, on the In Season analyser.
 *
 * Two things the page could not do, checked against the same twelve-team
 * league the rest of the trade checks use. The claims worth holding it to
 * are not "the controls render":
 *
 * A pick must not move the season. It does not play, so the playoff-odds
 * verdict has to come back bit-for-bit identical with a 2027 first on the
 * table and without it. Anything else means a future pick has leaked into a
 * number about this November, which is the one mistake this feature could
 * make that a reader would never catch.
 *
 * Ownership must be read, not assumed. A pick the fixture has traded away
 * belongs to the team that traded for it, on their side of the table, and is
 * gone from the team that sent it.
 *
 * And the market total must be arithmetic, not vibes: putting one pick on
 * the table moves the total by exactly that pick's published value.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

const F = JSON.parse(fs.readFileSync(
    new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://localhost:3090';
const LEAGUE = 'Den Fantasy Football League 1';
const LEAGUE_ID = '1388633751839309824';

/**
 * The picks the fixture has moved.
 *
 * Roster 8's 2027 first went to roster 11 — which is the reader's own team,
 * so the check can see an acquired pick on its own side and a hole on the
 * side it came from. Sleeper reports season as a string, and the page has to
 * cope with that rather than with a tidied number.
 */
const TRADED = [
    { season: '2027', round: 1, roster_id: 8, previous_owner_id: 8, owner_id: 11 },
];

/** What the feed prices these at in 1QB, which is the format this league is. */
const VALUE = { '2027-1': 2781, '2027-2': 1510, '2028-1': 2057 };

const dynasty = { ...F.leagueDetail[LEAGUE_ID] };
dynasty.settings = { ...dynasty.settings, type: 2, draft_rounds: 4 };
const redraft = { ...F.leagueDetail[LEAGUE_ID] };
redraft.settings = { ...redraft.settings, type: 0 };

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
});

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

/** A page wired to this league, with the league detail the case wants. */
async function open(detail, traded, week = 1) {
    const ctx = await b.newContext({
        viewport: { width: 1500, height: 1600 }, deviceScaleFactor: 1 });
    await ctx.route('**/api/sleeper/**', route => {
        const u = new URL(route.request().url()).pathname.replace('/api/sleeper', '');
        const j = o => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.includes('/state/nfl')) return j({ week, display_week: week });
        if (/\/user\/[^/]+\/leagues/.test(u)) return j(F.leagues);
        if (/\/user\/txmossad$/.test(u)) return j(F.user);
        if (/\/user\/[^/]+$/.test(u)) return route.fulfill({ status: 404, body: 'null' });
        let m;
        if ((m = u.match(/\/league\/(\d+)\/traded_picks/))) return j(traded);
        if ((m = u.match(/\/league\/(\d+)\/rosters/))) {
            const rs = F.rosters[m[1]] ?? [];
            // Mid-season only: give every roster a played record, so the
            // record beside a pick has something to say.
            if (week === 1 || m[1] !== LEAGUE_ID) return j(rs);
            return j(rs.map(r => ({
                ...r,
                settings: {
                    ...r.settings,
                    wins: r.roster_id % 9, losses: (week - 1) - (r.roster_id % 9),
                    ties: 0, fpts: 1100, fpts_decimal: 0,
                    fpts_against: 1100, fpts_against_decimal: 0,
                },
            })));
        }
        if ((m = u.match(/\/league\/(\d+)\/users/))) return j(F.users[m[1]] ?? []);
        if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/)))
            return j(matchupsFor(F, m[1], Number(m[2])));
        if ((m = u.match(/\/league\/(\d+)$/)))
            return j(m[1] === LEAGUE_ID ? detail : (F.leagueDetail[m[1]] ?? null));
        return j(null);
    });
    await ctx.route('https://api.sleeper.app/**', r => r.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`${BASE}/in-season/trades`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
    await page.getByRole('button', { name: /^find$/i }).click();
    await page.getByRole('button', { name: new RegExp(LEAGUE) }).first()
        .click({ timeout: 25000 });
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first()
        .click({ timeout: 25000 });
    await page.locator('#trade-partner').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    return { ctx, page, errs };
}

/**
 * The verdict for the trade currently on the table.
 *
 * Waiting on the heading alone reads the previous answer, which stays on
 * screen while the next one runs — the page says which through aria-busy,
 * so that is what gets waited on.
 */
async function verdictSettled(page) {
    const heading = page.getByRole('heading', { name: /what it does to each side/i });
    await heading.waitFor({ timeout: 30000 });
    await page.locator('[aria-busy="false"]').filter({ has: heading })
        .waitFor({ timeout: 30000 });
}

/** Every playoff-odds number the verdict is currently showing. */
async function headline(page) {
    const t = await page.locator('body').innerText();
    return (t.match(/([−+-][\d.]+) pts of (?:playoff odds|win rate)/g) ?? []).join(' ');
}

const marketGap = async page => {
    const el = page.locator('[data-market-gap]');
    return await el.count() === 0 ? null : (await el.innerText()).trim();
};
const gapNumber = async page => {
    const raw = await marketGap(page);
    if (raw == null) return null;
    const n = Number(raw.replace(/[+,]/g, '').replace('−', '-'));
    return Number.isFinite(n) ? n : null;
};

// ───────────────────────────────────────────────────── dynasty league
{
    const { ctx, page, errs } = await open(dynasty, TRADED);

    step(1, 'search finds a player on somebody else\'s roster');
    const search = page.locator('[data-search="league"]');
    assert('the league has a search box', await search.count() === 1);

    // Somebody on a third roster, so picking him has to switch the partner.
    const startingPartner = await page.locator('#trade-partner').inputValue();
    const rosters = F.rosters[LEAGUE_ID];
    const third = rosters.find(r => String(r.roster_id) !== '11'
        && String(r.roster_id) !== startingPartner);
    await search.fill('a');
    await page.waitForTimeout(400);
    assert('one letter is not enough to list half the league',
        await page.locator('[data-search-results] button').count() === 0);

    // Take a real name off the page: the first player listed on that third
    // roster, as the page itself renders him.
    await page.locator('#trade-partner').selectOption(String(third.roster_id));
    await page.waitForTimeout(1200);
    const theirRows = page.locator('section').filter({ has: page.locator('h3') })
        .nth(1).locator('button[aria-pressed]');
    const targetName = (await theirRows.first().innerText()).split('\n')[0].trim();
    await page.locator('#trade-partner').selectOption(startingPartner);
    await page.waitForTimeout(1200);

    await search.fill(targetName.split(' ').slice(-1)[0]);
    await page.waitForTimeout(500);
    const hits = page.locator('[data-search-results] button');
    const hitCount = await hits.count();
    assert('the name comes back', hitCount > 0, `${hitCount} hits for "${targetName}"`);
    const owned = page.locator(`[data-hit-player-id][data-hit-team="${third.roster_id}"]`);
    assert('the hit names the manager who holds him', await owned.count() >= 1);

    step(2, 'picking him switches the partner and puts him on the table');
    await owned.first().click();
    await page.waitForTimeout(1200);
    assert('the partner is now the manager who had him',
        await page.locator('#trade-partner').inputValue() === String(third.roster_id),
        await page.locator('#trade-partner').inputValue());
    assert('he is on the table', (await page.locator('body').innerText())
        .includes(targetName));
    assert('the URL carries him', /[?&]get=/.test(page.url()), page.url());

    step(3, 'the pick the fixture traded moved with it');
    // Roster 8's 2027 1st was traded to roster 11 — mine.
    await page.locator('#trade-partner').selectOption('8');
    await page.waitForTimeout(1500);
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    const theirSide = page.locator('section').filter({ has: page.locator('h3') }).nth(1);
    const myPickIds = await mineSide.locator('[data-pick-id]')
        .evaluateAll(e => e.map(x => x.getAttribute('data-pick-id')));
    const theirPickIds = await theirSide.locator('[data-pick-id]')
        .evaluateAll(e => e.map(x => x.getAttribute('data-pick-id')));
    console.log('      mine:  ' + myPickIds.join(' '));
    console.log('      theirs:' + theirPickIds.join(' '));
    assert('I hold my own 2027 1st', myPickIds.includes('2027-1-11'));
    assert('I also hold the 2027 1st I traded for', myPickIds.includes('2027-1-8'));
    assert('they no longer hold the 2027 1st they sent',
        !theirPickIds.includes('2027-1-8'), theirPickIds.join(','));
    assert('they still hold their other picks', theirPickIds.includes('2027-2-8'));
    assert('a pick traded for is labelled with whose it was',
        (await mineSide.innerText()).includes('ex '), 'expects an "ex <team>" tag');
    // Week one, so nobody has a record yet and no chip should pretend to.
    // Step 9 is the other half of this: once a season is under way it does.
    const weekOneChip = await mineSide.locator('[data-pick-id="2027-1-8"]').innerText();
    assert('and carries no record before a game has been played',
        !/\d-\d/.test(weekOneChip), weekOneChip.replace(/\n/g, ' '));

    step(4, 'a pick does not touch the playoff odds');
    // A player-only trade first, so there is a verdict to compare against.
    await mineSide.locator('button[aria-pressed]').first().click();
    await verdictSettled(page);
    const before = await headline(page);
    assert('a player-only trade has a verdict', before.length > 0, before);

    const gapBefore = await gapNumber(page);
    await theirSide.locator('[data-pick-id]').first().click();
    await verdictSettled(page);
    // Without this the assertion below is vacuous: a click that missed
    // leaves the odds identical too, and the check would be congratulating
    // itself on having changed nothing.
    assert('the pick really is on the table',
        await theirSide.locator('[data-pick-id][aria-pressed="true"]').count() === 1);
    const gapAfter = await gapNumber(page);
    assert('and the market panel noticed it', gapAfter !== gapBefore,
        `${gapBefore} → ${gapAfter}`);
    const after = await headline(page);
    assert('the odds are identical with a pick on the table', before === after,
        `${before}  →  ${after}`);

    step(5, 'the market panel is arithmetic');
    const withPick = await gapNumber(page);
    await theirSide.locator('[data-pick-id]').first().click();  // take it back off
    await page.waitForTimeout(600);
    const withoutPick = await gapNumber(page);
    const pickId = await theirSide.locator('[data-pick-id]').first()
        .getAttribute('data-pick-id');
    const season = pickId.split('-').slice(0, 2).join('-');
    const expected = VALUE[season];
    console.log(`      ${pickId} → with ${withPick}, without ${withoutPick}, `
        + `feed says ${expected}`);
    assert('taking the pick off moves the gap by exactly its published value',
        withPick != null && withoutPick != null
        && Math.abs((withPick - withoutPick) - expected) < 1,
        `moved ${withPick - withoutPick}, feed ${expected}`);

    step(6, 'a pick survives the round trip through the URL');
    await theirSide.locator('[data-pick-id]').first().click();
    await page.waitForTimeout(600);
    const url = page.url();
    assert('the URL carries the pick', /getPicks=\d{4}-\d/.test(url), url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const reloaded = page.locator('section').filter({ has: page.locator('h3') })
        .nth(1).locator('[data-pick-id][aria-pressed="true"]');
    assert('it comes back selected', await reloaded.count() === 1,
        `${await reloaded.count()} selected`);

    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ───────────────────────────────────────────────────── redraft league
{
    step(7, 'a redraft league is not offered picks at all');
    const { ctx, page, errs } = await open(redraft, []);
    assert('no picks anywhere', await page.locator('[data-pick-id]').count() === 0);
    assert('and no switch to turn them on, because the platform said',
        await page.locator('[data-toggle="picks"]').count() === 0);
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    await mineSide.locator('button[aria-pressed]').first().click();
    await verdictSettled(page);
    assert('the season verdict still works', (await headline(page)).length > 0);
    assert('and no market panel, because a redraft trade has no afterwards',
        await page.locator('[data-panel="market"]').count() === 0);
    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ─────────────────────────────────── a platform that will not say which
{
    step(8, 'where the platform is silent, the reader is asked rather than guessed at');
    const quiet = { ...F.leagueDetail[LEAGUE_ID] };
    quiet.settings = { ...quiet.settings };
    delete quiet.settings.type;
    const { ctx, page, errs } = await open(quiet, TRADED);
    const toggle = page.locator('[data-toggle="picks"]');
    assert('the switch is offered', await toggle.count() === 1);
    assert('picks are off until it is used',
        await page.locator('[data-pick-id]').count() === 0);
    await toggle.check();
    await page.waitForTimeout(800);
    assert('turning it on produces picks',
        await page.locator('[data-pick-id]').count() > 0);
    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ─────────────────────────────── the record beside a pick, once there is one
{
    step(9, 'mid-season, a pick carries the record of the team it belongs to');
    const { ctx, page, errs } = await open(dynasty, TRADED, 10);
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    const chip = mineSide.locator('[data-pick-id="2027-1-8"]');
    assert('the acquired pick is still there', await chip.count() === 1);
    const text = await chip.innerText();
    console.log('      ' + text.replace(/\n/g, ' '));
    // Roster 8's record under the rule above is 8 % 9 = 8 wins of 9 played.
    assert('it shows whose pick it is and how their season is going',
        /8-1/.test(text), text.replace(/\n/g, ' '));
    assert('and that is the original owner\u2019s record, not the holder\u2019s',
        !/ 2-/.test(text), text.replace(/\n/g, ' '));
    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ──────────────────── what the market does not price, and why it says so
{
    step(10, 'an unpriced asset is explained by what it is, not by one blanket reason');
    const { ctx, page, errs } = await open(dynasty, TRADED);
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    // A kicker: the dynasty market carries a few hundred tradeable players
    // and no kickers at all, so this is the common unpriced case rather
    // than an exotic one — 13% of a real roster is kickers and defences.
    const kicker = mineSide.locator('button[aria-pressed]')
        .filter({ hasText: /^(?!.*ST\s*$)/ });
    const rows = await mineSide.locator('button[aria-pressed]').all();
    let picked = null;
    for (const r of rows) {
        const t = await r.innerText();
        if (/D\/ST|Myers|Reichard|Ravens|Texans/i.test(t)) { picked = r; break; }
    }
    assert('the fixture has a kicker or defence to offer', picked != null);
    if (picked) {
        await picked.click();
        await page.waitForTimeout(1500);
        const note = page.locator('[data-note="unpriced"]');
        assert('the panel says it is unpriced', await note.count() === 1);
        const text = await note.innerText();
        console.log('      ' + text.replace(/\s+/g, ' ').slice(0, 160));
        assert('and blames the market, not the feed\u2019s horizon',
            /does not price/.test(text) && !/further out than the market/.test(text),
            text.replace(/\s+/g, ' '));
    }
    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

await b.close();
console.log(fails.length
    ? `\nFAILED ${fails.length}:\n - ${fails.join('\n - ')}`
    : '\ntrade_picks_check    ok');
process.exit(fails.length ? 1 : 0);
