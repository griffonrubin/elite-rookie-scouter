/**
 * Which list you get, and why.
 *
 * The waiver page has two orderings and only one of them can be exercised
 * against the database at a time: ranking on a change in usage needs a
 * season of games behind it, and in September there isn't one. So the path
 * that will run for four months of the year is tested here, on rows built by
 * hand, rather than shipping untested until it starts running.
 *
 * Four things have to hold, and each of them is a bug this page shipped:
 *
 *   a trend needs a season, not an offseason — ranking the last three games
 *   against the five before them across a summer meant "recent" was weeks
 *   sixteen to eighteen, the weeks eliminated teams rest their starters;
 *
 *   a rise off nothing is not a rise — a back going from one touch to three
 *   has tripled his role and is still averaging two points;
 *
 *   replacement is the whole pool, not the free agents in it — every
 *   startable quarterback is rostered, so a baseline drawn from what is
 *   available makes a free-agent starter look like the best player alive;
 *
 *   and kickers keep out of the combined list, where they are right on the
 *   arithmetic and useless as advice.
 */
import {
    MIN_RECENT_POINTS, MIN_TREND_GAMES, TREND_MIN_POOL,
    isTrendable, rankWaivers, replacementBaseline, trendScore,
    type WaiverRow,
} from '../lib/waiverRank';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

let nextId = 1;
function row(p: Partial<WaiverRow> & { position: string }): WaiverRow {
    const id = nextId++;
    return {
        id, slug: `p${id}`, full_name: p.full_name ?? `player ${id}`,
        position: p.position, nfl_team: p.nfl_team ?? 'NE',
        games: p.games ?? 0,
        snap_now: p.snap_now ?? null, snap_before: p.snap_before ?? null,
        touches_now: p.touches_now ?? null, touches_before: p.touches_before ?? null,
        points_now: p.points_now ?? null, points_before: p.points_before ?? null,
        implied_team_total: null, spread: null, opponent: null,
        on_bye: false, teammate_out: null,
        proj_points: p.proj_points ?? null,
        over_replacement: null,
    };
}

/** A player whose job has grown, as the page means it. */
const riser = (name: string, over: Partial<WaiverRow> = {}) => row({
    ...over, position: 'RB', full_name: name, games: 8,
    snap_before: 0.22, snap_now: 0.68,
    touches_before: 4, touches_now: 14,
    points_before: 5, points_now: 13,
    proj_points: 120,
});
/** And one whose job has shrunk. */
const faller = (name: string) => row({
    position: 'RB', full_name: name, games: 8,
    snap_before: 0.70, snap_now: 0.25,
    touches_before: 15, touches_now: 4,
    points_before: 13, points_now: 5,
    proj_points: 120,
});

step(1, 'a trend needs a season behind it, not a summer');
const short = row({ position: 'RB', full_name: 'two games in',
    games: MIN_TREND_GAMES - 1, snap_before: 0.2, snap_now: 0.9,
    touches_before: 2, touches_now: 12, points_before: 4, points_now: 14,
    proj_points: 120 });
assert('a player short of the floor is not trendable', !isTrendable(short),
    `${short.games} games, floor ${MIN_TREND_GAMES}`);
assert('and one past it is', isTrendable(riser('past the floor')));

step(2, 'a rise off nothing is not a rise');
// The bug: a man averaging two points a game ranked third, because his snap
// share had tripled. The share was real. He was still not a football player.
const empty = row({ position: 'RB', full_name: 'tripled off nothing',
    games: 9, snap_before: 0.05, snap_now: 0.35,
    touches_before: 1, touches_now: 3, points_before: 1.2, points_now: 2.1,
    proj_points: 30 });
assert('the biggest riser in the league is held out if he scores nothing',
    !isTrendable(empty), `${empty.points_now} points, floor ${MIN_RECENT_POINTS}`);
assert('but his trend score is genuinely high, which is why the floor exists',
    trendScore(empty) > 10, trendScore(empty).toFixed(1));

step(3, 'with a season, the list is the movers and it is signed the right way');
const pool: WaiverRow[] = [
    ...Array.from({ length: TREND_MIN_POOL }, (_, i) => riser(`riser ${i}`)),
    faller('the man losing his job'),
    row({ position: 'WR', full_name: 'steady', games: 10,
        snap_before: 0.6, snap_now: 0.6, touches_before: 6, touches_now: 6,
        points_before: 10, points_now: 10, proj_points: 140 }),
];
const withSeason = rankWaivers(pool, replacementBaseline(pool), null);
console.log(`      mode=${withSeason.mode}, ${withSeason.trendable} trendable, `
    + `top: ${withSeason.players.slice(0, 2).map(p => p.full_name).join(', ')}`);
assert('enough of the pool can be read, so it is the trend list',
    withSeason.mode === 'trend', withSeason.mode);
assert('a riser is top', /^riser/.test(withSeason.players[0].full_name),
    withSeason.players[0].full_name);
assert('and the man losing his job is last',
    withSeason.players[withSeason.players.length - 1].full_name
        === 'the man losing his job',
    withSeason.players[withSeason.players.length - 1].full_name);
assert('a riser outscores a faller by a wide margin',
    trendScore(riser('a')) - trendScore(faller('b')) > 30,
    (trendScore(riser('a')) - trendScore(faller('b'))).toFixed(1));

