/**
 * Everything the app queries has to be in the file, not in the log beside it.
 *
 * SQLite runs in WAL mode here, so a write lands in dynasty_scout.db-wal and
 * not in dynasty_scout.db. Readers on this machine see straight through the
 * pair and cannot tell the difference; git sees only the main file, and
 * .gitignore drops the sidecar. The failure that follows is silent in the
 * worst way — `git status` clean, every page working, every check passing,
 * and a fresh clone missing a table. The historical spread table lived that
 * way through two commits before anyone noticed, and the thing that finally
 * noticed was a five hundred on a page nobody had touched.
 *
 * So this reads the database the way a clone would: the main file copied
 * alone, no sidecar, nothing to fall through to. The table list is not
 * maintained by hand — it is every name the routes and libraries select
 * from, narrowed to the ones the live database agrees are real tables, which
 * throws out common table expressions and aliases without needing to parse
 * SQL. A table added to a route next month is covered the day it is added.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const fails: string[] = [];
const assert = (label: string, pass: boolean, extra = '') => {
    console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) fails.push(label);
};
const step = (n: number | string, s: string) => console.log(`\n── ${n}. ${s}`);

const ROOT = process.cwd();
/**
 * The real database by default; a fixture when one is named, which is how
 * the negative case gets tested — a copy with a table hidden in its log is
 * the only way to watch this fail on purpose.
 */
const LIVE = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(ROOT, 'dynasty_scout.db');

step(1, 'the sidecar is empty, so the file is the whole database');
/**
 * A checkpointed log is thirty-two bytes of header or nothing at all. Any
 * frame past that is a write the file does not have and a clone will not
 * get — which is the entire failure this guards.
 */
const walPath = `${LIVE}-wal`;
const walSize = existsSync(walPath) ? statSync(walPath).size : 0;
assert(`no unflushed frames in ${path.basename(LIVE)}-wal`, walSize <= 32,
    walSize ? `${walSize.toLocaleString()} bytes` : 'absent');
if (walSize > 32) {
    console.log('        run checkpoint() from lib/db, or close every reader and re-run');
}

step(2, 'every table the code reads from');
/** Walk the source rather than keep a list that goes stale. */
const sources: string[] = [];
const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|mts)$/.test(entry.name)) sources.push(full);
    }
};
for (const dir of ['app', 'lib', 'scripts']) {
    const full = path.join(ROOT, dir);
    if (existsSync(full)) walk(full);
}

const named = new Set<string>();
for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
        named.add(m[1].toLowerCase());
    }
}

const live = new Database(LIVE, { readonly: true });
const liveTables = new Set(live.prepare(
    `SELECT name FROM sqlite_master WHERE type IN ('table','view')`
).all().map((r: any) => String(r.name).toLowerCase()));
live.close();

/** Names the live database calls tables: everything else was a CTE. */
const wanted = [...named].filter(t => liveTables.has(t)).sort();
assert('the source names tables the database has', wanted.length >= 10,
    `${wanted.length} of ${named.size} names`);

step(3, 'and a copy of the file alone has every one of them');
// Outside the repository, so a check never leaves a sixteen megabyte copy
// of the database where git can see it.
const scratch = mkdtempSync(path.join(os.tmpdir(), 'wal-check-'));
const alone = path.join(scratch, 'alone.db');
copyFileSync(LIVE, alone);      // the main file only — no -wal, no -shm

const copy = new Database(alone, { readonly: true });
const present = new Set(copy.prepare(
    `SELECT name FROM sqlite_master WHERE type IN ('table','view')`
).all().map((r: any) => String(r.name).toLowerCase()));

const missing = wanted.filter(t => !present.has(t));
assert('no table is left behind in the log', missing.length === 0,
    missing.length ? missing.join(', ') : `${wanted.length} tables`);

/**
 * Present but empty is the other half of the same mistake: a CREATE TABLE
 * that reached the file while its rows stayed in the log. Only flagged, not
 * failed — some of these are genuinely empty out of season.
 */
const empty: string[] = [];
for (const t of wanted) {
    if (!present.has(t)) continue;
    const n = (copy.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as any).n as number;
    if (n === 0) empty.push(t);
}
copy.close();
rmSync(scratch, { recursive: true, force: true });
console.log(`        ${wanted.length - empty.length} of ${wanted.length} carry rows`
    + (empty.length ? `; empty: ${empty.join(', ')}` : ''));

console.log(`\n${fails.length ? `FAILED: ${fails.join('; ')}` : 'all good'}`);
process.exit(fails.length ? 1 : 0);
