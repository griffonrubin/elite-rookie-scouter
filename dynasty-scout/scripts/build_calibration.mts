/**
 * Create and fill the spread-calibration table.
 *
 * The table had no definition anywhere in the repository. It was created by
 * hand at some point and filled by the daily pass, which means a fresh
 * clone could build the app, run every check, and only discover the gap when
 * Pick'ems returned a five hundred — which is how it was found.
 *
 * So the shape lives here now, beside the code that fills it, and this
 * script is safe to run repeatedly: it creates the table if it is missing
 * and upserts by bucket.
 *
 *   npx tsx scripts/build_calibration.mts
 */
import { getDb, query } from '../lib/db';
import { buildCalibration, writeCalibration } from '../lib/vegasLines';

const GAMES_URL =
    'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

/**
 * Parsed the same way the loader does, rather than with a CSV library.
 *
 * nfldata has no embedded commas in the columns this reads, and a second
 * parser is a second thing to keep in step with the first.
 */
function parseCsv(text: string): Record<string, string>[] {
    const lines = text.trim().split('\n');
    const head = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const cells = line.split(',');
        const row: Record<string, string> = {};
        head.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
        return row;
    });
}

/**
 * The definition, written down where the rest of the schema can find it.
 *
 * `bucket` is the primary key because the writer upserts on it — one row per
 * spread band, rewritten whenever the history is recounted. It is REAL and
 * not INTEGER: the key is the band's lower bound, and half-point spreads are
 * the entire reason the bands exist, so three and a half is a bucket name.
 * Declared INTEGER it is a rowid alias and SQLite refuses the row outright.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS vegas_spread_calibration (
    bucket      REAL PRIMARY KEY,
    label       TEXT    NOT NULL,
    games       INTEGER NOT NULL,
    fav_wins    INTEGER NOT NULL,
    ties        INTEGER NOT NULL,
    fav_covers  INTEGER NOT NULL,
    pushes      INTEGER NOT NULL,
    overs       INTEGER NOT NULL,
    totalled    INTEGER NOT NULL,
    from_season INTEGER,
    to_season   INTEGER,
    updated_at  TEXT
)`;

getDb().prepare(DDL).run([]);
console.log('vegas_spread_calibration ready');

const res = await fetch(GAMES_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DyCharts/1.0)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
});
if (!res.ok) {
    console.error(`games.csv: ${res.status}`);
    process.exit(1);
}
const games = parseCsv(await res.text());
console.log(`${games.length.toLocaleString()} games downloaded`);

const rows = buildCalibration(games);
const written = await writeCalibration(rows);
console.log(`${written} buckets written`);

const back = await query<{
    label: string; games: number; fav_wins: number; ties: number;
    fav_covers: number; pushes: number; from_season: number; to_season: number;
}>('SELECT * FROM vegas_spread_calibration ORDER BY bucket');
let total = 0;
for (const r of back) {
    total += r.games;
    const win = (r.fav_wins / (r.games - r.ties)) * 100;
    const cover = (r.fav_covers / (r.games - r.pushes)) * 100;
    console.log(`  ${r.label.padEnd(8)} ${String(r.games).padStart(5)} games  `
        + `won ${win.toFixed(1)}%  covered ${cover.toFixed(1)}%`);
}
console.log(`${total.toLocaleString()} games, `
    + `${back[0]?.from_season}–${back[0]?.to_season}`);
