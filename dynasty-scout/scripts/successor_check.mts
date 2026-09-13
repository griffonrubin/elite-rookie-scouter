/**
 * The handcuff question, answered off the game logs rather than off a chart.
 *
 * Checked on the property that makes it worth building: a measurement of who
 * took the work has to be able to disagree with the depth chart, and it has
 * to disagree in the direction the season actually went. Tampa Bay is the
 * fixture, because the answer there is known and is not the chart's answer —
 * Rachaad White was the listed backup and did pick the work up, and Sean
 * Tucker, listed nowhere, picked up nearly as much.
 *
 * Plus the arithmetic that is easy to get wrong and impossible to see: that
 * a week before a player ever appeared is not a week he missed, that a bye
 * is not a missed game, and that a teammate who never shared a field has no
 * lift rather than a lift of everything he scored.
 */
import { query } from '../lib/db';
import { contingencyFor, MIN_ABSENCE, MIN_ABSORBED, notable, type WeekRow } from '../lib/successor';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SEASONS = [2024, 2025];

async function teamRows(team: string): Promise<WeekRow[]> {
    return query<WeekRow>(
        `SELECT w.player_id, p.full_name, w.position, w.team, w.season, w.week,
                w.fantasy_points_ppr AS points,
                COALESCE(w.carries, 0) + COALESCE(w.targets, 0) AS touches
           FROM nfl_player_week w
           JOIN players p ON p.id = w.player_id
          WHERE w.season_type = 'REG' AND w.team = $1
            AND w.season IN (${SEASONS.join(',')})
          ORDER BY w.season, w.week`, [team]);
}

const idOf = async (name: string) => {
    const r = await query<{ id: number }>(
        `SELECT id FROM players WHERE full_name = $1 LIMIT 1`, [name]);
    return r[0]?.id ?? null;
};

step(1, 'a real absence, and who was measured taking the work');
const tb = await teamRows('TB');
const irvingId = await idOf('Bucky Irving');
assert('the fixture is in the database', !!irvingId && tb.length > 0,
    `${tb.length} Tampa Bay game logs`);

const irving = contingencyFor(irvingId!, tb)!;
assert('his missed games are counted', irving.missed >= 5,
    `${irving.missed} missed, ${irving.played} played`);
console.log(`        ${irving.name} · ${irving.position} · `
    + `${irving.ownPoints.toFixed(1)} a game on ${irving.ownTouches.toFixed(1)} touches`);
for (const s of irving.successors.slice(0, 4)) {
    console.log(`        ${s.name.padEnd(18)} ${s.games}g out  `
        + `${s.pointsOut.toFixed(1)} vs ${s.pointsIn == null ? '—' : s.pointsIn.toFixed(1)}`
        + `  lift ${s.lift == null ? '—' : (s.lift > 0 ? '+' : '') + s.lift.toFixed(1)}`
        + `  absorbed ${s.absorbed == null ? '—' : (s.absorbed * 100).toFixed(0) + '%'}`);
}

step(2, 'and it disagrees with the depth chart, which is the point');
const named = irving.successors.filter(notable);
assert('more than one man picked the work up', named.length >= 2,
    named.map(s => s.name).join(', '));
const tucker = irving.successors.find(s => s.name.includes('Tucker'));
assert('the man on no chart is measured taking real work',
    !!tucker && (tucker.lift ?? 0) > 4,
    tucker ? `${tucker.name} +${tucker.lift?.toFixed(1)}` : 'not found');

step(3, 'lift is ranked, not level');
/**
 * The ordering is the whole claim. A teammate who scores the same either way
 * is not a successor, and a list ranked on the level says he is.
 */
const synthetic: WeekRow[] = [];
const add = (id: number, name: string, week: number, points: number, touches: number) =>
    synthetic.push({ player_id: id, full_name: name, position: 'RB', team: 'ZZZ',
        season: 2025, week, points, touches });
// The starter plays weeks 1–3 and misses 4–5.
for (const w of [1, 2, 3]) add(1, 'Starter', w, 18, 20);
// Steady: fifteen points every week, absence or not. Not a successor.
for (const w of [1, 2, 3, 4, 5]) add(2, 'Steady', w, 15, 16);
// Backup: nothing while the starter plays, twelve when he does not.
for (const w of [1, 2, 3]) add(3, 'Backup', w, 2, 3);
for (const w of [4, 5]) add(3, 'Backup', w, 12, 14);
for (const w of [4, 5]) add(2, 'Steady', w, 15, 16);

const synth = contingencyFor(1, synthetic)!;
assert('the two missed weeks are found', synth.missed === 2, `${synth.missed}`);
assert('the backup is ranked above the man who scored more',
    synth.successors[0]?.name === 'Backup',
    synth.successors.map(s => `${s.name} ${s.pointsOut.toFixed(0)}`).join(' > '));
assert('and the steady one shows no lift', (synth.successors[1]?.lift ?? 1) === 0,
    `${synth.successors[1]?.lift}`);

step(4, 'a week before a player arrived is not a week he missed');
/** The starter's first appearance is week 3; weeks 1–2 must not count. */
const late: WeekRow[] = synthetic.filter(r => r.player_id !== 1);
for (const w of [3]) late.push({ player_id: 1, full_name: 'Late', position: 'RB',
    team: 'ZZZ', season: 2025, week: w, points: 18, touches: 20 });
