'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import {
    getCurrentWeek, getLeague, getLeagueRosters, getLeagueUsers, getMatchups, teamName,
} from '@/lib/sleeper';
import { readEspnCreds } from '@/lib/espn';

/**
 * Your lineup, and the one you are playing this week.
 *
 * The draft sync answers "who is gone". This answers "who do I have, who am
 * I playing, and what have they started" — which is what a start/sit call
 * needs and what turns the model into advice about your team rather than
 * about players in the abstract.
 *
 * Same shape as useDraftSync deliberately: the connection is one object in
 * THIS browser's localStorage, never server-side, so any number of people
 * can each follow their own league. Both platforms are reduced to the same
 * snapshot and everything past fetching is platform-agnostic.
 */

const STORAGE_KEY = 'redraft_league_sync';
/** Every league this browser has connected, not just the current one. */
const SAVED_KEY = 'redraft_league_saved';

/** Slots that are not part of the lineup being set. */
/** Slots that are not part of the lineup, so not part of its shape. */
export const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);

export type LeaguePlatform = 'sleeper' | 'espn';

export interface LeagueConnection {
    platform: LeaguePlatform;
    /** Sleeper league id, or ESPN league id. */
    id: string;
    label: string;
    season: string;
    /** Sleeper roster_id, or ESPN teamId. Which team in the league is yours. */
    teamKey?: string;
}

/** One roster spot, in whichever id space the platform uses. */
export interface LeagueSlot {
    playerId: string;
    dstTeam?: string | null;
    starting: boolean;
    /** The platform's slot label where it gives one (QB, FLEX, BN). */
    slot?: string | null;
}

export interface LeagueTeam {
    key: string;
    name: string;
    slots: LeagueSlot[];
    /** The starting lineup in slot order, empty spots included. */
    lineupSlots?: { slot: string; playerId: string | null }[];
    /**
     * What has happened so far, where the platform reports it.
     *
     * Kept because a record and a roster are different claims, and early in
     * a season the gap between them is the most interesting thing in a
     * league: 3-0 with the sixth-best roster is a fact about the schedule.
     */
    record?: {
        wins: number; losses: number; ties: number;
        pointsFor: number; pointsAgainst: number;
    };
}

export interface LeagueSnapshot {
    leagueName: string | null;
    week: number | null;
    teams: LeagueTeam[];
    /** key of the team your team plays this week. */
    opponentKeyFor: Record<string, string | null>;
    /** Slot names in lineup order, where the platform reports them. */
    rosterPositions?: string[] | null;
    /** True in a best-ball league: the platform scores the optimal lineup
        itself, so there is no start/sit call to make. */
    bestBall?: boolean;
}

export interface MatchedSide {
    team: LeagueTeam | null;
    /** Pool players, split by whether the platform has them starting. */
    starters: RedraftPlayer[];
    bench: RedraftPlayer[];
    /** Roster spots that matched no player in our pool. */
    unmatched: number;
}

export interface LeagueSyncState {
    connection: LeagueConnection | null;
    status: 'idle' | 'loading' | 'ready' | 'error' | 'needsCreds';
    snapshot: LeagueSnapshot | null;
    me: MatchedSide;
    opponent: MatchedSide;
    week: number | null;
    connect: (c: LeagueConnection) => void;
    disconnect: () => void;
    setTeam: (key: string) => void;
    /** Every team this browser knows, for the switcher. */
    saved: LeagueConnection[];
    /** Switch to a saved team without reconnecting. */
    switchTo: (c: LeagueConnection) => void;
    forget: (c: LeagueConnection) => void;
    setWeek: (w: number) => void;
    refresh: () => void;
}

function readConnection(): LeagueConnection | null {
    if (typeof window === 'undefined') return null;
    try {
        const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return v && typeof v.id === 'string' ? v : null;
    } catch {
        return null;
    }
}

/** A league and team together identify one of someone's teams. */
export function connectionKey(c: LeagueConnection): string {
    return `${c.platform}:${c.id}:${c.teamKey ?? ''}`;
}

