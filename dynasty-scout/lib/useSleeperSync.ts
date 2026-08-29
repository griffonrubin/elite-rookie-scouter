'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { getDraft, getDraftPicks, SleeperDraft, SleeperPick } from '@/lib/sleeper';

/**
 * Live sync against a Sleeper draft.
 *
 * The connection is a draft id in THIS browser's localStorage — per visitor,
 * never server-side — so any number of users can each follow their own
 * league at the same time. While connected, the hook polls the public picks
 * endpoint (Sleeper has no public websocket) and maps every pick onto our
 * player slugs, which the board unions with the manually-marked set. The
 * right-click flow is untouched: synced picks are a second, read-only layer
 * that vanishes the moment you disconnect.
 *
 * Poll cadence follows the draft: once a second while it is live, every 15s
 * before it starts, stopped once complete, and paused entirely while the tab
 * is hidden — with an immediate poll the moment you come back to it.
 */

const STORAGE_KEY = 'redraft_sleeper_draft';

/**
 * Picks are polled once a second while the draft is live. Each poll is one
 * request (the draft's own metadata is refreshed far less often — see
 * META_EVERY), so this costs ~60 calls a minute, comfortably inside what
 * Sleeper's public API expects, and puts a pick on the board about as fast
 * as Sleeper's own client shows it.
 */
const LIVE_MS = 1_000;
const IDLE_MS = 15_000;

/** Draft status changes a handful of times; picks change constantly. */
const META_EVERY = 10;

export interface SleeperConnection {
    draftId: string;
    label: string;
}

export interface SleeperSyncState {
    connection: SleeperConnection | null;
    status: SleeperDraft['status'] | 'connecting' | 'error';
    /** Slugs of players already taken in the Sleeper draft. */
    takenSlugs: Set<string>;
    pickCount: number;
    connect: (draftId: string, label: string) => void;
    disconnect: () => void;
}

function readConnection(): SleeperConnection | null {
    if (typeof window === 'undefined') return null;
    try {
        const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return v && typeof v.draftId === 'string' ? v : null;
    } catch {
        return null;
    }
}

/**
 * Map Sleeper picks to our slugs. Skaters match on sleeper_id; a D/ST pick
 * arrives as the team abbreviation (player_id "DET"), so those match on
 * position + team instead.
 */
function slugsForPicks(picks: SleeperPick[], players: RedraftPlayer[]): Set<string> {
    const bySleeperId = new Map<string, string>();
    const dstByTeam = new Map<string, string>();
    for (const p of players) {
        if (p.sleeper_id) bySleeperId.set(String(p.sleeper_id), p.slug);
        if ((p.position || '').toUpperCase() === 'DST' && p.nfl_team) {
            dstByTeam.set(p.nfl_team.toUpperCase(), p.slug);
        }
    }

    const taken = new Set<string>();
    for (const pick of picks) {
        const id = String(pick.player_id);
        const direct = bySleeperId.get(id);
        if (direct) { taken.add(direct); continue; }
        if (/^[A-Z]{2,3}$/.test(id)) {
            const dst = dstByTeam.get(id);
            if (dst) taken.add(dst);
        }
    }
    return taken;
}

export function useSleeperSync(players: RedraftPlayer[]): SleeperSyncState {
    const [connection, setConnection] = useState<SleeperConnection | null>(null);
    const [status, setStatus] = useState<SleeperSyncState['status']>('connecting');
    const [takenSlugs, setTakenSlugs] = useState<Set<string>>(new Set());
    const [pickCount, setPickCount] = useState(0);

    // The poll reads players through a ref so a board re-sort or filter does
    // not tear the interval down and restart it.
    const playersRef = useRef(players);
    playersRef.current = players;

    useEffect(() => { setConnection(readConnection()); }, []);

    useEffect(() => {
        if (!connection) {
            setTakenSlugs(new Set());
            setPickCount(0);
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let inFlight = false;
        let polls = 0;
        let lastStatus: SleeperDraft['status'] | null = null;
        // A draft only ever gains picks, so the count plus the newest pick
        // identifies the state. Re-publishing an unchanged set once a second
        // would re-filter and re-render all 1,300 rows for nothing.
        let lastSignature = '';
        setStatus('connecting');

        const schedule = (ms: number) => {
            if (cancelled) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(run, ms);
        };

        const run = async () => {
            if (cancelled || inFlight) return;
            // Nothing is polled while the tab is hidden; coming back to it
            // triggers an immediate poll rather than waiting out an interval.
            if (document.visibilityState === 'hidden') return;

            inFlight = true;
            let delay = LIVE_MS;
            try {
                const wantMeta = polls % META_EVERY === 0;
                const [picks, draft] = await Promise.all([
                    getDraftPicks(connection.draftId),
                    wantMeta ? getDraft(connection.draftId) : Promise.resolve(null),
                ]);
                if (cancelled) return;
                polls++;

                const signature = `${picks.length}:${picks[picks.length - 1]?.player_id ?? ''}`;
                if (signature !== lastSignature) {
                    lastSignature = signature;
                    setTakenSlugs(slugsForPicks(picks, playersRef.current));
                    setPickCount(picks.length);
                }

                if (draft) {
                    lastStatus = draft.status;
                    setStatus(draft.status);
                } else if (wantMeta) {
                    // Metadata was asked for and did not come back: the draft id
                    // is bad or Sleeper is down. Picks alone cannot tell us.
                    setStatus('error');
                    delay = IDLE_MS;
                }
                if (lastStatus === 'complete') return;     // final — stop polling
                if (lastStatus === 'pre_draft') delay = IDLE_MS;
            } catch {
                if (cancelled) return;
                setStatus('error');
                delay = IDLE_MS;   // transient failure — keep trying, slower
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
    }, [connection]);

    const connect = useCallback((draftId: string, label: string) => {
        const conn = { draftId, label };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
        setConnection(conn);
    }, []);

    const disconnect = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setConnection(null);
    }, []);

    return { connection, status, takenSlugs, pickCount, connect, disconnect };
}
