'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { getDraft, getDraftPicks } from '@/lib/sleeper';
import { fetchEspnDraft, readEspnCreds } from '@/lib/espn';

/**
 * Live sync against a draft on Sleeper or ESPN.
 *
 * The connection is one small object in THIS browser's localStorage — never
 * server-side — so any number of people can each follow their own league at
 * once. Everything past fetching is platform-agnostic: both services are
 * reduced to the same snapshot (a status, the board shape, and the picks so
 * far), and the rest of the hook works on that.
 *
 * The picks become a read-only layer the board unions with the manually
 * marked set, so the right-click flow is untouched and disconnecting drops
 * the synced players instantly.
 *
 * Poll cadence follows the draft: fast while it is live, slow before it
 * starts, stopped once complete, paused while the tab is hidden, and an
 * immediate poll the moment you come back to it.
 */

const STORAGE_KEY = 'redraft_draft_sync';
/** What the Sleeper-only version used; migrated on first read. */
const LEGACY_KEY = 'redraft_sleeper_draft';

/** Sleeper answers in ~100ms; ESPN goes through our relay, so ease off. */
const LIVE_MS: Record<DraftPlatform, number> = { sleeper: 1_000, espn: 2_500 };
const IDLE_MS = 15_000;

/** Draft status changes a handful of times; picks change constantly. */
const META_EVERY = 10;

export type DraftPlatform = 'sleeper' | 'espn';
export type DraftStatus =
    | 'pre_draft' | 'drafting' | 'paused' | 'complete' | 'connecting' | 'error';

export interface DraftConnection {
    platform: DraftPlatform;
    /** Sleeper draft id, or ESPN league id. */
    id: string;
    label: string;
    /** ESPN needs the season to address a league; Sleeper does not. */
    season?: string;
    /**
     * 1-based draft slot you pick from. Both services can map accounts to
     * slots, but a pasted mock link carries no account, so this is chosen.
     */
    slot?: number;
}

/** Board shape needed to work out when your next turn comes round. */
export interface DraftShapeInfo {
    teams: number;
    snake: boolean;
    rounds: number;
}

/** One pick, in whichever id space the platform uses. */
export interface RawPick {
    playerId: string;
    /** Set when the platform identifies a D/ST by team rather than player. */
    dstTeam?: string | null;
}

export interface DraftSnapshot {
    status: Exclude<DraftStatus, 'connecting' | 'error'>;
    shape: DraftShapeInfo;
    picks: RawPick[];
    /** Filled in when the platform names the league for us. */
    label?: string | null;
}

export interface DraftSyncState {
    connection: DraftConnection | null;
    /** Connection label, upgraded to the league's real name once known. */
    label: string;
    status: DraftStatus;
    /** Slugs of players already taken in the connected draft. */
    takenSlugs: Set<string>;
    pickCount: number;
    /** Picks that arrived but matched no player in our pool. */
    unmatched: number;
    shape: DraftShapeInfo | null;
    /** Set when the platform refused the league for want of credentials. */
    needsCreds: boolean;
    connect: (conn: DraftConnection) => void;
    disconnect: () => void;
    setSlot: (slot: number | undefined) => void;
}

function readConnection(): DraftConnection | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const v = JSON.parse(raw);
            return v && typeof v.id === 'string' ? v : null;
        }
        // Anyone connected before ESPN existed keeps their Sleeper draft.
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
        if (legacy && typeof legacy.draftId === 'string') {
            return {
                platform: 'sleeper',
                id: legacy.draftId,
                label: legacy.label ?? 'Sleeper draft',
                slot: legacy.slot,
            };
        }
        return null;
    } catch {
        return null;
    }
}

/** Fetch one platform-neutral snapshot of the draft. */
async function fetchSnapshot(
    conn: DraftConnection, wantMeta: boolean, lastShape: DraftShapeInfo | null,
): Promise<DraftSnapshot | null> {
    if (conn.platform === 'espn') {
        // ESPN answers the whole draft in one call, so there is nothing to
        // split between a cheap poll and an occasional one.
        const d = await fetchEspnDraft(conn.id, conn.season ?? '2026', readEspnCreds());
        if (!d) return null;
        return {
            status: d.status,
            shape: { teams: d.teams, snake: d.snake, rounds: d.rounds },
            picks: d.picks.map(p => ({ playerId: p.playerId, dstTeam: p.dstTeam })),
            label: d.name,
        };
    }

    const [picks, draft] = await Promise.all([
        getDraftPicks(conn.id),
        wantMeta ? getDraft(conn.id) : Promise.resolve(null),
    ]);
    // Sleeper's metadata is only refreshed occasionally; between refreshes
    // the shape and status we already know still stand.
    if (!draft && !lastShape) return null;
    return {
        status: draft?.status ?? 'drafting',
        shape: draft
            ? {
                teams: draft.settings?.teams ?? 12,
                // Sleeper calls a straight order 'linear'; the rest reverse.
                snake: (draft.type ?? 'snake') !== 'linear',
                rounds: draft.settings?.rounds ?? 15,
            }
            : lastShape!,
        picks: picks.map(p => ({ playerId: String(p.player_id) })),
    };
}

/**
 * Map picks onto our players.
 *
 * Each platform has its own id space — Sleeper's `sleeper_id`, ESPN's
 * `espn_nfl_id` — and each identifies a team defense by the team rather than
 * by a player, which is why D/ST matches on the abbreviation instead.
 */
