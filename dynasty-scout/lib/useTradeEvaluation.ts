'use client';

import { useEffect, useRef, useState } from 'react';
import { evaluateTrade, type TradeResult } from '@/lib/trade';
import type { TradeRequest, TradeResponse } from '@/lib/tradeWorker';

/** Everything a run needs, minus the request id the hook assigns. */
export type TradeInput = Omit<TradeRequest, 'id'>;

export interface Evaluation {
    /**
     * The last answer, kept on screen while the next one is worked out.
     * Blanking it would flash the verdict away and back on every click, and
     * the number a reader is comparing against is the one that was just
     * there.
     */
    result: TradeResult | null;
    /** True while an answer is being computed for the current selection. */
    pending: boolean;
}

/**
 * Price a trade without freezing the page.
 *
 * Two full runs of the league at twenty thousand seasons each, plus playoff
 * odds either side, is about four and a half seconds in this browser — and
 * all of it used to block: two long tasks of 2.3 and 2.2 seconds during
 * which the page could not scroll, could not paint the selection just made,
 * and could not take the next click. That ruined the thing the analyser is
 * for, because trying another name is how you use it and each try cost a
 * four-second freeze.
 *
 * So the work goes to a worker. Two details a bare postMessage would miss:
 * replies are matched against the most recent question, since clicking
 * through four players asks four times and only the fourth answer is
 * wanted; and the previous answer stays up underneath `pending`, so the
 * verdict dims instead of vanishing.
 *
 * Falls back to this thread where a worker cannot be made — no constructor,
 * or a bundler that will not take the import. That is the old behaviour,
 * freeze and all, which is worse than a worker and far better than a page
 * that never answers.
 */
export function useTradeEvaluation(input: TradeInput | null): Evaluation {
    /**
     * The answer, and the question it answers.
     *
     * Holding the question beside it is what makes `pending` something this
     * can work out during render, rather than a second piece of state
     * written from the effect: an answer whose question is not the current
     * one means the current one is still in flight.
     */
    const [answered, setAnswered] = useState<{
        input: TradeInput | null; result: TradeResult | null;
    }>({ input: null, result: null });

    const workerRef = useRef<Worker | null>(null);
    const brokenRef = useRef(false);
    /** The most recent question, so a late reply to an old one is dropped. */
    const latest = useRef(0);

    useEffect(() => () => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }, []);

    useEffect(() => {
        if (!input) { latest.current += 1; return; }

        const id = latest.current + 1;
        latest.current = id;

        if (!brokenRef.current && !workerRef.current && typeof Worker !== 'undefined') {
            try {
                // The URL form is what lets the bundler find and compile the
                // worker as its own entry; a plain string path would ship a
                // request for a file that was never built.
                workerRef.current = new Worker(
                    new URL('./tradeWorker.ts', import.meta.url));
            } catch {
                brokenRef.current = true;
            }
        }

        const worker = workerRef.current;
        if (!worker) {
            // Handed to a timer rather than run inline so the browser gets
            // one paint first: the selection appears and the verdict dims
            // before everything stops. The freeze is the same length; it
            // stops looking like a dead click.
            const timer = setTimeout(() => {
                const table = new Map(input.sims);
                const result = evaluateTrade(
                    input.teams, input.slots, input.a, input.b,
                    pid => table.get(pid) ?? null,
                    input.trials, input.seed, input.season);
                if (id === latest.current) setAnswered({ input, result });
            }, 0);
            return () => clearTimeout(timer);
        }

        const onMessage = (e: MessageEvent<TradeResponse>) => {
            if (e.data.id !== latest.current) return;
            setAnswered({ input, result: e.data.result });
        };
        const onError = () => {
            // A worker that fails once will fail again, so stop trying and
            // let the next run take the synchronous path.
            brokenRef.current = true;
            worker.terminate();
            workerRef.current = null;
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ id, ...input } satisfies TradeRequest);

        return () => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
        };
    }, [input]);

    /**
     * The stored answer shows for as long as there is a question, which is
     * what lets a reader watch a number move rather than flash away and
     * back.
     *
     * It does mean that clearing the table and starting a fresh trade shows
     * the previous verdict for the second or two the new one takes — which
     * is why `pending` dims it and says the league is being replayed.
     */
    return {
        result: input ? answered.result : null,
        pending: input != null && answered.input !== input,
    };
}
