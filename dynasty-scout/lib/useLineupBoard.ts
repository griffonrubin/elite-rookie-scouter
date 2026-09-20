'use client';

import { useEffect, useRef, useState } from 'react';
import { rankSlots, resolveConflicts, optimalLineup } from '@/lib/lineup';
import { beatsProbability, simulateMatchup } from '@/lib/startSit';
import type {
    BoardAsk, BoardReply, LineupRequest, LineupResponse, PreviewAsk, PreviewReply,
} from '@/lib/lineupWorker';

/**
 * The board, and the preview, computed beside the page.
 *
 * Same shape as the trade analyser's hook and for the same reasons: the
 * last answer stays on screen while the next one is worked out, so a
 * reader watching a number move sees it move rather than flash away and
 * back; and replies are matched against the most recent question, since
 * clicking through four slots asks four times and only the fourth answer
 * is wanted.
 *
 * With one difference learned from that hook. There, keeping the previous
 * answer across a *cleared* table put the last trade's verdict under this
 * one's heading. The equivalent here is switching teams or leagues, so a
 * board whose question has gone is dropped rather than held: an empty
 * question means there is nothing to compare against, which is exactly
 * when a stale answer stops being context and starts being wrong.
 *
 * Falls back to this thread where a worker cannot be made. That is the old
 * behaviour, blocking and all, which is worse than a worker and far better
 * than a page that never answers.
 */

export type BoardInput = Omit<BoardAsk, 'id' | 'kind'>;
export type PreviewInput = Omit<PreviewAsk, 'id' | 'kind'>;

export type BoardResult = Omit<BoardReply, 'id' | 'kind'>;

const EMPTY: BoardResult = {
    matchup: null, decisions: [], bestIds: [], bestProb: null, beats: [],
};

/** Run a board ask here, for want of a worker. */
function boardHere(ask: BoardInput): BoardResult {
    const table = new Map(ask.sims);
    const simOf = (id: number) => table.get(id) ?? null;
    const lineupOf = (ids: (number | null)[]) => ids
        .map(id => (id == null ? null : simOf(id)))
        .filter((s): s is NonNullable<typeof s> => s != null);
    const theirs = lineupOf(ask.opponentIds);
    const mine = lineupOf(ask.lineup.map(l => l.playerId));
    if (mine.length === 0 || theirs.length === 0) return EMPTY;
    const matchup = simulateMatchup(mine, theirs, ask.matchupTrials, 11, { bins: 40 });
    const posTable = new Map(ask.positions);
    const decisions = resolveConflicts(rankSlots(
        ask.lineup, id => (posTable.get(id) ?? '').toUpperCase(),
        id => simOf(id)!, ask.benchIds.filter(id => table.has(id)),
        theirs, ask.trials));
    const chosen = optimalLineup(decisions);
    const bestIds = decisions.map(d => chosen.get(d.index) ?? d.currentId);
    const unchanged = bestIds.length === decisions.length
        && bestIds.every((id, i) => id === decisions[i].currentId);
    const bestLineup = lineupOf(bestIds);
    return {
        matchup, decisions, bestIds,
        bestProb: unchanged ? matchup.winProb
            : bestLineup.length === 0 ? null
            : simulateMatchup(bestLineup, theirs, ask.matchupTrials, 11).winProb,
        beats: ask.lineup.map((s, i) => {
            const a = s.playerId == null ? null : simOf(s.playerId);
            const bId = ask.opponentSlotIds[i] ?? null;
            const bSim = bId == null ? null : simOf(bId);
            return a && bSim ? beatsProbability(a, bSim, 3000, 17) : null;
        }),
    };
}

/** Run a preview ask here, for want of a worker. */
function previewHere(ask: PreviewInput): PreviewReply['matchup'] {
    const table = new Map(ask.sims);
    const pick = (ids: (number | null)[]) => ids
        .map(id => (id == null ? null : table.get(id) ?? null))
        .filter((s): s is NonNullable<typeof s> => s != null);
    const mine = pick(ask.ids);
    const theirs = pick(ask.opponentIds);
    if (mine.length === 0 || theirs.length === 0) return null;
    return simulateMatchup(mine, theirs, ask.matchupTrials, 11, { bins: 40 });
}

