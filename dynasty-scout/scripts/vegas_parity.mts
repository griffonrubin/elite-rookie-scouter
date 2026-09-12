/**
 * The TypeScript loader and the Python one, on the same games.
 *
 * Two implementations of one piece of arithmetic drift apart silently: a
 * sign flipped on a spread, a devig applied to one side only, and the site
 * and the scripts disagree about who is favoured with nothing to show it.
 * This runs both over the same rows and demands they match exactly.
 */
import { buildRows, moneylineProb, spreadWinProb, winProbabilities, teamSides }
    from '../lib/vegasLines';

let failed = 0;
const ok = (label: string, pass: boolean, extra = '') => {
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) failed++;
};
const near = (a: number | null, b: number, eps = 1e-9) =>
    a != null && Math.abs(a - b) < eps;

console.log('\n== the pieces ==');
// -110 is the canonical coin flip with a 4.5% hold on each side.
ok('moneyline -110 is 52.38%', near(moneylineProb(-110), 110 / 210, 1e-12),
    String(moneylineProb(-110)));
ok('moneyline +150 is 40%', near(moneylineProb(150), 100 / 250, 1e-12));
ok('moneyline 0 is null', moneylineProb(0) === null);
// A pick'em is 50%, and the sign convention: negative spread = favoured.
// The tolerance is the honest one: Math has no erf, so this uses the
// Abramowitz & Stegun series, which tracks Python's math.erf to ~1e-8 —
// eight digits more than a point spread can justify, and not to be tested
// as though it were exact.
ok('a pick-em is 50%', near(spreadWinProb(0), 0.5, 1e-8));
ok('a favourite is above 50%', (spreadWinProb(-7) ?? 0) > 0.5, String(spreadWinProb(-7)));
ok('an underdog is below 50%', (spreadWinProb(7) ?? 1) < 0.5);
// Against Python's math.erf, which the scraper uses, at every spread that
// matters. These are that loader's own numbers, printed to twelve places.
const PY_SPREAD: [number, number][] = [
    [0, 0.500000000000], [-3.5, 0.602282394331], [-7, 0.697951728521],
    [7, 0.302048271479], [-10, 0.770574674035],
];
for (const [spread, want] of PY_SPREAD) {
    ok(`spread ${spread} matches the scraper`, near(spreadWinProb(spread), want, 1e-7),
        `${spreadWinProb(spread)} vs ${want}`);
}

console.log('\n== devig ==');
// Both sides priced: the hold comes out and the pair sums to exactly 1.
const [h, a] = winProbabilities(-200, 170, -3.5);
ok('both moneylines sum to 1', near(h! + a!, 1, 1e-4), `${h} + ${a}`);
ok('the favourite is the bigger half', h! > a!);
// One side missing falls back to the spread model, not to a raw implied.
const [h2, a2] = winProbabilities(-200, null, -3.5);
ok('one moneyline falls back to the spread', near(h2!, spreadWinProb(-3.5)!, 1e-4),
    `${h2} vs ${spreadWinProb(-3.5)}`);
ok('the fallback pair still sums to 1', near(h2! + a2!, 1, 1e-4));

console.log('\n== one game, both sides ==');
const game = {
    season: '2026', week: '1', game_type: 'REG', game_id: '2026_01_NO_DET',
    gameday: '2026-09-13', home_team: 'DET', away_team: 'NO',
    total_line: '49.5', spread_line: '7', home_moneyline: '-320',
    away_moneyline: '260',
};
const [home, away] = teamSides(game);
ok('the home team is DET', home.team === 'DET' && home.isHome === 1);
// nfldata says "home favoured by 7"; a betting line says -7.
ok('the home spread is negative when favoured', home.spread === -7, String(home.spread));
ok('the away spread is the mirror', away.spread === 7);
// 49.5/2 = 24.75, shifted by half the spread.
ok('implied totals split the game total', home.impliedTeamTotal === 28.25
    && away.impliedTeamTotal === 21.25,
    `${home.impliedTeamTotal} / ${away.impliedTeamTotal}`);
ok('the totals add back to the line',
    home.impliedTeamTotal! + away.impliedTeamTotal! === 49.5);
ok('each side sees the other as the opponent total',
    home.impliedOppTotal === away.impliedTeamTotal);
ok('win probs sum to 1', near(home.winProb! + away.winProb!, 1, 1e-4));

console.log('\n== what gets kept ==');
const rows = buildRows(2026, [
    game,
    { ...game, game_id: 'x1', game_type: 'POST' },
    { ...game, game_id: 'x2', season: '2025' },
    { ...game, game_id: '', home_team: 'DET' },
    { ...game, game_id: 'x4', home_team: '', away_team: 'NO' },
    // Unpriced, but scheduled: the row is what tells the cron the week.
    { ...game, game_id: 'x5', total_line: '', spread_line: '',
      home_moneyline: '', away_moneyline: '' },
]);
ok('the playoff game is dropped', !rows.some(r => r.gameId === 'x1'));
ok('another season is dropped', !rows.some(r => r.gameId === 'x2'));
ok('a game with no id is dropped', !rows.some(r => r.gameId === ''));
ok('a game with no team is dropped', !rows.some(r => r.gameId === 'x4'));
ok('an unpriced game is kept', rows.some(r => r.gameId === 'x5'), `${rows.length} rows`);
const unpriced = rows.find(r => r.gameId === 'x5')!;
ok('unpriced means null, not zero', unpriced.impliedTeamTotal === null
    && unpriced.spread === null, JSON.stringify(unpriced.impliedTeamTotal));
ok('two rows per kept game', rows.length === 4, String(rows.length));

// LA is the Rams everywhere but nflverse — the alias bug that once lost 863
// rows of matchup data.
const la = teamSides({ ...game, home_team: 'LA' });
ok('LA canonicalises to LAR', la[0].team === 'LAR', la[0].team);

console.log(failed ? `\n${failed} FAILED` : '\nall vegas parity checks passed');
process.exit(failed ? 1 : 0);
