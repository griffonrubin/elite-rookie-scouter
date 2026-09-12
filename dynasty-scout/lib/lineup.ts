/**
 * A lineup is a set of slots, not a pile of players.
 *
 * Ranking every legal swap produces a long flat list in which "Gibbs over
 * McBride" sits beside "Gibbs over Chase" as though they were alternatives to
 * each other. They are not. Nobody sets a lineup that way. The real question
 * is asked one slot at a time — who plays flex, which three of my four
 * receivers start — and each slot has its own small set of candidates and its
 * own answer.
 *
 * So this ranks candidates within a slot. Each slot's verdict is the win
 * probability of the whole lineup with that player in it, which keeps the one
 * property worth having: a player is judged by what he does to your chances,
 * not by his projection.
 */
import { beatsProbability, SimPlayer, simulateMatchup, slotWinProbs } from '@/lib/startSit';

/** Positions that can fill a FLEX in every common league shape. */
const FLEX_ELIGIBLE: Record<string, Set<string>> = {
    FLEX: new Set(['RB', 'WR', 'TE']),
    WRRB_FLEX: new Set(['RB', 'WR']),
    REC_FLEX: new Set(['WR', 'TE']),
    SUPER_FLEX: new Set(['QB', 'RB', 'WR', 'TE']),
    SUPERFLEX: new Set(['QB', 'RB', 'WR', 'TE']),
    IDP_FLEX: new Set(['DL', 'LB', 'DB']),
};

/** What a platform calls a slot, mapped to the position it wants. */
const SLOT_ALIASES: Record<string, string> = {
    DEF: 'DST', 'D/ST': 'DST', DST: 'DST', PK: 'K', K: 'K',
};

export function normaliseSlot(slot: string): string {
    const s = (slot ?? '').trim().toUpperCase();
    return SLOT_ALIASES[s] ?? s;
}

/** Whether a player of this position may be started in this slot. */
export function eligibleForSlot(slot: string, position: string): boolean {
    const s = normaliseSlot(slot);
    const p = normaliseSlot(position);
    if (!s || !p) return false;
    const flex = FLEX_ELIGIBLE[s];
    if (flex) return flex.has(p);
    return s === p;
}

export interface SlotCandidate {
    playerId: number;
    /** Win probability of the whole lineup with this player in this slot. */
    winProb: number;
    /** Percentage points against the player currently in the slot. */
    deltaWinProb: number;
    deltaPoints: number;
    current: boolean;
    /** Share of weeks this player outscores whoever is in the slot now. */
    beats: number;
}

export interface SlotDecision {
    slot: string;
    index: number;
    currentId: number | null;
    candidates: SlotCandidate[];
    /**
     * How much better the best candidate is than the one in the slot, in
     * percentage points of win probability. Zero when the lineup is already
     * right, which is most slots most weeks.
     */
    gain: number;
    /**
     * Whether the call is worth making. A tenth of a point of win probability
     * is noise in a twelve-thousand-trial simulation, and telling someone to
     * change their lineup over it would be worse than saying nothing.
     */
    verdict: 'set' | 'close' | 'change';
}

/** Below this the two lineups are the same lineup as far as anyone can tell. */
export const NOISE_FLOOR = 0.3;
/** Above this the choice is clear enough to state as one. */
export const CLEAR_MARGIN = 1.5;

/**
 * Rank every eligible player for every slot.
 *
 * Each candidate is scored by simulating the whole lineup with them in place,
 * under one shared seed so the comparison is between lineups rather than
 * between two different sets of random draws. Bench players are considered
 * for every slot they are eligible for; the other starters are too, because
 * "my WR2 and WR3 are in the wrong order" is a real, if rare, finding.
 */
