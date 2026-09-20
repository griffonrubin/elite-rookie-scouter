/**
 * The league's season, played out where it cannot freeze anybody.
 *
 * Ranking twelve rosters over twenty thousand seasons is about 780ms of
 * arithmetic, and every page In Season wants it: Power prints it, Start/Sit
 * prices a lineup against it, Waivers and Trades ask what a roster change
 * does to it. Run on the main thread it is a dropped second on each of
 * them — and on Waivers and Trades it is that second once per claim priced.
 *
 * Nothing in the engine touches the DOM. `power`, `trade`, `lineup` and
 * `startSit` are arithmetic over plain numbers, so the whole thing crosses
 * by structured clone, as the trade analyser's worker already does.
 *
 * What is different here, and why this is not a copy of that one: the
 * league is *kept*. A waiver page prices four claims against the same
 * twelve rosters, and the input is a hundred and seventy players' game
 * logs plus the whole redraft pool — serialising that per question would
 * put the clone back on the main thread four more times, which is the cost
 * this exists to remove. So the league is sent once and asked about many
 * times, and every answer after the first carries only the rosters that
 * changed.
 *
 * The `epoch` is what keeps that safe. A question about a league the worker
 * is not holding — a different league, a new week, a reload — is refused
 * rather than answered against the wrong one, and the client resends.
 */
import { seasonOdds, type SeasonInput, type SeasonOdds } from './seasonOdds';
import type { LeagueRoster } from './leagueRosters';
import type { RedraftPlayer } from './types';

/** One roster, replaced: what a claim is, and half of what a trade is. */
export type SeasonOverride = { key: string; roster: LeagueRoster['roster'] };

/** Rank the league and play its season out, holding it for what follows. */
export interface SeasonAsk {
    id: number;
    kind: 'season';
    /** Which league this is. A question tagged otherwise is refused. */
    epoch: string;
    input: SeasonInput;
    trials: number;
    seed: number;
}

/** What one roster change does, against the league already held. */
export interface ChangeAsk {
    id: number;
    kind: 'change';
    epoch: string;
    overrides: SeasonOverride[];
    /** Whose odds the answer is about. */
    myKey: string;
    /**
     * The odds without the change, where the caller already has them.
     *
     * Every page pricing a change has just run this league's season, and
     * the unchanged half of the comparison is exactly that number — same
     * trials, same seed, same fixtures. Passing it in halves the work and,
     * more usefully, makes the "before" the number the page is printing
     * rather than a second estimate of it.
     */
    baseline: number | null;
    /**
     * Players the held league does not carry.
     *
     * The league is sent trimmed to the men on its rosters, because that
     * is all ranking it can look up. A waiver claim breaks that: the
     * player being claimed is a free agent, on nobody's roster, and
     * unknown to the worker. The client sends him with the question.
     */
    extraPlayers: RedraftPlayer[];
    trials: number;
    seed: number;
}

export type SeasonRequest = SeasonAsk | ChangeAsk;

export interface SeasonReply {
    id: number;
    kind: 'season';
    result: SeasonOdds;
}

export interface ChangeReply {
    id: number;
    kind: 'change';
    /** Null where the league could not answer — no season left, too few teams. */
    worth: { before: number; after: number; delta: number } | null;
}

/** The league asked about is not the one held. The client resends it. */
export interface StaleReply {
    id: number;
    kind: 'stale';
    epoch: string;
}

export type SeasonResponse = SeasonReply | ChangeReply | StaleReply;

/**
 * `self` in a worker, without pulling the webworker lib into a tsconfig
 * that is otherwise a DOM one. Only two members are used and both are
 * named here, so this stays a narrowing rather than an `any`.
 */
const ctx = self as unknown as {
    addEventListener(type: 'message', fn: (e: MessageEvent<SeasonRequest>) => void): void;
    postMessage(message: SeasonResponse): void;
};

/** The league being asked about, and which one it is. */
let held: { epoch: string; input: SeasonInput } | null = null;

ctx.addEventListener('message', (e: MessageEvent<SeasonRequest>) => {
    const ask = e.data;
    if (ask.kind === 'season') {
        held = { epoch: ask.epoch, input: ask.input };
        ctx.postMessage({
            id: ask.id, kind: 'season',
            result: seasonOdds(ask.input, null, ask.trials, ask.seed),
        });
        return;
    }
    if (!held || held.epoch !== ask.epoch) {
        ctx.postMessage({ id: ask.id, kind: 'stale', epoch: ask.epoch });
        return;
    }
    const input = ask.extraPlayers.length
        ? { ...held.input, players: [...held.input.players, ...ask.extraPlayers] }
        : held.input;
    if (input.remaining <= 0 || input.teams.length < 2) {
        ctx.postMessage({ id: ask.id, kind: 'change', worth: null });
        return;
    }
    const before = ask.baseline
        ?? seasonOdds(input, null, ask.trials, ask.seed).odds?.get(ask.myKey)?.odds;
    const after = seasonOdds(input, ask.overrides, ask.trials, ask.seed)
        .odds?.get(ask.myKey)?.odds;
    ctx.postMessage({
        id: ask.id, kind: 'change',
        worth: before == null || after == null
            ? null : { before, after, delta: after - before },
    });
});
