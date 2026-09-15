/**
 * A record, the schedule that produced it, and the two ways of getting this
 * wrong that would not show up on a page.
 *
 * The all-play record is the sort of arithmetic that looks right whichever
 * way round it is: a number near .500 with a plausible spread. So the
 * fixtures here are built so that the right answer and the wrong one are far
 * apart — a team that scores second in the league every single week and
 * loses every single week has an all-play rate near .900 and a record of
 * nothing, and any implementation that quietly uses its own result instead
 * of the league's will read .500 and be caught.
 *
 * The other failure is the one that matters more, because it degrades
 * instead of erroring: a fixture list a platform only half delivered. Three
 * weeks of a six-week run home, simulated, gives a playoff number that is
 * specific, confident and half a season. The guard is asserted in the
 * failing direction against every shape of incomplete schedule I could
 * think of, because it is the only thing standing between a partial fetch
 * and a wrong number nobody can see is wrong.
 */
import {
    scheduleUsable, pairingTable, scheduleStrength, allPlay, type LeagueGame,
} from '../lib/leagueSchedule';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

/** A complete round robin over `n` teams for `weeks` weeks, circle method. */
function roundRobin(keys: string[], weeks: number, from = 1): LeagueGame[] {
    const n = keys.length;
    const ring = keys.slice();
    if (n % 2 === 1) ring.push('__bye');
    const m = ring.length;
    const out: LeagueGame[] = [];
    for (let w = 0; w < weeks; w++) {
        for (let i = 0; i < m / 2; i++) {
            const a = ring[i], b = ring[m - 1 - i];
            if (a !== '__bye' && b !== '__bye') out.push({ week: from + w, home: a, away: b });
        }
        ring.splice(1, 0, ring.pop()!);   // rotate, first team fixed
    }
    return out;
}

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

step(1, 'a complete fixture list is usable, and a partial one is not');
const full = roundRobin(KEYS, 5);
assert('the round robin passes', scheduleUsable(full, KEYS, 1, 5),
    `${full.length} games over 5 weeks`);

const missingWeek = full.filter(g => g.week !== 3);
assert('a missing week is refused', !scheduleUsable(missingWeek, KEYS, 1, 5));

const halfWeek = full.filter(g => !(g.week === 3 && g.home === 'a'));
assert('a week one game short is refused', !scheduleUsable(halfWeek, KEYS, 1, 5));

const doubled = full.concat([{ week: 2, home: 'a', away: 'b' }]);
assert('a team playing twice in a week is refused', !scheduleUsable(doubled, KEYS, 1, 5));

assert('a range beyond the fixtures is refused', !scheduleUsable(full, KEYS, 1, 6));
assert('and the weeks inside it still pass', scheduleUsable(full, KEYS, 2, 4));

step(2, 'an odd league, where somebody sits out every week');
const odd = ['a', 'b', 'c', 'd', 'e'];
const oddGames = roundRobin(odd, 5);
assert('one team idle per week is allowed for', scheduleUsable(oddGames, odd, 1, 5),
    `${oddGames.length} games, 2 per week`);

step(3, 'the pairing table agrees with itself');
const table = pairingTable(full, KEYS, 1, 5);
let symmetric = true, paired = 0;
for (let w = 0; w < 5; w++) {
    for (let i = 0; i < KEYS.length; i++) {
        const j = table[w * KEYS.length + i];
        if (j < 0) continue;
        paired++;
        if (table[w * KEYS.length + j] !== i) symmetric = false;
    }
}
assert('every opponent has you as their opponent', symmetric);
assert('and everybody is paired every week', paired === KEYS.length * 5, `${paired} slots`);

step(4, 'a team that scores second every week and loses every week');
/**
 * `b` scores 140 every week — second in the league, behind `a` on 200 and
 * ahead of everybody else on 100 to 130 — and is scheduled against `a` every
 * single week. So its scores beat four of the other five teams and its
 * record is nothing at all: the largest gap between deserved and banked a
 * league can produce.
 */
const cruel: LeagueGame[] = [];
for (let w = 1; w <= 8; w++) {
    cruel.push({ week: w, home: 'a', away: 'b', homePoints: 200, awayPoints: 140 });
    cruel.push({ week: w, home: 'c', away: 'd', homePoints: 130, awayPoints: 120 });
    cruel.push({ week: w, home: 'e', away: 'f', homePoints: 110, awayPoints: 100 });
}
const ap = allPlay(cruel, KEYS);
const b = ap.get('b')!;
assert('its all-play rate is near the top of the league', b.rate > 0.75,
    `${(b.rate * 100).toFixed(0)}% over ${b.allPlayGames} all-play games`);
assert('and its actual record is nothing', b.actualWins === 0);
assert('so the gap is large and negative', b.luck < -5,
    `${b.luck.toFixed(1)} wins below what it scored`);
assert('and it clears the noise band', b.notable, `sd ${b.sd.toFixed(2)}`);
const a = ap.get('a')!;
assert('the team it kept beating is not flattered', Math.abs(a.luck) < 0.5,
    `${a.luck.toFixed(1)} — it outscored everybody and won everything`);

