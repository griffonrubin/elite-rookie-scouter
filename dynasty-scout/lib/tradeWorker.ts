/**
 * The league, replayed off the main thread.
 *
 * Pricing one trade is two full runs of the league at twenty thousand
 * seasons each, plus the playoff odds either side of it. Measured on a
 * twelve-team league in this browser that is about four and a half seconds,
 * and every millisecond of it was blocking: two long tasks of 2.3 and 2.2
 * seconds, during which the page could not scroll, could not paint the
 * selection you had just made, and could not accept the next click.
 *
 * Which ruined the one thing the analyser is for. Its own note says the
 * question is never whether a trade is good but what else you might have
 * offered — a question you answer by trying things and watching the number.
 * Trying things cost a four-second freeze each, so nobody tried much.
 *
 * Nothing in the engine touches the DOM: `trade`, `power`, `lineup` and
 * `startSit` are arithmetic over plain numbers, and a SimPlayer is an object
 * of numbers and an array of them. So the whole thing crosses the wire by
 * structured clone and runs where it cannot freeze anybody.
 */
import { evaluateTrade, type TradeResult, type TradeSide, type TradeTeam } from './trade';
import type { SimPlayer } from './startSit';

/** One question for the worker. */
export interface TradeRequest {
    /**
     * Which question this is. Replies arrive in the order the worker
     * finishes them, which is not necessarily the order they were asked, and
     * a reader clicking through four players wants the answer to the fourth
     * rather than whichever run happened to land last.
     */
    id: number;
    teams: TradeTeam[];
    slots: string[];
    a: TradeSide;
    b: TradeSide;
    /**
     * Every player either roster might need, as pairs rather than a Map.
     * A Map clones fine; pairs are what the caller already has and one less
     * thing to get wrong at each end.
     */
    sims: [number, SimPlayer][];
    trials: number;
    seed: number;
    season: { remaining: number; spots: number; pairs?: Int32Array | null } | null;
}

export interface TradeResponse {
    id: number;
    result: TradeResult;
}

/**
 * `self` in a worker, without pulling the webworker lib into a tsconfig
 * that is otherwise a DOM one. Only two members are used and both are named
 * here, so this stays a narrowing rather than an `any`.
 */
const ctx = self as unknown as {
    addEventListener(type: 'message', fn: (e: MessageEvent<TradeRequest>) => void): void;
    postMessage(message: TradeResponse): void;
};

ctx.addEventListener('message', (e: MessageEvent<TradeRequest>) => {
    const { id, teams, slots, a, b, sims, trials, seed, season } = e.data;
    const table = new Map(sims);
    const result = evaluateTrade(
        teams, slots, a, b,
        pid => table.get(pid) ?? null,
        trials, seed, season);
    ctx.postMessage({ id, result });
});
