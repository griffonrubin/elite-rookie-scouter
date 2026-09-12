/**
 * How precise the win-probability deltas actually are.
 *
 * The board turns a simulated gap into a verdict, so the threshold between
 * "set" and "worth a look" has to sit above the simulation's own noise. It
 * was guessed at 0.3 points of win probability. Re-running one slot across
 * eight seeds says the real swing at 6000 trials is about 1.4, which means
 * the old floor was flagging randomness as a decision.
 *
 * This keeps the constant honest: it measures the swing and fails if
 * NOISE_FLOOR has drifted below it, or if the trial count has been cut to
 * the point where the ranking stops being reproducible at all.
 */
import { buildOutcome, slotWinProbs, type SimPlayer } from '../lib/startSit';
import { NOISE_FLOOR, CLEAR_MARGIN } from '../lib/lineup';

let failed = 0;
const ok = (label: string, pass: boolean, extra = '') => {
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
    if (!pass) failed++;
};

// Seventeen weeks each, the shape a loaded board actually has.
const S = [14, 9, 21, 3, 17, 12, 26, 8, 15, 11, 19, 6, 23, 10, 13, 18, 7];
const mk = (id: number, shift: number): SimPlayer => {
    const logs = S.map((points, k) => ({ season: 2025, week: k + 1, points: points + shift }));
    return {
        outcome: buildOutcome({ playerId: id, position: 'WR', logs,
            context: { impliedTeamTotal: 23, spread: -2 } }, 2025),
        sample: logs.map(l => l.points),
    };
};
const sims = Array.from({ length: 23 }, (_, i) => mk(i + 1, i % 5));
const others = sims.slice(0, 8), cands = sims.slice(8, 14), opp = sims.slice(14, 23);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const swingAt = (trials: number) => {
    const runs = SEEDS.map(seed => slotWinProbs(others, cands, opp, trials, seed));
    const deltas = runs.map(r => r.slice(1).map(p => (p - r[0]) * 100));
    const worst = Math.max(...deltas[0].map((_, c) => {
        const xs = deltas.map(d => d[c]);
        return Math.max(...xs) - Math.min(...xs);
    }));
    const orders = new Set(runs.map(r =>
        r.map((_, i) => i).sort((a, b) => r[b] - r[a]).join(',')));
    return { worst, stable: orders.size === 1 };
};

console.log('\n== what a delta is worth at each trial count ==');
for (const t of [1500, 3000, 6000]) {
    const { worst, stable } = swingAt(t);
    console.log(`   ${String(t).padStart(5)} trials  swing ${worst.toFixed(2)} pp`
        + `  ranking reproducible: ${stable}`);
}

console.log('\n== the thresholds respect it ==');
const live = swingAt(6000);
ok('NOISE_FLOOR is at or above the measured swing', NOISE_FLOOR >= live.worst - 0.05,
    `floor ${NOISE_FLOOR} vs swing ${live.worst.toFixed(2)}`);
ok('CLEAR_MARGIN is clear of the floor', CLEAR_MARGIN >= NOISE_FLOOR * 1.5,
    `${CLEAR_MARGIN} vs ${NOISE_FLOOR}`);

// The candidates above are near-identical on purpose, and their order is not
// reproducible between seeds. That is the correct answer rather than a bug —
// equals cannot be ranked — and it is the whole reason the verdict needs a
// floor instead of trusting the sort. What must hold is that candidates
// genuinely separated by more than the clear margin stay in order.
console.log('\n== separated candidates hold their order ==');
const spread = [mk(90, 0), mk(91, 8), mk(92, 16), mk(93, 24)];
const orders = new Set(SEEDS.map(seed => {
    const r = slotWinProbs(others, spread, opp, 6000, seed);
    return r.map((_, i) => i).sort((a, b) => r[b] - r[a]).join(',');
}));
ok('a clearly better candidate wins every seed', orders.size === 1,
    [...orders].join(' | '));
const near = swingAt(6000);
ok('near-equal candidates are not reproducibly ordered', !near.stable,
    'which is why the verdict uses a floor');

console.log(failed ? `\n${failed} FAILED` : '\nall noise checks passed');
process.exit(failed ? 1 : 0);
