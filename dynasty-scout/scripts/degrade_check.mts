/**
 * What the app does when it cannot read the database.
 *
 * The answer used to be: nothing visible. Every page here that loads from the
 * database wrapped the load in a try and returned an empty list, so a failure
 * rendered as a page with its chrome, its controls, a two hundred, and no
 * data — indistinguishable from a quiet day. The positional dropoff page
 * lived in that state for its whole existence, throwing on every request,
 * because it passed one parameter to a query that names it twice.
 *
 * Proving the fix needs a broken database rather than a mocked one, and
 * lib/db hands one over: it resolves `dynasty_scout.db` against the working
 * directory, so a server started somewhere else opens a file SQLite creates
 * empty and every query fails with "no such table". That is a truer fault
 * than any stub — the real driver, the real queries, the real error.
 *
 * The build is symlinked rather than copied, so this costs a directory of
 * links and one more server rather than four hundred megabytes.
 */
import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, unlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import { LOAD_FAILURE_MARKER } from '../components/LoadFailure';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const APP = process.cwd();
const PORT = Number(process.env.DEGRADE_PORT ?? 3098);
const BASE = `http://localhost:${PORT}`;

/**
 * Pages that read the database and must say so when they cannot.
 *
 * Named rather than swept, because the claim is specific: these are the ones
 * that render a list or a chart from a query, where an empty result is a
 * plausible answer and therefore a convincing disguise. A page with no data
 * of its own has nothing to hide.
 */
const PAGES = [
    { route: '/redraft', what: 'the redraft board' },
    { route: '/redraft/dropoff', what: 'the projection curves' },
    { route: '/redraft/mock', what: 'the player pool' },
];

step(1, 'a server whose working directory has no database');
const dir = path.join(os.tmpdir(), `degrade-${process.pid}`);
mkdirSync(dir, { recursive: true });
for (const f of ['.next', 'node_modules', 'package.json', 'public', 'next.config.ts']) {
    const from = path.join(APP, f);
    if (!existsSync(from)) continue;
    const to = path.join(dir, f);
    try { unlinkSync(to); } catch { /* not there */ }
    symlinkSync(from, to);
}
assert('the build is linked into an empty directory',
    existsSync(path.join(dir, '.next')), dir);

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: dir, stdio: 'ignore', detached: true,
});
const stop = () => { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } };

/** Up to thirty seconds to listen, polled rather than slept through. */
let up = false;
for (let i = 0; i < 60 && !up; i++) {
    try {
        const r = await fetch(`${BASE}/horizontal`);
        up = r.status > 0;
    } catch {
        await new Promise(r => setTimeout(r, 500));
    }
}
assert('it came up', up, up ? BASE : 'never listened');

if (up) {
    step(2, 'every data page says it could not read, rather than looking empty');
    for (const p of PAGES) {
        let status = 0, body = '';
        try {
            const r = await fetch(BASE + p.route);
            status = r.status;
            body = await r.text();
        } catch { /* counted below */ }
        const marked = body.includes(LOAD_FAILURE_MARKER);
        const said = body.includes('Could not load');
        console.log(`        ${p.route.padEnd(20)} ${status}  `
            + `${marked ? 'marked' : 'NOT MARKED'}  ${said ? 'and says so' : ''}`);
        assert(`${p.route} does not pretend to be fine`,
            marked || status >= 500,
            `status ${status}, marker ${marked}`);
    }

    step(3, 'and it is not a blank page either — a reader is told what happened');
    const body = await (await fetch(BASE + PAGES[0].route)).text();
    assert('the message names what failed',
        body.includes('Could not load') && body.includes(PAGES[0].what),
        (body.match(/Could not load [^<]*/) ?? ['nothing'])[0]);
    assert('and separates a fault from an answer about football',
        /fault on our side/.test(body),
        'the distinction is stated');

    step(4, 'the empty database really was empty, so this measured the fault');
    /**
     * Guards the whole check against its own success. If the server had found
     * a real database the pages would render normally and every assertion
     * above would pass for the wrong reason.
     */
    const dbPath = path.join(dir, 'dynasty_scout.db');
    assert('SQLite created a file where the app looked', existsSync(dbPath), dbPath);
}

stop();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'every step passed'}`);
process.exit(fails.length ? 1 : 0);
