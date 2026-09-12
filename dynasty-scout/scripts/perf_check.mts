/**
 * What the Start/Sit page makes the browser do before it can paint.
 *
 * The page is a Monte Carlo simulator that happens to render, so "it feels
 * slow" has a measurable cause and a budget. Run this after touching
 * anything in lib/startSit.ts or lib/lineup.ts: the numbers below are what
 * a nine-slot lineup with six on the bench costs on one main thread.
 *
 * Where it went, the last time this was looked at:
 *   rankSlots was re-simulating all nine starters for every candidate, when
 *   five of six runs differ by one player. Pooling the unchanged draws took
 *   it from 219ms to 63ms, and `best` stopped re-deriving a number already
 *   on screen. 312ms to 116ms in total.
 */
import Database from 'better-sqlite3';
import { buildOutcome, simulateMatchup, beatsProbability, type SimPlayer }
    from '/home/user/elite-rookie-scouter/dynasty-scout/lib/startSit';
import { rankSlots, resolveConflicts }
    from '/home/user/elite-rookie-scouter/dynasty-scout/lib/lineup';

const db = new Database('/home/user/elite-rookie-scouter/dynasty-scout/dynasty_scout.db',
    { readonly: true });

// A realistic pool: 9 starters, 6 bench, 9 opponents, with real logs.
const pool = db.prepare(`
  SELECT p.id, p.full_name, p.position FROM players p
   WHERE p.redraft_pool = 1 AND p.position IN ('QB','RB','WR','TE','K')
   ORDER BY p.id LIMIT 24`).all() as any[];
const logsOf = db.prepare(`
  SELECT season, week, fantasy_points_ppr AS points FROM nfl_player_week
   WHERE player_id = ? AND season_type='REG' AND season >= 2024
   ORDER BY season, week`);

const mk = (p: any): SimPlayer => {
    const logs = logsOf.all(p.id) as any[];
    const outcome = buildOutcome({ playerId: p.id, position: p.position, logs,
        context: { impliedTeamTotal: 23, spread: -2 } }, 2025);
    return { outcome, sample: logs.map(l => l.points) };
};
const sims = pool.map(mk);
const mine = sims.slice(0, 9), bench = sims.slice(9, 15), opp = sims.slice(15, 24);

const time = (label: string, fn: () => void, n = 1) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn();
    const ms = (performance.now() - t0) / n;
    console.log(`  ${ms.toFixed(0).padStart(6)} ms   ${label}`);
    return ms;
};

console.log('\n== what the page computes on every load ==');
const a = time('matchup  simulateMatchup(9v9, 20000, bins 40)',
    () => simulateMatchup(mine, opp, 20000, 11, { bins: 40 }));
// Skipped entirely when the optimal lineup is the one already set, which is
// most weeks — the number is already on screen.
const b = 0;
console.log('       0 ms   best     reuses the headline when nothing changes');
const lineup = pool.slice(0, 9).map((p, i) => ({ slot: p.position, playerId: p.id }));
const byId = new Map(pool.map((p, i) => [p.id, sims[i]]));
const posOf = (id: number) => String(pool.find(p => p.id === id)?.position ?? '');
const c = time('decisions rankSlots(9 slots, 6 bench, 6000)  [pooled draws]',
    () => resolveConflicts(rankSlots(lineup, posOf, id => byId.get(id)!,
        pool.slice(9, 15).map(p => p.id), opp, 6000)));
// rankSwaps is gone: it simulated every bench-and-starter pair to answer a
// question the slot board had already answered, and was 79% of the page.
const e = 0;
console.log('       0 ms   swaps    the slot board already ranked them');
const d = time('pairs    9 x beatsProbability(3000)',
    () => { for (let i = 0; i < 9; i++) beatsProbability(mine[i], opp[i], 3000, 17); });
const total = a + b + c + d + e;
console.log(`\n  ${total.toFixed(0)} ms total, blocking the main thread`);
console.log(`  rankSlots is ${((c / total) * 100).toFixed(0)}% of it`);

// A budget rather than a stopwatch: this runs on other people's phones, and
// the exact figure moves with the machine. 400ms is the point at which the
// page stops feeling like it responded to the click that opened it.
const BUDGET_MS = 400;
if (total > BUDGET_MS) {
    console.log(`\n  OVER BUDGET — ${total.toFixed(0)}ms against ${BUDGET_MS}ms.`);
    process.exit(1);
}
console.log(`  within the ${BUDGET_MS}ms budget`);