/**
 * Every team this browser has connected.
 *
 * Managing several teams is the normal case, and making someone disconnect
 * and re-enter a username to look at their other league is the kind of
 * friction that stops a tool being opened at all. The list is kept beside the
 * current connection rather than replacing it, so an existing single
 * connection survives the upgrade and simply becomes the first entry.
 */
export function readSaved(): LeagueConnection[] {
    if (typeof window === 'undefined') return [];
    let saved: LeagueConnection[] = [];
    try {
        const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
        if (Array.isArray(v)) saved = v.filter(c => c && typeof c.id === 'string');
    } catch { /* a corrupt list is the same as no list */ }
    // Fold in whatever the single-connection key holds, so nothing a user
    // already set up disappears the first time they load the new build.
    const current = readConnection();
    if (current && !saved.some(c => connectionKey(c) === connectionKey(current))) {
        saved = [current, ...saved];
    }
    return saved;
}

function writeSaved(list: LeagueConnection[]) {
    try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 12)));
    } catch { /* storage full or blocked: the session still works */ }
}

/** Add or replace one team in the saved list, newest first. */
export function rememberConnection(c: LeagueConnection): LeagueConnection[] {
    const key = connectionKey(c);
    const next = [c, ...readSaved().filter(x => connectionKey(x) !== key)];
    writeSaved(next);
    return next;
}

export function forgetConnection(c: LeagueConnection): LeagueConnection[] {
    const key = connectionKey(c);
    const next = readSaved().filter(x => connectionKey(x) !== key);
    writeSaved(next);
    return next;
}

const EMPTY: MatchedSide = { team: null, starters: [], bench: [], unmatched: 0 };

/**
 * Map a platform's roster ids onto our players.
 *
 * Same id spaces as the draft sync — Sleeper's `sleeper_id`, ESPN's
 * `espn_nfl_id` — with defenses matched on the team abbreviation, because
 * neither platform names a defense as a player.
 */
function matchSide(
    team: LeagueTeam | null, players: RedraftPlayer[], platform: LeaguePlatform,
): MatchedSide {
    if (!team) return EMPTY;
    const byId = new Map<string, RedraftPlayer>();
    const byDst = new Map<string, RedraftPlayer>();
    for (const p of players) {
        const id = platform === 'espn' ? p.espn_nfl_id : p.sleeper_id;
        // A non-integer ESPN id is a source file's missing-value sentinel,
        // not an id — the same guard the draft matcher carries.
        const usable = platform === 'espn' ? /^-?\d+$/.test(String(id ?? '')) : !!id;
        if (id && usable) byId.set(String(id), p);
        if ((p.position || '').toUpperCase() === 'DST' && p.nfl_team) {
            byDst.set(p.nfl_team.toUpperCase(), p);
        }
    }

    const starters: RedraftPlayer[] = [];
    const bench: RedraftPlayer[] = [];
    let unmatched = 0;
    for (const s of team.slots) {
        const teamAbbr = s.dstTeam
            ?? (/^[A-Z]{2,3}$/.test(s.playerId) ? s.playerId : null);
        const hit = (teamAbbr ? byDst.get(teamAbbr.toUpperCase()) : undefined)
            ?? byId.get(s.playerId);
        if (!hit) { unmatched++; continue; }
        (s.starting ? starters : bench).push(hit);
    }
    return { team, starters, bench, unmatched };
}

