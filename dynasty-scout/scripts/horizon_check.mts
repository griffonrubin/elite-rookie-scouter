/**
 * The difference between a matchup preview and a power ranking.
 *
 * Both pages ranked rosters on this Sunday's inputs — the opponent's
 * defence, the books' total for each offence, the spread, byes, the injury
 * report — and called the result a statement about a team. It is not one. A
 * roster with three starters on a bye drops four places and recovers them
 * next week without a single transaction, which is a fact about the calendar
 * wearing a power ranking's title.
 *
 * So the pages rank on a horizon now, and this measures that the horizon
 * does what it claims:
 *
 *   a bye is worth nothing over a season and everything this week;
 *   a soft matchup does not make a roster good;
 *   the two orderings really do disagree, or the setting is decoration;
 *   and a projected record is the win rate said out loud rather than a
 *   second, quietly different number.
 */
import { buildOutcome, type SimPlayer } from '../lib/startSit';
import { powerRank, seasonOutlook, type PowerTeam } from '../lib/power';
import { simInputFor, simPlayerFrom } from '../lib/simInput';
import type { StartSitPlayer } from '../app/api/redraft/startsit/route';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SEASON = 2026;
/** A believable log: the same shape at whatever level a player is set to. */
const shape = [0.4, 1.5, 0.7, 1.2, 0.2, 1.8, 0.9, 1.1, 0.6, 1.4,
    0.8, 1.0, 0.3, 1.6, 0.95, 1.25, 0.55];
const logs = (mean: number) => shape.map((f, i) => ({
    season: SEASON - 1, week: i + 1, points: mean * f,
    opponent: 'OPP', started: true,
}));

let nextId = 1;
function row(mean: number, over: Partial<StartSitPlayer> = {}) {
    const id = nextId++;
    const data = {
        id, full_name: `player ${id}`, position: over.position ?? 'RB',
        proj_points: mean * 17, logs: logs(mean),
        implied_team_total: null, spread: null,
        def_allowed: null, def_league_avg: null, def_sample: null,
        report_status: null, practice_status: null, on_bye: false,
        market_points: null, market_markets: null,
        ...over,
    } as unknown as StartSitPlayer;
    return { id, position: (over.position ?? 'RB') as string, data };
}

const simOf = (p: { id: number; position: string; data: StartSitPlayer },
    horizon: 'week' | 'season'): SimPlayer =>
    simPlayerFrom(simInputFor({ id: p.id, position: p.position }, p.data, SEASON, horizon));

step(1, 'a bye is the whole week and none of the season');
const bye = row(14, { on_bye: true });
console.log(`      this week ${simOf(bye, 'week').outcome.mean}, `
    + `rest of season ${simOf(bye, 'season').outcome.mean}`);
assert('on a bye he scores nothing this week', simOf(bye, 'week').outcome.mean === 0,
    String(simOf(bye, 'week').outcome.mean));
assert('and his own level over the season', simOf(bye, 'season').outcome.mean > 10,
    String(simOf(bye, 'season').outcome.mean));

step(2, 'and neither is a soft matchup');
// A fat team total, a long spread and a defence giving up half again as
// much as the league: everything the weekly model leans on, at once.
const spot = row(14, {
    implied_team_total: 31, spread: -10,
    def_allowed: 24, def_league_avg: 16, def_sample: 8,
} as Partial<StartSitPlayer>);
const wk = simOf(spot, 'week').outcome.mean;
const sn = simOf(spot, 'season').outcome.mean;
console.log(`      this week ${wk}, rest of season ${sn}`);
assert('the week is lifted by the spot', wk > sn, `${wk} vs ${sn}`);
assert('by a margin worth a lineup decision', wk - sn > 1.5, (wk - sn).toFixed(1));
assert('and the season is his own level, unmoved',
    Math.abs(sn - simOf(row(14), 'season').outcome.mean) < 0.3,
    `${sn} vs ${simOf(row(14), 'season').outcome.mean}`);

step(3, 'so the two orderings disagree, which is the point of having both');
/**
 * Two rosters of equal strength, one of them on a bye.
 *
 * If the horizon were decoration the table would rank them the same way
 * twice. The whole reason the setting exists is that it does not.
 */
const SLOTS = 9;
const even = (n: number) => Array.from({ length: SLOTS }, (_, i) => row(14 - i * 0.4));
const rested = even(0);
const onBye = even(1).map((p, i) => (i < 3
    ? row(14 - i * 0.4, { on_bye: true })
    : p));
