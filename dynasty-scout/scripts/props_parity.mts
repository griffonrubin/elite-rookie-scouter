/**
 * The TypeScript prop loader and the Python one must agree.
 *
 * They exist because the same job has to run in two places — the daily Vercel
 * pass and the local pipeline — and two implementations of the same
 * arithmetic drift unless something compares them. This runs the identical
 * fixture from scripts/props_check.py and asserts the identical numbers.
 */
import { americanToProb, consensus, devig, parseEvent, pprFromMarkets } from '../lib/playerProps';

const FIXTURE = {
    id: 'evt1', commence_time: '2026-09-14T17:00:00Z',
    bookmakers: [
        { key: 'draftkings', markets: [
            { key: 'player_reception_yds', outcomes: [
                { name: 'Over', description: "Ja'Marr Chase", price: -114, point: 78.5 },
                { name: 'Under', description: "Ja'Marr Chase", price: -108, point: 78.5 }] },
            { key: 'player_receptions', outcomes: [
                { name: 'Over', description: "Ja'Marr Chase", price: -120, point: 6.5 },
                { name: 'Under', description: "Ja'Marr Chase", price: 100, point: 6.5 }] },
            { key: 'player_anytime_td', outcomes: [
                { name: 'Yes', description: "Ja'Marr Chase", price: 115 }] },
        ] },
        { key: 'fanduel', markets: [
            { key: 'player_reception_yds', outcomes: [
                { name: 'Over', description: "Ja'Marr Chase", price: -110, point: 80.5 },
                { name: 'Under', description: "Ja'Marr Chase", price: -110, point: 80.5 }] },
        ] },
    ],
};

const fails: string[] = [];
const r4 = (n: number | null) => n == null ? null : Math.round(n * 1e4) / 1e4;
function check(label: string, got: unknown, want: unknown) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`
        + (ok ? '' : `  (want ${JSON.stringify(want)})`));
    if (!ok) fails.push(label);
}

// Every number below is the one scripts/props_check.py asserts.
console.log('== odds arithmetic, against the Python values ==');
check('-110 favourite', r4(americanToProb(-110)), 0.5238);
check('+150 underdog', r4(americanToProb(150)), 0.4);
check('no price', americanToProb(null), null);
check('-110 / -110 devigs even', r4(devig(-110, -110)), 0.5);
check('-114 / -108 leans over', r4(devig(-114, -108)), 0.5064);
check('+115 yes-only keeps vig', r4(devig(115, null)), 0.4651);

console.log('\n== payload shape ==');
const byName = new Map([['jamarr chase', 42]]);
const rows = parseEvent(FIXTURE, byName);
check('rows parsed', rows.length, 4);
check('books seen', new Set(rows.map(r => r.book)).size, 2);
check('markets seen', new Set(rows.map(r => r.market)).size, 3);
check('yes-only has no under',
    rows.find(r => r.market === 'anytime_td')!.underPrice, null);
check('unknown player dropped', parseEvent(FIXTURE, new Map()).length, 0);

console.log('\n== conversion ==');
check('full line set',
    pprFromMarkets({ receptions: 6.5, rec_yds: 79.5, anytime_td_prob: 0.45 }), [17.15, 3]);
check('yards only is thinner', pprFromMarkets({ rec_yds: 79.5 }), [7.95, 1]);
check('nothing priced', pprFromMarkets({}), [0, 0]);

console.log('\n== consensus ==');
const p = consensus(rows).get(42)!;
check('median line across books', p.values.rec_yds, 79.5);
check('receptions carried', p.values.receptions, 6.5);
check('books counted', p.booksPriced, 2);
check('ppr points', p.pprPoints, 17.24);

console.log();
if (fails.length) { console.log(`${fails.length} FAILED: ${fails.join(', ')}`); process.exit(1); }
console.log('TypeScript agrees with Python on every fixture value');
