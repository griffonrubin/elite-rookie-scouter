/**
 * Half PPR is a different game, and the app used to play only one of them.
 *
 * Every projection stored here and every weekly total is full PPR —
 * `fantasy_points_ppr` in the logs, PPR projections from the sources — and
 * the app never asked what a league scores. Roughly half of leagues are not
 * full PPR, and for all of them every number on every page was wrong in the
 * same direction: everyone who catches passes overstated against everyone
 * who runs, by exactly the catches they make.
 *
 * The size of it decides whether this matters. A receiver catching six a
 * game sits three points a week clear of where his own half-PPR league has
 * him, which is larger than most of the gaps these pages exist to arbitrate
 * — so a start/sit call between a six-catch receiver and a runner was being
 * settled by the scoring settings of a league the reader is not in.
 *
 * Checked on the properties that have to hold: the correction is exact
 * rather than modelled, it moves catchers and leaves runners alone, it
 * changes the order of a real decision, and full PPR is untouched.
 */
import { query } from '../lib/db';
import { PPR, isPpr, rescore, scoringFrom, scoringLabel, type Scoring } from '../lib/scoring';
import { receptionPointsFrom, rosterPositionsFrom } from '../app/api/espn/league/route';
import { eligibleForSlot } from '../lib/lineup';
import { startersByPosition } from '../lib/waiverRank';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const HALF: Scoring = { reception: 0.5, teReceptionBonus: 0 };
const STANDARD: Scoring = { reception: 0, teReceptionBonus: 0 };
const TE_PREMIUM: Scoring = { reception: 1, teReceptionBonus: 0.5 };

step(1, 'the arithmetic, which is a subtraction rather than a model');
assert('a catch is worth half a point less in half PPR',
    rescore(20, 6, 'WR', HALF) === 17, `${rescore(20, 6, 'WR', HALF)}`);
assert('and a whole point less in standard',
    rescore(20, 6, 'WR', STANDARD) === 14, `${rescore(20, 6, 'WR', STANDARD)}`);
assert('a tight end premium pays extra, and only to tight ends',
    rescore(10, 4, 'TE', TE_PREMIUM) === 12 && rescore(10, 4, 'WR', TE_PREMIUM) === 10,
    `TE ${rescore(10, 4, 'TE', TE_PREMIUM)}, WR ${rescore(10, 4, 'WR', TE_PREMIUM)}`);
assert('a runner with no catches is untouched by any of it',
    rescore(18, 0, 'RB', STANDARD) === 18, `${rescore(18, 0, 'RB', STANDARD)}`);
/**
 * Unknown catches are left alone rather than guessed. A row without its
 * receptions is a row this cannot correct, and a guessed catch rate would be
 * a worse number wearing the same confidence.
 */
assert('and so is a row whose catches are missing',
    rescore(18, null, 'WR', STANDARD) === 18, `${rescore(18, null, 'WR', STANDARD)}`);

step(2, 'full PPR is the identity, so nobody in one sees a change');
assert('it is recognised as the scoring everything already assumes', isPpr(PPR));
assert('and leaves a total exactly alone', rescore(23.7, 9, 'WR', PPR) === 23.7);
console.log(`        labels: ${[PPR, HALF, STANDARD, TE_PREMIUM].map(scoringLabel).join(' · ')}`);

step(3, 'reading a platform, where silence is not zero');
/**
 * The conservative half. A missing `rec` could be a standard league or a
 * payload that does not carry the field, and reading it as zero would take a
 * point off every catch for a full-PPR league whose settings did not come
 * through — a new fault, against merely failing to fix an old one.
 */
assert('an explicit value is used', scoringFrom({ rec: 0.5 }).reception === 0.5);
assert('an explicit zero is a standard league', scoringFrom({ rec: 0 }).reception === 0);
assert('a missing key leaves the old behaviour alone',
    isPpr(scoringFrom({ pass_td: 4 })), `${scoringFrom({ pass_td: 4 }).reception}`);
assert('and so does no settings at all', isPpr(scoringFrom(null)));

step(4, 'against real players, it moves the men it should');
const logs = await query<{
    full_name: string; position: string; points: number; receptions: number | null;
}>(`SELECT p.full_name, w.position,
           AVG(w.fantasy_points_ppr) AS points, AVG(w.receptions) AS receptions
      FROM nfl_player_week w JOIN players p ON p.id = w.player_id
     WHERE w.season = 2025 AND w.season_type = 'REG'
       AND w.position IN ('RB','WR','TE')
     GROUP BY p.id, w.position
    HAVING COUNT(*) >= 12 AND AVG(w.fantasy_points_ppr) > 8
     ORDER BY points DESC LIMIT 60`, []);
assert('there are enough real seasons to look at', logs.length >= 30, `${logs.length}`);

const moved = logs.map(l => ({
    ...l,
    half: rescore(Number(l.points), Number(l.receptions), l.position, HALF),
}));
const biggest = [...moved].sort((a, b) =>
    (Number(a.points) - a.half) - (Number(b.points) - b.half)).slice(-3).reverse();
const smallest = [...moved].sort((a, b) =>
    (Number(a.points) - a.half) - (Number(b.points) - b.half)).slice(0, 3);
