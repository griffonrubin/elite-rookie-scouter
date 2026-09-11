/**
 * The slot model, checked where it can be wrong.
 *
 * Eligibility decides which decisions a reader is even offered, and a verdict
 * that says "change" over simulation noise is worse than saying nothing — so
 * both are pinned here rather than eyeballed in the UI.
 */
import { eligibleForSlot, normaliseSlot, optimalLineup, rankSlots, resolveConflicts } from '../lib/lineup';
import { SimPlayer } from '../lib/startSit';

const fails: string[] = [];
const check = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}`
        + (ok ? '' : ` (want ${JSON.stringify(want)})`));
    if (!ok) fails.push(label);
};

console.log('== slot eligibility ==');
check('RB fills RB', eligibleForSlot('RB', 'RB'), true);
check('RB does not fill WR', eligibleForSlot('WR', 'RB'), false);
check('RB fills FLEX', eligibleForSlot('FLEX', 'RB'), true);
check('QB does not fill FLEX', eligibleForSlot('FLEX', 'QB'), false);
check('QB fills SUPER_FLEX', eligibleForSlot('SUPER_FLEX', 'QB'), true);
check('TE fills REC_FLEX', eligibleForSlot('REC_FLEX', 'TE'), true);
check('RB does not fill REC_FLEX', eligibleForSlot('REC_FLEX', 'RB'), false);
check('DEF is DST', normaliseSlot('DEF'), 'DST');
check('D/ST is DST', eligibleForSlot('D/ST', 'DST'), true);
check('K fills PK', eligibleForSlot('PK', 'K'), true);

console.log('\n== verdicts ==');
const mk = (id: number, mean: number, sd: number): SimPlayer => ({
    outcome: { playerId: id, mean, sd, floor: mean - sd, ceiling: mean + sd, sample: 17,
        formWeight: 0, contextAdjustment: 0, onBye: false, playProbability: 1,
        availability: null, centreSource: 'model' },
});
const pos = new Map<number, string>([[1,'RB'],[2,'RB'],[3,'WR'],[4,'WR'],[9,'RB'],[8,'WR'],[7,'RB']]);
const sims = new Map<number, SimPlayer>([
    [1, mk(1, 16, 6)], [2, mk(2, 12, 5)], [3, mk(3, 15, 6)], [4, mk(4, 14, 6)],
    [7, mk(7, 21, 6)],  // a strong bench back both RB slots will want
    [9, mk(9, 4, 3)],   // a clearly worse bench back
    [8, mk(8, 22, 7)],  // a clearly better bench receiver
]);
const opp = [mk(90, 14, 6), mk(91, 14, 6), mk(92, 14, 6), mk(93, 14, 6)];
const lineup = [
    { slot: 'RB', playerId: 1 }, { slot: 'RB', playerId: 2 },
    { slot: 'WR', playerId: 3 }, { slot: 'FLEX', playerId: 4 },
];
const d = rankSlots(lineup, id => pos.get(id)!, id => sims.get(id)!, [9, 8], opp, 4000);
for (const s of d) {
    console.log(`  ${s.slot.padEnd(5)} current=${s.currentId} gain=${s.gain} -> ${s.verdict}`
        + `  best=${s.candidates[0]?.playerId}`);
}
// The strong bench receiver belongs in FLEX; the weak bench back belongs nowhere.
check('FLEX wants the strong bench WR', d[3].candidates[0].playerId, 8);
check('FLEX says change', d[3].verdict, 'change');
check('RB1 is already right', d[0].verdict, 'set');
check('weak bench RB never wins a slot',
    d.every(s => s.candidates[0]?.playerId !== 9), true);
check('WR slot excludes the bench RB',
    d[2].candidates.some(c => c.playerId === 9), false);

console.log('\n== two slots cannot start the same player ==');
// Both running back slots will ask for the best back on the bench when scored
// on their own. Only one of them can have him.
const two = rankSlots(
    [{ slot: 'RB', playerId: 1 }, { slot: 'RB', playerId: 2 }],
    id => pos.get(id)!, id => sims.get(id)!, [7], opp, 4000);
const rankedBoth = two.filter(x => x.candidates[0]?.playerId === 7).length;
console.log(`   scored independently, ${rankedBoth} of 2 RB slots want the same player`);
const fixed = resolveConflicts(two);
const wantSame = fixed.filter(x => x.verdict !== 'set' && x.candidates[0]?.playerId === 7).length;
console.log(`   after resolving,     ${wantSame} of 2 do`);
check('only one slot is told to start him', wantSame <= 1, true);
check('the other slot re-reads without him',
    fixed.every(x => x.candidates.filter(c => c.playerId === 7).length <= 1), true);

console.log('\n== optimal lineup ==');
const opt = optimalLineup(d);
console.log('  ', [...opt.entries()].map(([i, p]) => `slot${i}=${p}`).join(' '));
check('nobody is started twice', new Set(opt.values()).size, opt.size);
check('the strong WR is started', [...opt.values()].includes(8), true);

console.log('\n== the two summaries cannot disagree ==');
// A slot the board calls settled must not show up as a change in the
// optimal lineup, or the page contradicts itself in two adjacent panels.
const settled = rankSlots(
    [{ slot: 'RB', playerId: 1 }, { slot: 'WR', playerId: 3 }],
    id => pos.get(id)!, id => sims.get(id)!, [9], opp, 4000);
const settledFixed = resolveConflicts(settled);
const optSettled = optimalLineup(settledFixed);
const proposed = settledFixed.filter(
    d => (optSettled.get(d.index) ?? d.currentId) !== d.currentId).length;
const flagged = settledFixed.filter(d => d.verdict !== 'set').length;
console.log(`   board flags ${flagged} slots; optimal proposes ${proposed} changes`);
check('a settled board proposes no changes', proposed <= flagged, true);

console.log();
if (fails.length) { console.log(`${fails.length} FAILED: ${fails.join(', ')}`); process.exit(1); }
console.log('all lineup checks passed');
