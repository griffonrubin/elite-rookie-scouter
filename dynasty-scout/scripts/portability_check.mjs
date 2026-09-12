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
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Absolute filesystem paths only. A README that says to visit localhost:3000
// is telling the truth, and a check that flags it gets ignored along with the
// one finding that mattered.
const BAD = [
    [/\/home\/[a-z][a-z0-9_-]*\//, 'an absolute path into somebody’s home directory'],
    [/\/Users\/[A-Za-z]/, 'an absolute macOS home path'],
    [/\/tmp\/claude-/, 'a path into the agent scratch directory'],
];

const files = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .filter(f => /\.(ts|tsx|mts|mjs|js|json|py|sql|md)$/.test(f));

let bad = 0;
for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const [re, why] of BAD) {
        const line = text.split('\n').findIndex(l => re.test(l));
        if (line >= 0) {
            console.log(`  FAIL ${f}:${line + 1}  ${why}`);
            console.log(`       ${text.split('\n')[line].trim().slice(0, 100)}`);
            bad++;
        }
    }
}

console.log(bad
    ? `\n${bad} portability problem${bad > 1 ? 's' : ''} — these build here and nowhere else`
    : `nothing machine-specific in ${files.length} tracked files`);
process.exit(bad ? 1 : 0);
