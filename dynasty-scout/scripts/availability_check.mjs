/**
 * Whether a profile says he is there, and whether the two directions agree.
 *
 * A profile page can print three seasons of production in full and never say
 * that one of them was ten games rather than seventeen — which is what this
 * one did. Availability is the largest single input to a season and the one
 * every projection assumes away by pricing a full year.
 *
 * The claim worth automating is the round trip. Bucky Irving's page says who
 * took his work; Sean Tucker's page says whose work he took. They are the
 * same measurement read from two ends and they must produce the same
 * numbers, because a reader following the link between them will notice if
 * they do not — and nothing but a check that reads both pages can tell.
 *
 * Plus the coherence bug this shipped with: the percentile ranks on a rate
 * and the comparison beside it was a raw count, so Irving read as "missed
 * seven, median five, above average" and looked broken while being right.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:3090';
const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1200 } });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));

const fails = [];
const assert = (l, pass, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${l}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(l);
};
const step = (n, s) => console.log(`\n── ${n}. ${s}`);

const section = () => page.locator('section#availability');
async function open(slug) {
    await page.goto(`${BASE}/redraft/players/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    return (await section().count()) ? (await section().innerText()).replace(/\s+/g, ' ') : '';
}

step(1, 'a man who missed games says so');
const irving = await open('bucky-irving');
assert('the section is on the page', irving.length > 0);
assert('and leads with the count', /Missed 7 of 34/.test(irving),
    (irving.match(/(Missed|Played)[^.]{0,24}/) ?? [''])[0]);
assert('his successor is named with a sample',
    /Sean Tucker .*9\.8 a game over 7/.test(irving),
    (irving.match(/Sean Tucker[^.]{0,90}/) ?? ['not named'])[0]);

step(2, 'the comparison is the same quantity the percentile ranks on');
/**
 * Both rates, or the page contradicts itself in front of the reader: seven
 * missed against a median of five reads as worse than average, and the bar
 * beside it says fifty-first percentile.
 */
const rates = irving.match(/missed (\d+)% of his team.s games; the middle man at his position missed (\d+)%/);
assert('his rate and the median are both rates', !!rates,
    rates ? `${rates[1]}% vs ${rates[2]}%` : (irving.match(/middle man[^.]{0,60}/) ?? [''])[0]);
const pct = irving.match(/more available than (\d+)% of (\d+) others/);
assert('and the percentile is against named peers', !!pct,
    pct ? `${pct[1]}th of ${pct[2]}` : 'no percentile');
if (rates && pct) {
    const mine = Number(rates[1]), mid = Number(rates[2]), p = Number(pct[1]);
    // Worse than the median rate must not read as better than half the field.
    assert('the two agree about which side of the middle he is on',
        (mine <= mid) === (p >= 50), `rate ${mine}% vs median ${mid}%, percentile ${p}`);
}

step(3, 'and the same measurement read from the other end matches');
const tucker = await open('sean-tucker');
assert('the backup page names whose job it is',
    /Bucky Irving/.test(tucker), (tucker.match(/Bucky Irving[^.]{0,80}/) ?? ['not named'])[0]);
const a = irving.match(/9\.8 a game over 7/);
const c = tucker.match(/(\d+\.\d) a game over (\d+)/);
assert('with the same production and the same sample',
    !!a && !!c && c[1] === '9.8' && c[2] === '7',
    c ? `${c[1]} over ${c[2]}` : 'nothing to compare');
const shareA = irving.match(/on (\d+)% of/);
const shareB = tucker.match(/on (\d+)% of/);
assert('and the same share of the work',
    !!shareA && !!shareB && shareA[1] === shareB[1],
    `${shareA?.[1]}% vs ${shareB?.[1]}%`);

step(4, 'a man who has missed nothing is told apart from one with no data');
const flowers = await open('zay-flowers');
assert('perfect attendance reads as a finding, not a blank',
    /Played all \d+/.test(flowers), (flowers.match(/(Played|Missed)[^.]{0,24}/) ?? [''])[0]);
assert('and carries no successor list, because there is nothing to measure',
    !/Who took the work/.test(flowers),
    /Who took the work/.test(flowers) ? 'successors listed anyway' : 'clean');

step(5, 'nothing blew up');
assert('no page errors', errs.length === 0, errs[0] ?? '');
const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert('no overflow', over <= 1, `${over}px`);

await page.setViewportSize({ width: 390, height: 900 });
await open('bucky-irving');
const overPhone = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert('and none at 390px', overPhone <= 1, `${overPhone}px`);
await section().screenshot({ path: '/tmp/availability-phone.png' });
await page.setViewportSize({ width: 1400, height: 1200 });
await open('bucky-irving');
await section().screenshot({ path: '/tmp/availability.png' });

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
await b.close();
process.exit(fails.length ? 1 : 0);
