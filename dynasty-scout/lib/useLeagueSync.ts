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
}

export interface LeagueSnapshot {
    leagueName: string | null;
    week: number | null;
    teams: LeagueTeam[];
    /** key of the team your team plays this week. */
    opponentKeyFor: Record<string, string | null>;
    /** Slot names in lineup order, where the platform reports them. */
    rosterPositions?: string[] | null;
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

    const teams: LeagueTeam[] = rosters.map(r => {
        // Before a week is scored Sleeper reports no matchup, so the roster's
        // own starters stand in — which is exactly the lineup being set.
        const starting = new Set(startersByRoster.get(r.roster_id) ?? r.starters ?? []);
        const all = r.players ?? [];
        return {
            key: String(r.roster_id),
            name: teamName(userById.get(r.owner_id ?? '')),
            slots: all.map(pid => ({ playerId: pid, starting: starting.has(pid) })),
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

    const connect = useCallback((c: LeagueConnection) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
        setConnection(c);
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
            return next;
        });
    }, []);

    return {
        connection, status, snapshot, week,
        me: matchSide(myTeam, playersRef.current, platform),
        opponent: matchSide(oppTeam, playersRef.current, platform),
        connect, disconnect, setTeam,
        setWeek: (w: number) => setWeekState(w),
        refresh: () => setNonce(n => n + 1),
    };
}