for (const m of [...biggest, ...smallest]) {
    console.log(`        ${m.full_name.padEnd(20)} ${m.position}  `
        + `${Number(m.points).toFixed(1)} → ${m.half.toFixed(1)}  `
        + `(${(m.half - Number(m.points)).toFixed(1)}, ${Number(m.receptions).toFixed(1)} catches)`);
}
assert('every change is downwards or nothing',
    moved.every(m => m.half <= Number(m.points) + 1e-9), 'none went up');
assert('and the biggest loser is a bigger receiver than the smallest',
    Number(biggest[0].receptions) > Number(smallest[0].receptions),
    `${Number(biggest[0].receptions).toFixed(1)} against ${Number(smallest[0].receptions).toFixed(1)}`);

step(5, 'and it changes a decision, not just a number');
/**
 * The point of the whole exercise: a pair who are ordered one way in PPR and
 * the other way in half PPR. If no such pair exists the correction is
 * cosmetic and this file should not.
 */
let flips = 0;
let example = '';
for (let i = 0; i < moved.length; i++) {
    for (let j = i + 1; j < moved.length; j++) {
        const a = moved[i], b = moved[j];
        const pprOrder = Number(a.points) - Number(b.points);
        const halfOrder = a.half - b.half;
        if (pprOrder > 0 !== halfOrder > 0) {
            flips++;
            if (!example) {
                example = `${a.full_name} (${a.position}) and ${b.full_name} (${b.position}): `
                    + `${Number(a.points).toFixed(1)} v ${Number(b.points).toFixed(1)} in PPR, `
                    + `${a.half.toFixed(1)} v ${b.half.toFixed(1)} in half`;
            }
        }
    }
}
console.log(`        ${flips} pairs out of ${moved.length * (moved.length - 1) / 2} swap order`);
console.log(`        e.g. ${example}`);
assert('real pairs change places', flips > 0, `${flips}`);

step(6, 'and ESPN leagues get the same two answers Sleeper ones do');
/**
 * Both corrections landed on the Sleeper path first and stopped there, which
 * is the quiet way a fix reaches half its users: absent reads exactly like
 * standard, so an ESPN superflex league kept a one-quarterback replacement
 * level and an ESPN half-PPR league kept full-PPR totals, and nothing said
 * so on either page.
 *
 * ESPN speaks in slot ids and stat ids rather than names, so the translation
 * is the thing that can be wrong. It is checked here rather than against the
 * live API, which is not reachable from where this was written — so what is
 * asserted is that the mapping does what it claims, not that ESPN sends
 * exactly this. The shapes come from ESPN's documented ids: slot 0 is a
 * quarterback, 7 is the superflex "OP", 23 is the flex, 20 and 21 are the
 * bench and injured reserve, and stat 53 is a reception.
 */
const espnStandard = rosterPositionsFrom({ '0': 1, '2': 2, '4': 2, '6': 1, '23': 1,
    '16': 1, '17': 1, '20': 7, '21': 1 });
const espnSuperflex = rosterPositionsFrom({ '0': 1, '2': 2, '4': 3, '6': 1, '7': 1,
    '23': 1, '20': 6 });
console.log(`        standard  → ${espnStandard?.join(' ')}`);
console.log(`        superflex → ${espnSuperflex?.join(' ')}`);
assert('the bench and injured reserve are not starting slots',
    !!espnStandard && !espnStandard.some(x => x === 'BN' || x === 'IR')
    && espnStandard.length === 9,
    `${espnStandard?.length} slots`);
assert('and the superflex slot is named as one',
    !!espnSuperflex && espnSuperflex.includes('SUPER_FLEX'),
    espnSuperflex?.join(' ') ?? 'none');

/** The end of the chain: the same slots must move replacement level. */
const poolForShape = await query<{ position: string | null; proj_points: number | null }>(
    `SELECT p.position,
            (SELECT AVG(pr.proj_points) FROM projections pr
              WHERE pr.player_id = p.id AND pr.season = 2026
                AND pr.scraped_at = (SELECT MAX(scraped_at) FROM projections
                                      WHERE player_id = p.id AND season = 2026
                                        AND source = pr.source)) AS proj_points
       FROM players p
      WHERE p.redraft_pool = 1 AND p.position IN ('QB','RB','WR','TE','K','DST')`, []);
const qbStd = startersByPosition(espnStandard ?? [], 12, poolForShape, eligibleForSlot).QB;
const qbSf = startersByPosition(espnSuperflex ?? [], 12, poolForShape, eligibleForSlot).QB;
console.log(`        quarterbacks started: ${qbStd} standard, ${qbSf} superflex`);
assert('an ESPN superflex league starts far more quarterbacks', qbSf > qbStd + 6,
    `${qbSf} against ${qbStd}`);

assert('a reception is read off the scoring items',
    receptionPointsFrom([{ statId: 42, points: 0.1 }, { statId: 53, points: 0.5 }]) === 0.5,
    `${receptionPointsFrom([{ statId: 53, points: 0.5 }])}`);
assert('an explicit nought is a standard league, not a silence',
    receptionPointsFrom([{ statId: 53, points: 0 }]) === 0,
    `${receptionPointsFrom([{ statId: 53, points: 0 }])}`);
assert('and a missing item changes nothing',
    receptionPointsFrom([{ statId: 42, points: 0.1 }]) === null
    && receptionPointsFrom(null) === null,
    'null both ways');

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
