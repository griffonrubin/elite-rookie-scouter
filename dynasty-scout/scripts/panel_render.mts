/**
 * Render the two schedule panels against a fixture, for `panel_check.mjs`
 * to measure.
 *
 * Split from the check that drives the browser, because the two halves
 * want opposite things from the toolchain. This half imports the
 * components themselves, so it has to be TypeScript and has to be
 * typechecked. The other half needs Playwright, which is not a dependency
 * of this app and must not become one — and a `.mts` file importing it
 * fails `next build`, which is how this pair got split: the module
 * resolved from a stray local install, so the app's own build passed here
 * and failed on a clean checkout.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { writeFileSync, readdirSync, mkdirSync, mkdtempSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
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

const out = process.env.SHOT_DIR || mkdtempSync(path.join(tmpdir(), 'panels-'));
mkdirSync(path.join(out, '_css'), { recursive: true });
for (const f of readdirSync('.next/static/chunks').filter(f => f.endsWith('.css'))) {
    copyFileSync(path.join('.next/static/chunks', f), path.join(out, '_css', f));
}
writeFileSync(path.join(out, 'panels.html'), html);
// The only thing on stdout, so the driver can read the directory back.
console.log(out);
