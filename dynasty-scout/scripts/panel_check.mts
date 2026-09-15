/**
 * The two schedule panels, rendered and measured at both widths.
 *
 * The palette validator checks colour and cannot check layout, and these
 * are exactly the panels that pass every unit check and collide on a
 * phone: a name column that collapses to nothing, a heat strip whose cells
 * round to zero width, a record that auto-places onto a row of its own
 * beside a bar it is not measuring. All three happened here, and the last
 * one only showed up in a screenshot — the markup was valid and the
 * numbers were right.
 *
 * So the measurements are the check. Every name has to be readable at
 * 390px, every cell has to be wide enough to hold its label, nothing may
 * push the page sideways, and no two teams may share a label — two letters
 * off the front of a name gives "Certified Dumpster" and "CeeDee
 * Islanders" the same one, and a column that says CE twice about different
 * opponents is worse than no column.
 *
 * The page these live on needs a connected league, which needs a platform
 * API this sandbox cannot reach, so they are server-rendered against a
 * fixture instead.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
    writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync, mkdtempSync,
    copyFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { createServer } from 'http';
import path from 'path';
// playwright-core, as every browser check here does: the full package is
// not a dependency of this app and does not need to be.
import { chromium } from 'playwright-core';
import { Earned } from '../components/redraft/power/Earned';
import { RunHome } from '../components/redraft/power/RunHome';
import { allPlay, scheduleStrength, type LeagueGame } from '../lib/leagueSchedule';

const NAMES: Record<string, string> = {
    '1': 'Regulators', '2': 'Pain Train', '3': 'Ducks on the Pond',
    '4': 'Zero RB Truthers', '5': 'Jalen the Hutt', '6': 'Sunday Scaries',
    '7': 'Bijan Mustard', '8': 'Certified Dumpster', '9': 'CeeDee Islanders',
    '10': 'Puka Shell', '11': 'Nabers Watch', '12': 'The Kelce Tapes',
};
const KEYS = Object.keys(NAMES);
const EXPECTED: Record<string, number> = {
    '1': 128.4, '2': 122.1, '3': 118.9, '4': 131.7, '5': 109.2, '6': 114.6,
    '7': 126.0, '8': 101.3, '9': 120.8, '10': 105.7, '11': 116.2, '12': 112.4,
};

/** A full round robin, circle method, so every week pairs everybody once. */
function season(weeks: number): LeagueGame[] {
    const ring = KEYS.slice();
    const out: LeagueGame[] = [];
    for (let w = 1; w <= weeks; w++) {
        for (let i = 0; i < ring.length / 2; i++) {
            out.push({ week: w, home: ring[i], away: ring[ring.length - 1 - i] });
        }
        ring.splice(1, 0, ring.pop()!);
    }
    return out;
}

const PLAYED = 8, AHEAD = 6;
const games = season(PLAYED + AHEAD);
// Scores drawn deterministically around each roster's expectation, so the
// fixture is the same picture every run and a change to a panel is the only
// thing that can move it.
let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (const g of games) {
    if (g.week > PLAYED) continue;
    const draw = (k: string) =>
        Math.round((EXPECTED[k] + (rand() - 0.5) * 46) * 10) / 10;
    g.homePoints = draw(g.home);
    g.awayPoints = draw(g.away);
}

const play = allPlay(games, KEYS);
const sos = scheduleStrength(
    KEYS.map(k => ({ key: k, expected: EXPECTED[k] })), games, PLAYED + 1, PLAYED + AHEAD);
const weeksAhead = Array.from({ length: AHEAD }, (_, i) => PLAYED + 1 + i);
const MY = '4';

const css = readdirSync('.next/static/chunks')
    .filter(f => f.endsWith('.css'))
    .map(f => `<link rel="stylesheet" href="/_css/${f}">`).join('\n');

const html = `<!doctype html><html class="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${css}
<style>body{background:#060a10;margin:0;padding:18px;
  font-family:system-ui,-apple-system,sans-serif}</style>
</head><body><div class="space-y-6" style="max-width:920px">
${renderToStaticMarkup(React.createElement(Earned, {
    rows: KEYS.map(k => ({ key: k, name: NAMES[k], play: play.get(k)! })),
    myKey: MY,
}))}
${renderToStaticMarkup(React.createElement(RunHome, {
    rows: KEYS.map(k => ({ key: k, name: NAMES[k], sos: sos.get(k)! })),
    myKey: MY, weeks: weeksAhead,
}))}
</div></body></html>`;

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const out = process.env.SHOT_DIR || mkdtempSync(path.join(tmpdir(), 'panels-'));
mkdirSync(path.join(out, '_css'), { recursive: true });
for (const f of readdirSync('.next/static/chunks').filter(f => f.endsWith('.css'))) {
    copyFileSync(path.join('.next/static/chunks', f), path.join(out, '_css', f));
}
writeFileSync(path.join(out, 'panels.html'), html);