step(5, 'the all-play wins are conserved, which a per-team loop would not be');
const total = KEYS.reduce((s, k) => s + ap.get(k)!.allPlayWins, 0);
const expect = 8 * (KEYS.length * (KEYS.length - 1)) / 2;
assert('every week hands out exactly one win per pair', total === expect,
    `${total} of ${expect}`);

step(6, 'a one-win gap over eight weeks is not evidence');
/**
 * Six teams, scores drawn so that everybody is close, and one team handed a
 * single extra win by its fixtures. The gap is real arithmetic and it is
 * inside a coin's swing, so the flag has to stay off — the whole point of
 * carrying `sd` beside `luck`.
 */
const close: LeagueGame[] = [];
for (let w = 1; w <= 8; w++) {
    const edge = w <= 5 ? 1 : -1;   // a wins 5, loses 3, on near-level scores
    close.push({ week: w, home: 'a', away: 'b', homePoints: 120 + edge, awayPoints: 120 });
    close.push({ week: w, home: 'c', away: 'd', homePoints: 121, awayPoints: 119 });
    close.push({ week: w, home: 'e', away: 'f', homePoints: 118, awayPoints: 122 });
}
const near = allPlay(close, KEYS).get('a')!;
assert('the gap is under a win and a half', Math.abs(near.luck) < 1.5,
    `${near.luck.toFixed(2)}`);
assert('and it is not called notable', !near.notable,
    `needs ${(1.28 * near.sd).toFixed(2)}`);

step(7, 'an unplayed week is not a nil-nil draw');
const withFuture = cruel.concat(roundRobin(KEYS, 3, 9));
const later = allPlay(withFuture, KEYS).get('b')!;
assert('weeks with no score are skipped', later.played === b.played,
    `${later.played} played, ${withFuture.length - cruel.length} fixtures ahead`);
assert('and the rate is unchanged', Math.abs(later.rate - b.rate) < 1e-9);

step(8, 'strength of schedule ranks the run home, not the season so far');
/**
 * Six teams of known strength, and `a` scheduled against the three best in
 * the weeks that are left after facing the two worst in the weeks gone.
 * A measure that pooled the whole season would call that an average
 * schedule; the split is the point, so both halves are asserted.
 *
 * No team can be given the mirror image of it — in a closed round robin the
 * strong rosters `a` avoids early have to play somebody, so the softest run
 * home is not free to hand out. That is a fact about schedules rather than a
 * limitation of the fixture, and it is why the ordering is checked against
 * the opponent means themselves rather than against a place picked in
 * advance: a claim written to a hoped-for rank passes by being lucky.
 */
const strength = [
    { key: 'a', expected: 110 }, { key: 'b', expected: 130 },
    { key: 'c', expected: 128 }, { key: 'd', expected: 126 },
    { key: 'e', expected: 92 }, { key: 'f', expected: 90 },
];
const split: LeagueGame[] = [
    // Weeks gone: a draws the two weakest rosters in the league.
    { week: 1, home: 'a', away: 'e' }, { week: 1, home: 'b', away: 'c' },
    { week: 1, home: 'd', away: 'f' },
    { week: 2, home: 'a', away: 'f' }, { week: 2, home: 'b', away: 'd' },
    { week: 2, home: 'c', away: 'e' },
    { week: 3, home: 'a', away: 'e' }, { week: 3, home: 'c', away: 'd' },
    { week: 3, home: 'b', away: 'f' },
    // Run home: a draws the three best.
    { week: 4, home: 'a', away: 'b' }, { week: 4, home: 'c', away: 'e' },
    { week: 4, home: 'd', away: 'f' },
    { week: 5, home: 'a', away: 'c' }, { week: 5, home: 'b', away: 'e' },
    { week: 5, home: 'd', away: 'f' },
    { week: 6, home: 'a', away: 'd' }, { week: 6, home: 'b', away: 'f' },
    { week: 6, home: 'c', away: 'e' },
];
const sos = scheduleStrength(strength, split, 4, 6);
const aSos = sos.get('a')!;
assert('the softest schedule in the league becomes one of the hardest',
    aSos.playedRank === strength.length && aSos.rank <= 2,
    `played rank ${aSos.playedRank} of ${strength.length}, remaining rank ${aSos.rank}`);
assert('the opponents come back in week order and only the ones ahead',
    aSos.opponents.map(o => o.key).join(',') === 'b,c,d');
assert('and the weeks already played were the soft half',
    (aSos.playedMeanOpponent ?? 0) < aSos.meanOpponent,
    `had ${aSos.playedMeanOpponent?.toFixed(1)}, has ${aSos.meanOpponent.toFixed(1)}`);

/** The ranking has to be the mean order, including the ties. */
const byMean = strength.map(t => sos.get(t.key)!)
    .sort((x, y) => y.meanOpponent - x.meanOpponent);
let ordered = true;
byMean.forEach((r, i) => {
    if (i === 0) return;
    const prev = byMean[i - 1];
    if (r.meanOpponent < prev.meanOpponent && r.rank <= prev.rank) ordered = false;
    if (r.meanOpponent === prev.meanOpponent && r.rank !== prev.rank) ordered = false;
});
assert('every rank agrees with its mean, ties shared', ordered,
    byMean.map(r => `${r.key} ${r.meanOpponent.toFixed(1)}#${r.rank}`).join('  '));

console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