function matchPicks(
    picks: RawPick[], players: RedraftPlayer[], platform: DraftPlatform,
): { slugs: Set<string>; unmatched: number } {
    const byId = new Map<string, string>();
    const dstByTeam = new Map<string, string>();
    for (const p of players) {
        const id = platform === 'espn' ? p.espn_nfl_id : p.sleeper_id;
        if (id) byId.set(String(id), p.slug);
        if ((p.position || '').toUpperCase() === 'DST' && p.nfl_team) {
            dstByTeam.set(p.nfl_team.toUpperCase(), p.slug);
        }
    }

    const slugs = new Set<string>();
    let unmatched = 0;
    for (const pick of picks) {
        // ESPN hands us the team directly; Sleeper puts it in the id itself.
        const team = pick.dstTeam
            ?? (/^[A-Z]{2,3}$/.test(pick.playerId) ? pick.playerId : null);
        if (team) {
            const dst = dstByTeam.get(team.toUpperCase());
            if (dst) { slugs.add(dst); continue; }
        }
        const hit = byId.get(pick.playerId);
        if (hit) slugs.add(hit);
        else unmatched++;
    }
    return { slugs, unmatched };
}

export function useDraftSync(players: RedraftPlayer[]): DraftSyncState {
    const [connection, setConnection] = useState<DraftConnection | null>(null);
    const [status, setStatus] = useState<DraftStatus>('connecting');
    const [takenSlugs, setTakenSlugs] = useState<Set<string>>(new Set());
    const [pickCount, setPickCount] = useState(0);
    const [unmatched, setUnmatched] = useState(0);
    const [shape, setShape] = useState<DraftShapeInfo | null>(null);
    const [needsCreds, setNeedsCreds] = useState(false);
    // ESPN names the league in its reply; a pasted id cannot.
    const [remoteLabel, setRemoteLabel] = useState<string | null>(null);

    // The poll reads players through a ref so a board re-sort or filter does
    // not tear the interval down and restart it.
    const playersRef = useRef(players);
    playersRef.current = players;

    useEffect(() => { setConnection(readConnection()); }, []);

    // Keyed on what actually addresses the draft, so changing your slot
    // re-renders without restarting the polling loop.
    const key = connection ? `${connection.platform}:${connection.id}:${connection.season ?? ''}` : null;

    useEffect(() => {
        if (!key || !connection) {
            setTakenSlugs(new Set());
            setPickCount(0);
            setUnmatched(0);
            setShape(null);
            setNeedsCreds(false);
            setRemoteLabel(null);
            return;
        }
        const conn = connection;
        const liveMs = LIVE_MS[conn.platform];

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let inFlight = false;
        let polls = 0;
        let lastStatus: DraftSnapshot['status'] | null = null;
        let lastShape: DraftShapeInfo | null = null;
        // A draft only ever gains picks, so the count plus the newest pick
        // identifies the state. Re-publishing an unchanged set every second
        // would re-filter and re-render all 1,300 rows for nothing.
        let lastSignature = '';
        setStatus('connecting');
        setRemoteLabel(null);

        const schedule = (ms: number) => {
            if (cancelled) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(run, ms);
        };

        const run = async () => {
            if (cancelled || inFlight) return;
            if (document.visibilityState === 'hidden') return;

            inFlight = true;
            let delay = liveMs;
            try {
                const snap = await fetchSnapshot(conn, polls % META_EVERY === 0, lastShape);
                if (cancelled) return;
                polls++;

                if (!snap) {
                    setStatus('error');
                    delay = IDLE_MS;
                } else {
                    setNeedsCreds(false);
                    lastStatus = snap.status;
                    lastShape = snap.shape;
                    setStatus(snap.status);
                    setShape(snap.shape);
                    if (snap.label) setRemoteLabel(snap.label);

                    const sig = `${snap.picks.length}:${snap.picks[snap.picks.length - 1]?.playerId ?? ''}`;
                    if (sig !== lastSignature) {
                        lastSignature = sig;
                        const m = matchPicks(snap.picks, playersRef.current, conn.platform);
                        setTakenSlugs(m.slugs);
                        setUnmatched(m.unmatched);
                        setPickCount(snap.picks.length);
                    }
                    if (snap.status === 'complete') return;   // final — stop polling
                    if (snap.status === 'pre_draft') delay = IDLE_MS;
                }
            } catch (e) {
                if (cancelled) return;
                // A private ESPN league is a fixable state, not a failure.
                setNeedsCreds((e as Error)?.message === 'private');
                setStatus('error');
                delay = IDLE_MS;
            } finally {
                inFlight = false;
            }
            schedule(delay);
        };

        run();
        const onVisibility = () => {
            if (document.visibilityState === 'visible') schedule(0);
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
        };
    // `connection` is read inside, but only these fields change the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const connect = useCallback((conn: DraftConnection) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
        localStorage.removeItem(LEGACY_KEY);
        setConnection(conn);
    }, []);

    const disconnect = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_KEY);
        setConnection(null);
    }, []);

    const setSlot = useCallback((slot: number | undefined) => {
        setConnection(prev => {
            if (!prev) return prev;
            const next = { ...prev, slot };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    return {
        connection, label: remoteLabel ?? connection?.label ?? '',
        status, takenSlugs, pickCount, unmatched, shape,
        needsCreds, connect, disconnect, setSlot,
    };
}
