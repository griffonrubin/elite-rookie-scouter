/**
 * How long every page and route takes the server, with a budget on each.
 *
 * This exists because of a five-and-a-half-second query that nobody saw.
 * The profile page grew an attendance measurement written with a correlated
 * subquery — thirteen hundred re-evaluations of the same list — and the page
 * went from a fifth of a second to eleven. Nothing reported it. What
 * reported it, eventually, was a browser check failing to click from Team
 * Analysis to the waiver wire: the new panel had added a dozen links to
 * profile pages, Next prefetched all of them, and twelve eleven-second
 * renders saturated the server. Eight concurrent profile requests took
 * eighty-seven seconds.
 *
 * A page check cannot find that, because every page check drives one page at
 * a time and one eleven-second page still answers. Only timing the server
 * finds it, and only a sweep finds it on the page nobody happened to be
 * working on — so the route list is read off the filesystem rather than
 * maintained here, and a page added next month is measured the day it is
 * added.
 *
 * The numbers are warm rather than cold, and deliberately: the query this
 * was built for was slow on every request, cached or not, which is the shape
 * of the mistake worth catching. A cold-start cost that a cache absorbs is a
 * different and much smaller problem.
 */
import { readdirSync, existsSync } from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { query } from '../lib/db';
import { LOAD_FAILURE_MARKER } from '../components/LoadFailure';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const BASE = process.env.BASE ?? 'http://localhost:3090';

/**
 * What a page or a route is allowed to take, warm.
 *
 * A second and a half is far above anything here measures and far below the
 * five seconds that broke navigation. It is a smoke alarm rather than a
 * performance target: a budget tight enough to argue with would fail on a
 * loaded machine and get raised until it meant nothing.
 */
const BUDGET_MS = 1500;

/** Routes that do work rather than answer questions, and are not swept. */
const SKIP = [
    'api/cron/',        // writes, and talks to the network
    'api/refresh',      // the same
    'api/scan',
    'api/debug',
    'api/espn/',        // needs credentials
    'api/sleeper/',     // proxies an external host
    'api/leagues',      // writes
    'api/tiers',        // writes
];

step(0, 'a parameter named twice is supplied twice');
/**
 * Postgres numbers its placeholders and SQLite counts them, so `$1` used
 * twice is one value there and two here. The local shim rewrote the text and
 * forwarded the original list, which threw "Too few parameter values were
 * provided" — and the positional dropoff page, which names the season in
 * both a join and a subquery, caught it, logged it, and rendered an empty
 * chart behind a two hundred. The whole feature was blank for as long as it
 * had existed locally.
 *
 * Asserted through the real helper rather than the private function, because
 * what matters is that a caller gets the right answer.
 */
const repeated = await query<{ a: number; b: number; c: number }>(
    'SELECT $1 AS a, $1 AS b, $2 AS c', [7, 9]);
assert('the same placeholder twice gets the same value',
    repeated[0]?.a === 7 && repeated[0]?.b === 7,
    JSON.stringify(repeated[0] ?? null));
assert('and a later one is not shifted by it', repeated[0]?.c === 9,
    `c = ${repeated[0]?.c}`);
/** Out of order, since the rewrite walks occurrences rather than numbers. */
const reversed = await query<{ a: number; b: number }>(
    'SELECT $2 AS a, $1 AS b', [1, 2]);
assert('placeholders out of order keep their numbers',
    reversed[0]?.a === 2 && reversed[0]?.b === 1,
    JSON.stringify(reversed[0] ?? null));

step(1, 'every page and route the app has');
const ROOT = process.cwd();
const found: { kind: 'page' | 'api'; route: string }[] = [];
const walk = (dir: string, route: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
        const next = path.join(dir, e.name);
        // Route groups — (marketing) and the like — are path-invisible.
        const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
        walk(next, route + seg);
    }
    if (existsSync(path.join(dir, 'page.tsx'))) found.push({ kind: 'page', route: route || '/' });
    if (existsSync(path.join(dir, 'route.ts'))) found.push({ kind: 'api', route: route || '/' });
};
walk(path.join(ROOT, 'app'), '');

/** Sample values for the dynamic segments, out of the database. */
const db = new Database('dynasty_scout.db', { readonly: true });
const aPlayer = db.prepare(
    `SELECT slug FROM players WHERE redraft_pool = 1 AND slug IS NOT NULL
      ORDER BY id LIMIT 1`).get() as { slug: string } | undefined;
const aTeam = db.prepare(
    `SELECT abbreviation FROM nfl_teams WHERE abbreviation IS NOT NULL
      ORDER BY abbreviation LIMIT 1`).get() as { abbreviation: string } | undefined;
db.close();

/** Query strings the routes need to answer rather than reject. */
const PARAMS: Record<string, string> = {
    '/api/redraft/waivers': '?week=1&limit=60',
    '/api/redraft/startsit': `?ids=1,2,3&week=1`,
    '/api/redraft/schedule': '?from=1&playoffWeek=15',
    '/api/redraft/search': '?q=a',
    '/api/players/search': '?q=a',
    '/api/redraft/pickems': '?week=1',
};

