/**
 * A waiver claim, priced in the season it changes.
 *
 * "Plus one point seven a week, drop Chig Okonkwo" is already a decision,
 * and it is still the wrong currency for the question underneath it: how
 * much FAAB to spend, and whether to spend any. A point and a half a week
 * is most of a season to a team on the cut line and nothing at all to a
 * team already through, and a waiver page that reports only the points
 * tells both owners the same thing.
 *
 * The claim runs through the same function the Power page uses, with one
 * roster replaced — not through a copy of it. A second implementation is a
 * page saying a claim is worth two points beside a page whose odds say
 * otherwise, and nothing to tell a reader which to believe.
 *
 * The load-bearing assertion is the step function, as it was for trades:
 * the identical claim, in the identical league, is worth a great deal to a
 * team on the cut line and almost nothing to a team already through. An
 * implementation that scaled odds off the points gained would pass "the
 * number moved" and fail this.
 */
import { changeWorth, claimWorth, CLAIM_NOISE, type SeasonInput }
    from '../lib/seasonOdds';
import { pairingTable, type LeagueGame } from '../lib/leagueSchedule';
import type { LeagueRoster } from '../lib/leagueRosters';
import type { RedraftPlayer } from '../lib/types';
import type { StartSitPlayer } from '../app/api/redraft/startsit/route';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
const POS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'WR', 'RB', 'WR', 'TE'];
const TEAMS = 12, REMAINING = 7, SPOTS = 6, WEEK = 8;

const players: RedraftPlayer[] = [];
const data = new Map<number, StartSitPlayer>();
let nextId = 1;

/** A player at a level, added to both sides of the fixture. */
function make(position: string, projPerWeek: number): LeagueRoster['roster'][number] {
    const id = nextId++;
    players.push({ id, position, full_name: `p${id}` } as RedraftPlayer);
    // A season projection is all `simInputFor` needs to place a player; the
    // shape comes from defaults, which is fine because every player here is
    // built the same way and only their level is being compared.
    data.set(id, { id, proj_points: projPerWeek * 17 } as StartSitPlayer);
    return { id, name: `p${id}`, position, startable: true };
}

/** Twelve rosters, each a little worse than the one above it. */
function league(records: (i: number) => { wins: number; losses: number }) {
    const teams: LeagueRoster[] = [];
    for (let t = 0; t < TEAMS; t++) {
        const roster = POS.map((position, i) => make(position, 17 - t * 0.3 - i * 1.1));
        const r = records(t);
        teams.push({
            key: String(t), name: `T${t}`,
            ids: roster.slice(0, SLOTS.length).map(p => p.id),
            roster, unmatched: 0, filled: SLOTS.length, slots: SLOTS.length,
            record: { ...r, ties: 0, pointsFor: 800 + (TEAMS - t) * 8, pointsAgainst: 800 },
        });
    }
    return teams;
}

function fixtures(keys: string[]): LeagueGame[] {
    const ring = keys.slice();
    const out: LeagueGame[] = [];
    for (let w = WEEK; w < WEEK + REMAINING; w++) {
        for (let i = 0; i < ring.length / 2; i++) {
            out.push({ week: w, home: ring[i], away: ring[ring.length - 1 - i] });
        }
        ring.splice(1, 0, ring.pop()!);
    }
    return out;
}

function inputFor(teams: LeagueRoster[]): SeasonInput {
    return {
        teams, slots: SLOTS, players, data, season: 2026, horizon: 'season',
        scoring: null, games: fixtures(teams.map(t => t.key)),
        week: WEEK, remaining: REMAINING, cut: SPOTS,
    };
}

const MY = '6';
const level = league(() => ({ wins: 4, losses: 3 }));
const mine = level.find(t => t.key === MY)!;

step(1, 'a claim that cannot reach the lineup is worth exactly nothing');
/**
 * Both sides run from one seed, so a roster change that does not change
 * the best lineup has to come back at zero rather than at something small.
 * "Small" is what an unpaired comparison looks like, and it is
 * indistinguishable on the page from a real marginal claim.
 */
const scrub = make('TE', 1.2);
const withScrub = claimWorth(inputFor(level), MY, [...mine.roster, scrub]);
assert('the claim is priced at all', withScrub != null,
    withScrub ? `${(withScrub.before * 100).toFixed(1)}% before` : 'null');
assert('and it moves nothing', withScrub?.delta === 0,
    `${((withScrub?.delta ?? 1) * 100).toFixed(6)} points`);

step(2, 'a real upgrade moves the season');
const star = make('RB', 19.5);
const upgraded = [...mine.roster.filter(p => p.id !== mine.roster[7].id), star];
const withStar = claimWorth(inputFor(level), MY, upgraded)!;
console.log(`      ${(withStar.before * 100).toFixed(0)}%`
    + ` → ${(withStar.after * 100).toFixed(0)}%`);
assert('the odds go up', withStar.delta > 0,
    `${(withStar.delta * 100).toFixed(1)} points`);
assert('and by more than the noise floor', withStar.delta > CLAIM_NOISE,
    `${(withStar.delta * 100).toFixed(1)} against a `
    + `${(CLAIM_NOISE * 100).toFixed(1)} floor`);

