/**
 * Client for the ESPN draft relay.
 *
 * ESPN's fantasy API sends no CORS headers, so unlike Sleeper there is no
 * direct path from the browser — every call goes through /api/espn/draft,
 * which forwards one GET and stores nothing.
 *
 * Private leagues need the two cookies ESPN sets for a signed-in user. They
 * live in this browser's localStorage and ride along as request headers, so
 * they stay out of URLs and logs and are never persisted on our side.
 */

export interface EspnCreds {
    swid: string;
    s2: string;
}

export interface EspnDraft {
    status: 'pre_draft' | 'drafting' | 'complete';
    name: string | null;
    teams: number;
    snake: boolean;
    rounds: number;
    picks: { playerId: string; dstTeam: string | null }[];
}

const CREDS_KEY = 'redraft_espn_creds';

export function readEspnCreds(): EspnCreds | null {
    if (typeof window === 'undefined') return null;
    try {
        const v = JSON.parse(localStorage.getItem(CREDS_KEY) || 'null');
        return v?.swid && v?.s2 ? v : null;
    } catch {
        return null;
    }
}

export function saveEspnCreds(creds: EspnCreds | null): void {
    if (creds) localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
    else localStorage.removeItem(CREDS_KEY);
}

/**
 * Pull a league id out of whatever the user pastes.
 *
 * Every ESPN fantasy URL carries it as ?leagueId=, and people also just
 * paste the bare number.
 */
export function parseLeagueId(input: string): string | null {
    const t = input.trim();
    if (/^\d{3,12}$/.test(t)) return t;
    const m = t.match(/leagueId[=/](\d{3,12})/i);
    return m ? m[1] : null;
}

/**
 * Fetch the draft, or throw 'private' when ESPN wants credentials — the one
 * failure the UI can actually do something about.
 */
export async function fetchEspnDraft(
    leagueId: string, season: string, creds: EspnCreds | null,
): Promise<EspnDraft | null> {
    const headers: Record<string, string> = {};
    if (creds) {
        headers['x-espn-swid'] = creds.swid;
        headers['x-espn-s2'] = creds.s2;
    }
    const res = await fetch(
        `/api/espn/draft?leagueId=${encodeURIComponent(leagueId)}&season=${encodeURIComponent(season)}`,
        { headers, cache: 'no-store' },
    );
    if (res.status === 403) throw new Error('private');
    if (!res.ok) return null;
    return res.json() as Promise<EspnDraft>;
}
