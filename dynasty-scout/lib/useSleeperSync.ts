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
 * Poll cadence follows the draft: every 3s while it is live, every 20s
 * before it starts, stopped once complete, and paused entirely while the
 * tab is hidden.
 */

const STORAGE_KEY = 'redraft_sleeper_draft';
const LIVE_MS = 3_000;
const IDLE_MS = 20_000;

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
        setStatus('connecting');

        const tick = async () => {
            if (cancelled) return;
            if (document.visibilityState === 'hidden') {
                timer = setTimeout(tick, LIVE_MS);
                return;
            }
            let delay = LIVE_MS;
            try {
                const [draft, picks] = await Promise.all([
                    getDraft(connection.draftId),
                    getDraftPicks(connection.draftId),
                ]);
                if (cancelled) return;
                if (!draft) {
                    setStatus('error');
                    delay = IDLE_MS;
                } else {
                    setStatus(draft.status);
                    setTakenSlugs(slugsForPicks(picks, playersRef.current));
                    setPickCount(picks.length);
                    if (draft.status === 'complete') return; // final state — stop polling
                    if (draft.status === 'pre_draft') delay = IDLE_MS;
                }
            } catch {
                if (cancelled) return;
                setStatus('error');
                delay = IDLE_MS; // transient network failure — keep trying, slower
            }
            timer = setTimeout(tick, delay);
        };

        tick();
        const onVisible = () => { if (document.visibilityState === 'visible') { /* next tick catches up */ } };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
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