step(4, 'one riser short of the floor and the page falls back rather than pretend');
const thin = [
    ...Array.from({ length: TREND_MIN_POOL - 1 }, (_, i) => riser(`riser ${i}`)),
    row({ position: 'WR', full_name: 'a name off a projection',
        proj_points: 200 }),
];
const thinRank = rankWaivers(thin, replacementBaseline(thin), null);
console.log(`      ${thinRank.trendable} trendable of ${thin.length}: `
    + `mode=${thinRank.mode}`);
assert('eleven readable players is not a usage list',
    thinRank.mode === 'projection', thinRank.mode);
assert('but they are counted, so the page can say how close it is',
    thinRank.trendable === TREND_MIN_POOL - 1, String(thinRank.trendable));
assert('and everyone with a projection is ranked, trendable or not',
    thinRank.players.length === thin.length, String(thinRank.players.length));

step(5, 'replacement is the whole pool, not the part of it that is free');
/**
 * The real shape, from txmossad's league: every startable quarterback is
 * rostered, so the *available* quarterbacks run 276, then 179 at the
 * twelfth, then 21 at the twenty-fourth. A baseline drawn from that cliff
 * prices a free-agent quarterback at +255 and puts eight of them on top of a
 * list nobody in a one-quarterback league would act on.
 */
const qbs = [
    ...Array.from({ length: 11 }, (_, i) => row({
        position: 'QB', full_name: `rostered qb ${i}`, proj_points: 300 - i * 4 })),
    row({ position: 'QB', full_name: 'the free quarterback', proj_points: 276 }),
    ...Array.from({ length: 12 }, (_, i) => row({
        position: 'QB', full_name: `backup ${i}`, proj_points: 60 - i * 3 })),
    ...Array.from({ length: 40 }, (_, i) => row({
        position: 'WR', full_name: `wr ${i}`, proj_points: 220 - i * 4 })),
];
const whole = replacementBaseline(qbs);
const freeOnly = replacementBaseline(
    qbs.filter(p => !/^rostered/.test(p.full_name ?? '')));
console.log(`      QB replacement: ${whole.get('QB')} over the pool, `
    + `${freeOnly.get('QB')} over the free agents alone`);
assert('the whole pool puts the line at a real starting quarterback',
    (whole.get('QB') ?? 0) > 250, String(whole.get('QB')));
assert('the free agents alone put it at a backup',
    (freeOnly.get('QB') ?? 0) < 100, String(freeOnly.get('QB')));
// Which is the finding: the free-agent baseline is not merely different, it
// inverts the answer.
const gapWhole = 276 - (whole.get('QB') ?? 0);
const gapFree = 276 - (freeOnly.get('QB') ?? 0);
console.log(`      so the same man prices at ${gapWhole.toFixed(0)} against the pool `
    + `and ${gapFree.toFixed(0)} against the free agents`);
assert('so a free quarterback is priced sanely against the pool',
    Math.abs(gapWhole) < 40, gapWhole.toFixed(0));
assert('and absurdly against the free agents', gapFree > 200, gapFree.toFixed(0));

step(6, 'kickers keep out of the combined list and stay in their own');
/**
 * Not because the arithmetic dislikes them — it likes them far too much.
 * Almost every startable kicker is unrostered, so the best one available
 * really is thirty points of season above replacement, which put four
 * kickers and four defences in the top eight of a list meant to answer "who
 * should I claim".
 */
const mixed = [
    ...Array.from({ length: 20 }, (_, i) => row({
        position: 'K', full_name: `kicker ${i}`, proj_points: 150 - i })),
    ...Array.from({ length: 40 }, (_, i) => row({
        position: 'WR', full_name: `wr ${i}`, proj_points: 220 - i * 4 })),
];
const base = replacementBaseline(mixed);
const combined = rankWaivers(mixed, base, null);
const kickersOnly = rankWaivers(mixed.filter(r => r.position === 'K'),
    base, 'K');
console.log(`      combined top five: `
    + combined.players.slice(0, 5).map(p => p.position).join(' '));
assert('no kicker reaches the combined list',
    combined.players.every(p => p.position !== 'K'),
    combined.players.filter(p => p.position === 'K').length + ' kickers');
assert('the best kicker really is above replacement, which is the trap',
    (base.get('K') ?? 0) < 150, `${base.get('K')} vs a 150-point best`);
assert('and asking for kickers gives you kickers',
    kickersOnly.players.length === 20 && kickersOnly.players[0].position === 'K',
    `${kickersOnly.players.length} rows`);
assert('ranked best first', kickersOnly.players[0].full_name === 'kicker 0',
    kickersOnly.players[0].full_name);

step(7, 'every ranked row carries the number it was ranked on');
assert('over replacement is filled in',
    combined.players.every(p => p.over_replacement != null),
    String(combined.players.filter(p => p.over_replacement == null).length));
assert('and it is in descending order',
    combined.players.every((p, i) => i === 0
        || (p.over_replacement ?? 0) <= (combined.players[i - 1].over_replacement ?? 0)),
    combined.players.slice(0, 4).map(p => p.over_replacement).join(', '));

console.log(`\n${fails.length ? fails.length + ' FAILED: ' + fails.join(', ') : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
