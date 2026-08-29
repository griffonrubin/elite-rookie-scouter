/**
 * Thin client for Sleeper's public read-only API.
 *
 * No key, no auth, CORS open — which is exactly what lets the draft sync run
 * entirely in the browser. Nothing about a connection ever touches our
 * server or database: the draft id lives in the visitor's localStorage, so
 * every user can be synced to their own league at once.
 * Docs: https://docs.sleeper.com
 */

const API = 'https://api.sleeper.app/v1';

/**
 * Once a direct call fails at the network layer (CORS stripped by an
 * extension, a corporate proxy, an older browser), every later call goes
 * through our stateless same-origin relay instead. HTTP errors (a 404 for
 * a bad draft id, say) are real answers and never trigger the switch.
 */
let viaProxy = false;

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new HttpError(res.status, url);
    return res.json() as Promise<T>;
}

class HttpError extends Error {
    constructor(public status: number, url: string) {
        super(`Sleeper returned ${status} for ${url}`);
    }
}

export interface SleeperDraft {
    draft_id: string;
    status: 'pre_draft' | 'drafting' | 'paused' | 'complete';
    type: string;               // 'snake' | 'linear' | 'auction'
    season: string;
    start_time: number | null;  // epoch ms
    league_id: string | null;   // null for mock drafts
    metadata?: { name?: string | null } | null;
    settings?: { teams?: number; rounds?: number } | null;
}

export interface SleeperPick {
    player_id: string;          // Sleeper player id; team abbreviation for a D/ST
    pick_no: number;
    round: number;
    metadata?: {
        first_name?: string;
        last_name?: string;
        position?: string;
        team?: string;
    } | null;
}

async function get<T>(path: string): Promise<T> {
    if (!viaProxy) {
        try {
            return await fetchJson<T>(`${API}${path}`);
        } catch (e) {
            if (e instanceof HttpError) throw e;
            // A TypeError here means the request never got an answer —
            // fall back to the relay and stay on it.
            viaProxy = true;
        }
    }
    return fetchJson<T>(`/api/sleeper${path}`);
}

export async function getUserId(username: string): Promise<string | null> {
    // 404s (unknown username) surface as a throw; a null body means the same.
    try {
        const u = await get<{ user_id?: string } | null>(`/user/${encodeURIComponent(username.trim())}`);
        return u?.user_id ?? null;
    } catch {
        return null;
    }
}

export async function getUserDrafts(userId: string, season: string): Promise<SleeperDraft[]> {
    const drafts = await get<SleeperDraft[] | null>(`/user/${userId}/drafts/nfl/${season}`);
    return drafts ?? [];
}

export async function getDraft(draftId: string): Promise<SleeperDraft | null> {
    try {
        return await get<SleeperDraft | null>(`/draft/${draftId}`);
    } catch {
        return null;
    }
}

export async function getDraftPicks(draftId: string): Promise<SleeperPick[]> {
    const picks = await get<SleeperPick[] | null>(`/draft/${draftId}/picks`);
    return picks ?? [];
}

/**
 * Pull a draft id out of whatever the user pastes: a bare id, a
 * sleeper.com/draft/nfl/<id> URL, or a mock-draft URL of the same shape.
 */
export function parseDraftId(input: string): string | null {
    const t = input.trim();
    if (/^\d{10,}$/.test(t)) return t;
    // Sleeper draft ids are long snowflakes; any URL from the draft room
    // (league drafts, mocks, app share links) carries one. Take the first
    // long number rather than betting on one URL shape.
    const m = t.match(/(\d{15,20})/);
    return m && /sleeper/i.test(t) ? m[1] : null;
}

/** Human label for a draft in the picker list. */
export function draftLabel(d: SleeperDraft): string {
    const name = d.metadata?.name || (d.league_id ? 'League draft' : 'Mock draft');
    const teams = d.settings?.teams ? ` · ${d.settings.teams} tm` : '';
    const when = d.start_time ? ` · ${new Date(d.start_time).toLocaleDateString()}` : '';
    return `${name}${teams}${when}`;
}