const teamsFor = (horizon: 'week' | 'season'): PowerTeam[] => [
    { key: 'rested', name: 'rested', lineup: rested.map(p => simOf(p, horizon)) },
    { key: 'bye', name: 'three on a bye', lineup: onBye.map(p => simOf(p, horizon)) },
    ...Array.from({ length: 4 }, (_, k) => ({
        key: `f${k}`, name: `filler ${k}`,
        lineup: even(0).map(p => simOf(p, horizon)),
    })),
];
const weekRows = powerRank(teamsFor('week'), 20000).rows;
const seasonRows = powerRank(teamsFor('season'), 20000).rows;
const rate = (rs: typeof weekRows, key: string) => rs.find(r => r.key === key)!.winRate;
console.log(`      three on a bye: ${(rate(weekRows, 'bye') * 100).toFixed(1)}% this week, `
    + `${(rate(seasonRows, 'bye') * 100).toFixed(1)}% rest of season`);
console.log(`      the rested roster: ${(rate(weekRows, 'rested') * 100).toFixed(1)}% / `
    + `${(rate(seasonRows, 'rested') * 100).toFixed(1)}%`);
assert('this week the bye roster is buried',
    rate(weekRows, 'bye') < 0.2, (rate(weekRows, 'bye') * 100).toFixed(1) + '%');
assert('over the season it is level with the one it matches',
    Math.abs(rate(seasonRows, 'bye') - rate(seasonRows, 'rested')) < 0.03,
    `${(rate(seasonRows, 'bye') * 100).toFixed(1)}% vs `
    + `${(rate(seasonRows, 'rested') * 100).toFixed(1)}%`);
assert('so the orderings genuinely differ',
    weekRows.find(r => r.key === 'bye')!.rank
        !== seasonRows.find(r => r.key === 'bye')!.rank,
    `${weekRows.find(r => r.key === 'bye')!.rank} this week vs `
    + `${seasonRows.find(r => r.key === 'bye')!.rank} over the season`);

step(4, 'a projected record is the rate said out loud');
const o = seasonOutlook(0.54, 14, { wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0 });
console.log(`      54% over 14 weeks: ${o.projectedWins}-${o.projectedLosses}, `
    + `${o.low} to ${o.high} wins in eighty per cent of seasons`);
assert('the wins are the rate times the weeks', Math.abs(o.winsToCome - 7.56) < 0.05,
    String(o.winsToCome));
assert('and the record adds up to the games', o.projectedWins + o.projectedLosses === 14,
    `${o.projectedWins}-${o.projectedLosses}`);
assert('the band is wide enough to be honest', o.high - o.low >= 4,
    `${o.low} to ${o.high}`);
assert('and narrow enough to mean something', o.high - o.low <= 8,
    `${o.low} to ${o.high}`);
// Mid-season, with games already banked.
const mid = seasonOutlook(0.60, 6, { wins: 5, losses: 3, ties: 0,
    pointsFor: 900, pointsAgainst: 850 });
console.log(`      5-3 at 60% with 6 to play: ${mid.projectedWins}-${mid.projectedLosses}`);
assert('banked wins are carried, not re-simulated', mid.projectedWins >= 8,
    `${mid.projectedWins}-${mid.projectedLosses}`);
assert('and the band never goes below what is already won', mid.low >= 5,
    String(mid.low));
assert('nor above what is still winnable', mid.high <= 11, String(mid.high));
// A finished season is not a projection.
const done = seasonOutlook(0.5, 0, { wins: 9, losses: 5, ties: 0,
    pointsFor: 0, pointsAgainst: 0 });
assert('no weeks left, nothing to project', done.projectedWins === 9
    && done.low === 9 && done.high === 9, `${done.low}-${done.high}`);

step(5, 'an injury report is a week, not a season');
const hurt = row(14, { report_status: 'Questionable', practice_status: 'Limited' });
const wp = simOf(hurt, 'week').outcome.playProbability;
const sp = simOf(hurt, 'season').outcome.playProbability;
console.log(`      plays this week ${(wp * 100).toFixed(0)}%, `
    + `a typical week from here ${(sp * 100).toFixed(0)}%`);
assert('a questionable tag costs him this week', wp < 1, wp.toFixed(2));
assert('and not every week between now and January', sp === 1, sp.toFixed(2));

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
