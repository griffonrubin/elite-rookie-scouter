'use client';

/**
 * One worker, one league, every page that asks about it.
 *
 * Module-level rather than per-hook on purpose. The worker keeps the league
 * it was last given so a page can price four waiver claims against it
 * without sending a hundred and seventy players' game logs four more times
 * — and that only works if the hook running the season and the hook pricing
 * the claims are talking to the same worker. Two workers would each hold
 * their own copy and each be sent one.
 *
 * Falls back to this thread wherever a worker cannot be made — no
 * constructor, a bundler that will not take the import. That is the old
 * behaviour, blocking and all, which is worse than a worker and far better
 * than a page that never answers.
 */
import { changeWorth, seasonOdds, SEASON_TRIALS,
    type ClaimWorth, type SeasonInput, type SeasonOdds } from './seasonOdds';
import type { SeasonOverride, SeasonRequest, SeasonResponse } from './seasonWorker';

/**
 * Which league an input *is*, by identity.
 *
 * The worker holds one league and answers questions about it, so both
 * hooks have to name the same one — and the thing they share is the
 * `SeasonInput` object itself, handed out by `useSeasonOdds` and passed
 * straight to `useClaimWorth`. Tagging the object is therefore exactly
 * right: two questions carry the same epoch precisely when they are about
 * the same league, and a rebuilt input is a new league as far as the
 * worker is concerned, which is the safe direction to be wrong in.
 */
const epochs = new WeakMap<SeasonInput, string>();
let epochCount = 0;

export function epochOf(input: SeasonInput): string {
    let e = epochs.get(input);
    if (!e) { e = `league-${++epochCount}`; epochs.set(input, e); }
    return e;
}

/**
 * Everyone the league can look up.
 *
 * `seasonOdds` reaches into `players` only for ids that are on a roster,
 * so sending the whole redraft pool sends about 1,300 players to price
 * 170. That is not free: it is deserialised at the worker's end before
 * anything runs, and it showed up as 300ms between asking and being
 * answered — the entire gap between running the league here and running
 * it there.
 */
function rosteredIds(input: SeasonInput): Set<number> {
    const ids = new Set<number>();
    for (const t of input.teams) {
        for (const id of t.ids) ids.add(id);
        for (const p of t.roster) ids.add(p.id);
    }
    return ids;
}

let worker: Worker | null = null;
/** A worker that failed once will fail again; stop trying. */
let broken = false;
let nextId = 1;
const waiting = new Map<number, (r: SeasonResponse) => void>();
/** Which league the worker is holding, as far as this side knows. */
let epochHeld: string | null = null;
/** And who it knows about, so a question can carry anybody it does not. */
let idsHeld: Set<number> = new Set();

function ensure(): Worker | null {
    if (broken || typeof Worker === 'undefined') return null;
    if (worker) return worker;
    try {
        // The URL form is what lets the bundler find and compile the worker
        // as its own entry; a plain string path would ship a request for a
        // file that was never built.
        worker = new Worker(new URL('./seasonWorker.ts', import.meta.url));
    } catch {
        broken = true;
        return null;
    }
    worker.addEventListener('message', (e: MessageEvent<SeasonResponse>) => {
        const done = waiting.get(e.data.id);
        if (!done) return;
        waiting.delete(e.data.id);
        done(e.data);
    });
    worker.addEventListener('error', () => {
        // Everything in flight is abandoned rather than left hanging: a
        // caller awaiting a promise that will never settle shows a spinner
        // for the rest of the session.
        broken = true;
        epochHeld = null;
        worker?.terminate();
        worker = null;
        for (const [, done] of waiting) done({ id: -1, kind: 'stale', epoch: '' });
        waiting.clear();
    });
    return worker;
}

/**
 * Build the worker before there is anything to ask it.
 *
 * Its code is a chunk of its own, so the first question pays to fetch and
 * compile it — measured on Power Rankings, about 300ms, and it landed at
 * the worst possible moment: after the league's hundred and seventy
 * players had finished arriving, with nothing left to overlap it. Called
 * as soon as a page that will want a season mounts, that cost happens
 * during the fetch instead, where there is already a wait.
 */
export function warmSeasonWorker() {
    ensure();
}

/** Drop the worker, so the next question rebuilds it. Used by tests. */
export function resetSeasonWorker() {
    worker?.terminate();
    worker = null;
    broken = false;
    epochHeld = null;
    waiting.clear();
}

function ask(w: Worker, req: SeasonRequest): Promise<SeasonResponse> {
    return new Promise(resolve => {
        waiting.set(req.id, resolve);
        w.postMessage(req);
    });
}

/**
 * Rank the league and play its season out.
 *
 * Sending it also leaves it with the worker, which is what makes the
 * claims priced afterwards cheap.
 */
export async function runSeason(
    epoch: string, input: SeasonInput,
    trials = SEASON_TRIALS, seed = 23,
): Promise<SeasonOdds> {
    const w = ensure();
    // Handed to a timer rather than run inline so the browser gets one
    // paint first. The block is the same length; it stops looking like a
    // page that has died.
    if (!w) return new Promise<SeasonOdds>(resolve =>
        setTimeout(() => resolve(seasonOdds(input, null, trials, seed)), 0));
    const ids = rosteredIds(input);
    const reply = await ask(w, {
        id: nextId++, kind: 'season', trials, seed, epoch,
        input: { ...input, players: input.players.filter(p => ids.has(p.id)) },
    });
    if (reply.kind !== 'season') {
        // The worker died mid-question. Answer it here rather than leave
        // the page waiting on a worker that is gone.
        return seasonOdds(input, null, trials, seed);
    }
    epochHeld = epoch;
    idsHeld = ids;
    return reply.result;
}

/**
 * What replacing one or two rosters does to a team's odds.
 *
 * The league itself is whatever the worker is holding for this epoch. If
 * it is holding another one — a different league, a new week — the answer
 * comes back stale and the league is sent again before asking a second
 * time. Once, not in a loop: a second stale reply means something is wrong
 * that retrying will not fix, and the question is answered here instead.
 */
export async function runChange(
    epoch: string, input: SeasonInput, myKey: string,
    overrides: SeasonOverride[], baseline: number | null,
    trials = SEASON_TRIALS, seed = 23,
): Promise<ClaimWorth | null> {
    const w = ensure();
    if (!w) return new Promise<ClaimWorth | null>(resolve =>
        setTimeout(() => resolve(changeWorth(input, myKey, overrides, baseline, seed)), 0));
    const send = () => {
        // Anybody the change brings in who is not on a roster the worker
        // holds — a free agent being claimed — travels with the question.
        const missing = new Set<number>();
        for (const o of overrides) {
            for (const p of o.roster) if (!idsHeld.has(p.id)) missing.add(p.id);
        }
        return ask(w, {
            id: nextId++, kind: 'change', epoch, overrides, myKey, baseline,
            extraPlayers: missing.size === 0 ? []
                : input.players.filter(p => missing.has(p.id)),
            trials, seed,
        });
    };

    if (epochHeld !== epoch) {
        await runSeason(epoch, input, trials, seed);
    }
    let reply = await send();
    if (reply.kind === 'stale') {
        await runSeason(epoch, input, trials, seed);
        reply = await send();
    }
    if (reply.kind !== 'change') {
        return changeWorth(input, myKey, overrides, baseline, seed);
    }
    return reply.worth;
}
