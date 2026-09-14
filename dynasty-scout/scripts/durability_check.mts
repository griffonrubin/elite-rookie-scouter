/**
 * Attendance, and the cost of measuring it.
 *
 * Two claims. The arithmetic has to match the successor measurement exactly,
 * because the two appear side by side on one page and a reader who sees
 * "missed 7 of 34" above a list of the men who covered those seven will
 * notice if the seven do not agree. And it has to be cheap, which is not a
 * nicety: written the obvious way this query took five and a half seconds,
 * and at five seconds a profile Next's prefetching of the links on Team
 * Analysis saturated the server and navigation across the app stopped
 * working. A budget is the only thing that catches that before a browser
 * does, because a five-second query looks exactly like a fast one in a diff.
 */
import { query } from '../lib/db';
import { durabilityOf, MIN_ATTENDANCE_GAMES, type Attendance } from '../lib/durability';
import { attendanceSql } from '../lib/attendance';
import { contingencyFor, type WeekRow } from '../lib/successor';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const FROM = 2024, TO = 2026;

step(1, 'the whole league, inside a budget');
/**
 * Two hundred milliseconds, against twenty-eight measured. Loose enough that
 * a slower machine or a season of new rows does not trip it, tight enough
 * that the five-and-a-half-second shape cannot come back.
 */
const BUDGET_MS = 200;
const t0 = Date.now();
const raw = await query<Record<string, any>>(attendanceSql(FROM, TO), []);
const ms = Date.now() - t0;
assert('every player priced', raw.length > 400, `${raw.length} players`);
assert(`and in under ${BUDGET_MS}ms`, ms < BUDGET_MS, `${ms}ms`);

const rows: Attendance[] = raw.map(a => ({
    playerId: Number(a.player_id), position: a.position ?? null,
    played: Number(a.played), missed: Number(a.missed),
}));

step(2, 'and it agrees with the measurement it sits beside');
/**
 * The same absences, counted two different ways: this query subtracts, and
 * lib/successor walks the weeks. They are printed within an inch of each
 * other on a profile, so a disagreement would be visible to a reader before
 * it was visible to anybody else.
 */
const names = ['Bucky Irving', 'Alvin Kamara', 'Jalen Hurts', 'Zay Flowers',
    'Cam Skattebo', 'James Cook'];
let agreed = 0, checked = 0;
for (const name of names) {
    const who = (await query<{ id: number; nfl_team: string | null }>(
        `SELECT id, nfl_team FROM players WHERE full_name = $1 LIMIT 1`, [name]))[0];
    if (!who?.nfl_team) continue;
    const weekRows = await query<WeekRow>(
        `SELECT w.player_id, p.full_name, w.position, w.team, w.season, w.week,
                w.fantasy_points_ppr AS points,
                COALESCE(w.carries, 0) + COALESCE(w.targets, 0) AS touches
           FROM nfl_player_week w JOIN players p ON p.id = w.player_id
          WHERE w.season_type = 'REG' AND w.season BETWEEN ${FROM} AND ${TO}
            AND UPPER(w.team) = $1`, [who.nfl_team.toUpperCase()]);
    const walked = contingencyFor(who.id, weekRows);
    const subtracted = rows.find(r => r.playerId === who.id);
    if (!walked || !subtracted) continue;
    checked++;
    const same = walked.missed === subtracted.missed && walked.played === subtracted.played;
    if (same) agreed++;
    console.log(`        ${name.padEnd(16)} walked ${walked.missed}/${walked.played}  `
        + `subtracted ${subtracted.missed}/${subtracted.played}  ${same ? '' : '← DIFFER'}`);
}
assert('the two counts are the same for everyone checked',
    checked > 0 && agreed === checked, `${agreed} of ${checked}`);

step(3, 'the percentile is a percentile');
const backs = rows.filter(r => (r.position ?? '') === 'RB'
    && r.played + r.missed >= MIN_ATTENDANCE_GAMES);
const scored = backs.map(b => ({ b, d: durabilityOf(b, rows) }))
    .filter(x => x.d.percentile != null);
assert('most backs can be ranked', scored.length > 50, `${scored.length} of ${backs.length}`);
const pcts = scored.map(x => x.d.percentile!);
assert('it stays inside nought and a hundred',
    pcts.every(p => p >= 0 && p <= 100),
    `${Math.min(...pcts).toFixed(1)}–${Math.max(...pcts).toFixed(1)}`);
/**
 * Half the tie, so a third of the field sharing a perfect record does not
 * all land at the ceiling — and so the median sits at fifty rather than
 * somewhere above it.
 */
const mid = [...pcts].sort((a, b) => a - b)[pcts.length >> 1];
assert('and the middle of the field is near the middle of the scale',
    Math.abs(mid - 50) < 12, `median percentile ${mid.toFixed(1)}`);

step(4, 'a man who missed more is never ranked above one who missed less');
const pairs = scored.slice().sort((a, b) => b.d.percentile! - a.d.percentile!);
let inversions = 0;
for (let i = 1; i < pairs.length; i++) {
    if (pairs[i].d.rate < pairs[i - 1].d.rate) inversions++;
}
assert('the ordering follows the rate exactly', inversions === 0, `${inversions} inversions`);

step(5, 'too little evidence is refused rather than guessed');
const thin: Attendance = { playerId: -1, position: 'RB', played: 3, missed: 1 };
const d = durabilityOf(thin, rows);
assert('a four-game sample gets no percentile', d.percentile === null,
    `${d.percentile}`);
assert('but the count is still reported', d.missed === 1 && d.played === 3,
    `${d.missed} of ${d.missed + d.played}`);
assert('and the comparison it would have used is offered anyway',
    d.medianRate != null, `median rate ${(100 * (d.medianRate ?? 0)).toFixed(0)}%`);

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