async function fetchSleeper(conn: LeagueConnection, week: number): Promise<LeagueSnapshot | null> {
    const [league, rosters, users, matchups] = await Promise.all([
        getLeague(conn.id), getLeagueRosters(conn.id),
        getLeagueUsers(conn.id), getMatchups(conn.id, week),
    ]);
    if (rosters.length === 0) return null;

    const userById = new Map(users.map(u => [u.user_id, u]));
    const startersByRoster = new Map(matchups.map(m => [m.roster_id, m.starters ?? []]));
    const matchupOf = new Map(matchups.map(m => [m.roster_id, m.matchup_id]));

    // Sleeper's starters array is in roster_positions order with the bench
    // removed, so the two zip: position i of the lineup is position i of the
    // startable slots. That pairing is what makes a slot view possible at all
    // — without it a lineup is just a set of players who happen to be active.
    const startableSlots = (league?.roster_positions ?? [])
        .filter(s => !BENCH_SLOTS.has(s.toUpperCase()));

    const teams: LeagueTeam[] = rosters.map(r => {
        // Before a week is scored Sleeper reports no matchup, so the roster's
        // own starters stand in — which is exactly the lineup being set.
        const startingOrder = startersByRoster.get(r.roster_id) ?? r.starters ?? [];
        const slotOf = new Map<string, string>();
        startingOrder.forEach((pid, i) => {
            if (pid && pid !== '0') slotOf.set(pid, startableSlots[i] ?? 'FLEX');
        });
        const starting = new Set(startingOrder.filter(p => p && p !== '0'));
        // Injured reserve and the taxi squad are on the roster and cannot be
        // started. Offering them as candidates for a slot would be offering a
        // move the platform will refuse.
        const unavailable = new Set([...(r.reserve ?? []), ...(r.taxi ?? [])]);
        const all = (r.players ?? []).filter(p => !unavailable.has(p) || starting.has(p));
        return {
            key: String(r.roster_id),
            name: teamName(userById.get(r.owner_id ?? '')),
            slots: all.map(pid => ({
                playerId: pid,
                starting: starting.has(pid),
                slot: slotOf.get(pid) ?? null,
            })),
            // The shape of the lineup, kept even where a slot is empty or
            // holds a player we could not match, so the view can show a hole
            // rather than quietly closing the gap.
            lineupSlots: startingOrder.map((pid, i) => ({
                slot: startableSlots[i] ?? 'FLEX',
                playerId: pid && pid !== '0' ? pid : null,
            })),
            record: r.settings ? {
                wins: r.settings.wins ?? 0,
                losses: r.settings.losses ?? 0,
                ties: r.settings.ties ?? 0,
                pointsFor: (r.settings.fpts ?? 0)
                    + (r.settings.fpts_decimal ?? 0) / 100,
                pointsAgainst: (r.settings.fpts_against ?? 0)
                    + (r.settings.fpts_against_decimal ?? 0) / 100,
            } : undefined,
        };
    });

    const opponentKeyFor: Record<string, string | null> = {};
    for (const r of rosters) {
        const mine = matchupOf.get(r.roster_id);
        const opp = mine == null ? null
            : rosters.find(o => o.roster_id !== r.roster_id && matchupOf.get(o.roster_id) === mine);
        opponentKeyFor[String(r.roster_id)] = opp ? String(opp.roster_id) : null;
    }

    return {
        leagueName: league?.name ?? null,
        week,
        teams,
        opponentKeyFor,
        rosterPositions: league?.roster_positions ?? null,
        bestBall: league?.settings?.best_ball === 1,
    };
}

async function fetchEspn(conn: LeagueConnection, week: number): Promise<LeagueSnapshot | null> {
    const creds = readEspnCreds();
    const headers: Record<string, string> = {};
    if (creds) { headers['x-espn-swid'] = creds.swid; headers['x-espn-s2'] = creds.s2; }
    const res = await fetch(
        `/api/espn/league?leagueId=${encodeURIComponent(conn.id)}`
        + `&season=${encodeURIComponent(conn.season)}&week=${week}`,
        { headers, cache: 'no-store' });
    if (res.status === 403) throw new Error('private');
    if (!res.ok) return null;
    const d = await res.json();

    const teams: LeagueTeam[] = (d.teams ?? []).map((t: any) => ({
        key: String(t.teamId),
        name: t.name,
        slots: (t.entries ?? []).map((e: any) => ({
            playerId: String(e.playerId), dstTeam: e.dstTeam, starting: !!e.starting,
        })),
    }));
    const opponentKeyFor: Record<string, string | null> = {};
    for (const t of d.teams ?? []) {
        opponentKeyFor[String(t.teamId)] =
            t.opponentTeamId != null ? String(t.opponentTeamId) : null;
    }
    return { leagueName: d.name ?? null, week: d.week ?? week, teams, opponentKeyFor };
}

