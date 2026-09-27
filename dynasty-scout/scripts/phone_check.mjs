/**
 * The pages at the width most people hold them at.
 *
 * Every other browser check in here runs at 1100 pixels or wider — eighteen
 * of them at 1500 — and fifteen assert that nothing overflows sideways. All
 * at a desk. Nothing had ever rendered any page of a fantasy-football tool at
 * phone width, which is where lineups get set on a Sunday morning.
 *
 * The layout survives it today; that was checked by looking. This is what
 * keeps it true, because a horizontal scrollbar is the one layout failure a
 * reader cannot work around — they cannot see half the numbers, and on a
 * touch screen the sideways drag fights the vertical one.
 *
 * The claim is deliberately narrow. Not "it looks good", which no check can
 * say, but "nothing is wider than the screen", which is measurable and is the
 * difference between awkward and unusable. Where it fails it names the
 * element, because "something overflows" on a page of two hundred nodes is a
 * bug report nobody can act on.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import { matchupsFor } from './fixtures.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3090';
const F = JSON.parse(fs.readFileSync(
    new URL('./fixtures-real-leagues.json', import.meta.url), 'utf8'));
const LEAGUE_ID = '1388633751839309824';

/** A middling phone. Narrower than most, which is the point of picking it. */
const PHONE = { width: 390, height: 844 };

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
});

/**
 * Whether anything sticks out past the screen, and what.
 *
 * A horizontally scrollable strip is a deliberate thing — the nav is one —
 * so an element inside a scroller is not an overflow. The test is the page
 * itself: if `documentElement` scrolls sideways, the reader is panning.
 */
const overflow = page => page.evaluate(() => {
    const de = document.documentElement;
    const scrolls = el => {
        for (let n = el; n && n !== de; n = n.parentElement) {
            const o = getComputedStyle(n).overflowX;
            if (o === 'auto' || o === 'scroll') return true;
        }
        return false;
    };
    const wide = [...document.querySelectorAll('body *')]
        .filter(e => e.getBoundingClientRect().right > de.clientWidth + 1)
        .filter(e => !scrolls(e))
        .slice(0, 6)
        .map(e => `<${e.tagName.toLowerCase()} class="`
            + `${(e.className || '').toString().split(' ').slice(0, 3).join(' ')}"> `
            + `reaches ${Math.round(e.getBoundingClientRect().right)}`);
    return { sw: de.scrollWidth, cw: de.clientWidth, wide };
});

