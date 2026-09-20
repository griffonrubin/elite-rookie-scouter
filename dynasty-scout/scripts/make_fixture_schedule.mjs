/**
 * Give the twelve-team fixture the fixture list it never had.
 *
 * `matchups` in fixtures-real-leagues.json was captured from one week of a
 * real league and only three rosters of it came back — the reader's own
 * game and one other. That is enough to open the page on the right
 * opponent and not nearly enough to be a schedule, so `scheduleUsable`
 * has always refused it and every browser check has quietly run the
 * degraded path: weeks drawn at random, "your platform would not give a
 * fixture list" printed under the panel that weighs the week, and the
 * whole real-schedule branch — the pairing table, the run home, who to
 * root for — never once exercised outside the model checks.
 *
 * This writes `schedule`: a full round robin over the league's rosters,
 * stored as the pairs themselves rather than as Sleeper payloads. Seven
 * thousand lines of repeated starters is not fixture data, it is the same
 * roster written out a hundred and sixty-eight times; `fixtures.mjs`
 * renders these pairs into the shape the platform returns, which is the
 * mock's job anyway.
 *
 * It is synthesised rather than captured, and says so. What it has to be
 * is consistent with what *was* captured, which means week one still
 * pairs roster 11 with roster 8 — the game three checks open on.
 *
 * Run: node scripts/make_fixture_schedule.mjs
 */
import fs from 'fs';

const PATH = new URL('./fixtures-real-leagues.json', import.meta.url);
const F = JSON.parse(fs.readFileSync(PATH, 'utf8'));

/** The circle method: fix one team, rotate the rest. */
function roundRobin(ids) {
    const ring = ids.slice();
    const weeks = [];
    for (let w = 0; w < ring.length - 1; w++) {
        const pairs = [];
        for (let i = 0; i < ring.length / 2; i++) {
            pairs.push([ring[i], ring[ring.length - 1 - i]]);
        }
        weeks.push(pairs);
        ring.splice(1, 0, ring.pop());
    }
    return weeks;
}

let wrote = 0;
F.schedule ??= {};
for (const [id, rosters] of Object.entries(F.rosters)) {
    if (rosters.length < 4 || rosters.length % 2 !== 0) continue;
    const ids = rosters.map(r => r.roster_id);
    const lastWeek = (F.leagueDetail[id]?.settings?.playoff_week_start ?? 15) - 1;

    // Whatever the captured week actually paired, so the checks that open
    // on "this week's opponent" still open on the same one.
    const captured = new Map();
    for (const m of F.matchups[id] ?? []) {
        if (m.matchup_id == null) continue;
        const other = (F.matchups[id] ?? []).find(
            x => x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id);
        if (other) captured.set(m.roster_id, other.roster_id);
    }

    let weeks = roundRobin(ids);
    // Rotate so the week carrying the captured pairing is week one.
    const holds = pairs => [...captured].every(([a, b]) =>
        pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a)));
    const at = weeks.findIndex(holds);
    if (at > 0) weeks = [...weeks.slice(at), ...weeks.slice(0, at)];
    if (at < 0 && captured.size) {
        console.warn(`  ${id}: no round-robin week pairs the captured game; `
            + 'swapping it into week one by hand');
        const [a, b] = [...captured][0];
        const w = weeks[0].map(p => p.slice());
        const ia = w.findIndex(p => p.includes(a));
        const ib = w.findIndex(p => p.includes(b));
        if (ia >= 0 && ib >= 0 && ia !== ib) {
            const partnerA = w[ia][0] === a ? w[ia][1] : w[ia][0];
            const partnerB = w[ib][0] === b ? w[ib][1] : w[ib][0];
            w[ia] = [a, b];
            w[ib] = [partnerA, partnerB];
            weeks[0] = w;
        }
    }

    const byWeek = [];
    for (let week = 1; week <= lastWeek; week++) {
        byWeek.push(weeks[(week - 1) % weeks.length].map(p => [p[0], p[1]]));
    }
    F.schedule[id] = byWeek;
    wrote++;
    console.log(`  ${id}: ${lastWeek} weeks, ${ids.length} rosters`
        + `, week 1 pairs ${byWeek[0].map(([a, b]) => `${a}v${b}`).join(' ')}`);
}

// Written the way it was found, so the diff is the data that changed.
fs.writeFileSync(PATH, JSON.stringify(F, null, 1));
console.log(`wrote schedules for ${wrote} leagues`);