export interface LineupBoard extends BoardResult {
    /** True while an answer is being worked out for the current lineup. */
    pending: boolean;
    /** The swap preview, or null when nothing is being previewed. */
    preview: PreviewReply['matchup'];
    previewPending: boolean;
}

export function useLineupBoard(
    board: BoardInput | null,
    preview: PreviewInput | null,
): LineupBoard {
    const [answered, setAnswered] = useState<{
        input: BoardInput | null; result: BoardResult;
    }>({ input: null, result: EMPTY });
    const [previewed, setPreviewed] = useState<{
        input: PreviewInput | null; matchup: PreviewReply['matchup'];
    }>({ input: null, matchup: null });

    const workerRef = useRef<Worker | null>(null);
    const brokenRef = useRef(false);
    const latestBoard = useRef(0);
    const latestPreview = useRef(0);

    useEffect(() => () => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }, []);


    /**
     * A board with no question forgets its answer, and so does a preview.
     *
     * Adjusted during render, which is the shape React documents for state
     * that has to follow an input: it converges in the same pass, so the
     * wrong board is never committed. An effect would paint it once first.
     */
    if (!board && answered.result !== EMPTY) setAnswered({ input: null, result: EMPTY });
    if (!preview && previewed.matchup !== null) {
        setPreviewed({ input: null, matchup: null });
    }

    /** The worker, or null where one cannot be made. */
    const ensure = (): Worker | null => {
        if (brokenRef.current || typeof Worker === 'undefined') return null;
        if (workerRef.current) return workerRef.current;
        try {
            // The URL form is what lets the bundler find and compile the
            // worker as its own entry; a plain string path would ship a
            // request for a file that was never built.
            workerRef.current = new Worker(new URL('./lineupWorker.ts', import.meta.url));
        } catch {
            brokenRef.current = true;
        }
        return workerRef.current;
    };

    useEffect(() => {
        if (!board) { latestBoard.current += 1; return; }
        const id = ++latestBoard.current;
        const worker = ensure();
        if (!worker) {
            // Handed to a timer rather than run inline so the browser gets
            // one paint first: the lineup appears and the board arrives
            // after. The block is the same length; it stops looking like a
            // page that has died.
            const timer = setTimeout(() => {
                if (id === latestBoard.current) {
                    setAnswered({ input: board, result: boardHere(board) });
                }
            }, 0);
            return () => clearTimeout(timer);
        }
        const onMessage = (e: MessageEvent<LineupResponse>) => {
            if (e.data.kind !== 'board' || e.data.id !== latestBoard.current) return;
            const { id: _id, kind: _kind, ...rest } = e.data;
            void _id; void _kind;
            setAnswered({ input: board, result: rest });
        };
        const onError = () => {
            // A worker that fails once will fail again, so stop trying and
            // let the next question take the synchronous path.
            brokenRef.current = true;
            worker.terminate();
            workerRef.current = null;
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ id, kind: 'board', ...board } satisfies LineupRequest);
        return () => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
        };
    }, [board]);

    useEffect(() => {
        if (!preview) { latestPreview.current += 1; return; }
        const id = ++latestPreview.current;
        const worker = ensure();
        if (!worker) {
            const timer = setTimeout(() => {
                if (id === latestPreview.current) {
                    setPreviewed({ input: preview, matchup: previewHere(preview) });
                }
            }, 0);
            return () => clearTimeout(timer);
        }
        const onMessage = (e: MessageEvent<LineupResponse>) => {
            if (e.data.kind !== 'preview' || e.data.id !== latestPreview.current) return;
            setPreviewed({ input: preview, matchup: e.data.matchup });
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({ id, kind: 'preview', ...preview } satisfies LineupRequest);
        return () => worker.removeEventListener('message', onMessage);
    }, [preview]);

    return {
        ...(board ? answered.result : EMPTY),
        pending: board != null && answered.input !== board,
        preview: preview ? previewed.matchup : null,
        previewPending: preview != null && previewed.input !== preview,
    };
}
