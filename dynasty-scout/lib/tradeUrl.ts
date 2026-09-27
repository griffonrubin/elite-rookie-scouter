/**
 * A trade, in a URL.
 *
 * The page already read `?give=`, because Team Analysis links into it with
 * the players your bench already covers. It never wrote one back, which made
 * the analyser the only page here you cannot hand to anybody — and the
 * question it exists to answer is whether to send an offer to another
 * manager. An offer you cannot put in front of them is half an answer.
 *
 * So the same three facts travel both ways: who you are trading with, who
 * leaves, who arrives. `give` keeps its name and its meaning, so every link
 * Team Analysis has already written still opens the roster it always did,
 * with the partner left for the page to choose as it did before.
 */
import { parsePickId } from '@/lib/tradePicks';

/** What the URL can say about a trade. */
export interface TradeUrlState {
    /** The other manager's team key, or null to let the page choose. */
    partner: string | null;
    /** Player ids leaving my roster. */
    give: number[];
    /** Player ids arriving from theirs. */
    get: number[];
    /**
     * Draft picks, as '2027-1-4' ids, each way.
     *
     * Separate keys from the players rather than one mixed list, because the
     * two are different types and a single list would have to be parsed by
     * shape. Optional on the way in, so that every link written before picks
     * existed still opens the trade it always described.
     */
    givePicks?: string[];
    getPicks?: string[];
}

/** Just enough of URLSearchParams to read one, so Next's readonly copy fits. */
export interface ParamReader {
    get(key: string): string | null;
}

/**
 * Ids from a comma-separated list, with anything that is not one dropped.
 *
 * A URL is typed by hand and pasted through chat clients that helpfully
 * append punctuation, so this keeps what parses and ignores the rest rather
 * than failing the whole link over one bad character.
 */
export function parseIds(raw: string | null): number[] {
    if (!raw) return [];
    const seen = new Set<number>();
    for (const part of raw.split(',')) {
        const n = Number(part.trim());
        if (Number.isInteger(n) && n > 0) seen.add(n);
    }
    return [...seen];
}

/**
 * Pick ids from a comma-separated list, keeping only well-formed ones.
 *
 * Same tolerance as the player ids: a link is pasted through chat clients
 * that append punctuation, so anything that does not parse is dropped rather
 * than failing the whole trade.
 */
export function parsePickIds(raw: string | null): string[] {
    if (!raw) return [];
    const seen = new Set<string>();
    for (const part of raw.split(',')) {
        const id = part.trim();
        if (parsePickId(id)) seen.add(id);
    }
    return [...seen];
}

/** Read a trade out of the query string. */
export function readTrade(params: ParamReader): TradeUrlState {
    const partner = params.get('with');
    return {
        partner: partner && partner.length > 0 ? partner : null,
        give: parseIds(params.get('give')),
        get: parseIds(params.get('get')),
        givePicks: parsePickIds(params.get('givePicks')),
        getPicks: parsePickIds(params.get('getPicks')),
    };
}

/**
 * Write one back, shortest form first.
 *
 * Empty keys are left out rather than written blank: a reader who has picked
 * nobody should get the bare page address back, not a URL with three empty
 * parameters that looks like something went wrong.
 *
 * Ids are sorted so that picking the same two players in a different order
 * produces the same link — otherwise the back button walks through states
 * that are identical to look at.
 */
export function tradeQuery(state: TradeUrlState): string {
    const parts: string[] = [];
    if (state.partner) parts.push(`with=${encodeURIComponent(state.partner)}`);
    // Joined by hand rather than through URLSearchParams, which escapes the
    // separator and turns a link somebody is going to paste into a group
    // chat into `give=913%2C1329`. The ids are integers, so there is nothing
    // in them that needs escaping, and a bare comma is legal in a query.
    const add = (key: string, ids: number[]) => {
        if (ids.length) parts.push(`${key}=${[...ids].sort((a, b) => a - b).join(',')}`);
    };
    add('give', state.give);
    add('get', state.get);
    // Sorted as strings, for the same reason the ids are sorted: picking the
    // same two picks in a different order should produce the same link.
    const addPicks = (key: string, ids: string[] | undefined) => {
        if (ids?.length) parts.push(`${key}=${[...ids].sort().join(',')}`);
    };
    addPicks('givePicks', state.givePicks);
    addPicks('getPicks', state.getPicks);
    return parts.join('&');
}

/** The whole address, for the copy button and for anything that shares it. */
export function tradeHref(path: string, state: TradeUrlState): string {
    const qs = tradeQuery(state);
    return qs ? `${path}?${qs}` : path;
}
