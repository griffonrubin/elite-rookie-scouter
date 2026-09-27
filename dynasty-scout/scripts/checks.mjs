/**
 * Run the checks. All of them.
 *
 * There are fifty-odd check scripts in here and, until this existed, no way
 * to run them — so what got run was whichever subset somebody remembered.
 * That is not a discipline problem, it is a missing tool: a check nobody can
 * invoke is a check that rots, and one of them sat red through two merges
 * because the suite being rerun was the browser half and it was in the other.
 *
 * So the list is discovered rather than written down. A new `*_check` file is
 * in the suite the moment it is saved, without anybody remembering to add it
 * here — which is the only version of this that stays true.
 *
 *   node scripts/checks.mjs              every check
 *   node scripts/checks.mjs --unit       the ones that need nothing
 *   node scripts/checks.mjs --browser    the ones that drive a real page
 *   node scripts/checks.mjs trade pick   only checks whose name matches
 *
 * Browser checks need the built app already serving on BASE (default
 * localhost:3090), because they are checking what a reader sees and `next
 * dev` is not that. The runner says so rather than failing twenty times over.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:3090';

const args = process.argv.slice(2);
const want = new Set(args.filter(a => !a.startsWith('--')));
const only = args.includes('--unit') ? 'unit'
    : args.includes('--browser') ? 'browser' : null;

/**
 * Every check, and what each one needs before it can mean anything.
 *
 * Read out of the file rather than inferred from its extension. The repo
 * mostly writes browser checks as .mjs and unit checks as .mts, and "mostly"
 * is not something to route on — the first version of this did route on a
 * playwright import, which filed `serve_check` as needing nothing because it
 * asks the server for every route with plain `fetch`. It then failed on all
 * thirty-three routes at once, which looks exactly like a broken app.
 *
 * So the test is the shared address itself. A check that names the default
 * port, or reads BASE from the environment, is talking to the server this
 * runner expects to be up. `degrade_check` builds its own address from its
 * own port and starts its own server, so it is correctly not one of those —
 * but it does need a build to link in, which is the third precondition.
 */
const checks = readdirSync(HERE)
    .filter(f => /_check\.(mjs|mts|ts)$/.test(f))
    .sort()
    .map(file => {
        const src = readFileSync(path.join(HERE, file), 'utf8');
        return {
            file,
            browser: /playwright/.test(src),
            server: /playwright/.test(src) || /localhost:3090/.test(src)
                || /process\.env\.BASE/.test(src),
            build: /'\.next'|"\.next"/.test(src),
        };
    })
    .filter(c => (only == null || (only === 'browser') === c.server))
    .filter(c => want.size === 0 || [...want].some(w => c.file.includes(w)));

if (checks.length === 0) {
    console.error('No checks matched.');
    process.exit(1);
}

/*
 * The two tools the suite needs but the manifest does not ask for.
 *
 * `tsx` runs the TypeScript checks and `playwright-core` drives the browser
 * ones, and neither is a declared dependency — so any `npm install` prunes
 * them and the whole suite starts failing with module-resolution errors that
 * look nothing like a broken check. That happened while this runner was being
 * written: sixteen checks went red at once and the cause was an empty
 * `node_modules`, not one line of product code.
 *
 * Reported once, up front, with the command that fixes it. Without this they
 * are rediscovered thirty times over, and `npx` quietly refetches `tsx` from
 * the registry on every single check, which turns a one-minute run into a
 * long one.
 */
const missing = [
    checks.some(c => !c.file.endsWith('.mjs')) && 'tsx',
    checks.some(c => c.browser) && 'playwright-core',
].filter(Boolean).filter(m => !existsSync(path.join(HERE, '..', 'node_modules', m)));
if (missing.length) {
    console.error(`Missing from node_modules: ${missing.join(', ')}.\n`
        + `  npm install --no-save ${missing.join(' ')} `
        + '&& git checkout -- package-lock.json\n'
        + 'Neither is a declared dependency, so an install prunes them and '
        + 'every check that needs one fails on module resolution rather than '
        + 'on anything it was written to check.');
    process.exit(1);
}

/*
 * A build, for the checks that serve one.
 *
 * `degrade_check` links `.next` into an empty directory to prove the pages
 * admit it when the database is missing, rather than rendering an empty list
 * that looks like a real answer. Without a build it reports that its server
 * never listened, which reads as a product failure and is not one.
 */
if (checks.some(c => c.build) && !existsSync(path.join(HERE, '..', '.next'))) {
    console.error('No .next build, and a check here serves one.\n'
        + '  npm run build');
    process.exit(1);
}

const needsPage = checks.some(c => c.server);
if (needsPage) {
    // Asked once, here, instead of each browser check timing out on its own.
    let up = false;
    try {
        const r = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
        up = r.ok;
    } catch { up = false; }
    if (!up) {
        console.error(`Nothing is serving ${BASE}, and `
            + `${checks.filter(c => c.server).length} of these checks need a `
            + 'served page.\n'
            + '  npm run build && npx next start -p 3090\n'
            + 'Or run only the checks that need nothing: '
            + 'node scripts/checks.mjs --unit');
        process.exit(1);
    }
}

const run = file => new Promise(resolve => {
    // TypeScript goes through tsx; plain .mjs runs on node directly.
    const [cmd, argv] = file.endsWith('.mjs')
        ? ['node', [`scripts/${file}`]]
        : ['npx', ['tsx', `scripts/${file}`]];
    const p = spawn(cmd, argv, { cwd: path.join(HERE, '..'), shell: false });
    const chunks = [];
    p.stdout.on('data', d => chunks.push(d));
    p.stderr.on('data', d => chunks.push(d));
    p.on('close', code => resolve({ code, out: Buffer.concat(chunks).toString() }));
});

const failed = [];
const started = Date.now();
for (const c of checks) {
    const t0 = Date.now();
    const { code, out } = await run(c.file);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const name = c.file.replace(/_check\.(mjs|mts|ts)$/, '');
    if (code === 0) {
        console.log(`  ok    ${name.padEnd(20)} ${secs}s`);
    } else {
        failed.push({ name, out });
        console.log(`  FAIL  ${name.padEnd(20)} ${secs}s  (exit ${code})`);
        // The failing assertions, not the whole transcript: a run of fifty
        // checks whose output is fifty full logs is one nobody reads.
        const lines = out.split('\n')
            .filter(l => /FAIL|Error|error TS/.test(l)).slice(0, 6);
        for (const l of lines) console.log(`          ${l.trim()}`);
    }
}

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n${checks.length - failed.length}/${checks.length} passed in ${mins}m`);
if (failed.length) {
    console.log(`failed: ${failed.map(f => f.name).join(', ')}`);
}
process.exit(failed.length ? 1 : 0);
