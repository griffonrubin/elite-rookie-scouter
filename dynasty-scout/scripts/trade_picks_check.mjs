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
            return j(rs.map(r => {
                const wins = r.roster_id % 9;
                return {
                    ...r,
                    settings: {
                        ...r.settings,
                        wins, losses: (week - 1) - wins, ties: 0,
                        // Points that track the record, the way a real
                        // league's do. Giving every roster the same total
                        // made the points rank a tiebreak on roster id,
                        // which is no rank at all — and the projection
                        // reading as arbitrary was the check's fault, not
                        // the page's.
                        fpts: 900 + wins * 45 + r.roster_id, fpts_decimal: 0,
                        fpts_against: 1100, fpts_against_decimal: 0,
                    },
                };
            }));
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
    const title = await chip.getAttribute('title');
    console.log('      ' + text.replace(/\n/g, ' '));
    console.log('      ' + (title ?? '').slice(0, 150));
    assert('it shows whose pick it is', /ex /.test(text), text.replace(/\n/g, ' '));
    // Roster 8's record under the rule above is 8 % 9 = 8 wins of 9 played.
    // Once a band is projected the chip shows that instead, so the raw
    // record moves into the tooltip rather than disappearing.
    assert('and how the team it belongs to is doing', /8-1/.test(title ?? ''),
        (title ?? '').slice(0, 150));
    assert('which is the original owner\u2019s record, not the holder\u2019s',
        !/\b2-7\b/.test(title ?? ''), (title ?? '').slice(0, 150));
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

