/**
 * Nothing in the repo may depend on this machine.
 *
 * A benchmark got copied out of a scratch directory into scripts/ with its
 * imports still absolute — `/home/user/.../lib/startSit`. It typechecked and
 * built cleanly here, because the path exists here, and then failed all three
 * Vercel builds. A local build can never catch that class of mistake: the
 * thing that makes it wrong is the thing that makes it work locally.
 *
 * So grep for it instead. Cheap, and it only has to catch this once.
 *
 * The second half is the same mistake wearing different clothes, and it
 * cost all three Vercel builds again. A `.mts` check imported
 * `playwright-core`, which was in this machine's node_modules as a stray
 * from some earlier session and in neither package.json nor the lockfile.
 * Everything passed here — typecheck, build, the check itself — because
 * the module was present here and nowhere else. tsconfig typechecks
 * `**\/*.mts`, so `next build` resolves those imports too, and a missing
 * one fails the build rather than the script.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

// Absolute filesystem paths only. A README that says to visit localhost:3000
// is telling the truth, and a check that flags it gets ignored along with the
// one finding that mattered.
const BAD = [
    [/\/home\/[a-z][a-z0-9_-]*\//, 'an absolute path into somebody’s home directory'],
    [/\/Users\/[A-Za-z]/, 'an absolute macOS home path'],
    [/\/tmp\/claude-/, 'a path into the agent scratch directory'],
];

const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n');
const files = tracked
    .filter(f => /\.(ts|tsx|mts|mjs|js|json|py|sql|md)$/.test(f));

let bad = 0;
for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const [re, why] of BAD) {
        // A path in prose is documentation — this file's own comment quotes
        // the import that broke the build — while a path in code is the bug.
        // Comment and markdown lines are described, not executed.
        const isProse = (l) => /^\s*(\*|\/\/|#|--|>)/.test(l);
        const line = text.split('\n')
            .findIndex(l => re.test(l) && !isProse(l));
        if (line >= 0) {
            console.log(`  FAIL ${f}:${line + 1}  ${why}`);
            console.log(`       ${text.split('\n')[line].trim().slice(0, 100)}`);
            bad++;
        }
    }
}

/**
 * Every package a typechecked file imports has to be one a clean checkout
 * installs.
 *
 * Only the files `next build` typechecks are examined — tsconfig's
 * `**\/*.mts` is why a check script can fail an app build at all. A
 * browser check written as `.mjs` is outside that net and may import
 * Playwright, which is the arrangement the rest of scripts/ uses on
 * purpose.
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
]);
const BUILTIN = new Set(builtinModules);
/** `@scope/name/sub` and `name/sub` both resolve to their package. */
const packageOf = (spec) => {
    const parts = spec.split('/');
    return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

/**
 * Everything tsconfig typechecks — `**\/*.ts`, `**\/*.tsx`, `**\/*.mts` —
 * because that is the same net `next build` resolves imports through, so an
 * undeclared package in any of them fails the build and not just a script.
 *
 * `.mjs` stays outside, deliberately. A browser check written as `.mjs` may
 * import Playwright, which is undeclared on purpose; tsconfig never looks at
 * those files, so the app build never tries to resolve them.
 *
 * This was scripts/-only for a while, because `components/ui/hover-card.tsx`
 * imported `@radix-ui/react-hover-card` — undeclared, and resolving only
 * because npm hoists it out of the `radix-ui` umbrella. A clean checkout did
 * build, so failing it here would have been a check telling a lie to make a
 * point. That import now goes through the umbrella like every other
 * `components/ui/*` file, so app code passes on its own merits and the scope
 * can finally include it.
 */
const typechecked = files.filter(f => /\.(ts|tsx|mts)$/.test(f));
let undeclared = 0;
for (const f of typechecked) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const specs = new Set();
    // Anchored to a statement at the start of a line, because "choose from
    // 'available'" in a comment is prose and the first draft of this check
    // reported four of those and one real finding.
    //
    // The clause between `import` and `from` spans newlines, because most of
    // the app's imports are multi-line and the same-line-only version of this
    // pattern read every component in the repo without once seeing `recharts`
    // or `@dnd-kit/core`. Widening the scope without widening this would have
    // been the more expensive mistake: a check that passes because it is not
    // looking. The clause admits only the characters an import clause is made
    // of — no slash, so a `//` comment between the braces ends the match
    // rather than being swallowed into it.
    for (const m of text.matchAll(
        /^[ \t]*(?:import|export)\b[A-Za-z0-9_$*,{}\s]*?\bfrom\s*['"]([^'"\n]+)['"]/gm)) specs.add(m[1]);
    for (const m of text.matchAll(
        /^\s*import\s*['"]([^'"\n]+)['"]/gm)) specs.add(m[1]);
    for (const m of text.matchAll(
        /\bawait\s+import\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)) specs.add(m[1]);
    // lib/db.ts picks its driver at runtime and loads it through require().
    for (const m of text.matchAll(
        /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)) specs.add(m[1]);
    for (const spec of specs) {
        if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('/')) continue;
        const name = packageOf(spec.replace(/^node:/, ''));
        if (BUILTIN.has(name) || declared.has(name)) continue;
        console.log(`  FAIL ${f}  imports '${spec}', which package.json does not list`);
        console.log('       it resolves here by hoisting and on no clean checkout — declare it, '
            + 'import it from a package that is declared, or, for a check script, '
            + 'move the file to .mjs');
        undeclared++;
    }
}

const total = bad + undeclared;
console.log(total
    ? `\n${total} portability problem${total > 1 ? 's' : ''} — these build here and nowhere else`
    : `nothing machine-specific in ${files.length} tracked files, and every package `
      + `${typechecked.length} typechecked files import is one a clean checkout installs`);
process.exit(total ? 1 : 0);
