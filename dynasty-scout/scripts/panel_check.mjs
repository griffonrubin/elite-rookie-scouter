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
 * API this sandbox cannot reach, so `panel_render.mts` server-renders them
 * against a fixture and this drives a browser over the result. The split
 * is not tidiness: Playwright is not a dependency of this app, and a
 * typechecked `.mts` importing it fails `next build` on a clean checkout
 * while passing locally against a stray install.
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { createServer } from 'http';
import path from 'path';
import { chromium } from 'playwright-core';

const out = execFileSync('npx', ['tsx', 'scripts/panel_render.mts'], {
    encoding: 'utf8',
    env: { ...process.env, SHOT_DIR: process.env.SHOT_DIR ?? '' },
}).trim().split('\n').pop();

const fails = [];
const assert = (label, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const server = createServer((req, res) => {
    const f = path.join(out, req.url === '/' ? 'panels.html' : decodeURIComponent(req.url));
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.css') ? 'text/css' : 'text/html' });
    res.end(readFileSync(f));
});
await new Promise(r => server.listen(4598, r));

const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
});

for (const [width, label] of [[1100, 'desktop'], [390, 'a phone']]) {
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
    const names = await page.evaluate(() => Array.from(
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
    const cells = await page.evaluate(() => Array.from(
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
    const byLabel = new Map();
    for (const c of cells) {
        const who = c.title.split(': ')[1]?.split(',')[0] ?? c.title;
        (byLabel.get(c.label) ?? byLabel.set(c.label, new Set()).get(c.label)).add(who);
    }
    const shared = [...byLabel.entries()].filter(([, who]) => who.size > 1);
    assert('no two teams share a label', shared.length === 0,
        shared.length ? shared.map(([l, w]) => `${l} = ${[...w].join(' / ')}`).join('; ')
            : `${byLabel.size} distinct`);
    await page.close();
}

step(3, 'the three orderings a reader is relying on');
/**
 * Selected by panel rather than by document order.
 *
 * This step used to read `section:first-of-type`, and when a third panel
 * was added above the other two it went on passing — measuring the new
 * panel's numbers against the old panel's claim. A check that passes while
 * testing something other than what it says is worse than one that fails,
 * so each panel is now addressed by name.
 */
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto('http://localhost:4598/', { waitUntil: 'networkidle' });

const numbersIn = (panel, selector) => page.evaluate(([p, sel]) => Array.from(
    document.querySelectorAll(`[data-panel="${p}"] li`),
    li => {
        const el = sel ? li.querySelector(sel) : li.lastElementChild;
        const text = (el?.textContent ?? '').replace('\u2212', '-');
        return parseFloat(text.replace(/[^0-9.\-]/g, ''));
    }), [panel, selector]);

const luck = await numbersIn('earned', null);
assert('the luck list runs from flattered to robbed',
    luck.length === 12 && luck.every((v, i) => i === 0 || v <= luck[i - 1] + 1e-9),
    luck.map(v => v.toFixed(1)).join(' '));

const ranks = await numbersIn('run-home', '[data-rank]');
assert('the run home runs from hardest to easiest',
    ranks.length === 12 && ranks.every((v, i) => i === 0 || v >= ranks[i - 1]),
    ranks.join(' '));

const stakes = await numbersIn('at-stake', null);
assert('the week runs from most riding on it to least',
    stakes.length === 12 && stakes.every((v, i) => i === 0 || v <= stakes[i - 1] + 1e-9),
    stakes.map(v => String(v)).join(' '));
assert('and the three panels are three different lists',
    new Set([luck.join(), ranks.join(), stakes.join()]).size === 3);

/**
 * The dumbbell's two ends have to be countable even when they coincide.
 * A team with nothing riding on the week draws both markers in the same
 * place, and without a ring in the surface colour that reads as one
 * marker — which is the only case where the panel has something
 * surprising to say.
 */
const overlapping = await page.evaluate(() => Array.from(
    document.querySelectorAll('[data-panel="at-stake"] li'),
    li => {
        const dots = li.querySelectorAll('[data-end]');
        if (dots.length !== 2) return null;
        const [a, b] = [...dots].map(d => d.getBoundingClientRect());
        return { gap: Math.abs(a.left - b.left), ring: getComputedStyle(dots[0]).boxShadow };
    }).filter(Boolean));
assert('every row draws two ends', overlapping.length === 12,
    String(overlapping.length));
assert('and each end carries a ring, so a nil-stake week still reads as two',
    // Non-vacuous by construction: an empty list made the same assertion
    // pass while measuring nothing, which is how it read the first time.
    overlapping.length === 12 && overlapping.every(d => d.ring && d.ring !== 'none'),
    overlapping[0]?.ring?.slice(0, 44) ?? 'none');
/**
 * And the ends have to actually coincide somewhere, or the ring is
 * guarding a case this fixture never produces. The fixture puts one team
 * through and one out on purpose, so two rows should have almost nothing
 * riding on the week.
 */
const coincident = overlapping.filter(d => d.gap < 6).length;
assert('the fixture exercises the overlapping case the ring is for',
    coincident >= 1, `${coincident} rows with their ends within 6px`);
await page.close();

await browser.close();
server.close();
console.log(`\nshots in ${out}`);
console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
