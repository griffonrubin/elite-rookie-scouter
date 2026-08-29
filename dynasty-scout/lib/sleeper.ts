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

export interface SleeperLeague {
    league_id: string;
    name: string | null;
}

export async function getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
    try {
        const l = await get<SleeperLeague[] | null>(`/user/${userId}/leagues/nfl/${season}`);
        return l ?? [];
    } catch {
        return [];
    }
}

export async function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    try {
        const d = await get<SleeperDraft[] | null>(`/league/${leagueId}/drafts`);
        return d ?? [];
    } catch {
        return [];
    }
}

/**
 * Every draft a username can reach: their own drafts (which is where mock
 * drafts live) plus the drafts of every league they are in.
 *
 * The two sources overlap but neither is complete on its own — /user/drafts
 * carries the mocks, and a league's own draft is not always listed there.
 * Merged and deduped by draft_id, with each league draft carrying its
 * league's name so the list reads as drafts rather than as leagues.
 */
export async function getConnectableDrafts(
    userId: string, season: string,
): Promise<SleeperDraft[]> {
    const [own, leagues] = await Promise.all([
        getUserDrafts(userId, season),
        getUserLeagues(userId, season),
    ]);

    const leagueNames = new Map(leagues.map(l => [l.league_id, l.name ?? null]));
    const fromLeagues = (await Promise.all(
        leagues.map(l => getLeagueDrafts(l.league_id)),
    )).flat();

    const byId = new Map<string, SleeperDraft>();
    for (const d of [...own, ...fromLeagues]) {
        if (!d?.draft_id || d.season !== season) continue;
        const named = d.league_id && !d.metadata?.name
            ? { ...d, metadata: { ...d.metadata, name: leagueNames.get(d.league_id) ?? null } }
            : d;
        // Later writes win, so a league copy fills in a name the user copy lacked.
        byId.set(d.draft_id, byId.has(d.draft_id) ? { ...byId.get(d.draft_id)!, ...named } : named);
    }
    return [...byId.values()].sort(byDraftRelevance);
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

/**
 * Order the picker by what is worth connecting to, not by clock time.
 *
 * Sorting on start_time alone buries the draft you are sitting in: a league
 * draft scheduled for next week carries a later timestamp than a mock that
 * started five minutes ago, so the one you cannot get picks from sorts to
 * the top. Live drafts lead, then paused, then upcoming, then finished.
 */
const STATUS_ORDER: Record<SleeperDraft['status'], number> = {
    drafting: 0, paused: 1, pre_draft: 2, complete: 3,
};

export function byDraftRelevance(a: SleeperDraft, b: SleeperDraft): number {
    const rank = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    return rank !== 0 ? rank : (b.start_time ?? 0) - (a.start_time ?? 0);
}