const lateC = contingencyFor(1, late)!;
assert('only the weeks after his arrival count', lateC.missed === 2,
    `${lateC.missed} missed from weeks 4–5, not 1–2 and 4–5`);

step(5, 'a bye is not a missed game');
/**
 * Nothing here reads a schedule. A missed game is a week the team appears in
 * and the player does not, so a week the whole team sat out cannot become
 * one — and the check is that removing everybody's week 4 removes the
 * absence with it.
 */
const bye = synthetic.filter(r => r.week !== 4);
const byeC = contingencyFor(1, bye)!;
assert('a week nobody played is not an absence', byeC.missed === 1,
    `${byeC.missed} from week 5 alone`);

step(6, 'no shared field means no lift, rather than a lift of everything');
const fresh: WeekRow[] = synthetic.filter(r => r.player_id !== 3);
for (const w of [4, 5]) fresh.push({ player_id: 4, full_name: 'Arrived', position: 'RB',
    team: 'ZZZ', season: 2025, week: w, points: 12, touches: 14 });
const freshC = contingencyFor(1, fresh)!;
const arrived = freshC.successors.find(s => s.name === 'Arrived')!;
assert('his lift is unknown rather than twelve', arrived.lift === null,
    `points out ${arrived.pointsOut.toFixed(1)}, lift ${arrived.lift}`);

step('6b', 'a man who merely dressed is not a successor');
/**
 * The floor is the difference between a list and a roster. Owen Wright
 * played two of Irving's seven and took three tenths of a point off them; he
 * is measured, he is real, and printing him next to Sean Tucker would say
 * the two are the same kind of answer.
 */
const bodies = irving.successors.filter(s => s.games >= MIN_ABSENCE && !notable(s));
assert('the bodies are measured but not named', bodies.length >= 1,
    bodies.map(s => `${s.name} ${(100 * (s.absorbed ?? 0)).toFixed(0)}%`).join(', ') || 'none');
assert('and everyone named picked up real work',
    irving.successors.filter(notable).every(s => (s.absorbed ?? 0) >= MIN_ABSORBED),
    irving.successors.filter(notable)
        .map(s => `${s.name} ${(100 * (s.absorbed ?? 0)).toFixed(0)}%`).join(', '));

step('6c', 'a teammate who scored well and took none of the work is not one');
/**
 * The case that sent the floor back to the drawing board. Justin Jefferson
 * averaged twenty-two across the two weeks Jordan Addison missed, six and a
 * half above his own average, and took none of Addison's targets — a scoring
 * floor called him the successor and a workload floor does not.
 */
const star: WeekRow[] = [];
const push = (id: number, name: string, week: number, points: number, touches: number) =>
    star.push({ player_id: id, full_name: name, position: 'WR', team: 'ZZZ',
        season: 2025, week, points, touches });
for (const w of [1, 2, 3]) push(1, 'Starter', w, 12, 8);
for (const w of [1, 2, 3]) push(2, 'Star', w, 16, 10);
for (const w of [4, 5]) push(2, 'Star', w, 22, 10.4);   // scored more, took nothing
for (const w of [1, 2, 3]) push(3, 'Fourth', w, 2, 2);
for (const w of [4, 5]) push(3, 'Fourth', w, 7, 6);     // took the targets
const starC = contingencyFor(1, star)!;
const named2 = starC.successors.filter(notable).map(s => s.name);
assert('the star having two good weeks is not named', !named2.includes('Star'),
    starC.successors.map(s =>
        `${s.name} +${(s.lift ?? 0).toFixed(1)} / ${(100 * (s.absorbed ?? 0)).toFixed(0)}%`
    ).join(', '));
assert('the man who took the targets is', named2.includes('Fourth'),
    named2.join(', ') || 'nobody');

step(7, 'the same measurement across the league, to see it is not one fixture');
const teams = ['NYG', 'NO', 'LAC', 'KC', 'MIN', 'ARI'];
let withEvidence = 0, checked = 0;
for (const t of teams) {
    const rows = await teamRows(t);
    const byId = new Map<number, WeekRow[]>();
    for (const r of rows) {
        byId.set(r.player_id, [...(byId.get(r.player_id) ?? []), r]);
    }
    // The team's busiest back, whoever that turned out to be.
    const backs = [...byId.entries()]
        .filter(([, rs]) => rs[0].position === 'RB' && rs.length >= 4)
        .sort((a, b) =>
            b[1].reduce((s, r) => s + r.touches, 0) / b[1].length
            - a[1].reduce((s, r) => s + r.touches, 0) / a[1].length);
    if (backs.length === 0) continue;
    const c = contingencyFor(backs[0][0], rows)!;
    checked++;
    const top = c.successors.filter(notable)[0];
    if (top) withEvidence++;
    console.log(`        ${t} · ${c.name.padEnd(20)} missed ${String(c.missed).padStart(2)}  `
        + (top
            ? `→ ${top.name} ${top.pointsOut.toFixed(1)} on ${top.games}g`
              + (top.lift == null ? '' : ` (${top.lift > 0 ? '+' : ''}${top.lift.toFixed(1)})`)
            : 'no successor with enough games'));
}
assert('most teams have a measured answer', withEvidence >= checked - 2,
    `${withEvidence} of ${checked}`);

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
