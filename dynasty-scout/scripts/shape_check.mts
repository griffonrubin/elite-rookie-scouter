/**
 * Replacement level is a fact about your league, not about football.
 *
 * The waiver wire measures every free agent against "the last player at that
 * position anybody starts", which is the right line and was drawn in the
 * wrong place: at a twelve-team, one-quarterback league, for everybody.
 *
 * That is not a small error for the leagues it is wrong about. A superflex
 * league starts roughly two quarterbacks a team, so its replacement
 * quarterback is around the twenty-fourth rather than the twelfth — and
 * against the twelfth, every claimable quarterback reads as far below a
 * startable one. Streaming quarterbacks is half of what a superflex waiver
 * wire is for, and the page was telling those managers the opposite.
 *
 * So the counts are worked out from the slots a league actually fields.
 * Checked on the property that matters: the same pool, the same free agents,
 * two league shapes, and an answer that moves in the direction the shape
 * implies — and by enough to change what a reader would do.
 */
import { query } from '../lib/db';
import { eligibleForSlot } from '../lib/lineup';
import {
    STARTED, overReplacement, replacementBaseline, startersByPosition,
} from '../lib/waiverRank';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SEASON = 2026;
const pool = await query<{ id: number; position: string | null; proj_points: number | null }>(
    `SELECT p.id, p.position,
            (SELECT AVG(pr.proj_points) FROM projections pr
              WHERE pr.player_id = p.id AND pr.season = ${SEASON}
                AND pr.scraped_at = (SELECT MAX(scraped_at) FROM projections
                                      WHERE player_id = p.id AND season = ${SEASON}
                                        AND source = pr.source)) AS proj_points
       FROM players p
      WHERE p.redraft_pool = 1 AND p.position IN ('QB','RB','WR','TE','K','DST')`, []);

const STANDARD = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const SUPERFLEX = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'SUPER_FLEX', 'FLEX'];

step(1, 'a standard twelve-team league lands where the constants always did');
const std = startersByPosition(STANDARD, 12, pool, eligibleForSlot);
console.log('        ' + Object.entries(std).map(([p, n]) => `${p} ${n}`).join('  '));
assert('one quarterback a team', std.QB === 12, `${std.QB}`);
/**
 * The hand-written constants were RB 30 and WR 36 — two backs and a share of
 * the flex, three receivers. Derived they need not match to the player, but
 * they have to land in the same neighbourhood or one of the two is wrong.
 */
assert('backs and receivers run past their own slots',
    std.RB > 24 && std.WR > 24,
    `RB ${std.RB} (was ${STARTED.RB}), WR ${std.WR} (was ${STARTED.WR})`);
assert('and the flex is spent, not double-counted',
    std.RB + std.WR + std.TE === 12 * 6,
    `${std.RB} + ${std.WR} + ${std.TE} = ${std.RB + std.WR + std.TE}, slots ${12 * 6}`);

step(2, 'and a superflex league does not');
const sf = startersByPosition(SUPERFLEX, 12, pool, eligibleForSlot);
console.log('        ' + Object.entries(sf).map(([p, n]) => `${p} ${n}`).join('  '));
assert('it starts far more quarterbacks', sf.QB > std.QB + 6,
    `${sf.QB} against ${std.QB}`);
assert('which is where a superflex league actually sits',
    sf.QB >= 18 && sf.QB <= 24, `${sf.QB} of a possible 24`);

step(3, 'the line moves, and it moves the right way');
const base = replacementBaseline(pool, std);
const baseSf = replacementBaseline(pool, sf);
const qbStd = base.get('QB') ?? 0;
const qbSf = baseSf.get('QB') ?? 0;
console.log(`        replacement QB: ${qbStd.toFixed(0)} standard, `
    + `${qbSf.toFixed(0)} superflex`);
assert('a deeper league has a lower bar', qbSf < qbStd,
    `${qbSf.toFixed(0)} below ${qbStd.toFixed(0)}`);

step(4, 'and it changes what a reader is told about a real quarterback');
/**
 * The point of the whole exercise. A middling free-agent quarterback is
 * "miles below a startable one" in a one-quarterback league and a genuine
 * starter in a superflex — the same player, the same projection, two
 * different right answers.
 */
const qbs = pool.filter(p => (p.position ?? '') === 'QB' && p.proj_points != null)
    .sort((a, b) => Number(b.proj_points) - Number(a.proj_points));
const target = qbs[Math.min(17, qbs.length - 1)];   // around QB18
assert('there are enough priced quarterbacks to ask', qbs.length > 24,
    `${qbs.length} priced`);
if (target) {
    const vStd = overReplacement(target, base);
    const vSf = overReplacement(target, baseSf);
    console.log(`        QB${qbs.indexOf(target) + 1}: `
        + `${(vStd / 17).toFixed(1)} a week against a standard league, `
        + `${(vSf / 17).toFixed(1)} against a superflex one`);
    assert('he is below replacement in one and above it in the other',
        vStd < 0 && vSf > 0, `${vStd.toFixed(0)} then ${vSf.toFixed(0)}`);
}

step(5, 'a league we were told nothing about keeps the old answer');
const blank = startersByPosition([], 12, pool, eligibleForSlot);
assert('no slots falls back to the constants',
    blank.QB === STARTED.QB && blank.RB === STARTED.RB,
    `QB ${blank.QB}, RB ${blank.RB}`);
const noTeams = startersByPosition(STANDARD, 0, pool, eligibleForSlot);
assert('and so does no team count', noTeams.QB === STARTED.QB, `${noTeams.QB}`);

step(6, 'a league deeper than the pool is not given a baseline off the end');
/** Thirty-two teams starting two quarterbacks wants sixty-four of them. */
const huge = startersByPosition(['QB', 'SUPER_FLEX'], 32, pool, eligibleForSlot);
const priced = pool.filter(p => (p.position ?? '') === 'QB' && p.proj_points != null).length;
assert('the count stops at the last priced player', huge.QB <= priced,
    `${huge.QB} wanted, ${priced} priced`);
const hugeBase = replacementBaseline(pool, huge);
assert('and the baseline is still a real number',
    Number.isFinite(hugeBase.get('QB') ?? NaN), `${hugeBase.get('QB')}`);

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