const server = createServer((req, res) => {
    const f = path.join(out, req.url === '/' ? 'panels.html' : decodeURIComponent(req.url!));
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.css') ? 'text/css' : 'text/html' });
    res.end(readFileSync(f));
});
await new Promise<void>(r => server.listen(4598, r));

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
});

for (const [width, label] of [[1100, 'desktop'], [390, 'a phone']] as const) {
    step(label === 'a phone' ? 2 : 1, `both panels at ${width}px — ${label}`);
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://localhost:4598/', { waitUntil: 'networkidle' });
    await page.screenshot({
        path: path.join(out, `panels-${label === 'a phone' ? 'phone' : 'wide'}.png`),
        fullPage: true,
    });

    const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(`nothing pushes the page sideways`, overflow <= 1, `${overflow}px over`);

    /**
     * Every team's name, measured rather than asserted to exist. A name in
     * a collapsed column is in the DOM and is zero pixels wide, which is
     * how the successor panel shipped unreadable.
     */
    const names: { text: string; w: number }[] = await page.evaluate(() => Array.from(
        // A stable hook rather than "the first span in the row": the row's
        // first span is the rank number in one of these panels and the name
        // in the other, and a check that measures the wrong element passes
        // while the thing it is guarding is broken.
        document.querySelectorAll('[data-team]'),
        el => ({
            text: (el.textContent ?? '').trim(),
            w: el.getBoundingClientRect().width,
        })));
    const narrow = names.filter(n => n.w < 46);
    assert('every team name has room to be read',
        names.length >= 24 && narrow.length === 0,
        narrow.length ? narrow.map(n => `"${n.text}" ${n.w.toFixed(0)}px`).join(', ')
            : `${names.length} rows, narrowest ${Math.min(...names.map(n => n.w)).toFixed(0)}px`);

    /** A heat cell too narrow for its own label is an unreadable cell. */
    const cells: { label: string; title: string; w: number }[] =
        await page.evaluate(() => Array.from(
        document.querySelectorAll('li span[title^="Week"]'),
        el => ({
            label: (el.textContent ?? '').trim(),
            title: el.getAttribute('title') ?? '',
            w: el.getBoundingClientRect().width,
        })));
    const tiny = cells.filter(c => c.w < 14);
    assert('every fixture cell is wide enough to hold its label',
        cells.length === 12 * 6 && tiny.length === 0,
        tiny.length ? `${tiny.length} under 14px` : `${cells.length} cells, `
            + `narrowest ${Math.min(...cells.map(c => c.w)).toFixed(0)}px`);

    /**
     * No two teams may share a short label. Two letters off the front of
     * the name collides on real league names, and a column that says the
     * same thing about two different opponents cannot be read at all.
     */
    const byLabel = new Map<string, Set<string>>();
    for (const c of cells) {
        const who = c.title.split(': ')[1]?.split(',')[0] ?? c.title;
        (byLabel.get(c.label) ?? byLabel.set(c.label, new Set()).get(c.label)!).add(who);
    }
    const shared = [...byLabel.entries()].filter(([, who]) => who.size > 1);
    assert('no two teams share a label', shared.length === 0,
        shared.length ? shared.map(([l, w]) => `${l} = ${[...w].join(' / ')}`).join('; ')
            : `${byLabel.size} distinct`);
    await page.close();
}

step(3, 'the two orderings a reader is relying on');
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto('http://localhost:4598/', { waitUntil: 'networkidle' });
const luck: number[] = await page.evaluate(() => Array.from(
    document.querySelectorAll('section:first-of-type li'),
    li => parseFloat((li.lastElementChild?.textContent ?? '')
        .replace('\u2212', '-').replace(/[^0-9.\-]/g, ''))));
assert('the luck list runs from flattered to robbed',
    luck.length === 12 && luck.every((v, i) => i === 0 || v <= luck[i - 1] + 1e-9),
    luck.map(v => v.toFixed(1)).join(' '));

const ranks: number[] = await page.evaluate(() => Array.from(
    document.querySelectorAll('section:last-of-type li'),
    li => parseInt((li.querySelector('[data-rank]')?.textContent ?? '').trim(), 10)));
assert('the run home runs from hardest to easiest',
    ranks.length === 12 && ranks.every((v, i) => i === 0 || v >= ranks[i - 1]),
    ranks.join(' '));
await page.close();

await browser.close();
server.close();
console.log(`\nshots in ${out}`);
console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