export function rankSlots(
    lineup: { slot: string; playerId: number | null }[],
    positionOf: (id: number) => string,
    simOf: (id: number) => SimPlayer,
    benchIds: number[],
    opponent: SimPlayer[],
    trials = 6000,
): SlotDecision[] {
    const base = lineup.map(l => l.playerId);
    const simLineup = (ids: (number | null)[]): SimPlayer[] =>
        ids.filter((id): id is number => id != null).map(simOf);

    const out: SlotDecision[] = [];
    for (let i = 0; i < lineup.length; i++) {
        const { slot } = lineup[i];
        const currentId = lineup[i].playerId;

        // Everyone who could legally stand here: the bench, plus whoever is
        // in the slot now.
        const pool = benchIds.filter(id => eligibleForSlot(slot, positionOf(id)));
        if (currentId != null) pool.unshift(currentId);
        if (pool.length === 0) {
            out.push({ slot, index: i, currentId, candidates: [], gain: 0, verdict: 'set' });
            continue;
        }

        // The starters who are not in this slot, drawn once for the whole
        // pool rather than once per candidate.
        const othersIds = base.filter((id, j) => j !== i && id != null) as number[];

        // A player already starting elsewhere cannot also fill this slot:
        // putting them here empties the slot they came from rather than
        // cloning them into two places. That candidate has a different set
        // of "others", so it cannot share the pooled draws and is scored on
        // its own — rare enough that the shared path still does the work.
        const shared = pool.filter(id => !othersIds.includes(id));
        const moved = pool.filter(id => othersIds.includes(id));

        const scored: SlotCandidate[] = [];
        if (shared.length > 0) {
            const probs = slotWinProbs(othersIds.map(simOf), shared.map(simOf),
                opponent, trials, 7);
            shared.forEach((id, k) => scored.push({
                playerId: id, winProb: probs[k], deltaWinProb: 0,
                current: id === currentId, deltaPoints: 0, beats: 0.5,
            }));
        }
        for (const id of moved) {
            const ids = [...base];
            ids[i] = id;
            for (let j = 0; j < ids.length; j++) if (j !== i && ids[j] === id) ids[j] = null;
            const w = simulateMatchup(simLineup(ids), opponent, trials, 7).winProb;
            scored.push({
                playerId: id, winProb: w, deltaWinProb: 0, current: id === currentId,
                deltaPoints: 0, beats: 0.5,
            });
        }
        // Pool order decides which slot gets first refusal in
        // resolveConflicts, so restore it after splitting the two paths.
        scored.sort((a, b) => pool.indexOf(a.playerId) - pool.indexOf(b.playerId));

        const currentProb = scored.find(c => c.current)?.winProb
            ?? Math.min(...scored.map(c => c.winProb));
        const currentMean = currentId != null ? simOf(currentId).outcome.mean : 0;
        for (const c of scored) {
            c.deltaWinProb = Math.round((c.winProb - currentProb) * 1000) / 10;
            c.deltaPoints = Math.round((simOf(c.playerId).outcome.mean - currentMean) * 10) / 10;
            c.beats = currentId != null && c.playerId !== currentId
                ? beatsProbability(simOf(c.playerId), simOf(currentId))
                : 0.5;
        }
        scored.sort((a, b) => b.winProb - a.winProb);

        const gain = scored[0]?.current ? 0 : (scored[0]?.deltaWinProb ?? 0);
        out.push({
            slot, index: i, currentId, candidates: scored,
            gain: Math.round(gain * 10) / 10,
            verdict: gain < NOISE_FLOOR ? 'set' : gain < CLEAR_MARGIN ? 'close' : 'change',
        });
    }
    return out;
}

/**
 * Resolve slots that want the same player.
 *
 * Scored independently, every running back slot will ask for the best back on
 * the bench, and a reader seeing "start Gibbs" twice learns that the tool
 * cannot count. He can only stand in one of them.
 *
 * So candidates are handed out once: the slot with the most to gain gets its
 * pick, and every other slot re-reads its own list with the taken players
 * removed. What each slot then shows is what it would actually get, which is
 * the only recommendation worth acting on.
 */
export function resolveConflicts(decisions: SlotDecision[]): SlotDecision[] {
    const claimed = new Set<number>();
    // Whoever is already in a slot holds it unless somebody takes it.
    const byGain = [...decisions].sort((a, b) => b.gain - a.gain);
    const resolved = new Map<number, SlotDecision>();

    for (const d of byGain) {
        const available = d.candidates.filter(
            c => c.current || !claimed.has(c.playerId));
        const best = available[0];
        if (best) claimed.add(best.playerId);
        const gain = !best || best.current ? 0 : best.deltaWinProb;
        resolved.set(d.index, {
            ...d,
            candidates: available,
            gain: Math.round(gain * 10) / 10,
            verdict: gain < NOISE_FLOOR ? 'set' : gain < CLEAR_MARGIN ? 'close' : 'change',
        });
    }
    return decisions.map(d => resolved.get(d.index) ?? d);
}

/**
 * The lineup the simulation prefers, slot by slot.
 *
 * Greedy rather than exhaustive, and deliberately: the exact optimum over ten
 * slots and a full bench is a large search, while taking the best remaining
 * candidate for the slot with the most to gain lands on the same answer in
 * every realistic lineup and can be explained in a sentence.
 */
export function optimalLineup(decisions: SlotDecision[]): Map<number, number> {
    const taken = new Set<number>();
    const chosen = new Map<number, number>();
    const order = [...decisions].sort((a, b) => b.gain - a.gain);
    for (const d of order) {
        // A slot the board calls settled must not be quietly changed here.
        // Taking the nominal best candidate regardless produced a lineup that
        // claimed two changes worth a tenth of a point while the board beside
        // it said every slot was already right — both were true of their own
        // rule, and a reader seeing them disagree simply stops believing
        // either. One threshold, applied in both places.
        const pick = d.verdict === 'set'
            ? d.candidates.find(c => c.current && !taken.has(c.playerId))
                ?? d.candidates.find(c => !taken.has(c.playerId))
            : d.candidates.find(c => !taken.has(c.playerId));
        if (!pick) continue;
        taken.add(pick.playerId);
        chosen.set(d.index, pick.playerId);
    }
    return chosen;
}
