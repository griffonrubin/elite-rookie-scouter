/**
 * Run the backtest and store what it found.
 *
 * The start/sit page publishes a floor, a ceiling and a chance of winning,
 * and a reader has no way to judge any of it without knowing how often those
 * ranges have contained the answer. The measurement takes nine thousand model
 * runs and half a minute, so it is computed here and read from the table —
 * the same arrangement as the historical spread table behind Pick'ems.
 *
 * Safe to run repeatedly: it creates the table if missing and upserts by
 * slice. Re-run it whenever a season of game logs lands or the model's shape
 * changes, because a stored accuracy claim about an older model is worse than
 * none at all.
 *
 *   npx tsx scripts/build_model_calibration.mts
 */
import { checkpoint, getDb, query } from '../lib/db';
import { buildOutcome, type GameLog } from '../lib/startSit';
import { bandFor, type CalibrationRow } from '../lib/modelCalibration';

/** Four games, which is where the model starts using a player's own shape. */
const MIN_HISTORY = 4;
const SEASONS = [2024, 2025];

/**
 * The definition, beside the code that fills it.
 *
 * `slice` is the primary key and it is text — 'all', 'QB', '4-5' — so a row
 * for a new cut can be added without a migration, and a re-run replaces a
 * slice rather than accumulating copies of it.
 */
const DDL = `
  CREATE TABLE IF NOT EXISTS model_calibration (
    slice       TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    weeks       INTEGER NOT NULL,
    inside      INTEGER NOT NULL,
    below       INTEGER NOT NULL,
    above       INTEGER NOT NULL,
    from_season INTEGER,
    to_season   INTEGER,
    updated_at  TEXT
  )
`;

const db = getDb();
await db.prepare(DDL).run();

const rows = await query<{
    player_id: number; position: string; season: number; week: number; points: number;
}>(`SELECT w.player_id, w.position, w.season, w.week,
           w.fantasy_points_ppr AS points
      FROM nfl_player_week w
     WHERE w.season_type = 'REG' AND w.season IN (${SEASONS.join(',')})
       AND w.position IN ('QB','RB','WR','TE')
     ORDER BY w.player_id, w.season, w.week`, []);

const byPlayer = new Map<number, typeof rows>();
for (const r of rows) {
    const at = byPlayer.get(r.player_id);
    if (at) at.push(r); else byPlayer.set(r.player_id, [r]);
}

interface Tally { weeks: number; inside: number; below: number; above: number }
const blank = (): Tally => ({ weeks: 0, inside: 0, below: 0, above: 0 });
const tallies = new Map<string, { kind: CalibrationRow['kind']; t: Tally }>();
const add = (slice: string, kind: CalibrationRow['kind'],
             inside: boolean, below: boolean) => {
    const at = tallies.get(slice) ?? { kind, t: blank() };
    at.t.weeks++;
    if (inside) at.t.inside++;
    else if (below) at.t.below++;
    else at.t.above++;
    tallies.set(slice, at);
};

let run = 0;
for (const [playerId, games] of byPlayer) {
    for (let i = MIN_HISTORY; i < games.length; i++) {
        const target = games[i];
        // Strictly before: the model may know nothing the page would not have
        // known on the Saturday.
        const logs: GameLog[] = games.slice(0, i).map(g => ({
            season: g.season, week: g.week, points: g.points,
        } as GameLog));
        const o = buildOutcome({
            playerId, position: target.position, logs, seasonProjection: null,
        }, target.season);
        if (!Number.isFinite(o.mean) || o.ceiling <= o.floor) continue;
        run++;
        const inside = target.points >= o.floor && target.points <= o.ceiling;
        const below = target.points < o.floor;
        add('all', 'overall', inside, below);
        add(target.position, 'position', inside, below);
        const band = bandFor(i);
        if (band) add(band, 'history', inside, below);
    }
}

const now = new Date().toISOString().slice(0, 19);
let written = 0;
for (const [slice, { kind, t }] of tallies) {
    // The parameters go to run, not to prepare. Handed to prepare they are
    // silently ignored and every column binds null, which surfaces as a NOT
    // NULL failure on whichever column happens to be declared first.
    await db.prepare(
        `INSERT INTO model_calibration
           (slice, kind, weeks, inside, below, above, from_season, to_season, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (slice) DO UPDATE SET
           kind = excluded.kind, weeks = excluded.weeks, inside = excluded.inside,
           below = excluded.below, above = excluded.above,
           from_season = excluded.from_season, to_season = excluded.to_season,
           updated_at = excluded.updated_at`
    ).run([slice, kind, t.weeks, t.inside, t.below, t.above,
           SEASONS[0], SEASONS[SEASONS.length - 1], now]);
    written++;
}

console.log(`${run.toLocaleString()} backtested weeks, ${written} slices written\n`);
const back = await query<CalibrationRow>(
    `SELECT * FROM model_calibration ORDER BY kind, slice`, []);
for (const r of back) {
    const cov = r.weeks > 0 ? (r.inside / r.weeks) * 100 : 0;
    console.log(`  ${r.kind.padEnd(8)} ${r.slice.padEnd(6)} `
        + `${String(r.weeks).padStart(5)} weeks  ${cov.toFixed(1)}% inside  `
        + `(${(100 * r.below / r.weeks).toFixed(1)}% low, `
        + `${(100 * r.above / r.weeks).toFixed(1)}% high)`);
}

// Otherwise the whole table lives in the ignored write-ahead log.
checkpoint();
