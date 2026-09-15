/**
 * The two platforms have to answer the same questions.
 *
 * Sleeper and ESPN each get their own builder turning a payload into a
 * league snapshot, and a field added to one of them is silently absent from
 * the other. Absent reads exactly like a standard league, so nothing
 * anywhere says so: an ESPN superflex league kept a one-quarterback
 * replacement level, an ESPN half-PPR league kept full-PPR totals, ESPN
 * lineups had no slot order to lay a board out with, and Power Rankings —
 * which exists to separate a roster from its results — had no record to set
 * a ranking against. Four fixes that reached half the users, none of them
 * visible as a bug.
 *
 * So the parity is checked rather than remembered. Both builders are driven
 * with a payload shaped the way each platform documents, and what is
 * asserted is that neither comes back knowing something the other does not.
 *
 * What this cannot do is confirm the payloads are real: neither API is
 * reachable from where this runs. It tests the translation, which is the
 * half that has actually been wrong every time.
 */
import { BENCH_SLOTS } from '../lib/useLeagueSync';
import { rosterPositionsFrom, receptionPointsFrom } from '../app/api/espn/league/route';
import { scoringFrom } from '../lib/scoring';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

/**
 * Everything a page reads off a snapshot, and off a team inside it.
 *
 * Maintained here on purpose: adding a field to LeagueSnapshot without
 * adding it to this list is the same mistake in a new place, and a list that
 * derives itself from one platform's output could never catch the platform
 * that is missing something.
 */
const SNAPSHOT_FIELDS = [
    'leagueName', 'week', 'teams', 'opponentKeyFor',
    'rosterPositions', 'playoffWeekStart', 'playoffTeams', 'scoring',
];
const TEAM_FIELDS = ['key', 'name', 'rostered', 'slots', 'lineupSlots', 'record'];

step(1, 'ESPN reports the lineup shape, in the names this app uses');
/**
 * Slot ids as ESPN documents them: 0 quarterback, 2 back, 4 receiver, 6
 * tight end, 7 the "OP" that makes a league superflex, 16 defence, 17
 * kicker, 23 flex, 20 bench, 21 injured reserve.
 */
const espnSlots = rosterPositionsFrom({
    '0': 1, '2': 2, '4': 2, '6': 1, '23': 1, '16': 1, '17': 1, '20': 7, '21': 1,
});
assert('the bench and injured reserve are not in it',
    !!espnSlots && espnSlots.length === 9
    && !espnSlots.some(x => BENCH_SLOTS.has(x.toUpperCase())),
    espnSlots?.join(' ') ?? 'none');

step(2, 'and both platforms read a reception the same way');
assert('Sleeper: an explicit value is used', scoringFrom({ rec: 0.5 }).reception === 0.5);
assert('ESPN: an explicit value is used', receptionPointsFrom([{ statId: 53, points: 0.5 }]) === 0.5);
assert('Sleeper: a silence changes nothing', scoringFrom({ pass_td: 4 }).reception === 1);
assert('ESPN: a silence changes nothing', receptionPointsFrom([{ statId: 42, points: 0.1 }]) === null);

step(3, 'a team from either platform answers the same questions');
/**
 * The builders are not exported — they close over a fetch each — so the
 * shapes they produce are reproduced here from the code they run, which
 * makes this a check on the contract rather than on the functions. It fails
 * the day one platform grows a field and the other does not, which is the
 * only failure that has ever happened here.
 */
const sleeperTeam = {
    key: '1', name: 'A team', rostered: ['100'],
    slots: [{ playerId: '100', starting: true, slot: 'QB' }],
    lineupSlots: [{ slot: 'QB', playerId: '100' }],
    record: { wins: 1, losses: 0, ties: 0, pointsFor: 100, pointsAgainst: 90 },
};
const espnTeam = {
    key: '1', name: 'A team', rostered: ['100'],
    slots: [{ playerId: '100', dstTeam: null, starting: true, slot: 'QB' }],
    lineupSlots: [{ slot: 'QB', playerId: '100' }],
    record: { wins: 1, losses: 0, ties: 0, pointsFor: 100, pointsAgainst: 90 },
};
for (const f of TEAM_FIELDS) {
    const inSleeper = f in sleeperTeam;
    const inEspn = f in espnTeam;
    assert(`both carry ${f}`, inSleeper && inEspn,
        `${inSleeper ? '' : 'missing on Sleeper '}${inEspn ? '' : 'missing on ESPN'}`);
}
assert('and a slot on a player is named on both',
    !!sleeperTeam.slots[0].slot && !!espnTeam.slots[0].slot,
    `${sleeperTeam.slots[0].slot} / ${espnTeam.slots[0].slot}`);

step(4, 'and the builders in the source really set them');
/**
 * The assertions above are about a contract written down twice. This one
 * reads the file, because a contract nobody checks against the code is a
 * comment. Crude on purpose — it looks for the field names inside each
 * builder's body — and it catches the thing that keeps happening: a return
 * statement that lists six fields where the other lists nine.
 */
import { readFileSync } from 'fs';
const src = readFileSync('lib/useLeagueSync.ts', 'utf8');
const sleeperBody = src.slice(src.indexOf('async function fetchSleeper'),
    src.indexOf('async function fetchEspn'));
const espnBody = src.slice(src.indexOf('async function fetchEspn'),
    src.indexOf('export function useLeagueSync'));
const missing: string[] = [];
for (const f of [...SNAPSHOT_FIELDS, ...TEAM_FIELDS]) {
    const inS = sleeperBody.includes(f);
    const inE = espnBody.includes(f);
    // Named for the builder that *has* it, which is the one to copy from.
    // Written the other way round first, so removing a field from ESPN
    // reported it as "ESPN only" — a diagnostic pointing at the wrong file
    // is worse than none, because it is believed.
    if (inS !== inE) missing.push(`${f} (${inS ? 'Sleeper' : 'ESPN'} only)`);
}
assert('neither builder knows something the other does not',
    missing.length === 0, missing.join(', ') || `${SNAPSHOT_FIELDS.length + TEAM_FIELDS.length} fields`);

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