step(3, 'the same claim is worth a season to one team and nothing to another');
/**
 * Records do the separating, so the rosters, the fixtures and the claim
 * are identical across both leagues. The points gained are identical too —
 * which is exactly why the points are not the answer.
 */
const worthTo = (records: (i: number) => { wins: number; losses: number }) => {
    const L = league(records);
    const me = L.find(t => t.key === MY)!;
    const better = make('RB', 19.5);
    const roster = [...me.roster.filter(p => p.id !== me.roster[7].id), better];
    return claimWorth(inputFor(L), MY, roster)!;
};
const bubble = worthTo(i => (i === 6 ? { wins: 3, losses: 4 } : { wins: 4, losses: 3 }));
const locked = worthTo(i => (i === 6 ? { wins: 7, losses: 0 } : { wins: 3, losses: 4 }));
console.log(`      on the cut line ${(bubble.before * 100).toFixed(0)}%`
    + ` → ${(bubble.after * 100).toFixed(0)}%`);
console.log(`      already through ${(locked.before * 100).toFixed(0)}%`
    + ` → ${(locked.after * 100).toFixed(0)}%`);
assert('the team on the cut line gains a lot', bubble.delta > 0.05,
    `${(bubble.delta * 100).toFixed(1)} points`);
assert('the team already through barely notices',
    Math.abs(locked.delta) < bubble.delta / 3,
    `${(locked.delta * 100).toFixed(1)} points`);

step(4, 'the noise floor covers what the simulation moves by');
/**
 * A claim that barely makes the lineup, re-run from eight seeds. That is
 * the regime the floor is for: a claim that changes no lineup is exactly
 * zero by construction at every trial count, so the swing worth measuring
 * is the one just above it.
 */
const marginal = make('WR', 10.9);
const swapped = [...mine.roster.filter(p => p.id !== mine.roster[6].id), marginal];
const deltas: number[] = [];
for (const seed of [23, 41, 67, 89, 101, 137, 199, 251]) {
    deltas.push(claimWorth(inputFor(level), MY, swapped, null, seed)!.delta);
}
const swing = Math.max(...deltas) - Math.min(...deltas);
console.log(`      eight seeds: ${deltas.map(d => (d * 100).toFixed(1)).join(' ')}`);
assert('the floor sits above the measured swing', CLAIM_NOISE > swing,
    `${(CLAIM_NOISE * 100).toFixed(1)} against ${(swing * 100).toFixed(2)} points`);
assert('and is not so loose it hides a real claim',
    CLAIM_NOISE < withStar.delta / 5,
    `${(CLAIM_NOISE * 100).toFixed(1)} against a `
    + `${(withStar.delta * 100).toFixed(0)}-point claim`);

step('4b', 'a trade replaces both rosters, or it is not a trade');
/**
 * The same machinery prices a trade, and the way to get a trade wrong is
 * to replace only your side.
 *
 * I expected that to overstate the gain — they hand their best player over
 * and keep everything — and it understates it. A trade does two things to
 * your season: it changes your roster, and it changes a rival's. Taking
 * their best back means they are worse for the rest of the year, and a
 * league with one fewer strong team is a league you finish higher in.
 * Pricing only your own side misses the second half, and the second half
 * is most of three points of playoff odds here.
 *
 * Which is the assertion: both sides must be worth more than one, and the
 * gap is the rival getting weaker.
 */
const partner = level.find(t => t.key === '2')!;
const theirBest = partner.roster[1];
const myWorst = mine.roster[8];
const myAfter = [...mine.roster.filter(p => p.id !== myWorst.id), theirBest];
const theirAfter = [...partner.roster.filter(p => p.id !== theirBest.id), myWorst];

const bothSides = changeWorth(inputFor(level), MY, [
    { key: MY, roster: myAfter },
    { key: partner.key, roster: theirAfter },
])!;
const oneSide = changeWorth(inputFor(level), MY, [{ key: MY, roster: myAfter }])!;
console.log(`      both sides ${(bothSides.delta * 100).toFixed(1)} points`
    + ` · only mine ${(oneSide.delta * 100).toFixed(1)}`);
assert('the trade is worth something', bothSides.delta > CLAIM_NOISE,
    `${(bothSides.delta * 100).toFixed(1)} points`);
assert('and replacing only my side is not the same answer',
    Math.abs(bothSides.delta - oneSide.delta) > 0.01,
    `${(bothSides.delta * 100).toFixed(1)} against `
    + `${(oneSide.delta * 100).toFixed(1)}`);
assert('and it understates it, because it misses the rival getting worse',
    bothSides.delta > oneSide.delta,
    `${(bothSides.delta * 100).toFixed(1)} against `
    + `${(oneSide.delta * 100).toFixed(1)} — the difference is their roster`);

step(5, 'a season already over has no claim to price');
const over = claimWorth({ ...inputFor(level), remaining: 0 }, MY,
    [...mine.roster, scrub]);
assert('nothing is invented', over == null);

console.log(fails.length === 0
    ? '\nevery step passed\n'
    : `\n${fails.length} FAILED\n${fails.map(f => '  · ' + f).join('\n')}\n`);
process.exit(fails.length === 0 ? 0 : 1);