const targets = found
    .filter(f => !SKIP.some(s => f.route.slice(1).startsWith(s)))
    .filter(f => !f.route.includes('[...'))
    .map(f => ({
        ...f,
        url: f.route
            .replace('[slug]', aTeam && f.route.startsWith('/teams')
                ? aTeam.abbreviation.toLowerCase() : aPlayer?.slug ?? 'x')
            .replace('[id]', '1'),
    }))
    .filter(f => !f.url.includes('['));

assert('the sweep found the app', targets.length >= 20, `${targets.length} routes`);

step(2, 'each one, warm, against the budget');
/** Warm first, then measure: a cold module load is not what this is for. */
const timed: { route: string; kind: string; ms: number; status: number }[] = [];
for (const t of targets) {
    const url = BASE + t.url + (PARAMS[t.url] ?? '');
    try {
        await fetch(url);                      // warm
        const t0 = Date.now();
        const r = await fetch(url);
        timed.push({ route: t.url, kind: t.kind, ms: Date.now() - t0, status: r.status });
    } catch (e) {
        timed.push({ route: t.url, kind: t.kind, ms: -1, status: 0 });
    }
}

timed.sort((a, b) => b.ms - a.ms);
for (const t of timed.slice(0, 10)) {
    console.log(`        ${String(t.ms).padStart(5)}ms  ${String(t.status).padStart(3)}  `
        + `${t.kind === 'api' ? '·' : ' '} ${t.route}`);
}
if (timed.length > 10) console.log(`        … ${timed.length - 10} faster`);

const unreachable = timed.filter(t => t.ms < 0);
assert('every route answered', unreachable.length === 0,
    unreachable.map(t => t.route).join(', ') || `${timed.length} routes`);

/**
 * A five hundred is a failure this sweep is entitled to notice. It is how
 * the missing calibration table surfaced, on a page nobody was working on.
 */
const broken = timed.filter(t => t.status >= 500);
assert('none of them is broken', broken.length === 0,
    broken.map(t => `${t.route} → ${t.status}`).join(', ') || 'no five hundreds');

/**
 * And none of them is quietly empty.
 *
 * A status code is not enough, which is the other half of what this sweep
 * was built for. The positional dropoff page threw on every request, caught
 * it, and answered two hundred with an empty chart — healthy by every
 * measure here. Pages that load from the database now render a marker when
 * the load fails instead of rendering nothing, so a sweep can see the
 * difference between a quiet day and a broken one.
 */
const failedLoads: string[] = [];
for (const t of timed.filter(t => t.kind === 'page')) {
    try {
        const body = await (await fetch(BASE + t.route + (PARAMS[t.route] ?? ''))).text();
        if (body.includes(LOAD_FAILURE_MARKER)) failedLoads.push(t.route);
    } catch { /* already counted as unreachable */ }
}
assert('no page is quietly empty behind a two hundred',
    failedLoads.length === 0,
    failedLoads.join(', ') || `${timed.filter(t => t.kind === 'page').length} pages read`);

const slow = timed.filter(t => t.ms > BUDGET_MS);
assert(`none of them takes more than ${BUDGET_MS}ms`, slow.length === 0,
    slow.map(t => `${t.route} ${t.ms}ms`).join(', ')
    || `slowest ${timed[0]?.ms}ms on ${timed[0]?.route}`);

step(3, 'and the slowest one survives a dozen readers at once');
/**
 * The half of the failure a serial sweep cannot see. Eleven seconds serial
 * is eighty-seven seconds when Next prefetches a dozen links at once, and
 * prefetching is not an unusual load — it is what happens when a reader
 * looks at a page with links on it.
 */
const worst = timed[0];
if (worst && worst.ms >= 0) {
    const url = BASE + worst.route + (PARAMS[worst.route] ?? '');
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 12 }, () => fetch(url)));
    const burst = Date.now() - t0;
    /**
     * Full serialisation is the expected floor here, not a failure.
     *
     * better-sqlite3 is synchronous, so every query blocks the event loop and
     * twelve requests cost twelve times one by construction — the first
     * version of this asserted eight times and failed on a healthy server,
     * which is how a budget gets raised until it means nothing. What is worth
     * catching is *worse* than serial: lock contention, a connection pool
     * running dry, a cache stampeding. So the ceiling is the serial cost
     * with half again on top.
     */
    const ceiling = Math.max(2500, worst.ms * 12 * 1.5 + 500);
    assert('twelve at once cost no more than twelve of them should',
        burst < ceiling,
        `${burst}ms for twelve of ${worst.route} (one takes ${worst.ms}ms, `
        + `ceiling ${Math.round(ceiling)}ms)`);
}

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'all good'}`);
process.exit(fails.length ? 1 : 0);
