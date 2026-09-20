/**
 * This week's lineup, priced where it cannot freeze the page.
 *
 * Start/Sit is the page people actually open, and its board was the last
 * simulation still running on the main thread. Measured on a twelve-team
 * league, one click: `rankSlots` 154ms, the matchup 59ms, the slot-by-slot
 * pairing 12ms — and in the browser, on top of React's own work, a 364ms
 * task during which the page could not scroll and could not take the next
 * click. Every preview of a swap cost another twenty thousand seasons on
 * the same thread.
 *
 * All of it is arithmetic over plain numbers — a SimPlayer is an outcome
 * and an array of weekly scores — so it crosses by structured clone and
 * runs beside the page rather than in front of it, as the trade analyser
 * and the season already do.
 *
 * One ask does the whole board rather than three, because all three
 * answers come off the same players and the same opponent: sending them
 * separately would be the same league serialised three times to save
 * nothing. The preview is its own ask because it is a click, not a load.
 */
import { rankSlots, resolveConflicts, optimalLineup, type SlotDecision }
    from './lineup';
import { beatsProbability, simulateMatchup, type MatchupOdds, type SimPlayer }
    from './startSit';

/** A lineup as it is actually set: a slot, and who is standing in it. */
export interface LineupSlot { slot: string; playerId: number | null }

export interface BoardAsk {
    id: number;
    kind: 'board';
    lineup: LineupSlot[];
    /** Everyone on my roster, as id to position. */
    positions: [number, string][];
    benchIds: number[];
    /**
     * The opponent's starting lineup, which is what your whole lineup is
     * simulated against.
     */
    opponentIds: number[];
    /**
     * The same lineup read as slots, holes included — a different list.
     *
     * The matchup is your nine against their nine and does not care which
     * slot anybody is in. The slot-for-slot pairing does, and it has to
     * line up index for index with your own slots, empty ones and all.
     * Conflating the two pairs your flex against whoever happened to be
     * ninth in their starters array.
     */
    opponentSlotIds: (number | null)[];
    /** Everybody either side needs, as pairs rather than a Map. */
    sims: [number, SimPlayer][];
    trials: number;
    matchupTrials: number;
}

/** One swap, previewed: the same lineup with one slot's occupant changed. */
export interface PreviewAsk {
    id: number;
    kind: 'preview';
    ids: (number | null)[];
    opponentIds: number[];
    sims: [number, SimPlayer][];
    matchupTrials: number;
}

export type LineupRequest = BoardAsk | PreviewAsk;

export interface BoardReply {
    id: number;
    kind: 'board';
    matchup: MatchupOdds | null;
    decisions: SlotDecision[];
    /**
     * The best lineup available and what it is worth.
     *
     * Computed here rather than sent back as decisions for the page to
     * re-simulate: picking it is arithmetic over the decisions, but
     * pricing it is another twenty thousand seasons, which is the thing
     * being moved off the thread in the first place. The ids come back so
     * the page can name the changes from its own player objects.
     */
    bestIds: (number | null)[];
    bestProb: number | null;
    /**
     * Your man against theirs, slot for slot — the share of weeks yours
     * outscores his. Null where either side has nobody in that slot.
     */
    beats: (number | null)[];
}

export interface PreviewReply {
    id: number;
    kind: 'preview';
    matchup: MatchupOdds | null;
}

export type LineupResponse = BoardReply | PreviewReply;

/**
 * `self` in a worker, without pulling the webworker lib into a tsconfig
 * that is otherwise a DOM one. Only two members are used and both are
 * named here, so this stays a narrowing rather than an `any`.
 */
const ctx = self as unknown as {
    addEventListener(type: 'message', fn: (e: MessageEvent<LineupRequest>) => void): void;
    postMessage(message: LineupResponse): void;
};

ctx.addEventListener('message', (e: MessageEvent<LineupRequest>) => {
    const ask = e.data;
    const table = new Map(ask.sims);
    const simOf = (id: number) => table.get(id) ?? null;
    const lineupOf = (ids: (number | null)[]): SimPlayer[] => {
        const out: SimPlayer[] = [];
        for (const id of ids) {
            const s = id == null ? null : simOf(id);
            if (s) out.push(s);
        }
        return out;
    };
    const theirs = lineupOf(ask.opponentIds);

    if (ask.kind === 'preview') {
        const mine = lineupOf(ask.ids);
        ctx.postMessage({
            id: ask.id, kind: 'preview',
            matchup: mine.length === 0 || theirs.length === 0 ? null
                // Same opponent, same trial count, same seed as the
                // headline, so the gap between the two numbers is the swap
                // rather than the dice.
                : simulateMatchup(mine, theirs, ask.matchupTrials, 11, { bins: 40 }),
        });
        return;
    }

    const mineIds = ask.lineup.map(l => l.playerId);
    const mine = lineupOf(mineIds);
    if (mine.length === 0 || theirs.length === 0) {
        ctx.postMessage({
            id: ask.id, kind: 'board', matchup: null, decisions: [],
            bestIds: [], bestProb: null, beats: [],
        });
        return;
    }

    const matchup = simulateMatchup(mine, theirs, ask.matchupTrials, 11, { bins: 40 });

    const posTable = new Map(ask.positions);
    // Resolved, not raw: scored on its own, every running back slot asks
    // for the best back on the bench, and being told to start the same man
    // twice is how a tool says it cannot count.
    const decisions = resolveConflicts(rankSlots(
        ask.lineup,
        id => (posTable.get(id) ?? '').toUpperCase(),
        id => simOf(id)!,
        ask.benchIds.filter(id => table.has(id)),
        theirs,
        ask.trials));

    const chosen = optimalLineup(decisions);
    const bestIds = decisions.map(d => chosen.get(d.index) ?? d.currentId);
    // Most weeks the best lineup is the one already set, and simulating it
    // again is twenty thousand seasons to re-derive a number that is
    // already on screen — same players, same opponent, same seed, so
    // necessarily the same answer.
    const unchanged = bestIds.length === decisions.length
        && bestIds.every((id, i) => id === decisions[i].currentId);
    const bestLineup = lineupOf(bestIds);
    const bestProb = unchanged ? matchup.winProb
        : bestLineup.length === 0 ? null
        : simulateMatchup(bestLineup, theirs, ask.matchupTrials, 11).winProb;

    const beats = ask.lineup.map((s, i) => {
        const a = s.playerId == null ? null : simOf(s.playerId);
        const bId = ask.opponentSlotIds[i] ?? null;
        const bSim = bId == null ? null : simOf(bId);
        // Three thousand rather than the headline's twenty: this is one
        // pair rather than eighteen players, and nine of them are drawn
        // per board.
        return a && bSim ? beatsProbability(a, bSim, 3000, 17) : null;
    });

    ctx.postMessage({
        id: ask.id, kind: 'board', matchup, decisions, bestIds, bestProb, beats,
    });
});