export function useLeagueSync(players: RedraftPlayer[]): LeagueSyncState {
    const [connection, setConnection] = useState<LeagueConnection | null>(null);
    const [status, setStatus] = useState<LeagueSyncState['status']>('idle');
    const [snapshot, setSnapshot] = useState<LeagueSnapshot | null>(null);
    const [week, setWeekState] = useState<number | null>(null);
    const [nonce, setNonce] = useState(0);

    const playersRef = useRef(players);
    playersRef.current = players;

    useEffect(() => { setConnection(readConnection()); }, []);

    // The league's own week unless the user has picked another, so the page
    // opens on the decision they actually have to make.
    useEffect(() => {
        if (week != null) return;
        let live = true;
        getCurrentWeek().then(w => { if (live && w) setWeekState(w); });
        return () => { live = false; };
    }, [week]);

    const key = connection ? `${connection.platform}:${connection.id}:${connection.season}` : null;

    useEffect(() => {
        if (!key || !connection || week == null) { setSnapshot(null); return; }
        let cancelled = false;
        setStatus('loading');
        const run = connection.platform === 'espn' ? fetchEspn : fetchSleeper;
        run(connection, week)
            .then(s => {
                if (cancelled) return;
                setSnapshot(s);
                setStatus(s ? 'ready' : 'error');
            })
            .catch((e: Error) => {
                if (cancelled) return;
                setStatus(e?.message === 'private' ? 'needsCreds' : 'error');
                setSnapshot(null);
            });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, week, nonce]);

    const myTeam = snapshot?.teams.find(t => t.key === connection?.teamKey) ?? null;
    const oppKey = myTeam ? snapshot?.opponentKeyFor[myTeam.key] ?? null : null;
    const oppTeam = oppKey ? snapshot?.teams.find(t => t.key === oppKey) ?? null : null;
    const platform = connection?.platform ?? 'sleeper';

    const [saved, setSaved] = useState<LeagueConnection[]>([]);
    // Read once on mount: localStorage is not available during render on the
    // server, and the migration in readSaved has to run in the browser.
    useEffect(() => { setSaved(readSaved()); }, []);

    const connect = useCallback((c: LeagueConnection) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
        // Only remember a team once it is actually a team. Connecting a
        // league and then picking a side are two steps, and half of one is
        // not worth a row in the switcher.
        if (c.teamKey) setSaved(rememberConnection(c));
        setConnection(c);
    }, []);

    const switchTo = useCallback((c: LeagueConnection) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
        // Set the connection and nothing else. The fetch effect is keyed on
        // platform, league and season, so moving to another league refetches
        // and moving to another team in the same league reuses the snapshot
        // already loaded — which is the whole point of the switcher. Clearing
        // the snapshot here left the second case with no data and no refetch
        // to replace it.
        setConnection(c);
    }, []);

    const forget = useCallback((c: LeagueConnection) => {
        setSaved(forgetConnection(c));
    }, []);
    const disconnect = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setConnection(null);
        setSnapshot(null);
        setStatus('idle');
    }, []);
    const setTeam = useCallback((teamKey: string) => {
        setConnection(prev => {
            if (!prev) return prev;
            const next = { ...prev, teamKey };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            setSaved(rememberConnection(next));
            return next;
        });
    }, []);

    return {
        connection, status, snapshot, week,
        me: matchSide(myTeam, playersRef.current, platform),
        opponent: matchSide(oppTeam, playersRef.current, platform),
        connect, disconnect, setTeam, saved, switchTo, forget,
        setWeek: (w: number) => setWeekState(w),
        refresh: () => setNonce(n => n + 1),
    };
}