// ───────────────────────── the projected band, end to end in the browser
{
    step(11, 'mid-season, the next draft is priced at its projected band');
    // Week 10, so nine games played: past the four-game floor, and the
    // fixture's records are roster_id % 9 wins, which makes roster 8 the
    // best team in the league (8-1) and roster 9 the worst (0-9).
    const { ctx, page, errs } = await open(dynasty, [], 10);
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);

    const chips = await mineSide.locator('[data-pick-id]')
        .evaluateAll(e => e.map(x => ({
            id: x.getAttribute('data-pick-id'),
            text: x.innerText.replace(/\s+/g, ' '),
            title: x.getAttribute('title') ?? '',
        })));
    const next = chips.filter(c => c.id.startsWith('2027-'));
    const later = chips.filter(c => c.id.startsWith('2029-'));
    console.log('      ' + (next[0]?.text ?? '(none)'));
    console.log('      ' + (later[0]?.text ?? '(none)'));

    assert('the next draft carries a band',
        next.length > 0 && /early|mid|late/.test(next[0].text), next[0]?.text);
    assert('and says it is a projection, with the blend that produced it',
        /Projected pick \d+ of \d+/.test(next[0].title)
        && /% record/.test(next[0].title), next[0].title.slice(0, 120));
    assert('the draft after next carries none',
        later.length > 0 && !/early|mid|late/.test(later[0].text), later[0]?.text);

    // The reader's own team is roster 11 on 2-7, which four teams are worse
    // than — so it projects mid, and asserting "near the bottom means early"
    // on it was the check misreading its own fixture rather than the page
    // misreading the league. The genuinely worst team is roster 9 on 0-9.
    const mine = chips.find(c => c.id === '2027-1-11');
    assert('a mid-table team holds a mid first', /mid/.test(mine?.text ?? ''),
        mine?.text);

    await page.locator('#trade-partner').selectOption('9');
    await page.waitForTimeout(1800);
    const worstSide = page.locator('section').filter({ has: page.locator('h3') }).nth(1);
    const worst = await worstSide.locator('[data-pick-id="2027-1-9"]').innerText();
    console.log('      worst team (0-9): ' + worst.replace(/\s+/g, ' '));
    assert('the worst team in the league holds an early first',
        /early/.test(worst), worst.replace(/\s+/g, ' '));
    // Read off the title, not the chip: innerText runs "~1" straight into
    // the value "4,477", so a regex on the chip cannot tell pick 1 from
    // pick 14 and was failing on a number that was right.
    const worstTitle = await worstSide.locator('[data-pick-id="2027-1-9"]')
        .getAttribute('title');
    assert('and it is projected at the very top of the draft',
        /Projected pick 1 of 12/.test(worstTitle ?? ''),
        (worstTitle ?? '').slice(0, 120));

    // And the best team in the league should hold a late one.
    await page.locator('#trade-partner').selectOption('8');
    await page.waitForTimeout(1800);
    const theirSide = page.locator('section').filter({ has: page.locator('h3') }).nth(1);
    const best = await theirSide.locator('[data-pick-id="2027-1-8"]').innerText();
    console.log('      best team (8-1): ' + best.replace(/\s+/g, ' '));
    assert('while the best team in the league holds a late one',
        /late/.test(best), best.replace(/\s+/g, ' '));

    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ─────────── and week one, where there is nothing to project it from
{
    step(12, 'week one prices every pick unslotted, and says why');
    const { ctx, page, errs } = await open(dynasty, [], 1);
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    const text = await mineSide.innerText();
    const chips = await mineSide.locator('[data-pick-id]')
        .evaluateAll(e => e.map(x => x.innerText.replace(/\s+/g, ' ')));
    assert('no chip claims a band', !chips.some(c => /early|mid|late/.test(c)),
        chips.find(c => /early|mid|late/.test(c)) ?? 'none do');
    assert('and the panel says a band needs games first',
        /not projected until game/.test(text));
    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ───── the bar that stands in for the verdict must describe the same trade
{
    step(13, 'the summary bar names the picks, not just the players');
    const { ctx, page, errs } = await open(dynasty, TRADED, 10);
    await page.locator('#trade-partner').selectOption('8');
    await page.waitForTimeout(1800);
    const theirSide = page.locator('section').filter({ has: page.locator('h3') }).nth(1);

    // Give a player, ask only for a pick. That is the realistic dynasty
    // trade and the exact shape that read as "nobody" before: the side
    // receiving the pick had no players on it at all. A pick-for-pick swap
    // would not do — it moves nobody, so there is no season verdict and no
    // bar to stand in for one.
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    await mineSide.locator('button[aria-pressed]').first().click();
    await theirSide.locator('[data-pick-id]').first().click();
    await verdictSettled(page);
    // Put the verdict genuinely out of view, which is the only state the bar
    // is ever seen in. Scrolling to the top of a 1600px-tall window is not
    // enough — the verdict is still on screen there, and the bar was right
    // to stay hidden.
    await page.setViewportSize({ width: 1500, height: 700 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);

    const bar = page.locator('[data-bar="summary"]');
    const barText = (await bar.innerText()).replace(/\s+/g, ' ');
    console.log('      ' + barText.slice(0, 160));
    assert('the bar has taken over from the off-screen verdict',
        await bar.getAttribute('aria-hidden') === 'false',
        `aria-hidden=${await bar.getAttribute('aria-hidden')}`);
    assert('it names the pick being asked for', /20\d\d (1st|2nd|3rd|4th)/.test(barText),
        barText.slice(0, 160));
    assert('and does not call a real trade \u201cnobody\u201d',
        !/nobody/.test(barText), barText.slice(0, 160));

    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ───────── the finder, looking for the trade dynasty leagues are made of
{
    step(14, 'the finder can be pointed at buying and at selling');
    const { ctx, page, errs } = await open(dynasty, TRADED, 10);

    const stance = page.locator('[data-stance-option]');
    assert('a dynasty league is offered the stance control',
        await stance.count() === 3, `${await stance.count()} options`);
    assert('it opens on the mutual sweep',
        await page.locator('[data-stance-option="mutual"]')
            .getAttribute('aria-pressed') === 'true');

    const blurb = () => page.locator('[data-finder-blurb]').innerText();
    const rows = () => page.locator('[data-stance] ~ * button, section button')
        .filter({ hasText: /market|them/ });

    for (const [option, wants] of [
        ['buy', /improve your starting lineup and pay the other manager/i],
        ['sell', /improve .*their.* lineup and leave you better off/i],
    ]) {
        await page.locator(`[data-stance-option="${option}"]`).click();
        await page.waitForTimeout(2500);
        const text = await page.locator('body').innerText();
        const empty = await page.locator('[data-finder-empty]').count();
        console.log(`      ${option}: ${empty ? 'no offers' : 'offers found'}`);
        if (empty === 0) {
            const b = await blurb();
            assert(`${option} explains what it is looking for`, wants.test(b),
                b.replace(/\s+/g, ' ').slice(0, 120));
            // Every row in a buy/sell list must name a pick, or the sweep is
            // returning player-for-player offers under a stance that cannot
            // produce them.
            assert(`${option} offers are made of picks`,
                /20\d\d (1st|2nd|3rd|4th)/.test(text));
            assert(`${option} prices the offer on the market`, /market/.test(text));
        } else {
            // An empty list is a legitimate answer, but it must say so in the
            // stance's own words rather than the mutual one's.
            const msg = await page.locator('[data-finder-empty]').innerText();
            console.log('        ' + msg.replace(/\s+/g, ' '));
            assert(`${option} says why in its own terms`,
                !/improves both lineups/.test(msg), msg.replace(/\s+/g, ' '));
        }
    }

    await page.locator('[data-stance-option="mutual"]').click();
    await page.waitForTimeout(2000);
    const back = await page.locator('body').innerText();
    assert('switching back restores the mutual wording',
        /both starting lineups improve|improves both lineups/.test(back));

    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

{
    step(15, 'a redraft league is never offered a stance it cannot use');
    const { ctx, page, errs } = await open(redraft, []);
    assert('no stance control', await page.locator('[data-stance-option]').count() === 0);
    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ──── the held-against-current columns are the third place a pick can vanish
{
    step(16, 'a held offer keeps its picks in the comparison columns');
    const { ctx, page, errs } = await open(dynasty, TRADED, 10);
    await page.locator('#trade-partner').selectOption('8');
    await page.waitForTimeout(1800);
    const mineSide = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    const theirSide = page.locator('section').filter({ has: page.locator('h3') }).nth(1);

    // Give a player, ask for a pick — the same shape that read as "nobody"
    // in the bar, checked here in the other place it could go missing.
    await mineSide.locator('button[aria-pressed]').first().click();
    await theirSide.locator('[data-pick-id]').first().click();
    await verdictSettled(page);

    // Hold it, then build a different offer so both columns are filled.
    // The Hold button lives in the bar, and the bar only exists while the
    // verdict is off screen — so the page has to be put in that state
    // before the button can be found at all.
    await page.setViewportSize({ width: 1500, height: 700 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^hold$/i }).first().click();
    await page.waitForTimeout(800);
    await page.setViewportSize({ width: 1500, height: 1600 });
    await page.waitForTimeout(500);
    await theirSide.locator('[data-pick-id]').first().click();   // take the pick off
    await theirSide.locator('button[aria-pressed]').first().click();  // ask for a player
    await verdictSettled(page);

    const compare = page.locator('section').filter({ hasText: /held against current/i })
        .first();
    const text = (await compare.innerText()).replace(/\s+/g, ' ');
    console.log('      ' + text.slice(0, 190));
    assert('the comparison is showing', await compare.count() >= 1);
    assert('the held offer still names its pick',
        /20\d\d (1st|2nd|3rd|4th)/.test(text), text.slice(0, 190));
    assert('and it reads as a pick, not as a raw id',
        !/20\d\d-\d-\d/.test(text), text.slice(0, 190));
    assert('neither column calls a real offer \u201cnobody\u201d',
        !/nobody/.test(text), text.slice(0, 190));

    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

// ───────────────── picks are findable in the same box players are
{
    step(17, 'the league search finds picks, not just players');
    const { ctx, page, errs } = await open(dynasty, TRADED, 10);
    const search = page.locator('[data-search="league"]');
    assert('the box says picks are findable',
        /pick/i.test(await search.getAttribute('placeholder') ?? ''),
        await search.getAttribute('placeholder'));

    await search.fill('2027 1st');
    await page.waitForTimeout(600);
    const hits = page.locator('[data-search-results] button');
    const n = await hits.count();
    const first = n > 0 ? (await hits.first().innerText()).replace(/\s+/g, ' ') : '';
    console.log(`      ${n} hits, first: ${first}`);
    assert('a year and a round finds picks', n > 0, `${n} hits`);
    assert('and they are labelled as picks', /PICK/.test(first), first);
    assert('with the manager who holds each one',
        await hits.first().getAttribute('data-hit-team') != null);

    // The case worth having: a pick on a manager I am not trading with.
    const startingPartner = await page.locator('#trade-partner').inputValue();
    let third = null;
    for (const h of await hits.all()) {
        const team = await h.getAttribute('data-hit-team');
        if (team !== startingPartner && team !== '11') { third = h; break; }
    }
    assert('a pick is listed on a manager I am not trading with', third != null);
    if (third) {
        const team = await third.getAttribute('data-hit-team');
        const label = (await third.innerText()).replace(/\s+/g, ' ');
        await third.click();
        await page.waitForTimeout(2000);
        assert('picking it switches the partner to whoever holds it',
            await page.locator('#trade-partner').inputValue() === team,
            `${await page.locator('#trade-partner').inputValue()} vs ${team}`);
        const theirSide = page.locator('section').filter({ has: page.locator('h3') })
            .nth(1);
        const selected = theirSide.locator('[data-pick-id][aria-pressed="true"]');
        assert('and puts that pick on the table', await selected.count() === 1,
            `${await selected.count()} selected — wanted ${label}`);
        assert('the URL carries it', /getPicks=/.test(page.url()), page.url());
    }

    assert('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

await b.close();
console.log(fails.length
    ? `\nFAILED ${fails.length}:\n - ${fails.join('\n - ')}`
    : '\ntrade_picks_check    ok');
process.exit(fails.length ? 1 : 0);