// ───────────────────────────── the pages that need no league
{
    step(1, 'the data-heavy pages fit a phone');
    const ctx = await b.newContext({
        viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(45000);
    const errs = [];
    page.on('pageerror', e => errs.push(`${e.message}`));

    // The ones made of tables and charts, which is what actually blows a
    // narrow layout open. A page of prose cannot overflow.
    for (const route of [
        '/', '/redraft', '/redraft/dropoff', '/redraft/tiers', '/rankings',
        '/trade-calculator', '/redraft/compare', '/in-season/trades',
    ]) {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1800);
        const o = await overflow(page);
        assert(`${route} fits`, o.sw <= o.cw + 1,
            `${o.sw} wide in ${o.cw}` + (o.wide.length ? ` — ${o.wide[0]}` : ''));
        if (o.sw > o.cw + 1 && o.wide.length > 1) {
            for (const w of o.wide.slice(1)) console.log(`        ${w}`);
        }
    }
    assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
}

// ──────────────── and the analyser with a real trade on the table
{
    step(2, 'the trade analyser fits one with an offer on the table');
    const ctx = await b.newContext({
        viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const week = 10;
    const dynasty = { ...F.leagueDetail[LEAGUE_ID] };
    dynasty.settings = { ...dynasty.settings, type: 2, draft_rounds: 4 };
    await ctx.route('**/api/sleeper/**', route => {
        const u = new URL(route.request().url()).pathname.replace('/api/sleeper', '');
        const j = o => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.includes('/state/nfl')) return j({ week, display_week: week });
        if (/\/user\/[^/]+\/leagues/.test(u)) return j(F.leagues);
        if (/\/user\/txmossad$/.test(u)) return j(F.user);
        if (/\/user\/[^/]+$/.test(u)) return route.fulfill({ status: 404, body: 'null' });
        let m;
        if (u.match(/\/league\/(\d+)\/traded_picks/)) {
            return j([{ season: '2027', round: 1, roster_id: 8,
                previous_owner_id: 8, owner_id: 11 }]);
        }
        if ((m = u.match(/\/league\/(\d+)\/rosters/))) {
            const rs = F.rosters[m[1]] ?? [];
            if (m[1] !== LEAGUE_ID) return j(rs);
            return j(rs.map(r => {
                const wins = r.roster_id % 9;
                return { ...r, settings: { ...r.settings, wins,
                    losses: (week - 1) - wins, ties: 0,
                    fpts: 900 + wins * 45 + r.roster_id } };
            }));
        }
        if ((m = u.match(/\/league\/(\d+)\/users/))) return j(F.users[m[1]] ?? []);
        if ((m = u.match(/\/league\/(\d+)\/matchups\/(\d+)/))) {
            return j(matchupsFor(F, m[1], Number(m[2])));
        }
        if ((m = u.match(/\/league\/(\d+)$/))) {
            return j(m[1] === LEAGUE_ID ? dynasty : (F.leagueDetail[m[1]] ?? null));
        }
        return j(null);
    });
    await ctx.route('https://api.sleeper.app/**', r => r.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    const errs = [];
    page.on('pageerror', e => errs.push(`${e.message}`));

    await page.goto(`${BASE}/in-season/trades`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/sleeper username/i).fill('txmossad');
    await page.getByRole('button', { name: /^find$/i }).click();
    await page.getByRole('button', { name: /Den Fantasy Football League 1/ }).first()
        .click({ timeout: 40000 });
    await page.getByRole('button', { name: /^Jebdaddybush$/ }).first()
        .click({ timeout: 40000 });
    await page.locator('#trade-partner').waitFor({ timeout: 40000 });
    await page.waitForTimeout(2000);
    await page.locator('#trade-partner').selectOption('8');
    await page.waitForTimeout(2000);

    const mine = page.locator('section').filter({ has: page.locator('h3') }).nth(0);
    const theirs = page.locator('section').filter({ has: page.locator('h3') }).nth(1);
    await mine.locator('button[aria-pressed]').first().click();
    await mine.locator('[data-pick-id]').first().click();
    await theirs.locator('button[aria-pressed]').first().click();
    await theirs.locator('[data-pick-id]').first().click();
    const heading = page.getByRole('heading', { name: /what it does to each side/i });
    await heading.waitFor({ timeout: 60000 });
    await page.locator('[aria-busy="false"]').filter({ has: heading })
        .waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);

    // Loaded, not empty: a page showing nothing cannot overflow, so the
    // assertion below would pass on an analyser that never rendered a trade.
    const chips = await page.locator('[data-pick-id][aria-pressed="true"]').count();
    assert('there is a real offer on the table', chips >= 1, `${chips} picks`);

    const o = await overflow(page);
    assert('the analyser fits with players and picks both ways',
        o.sw <= o.cw + 1, `${o.sw} wide in ${o.cw}`);
    for (const w of o.wide) console.log(`        ${w}`);

    // The bar stands in for the verdict off screen, and on a phone it is
    // almost always off screen — so it is the one element most likely to be
    // the thing that does not fit.
    const bar = page.locator('[data-bar="summary"]');
    if (await bar.count()) {
        const box = await bar.first().boundingBox();
        console.log(`      summary bar: ${Math.round(box.width)}px in ${o.cw}`);
        assert('and the summary bar fits inside the screen',
            box.x >= -1 && box.x + box.width <= o.cw + 1,
            `${Math.round(box.x)}..${Math.round(box.x + box.width)}`);
    }

    assert('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
}

await b.close();
console.log(fails.length
    ? `\nFAILED ${fails.length}:\n - ${fails.join('\n - ')}`
    : '\nphone_check          ok');
process.exit(fails.length ? 1 : 0);
