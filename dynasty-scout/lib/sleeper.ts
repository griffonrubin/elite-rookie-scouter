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
    const res = await fetch(`${API}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Sleeper returned ${res.status} for ${path}`);
    return res.json() as Promise<T>;
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
    const m = t.match(/draft\/nfl\/(\d{10,})/);
    return m ? m[1] : null;
}

/** Human label for a draft in the picker list. */
export function draftLabel(d: SleeperDraft): string {
    const name = d.metadata?.name || (d.league_id ? 'League draft' : 'Mock draft');
    const teams = d.settings?.teams ? ` · ${d.settings.teams} tm` : '';
    const when = d.start_time ? ` · ${new Date(d.start_time).toLocaleDateString()}` : '';
    return `${name}${teams}${when}`;
}
