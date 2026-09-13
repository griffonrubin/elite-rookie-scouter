'use client';

import React, { useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { BENCH_SLOTS, useLeagueSync } from '@/lib/useLeagueSync';
import { SimPlayer } from '@/lib/startSit';
import { useStartSitData } from '@/lib/useStartSit';
import { simInputFor, simPlayerFrom } from '@/lib/simInput';
import { evaluateTrade, TradeResult, TradeRosterPlayer, TradeTeam } from '@/lib/trade';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { RosterPicker } from './RosterPicker';
import { TradeVerdict } from './TradeVerdict';

const SEASON = 2026;
const TRIALS = 20000;

/** The lineup shape when the platform does not report one. */
const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

/**
 * A trade, judged on what it does rather than on what it is worth.
 *
 * Pick a partner, pick who goes each way, and the whole league plays its
 * round robin twice: once as things stand and once with both rosters
 * re-filled from their best available players. The answer is the change in
 * how often each side wins — which prices the shape of a lineup, and a value
 * ranking cannot.
 *
 * Both rosters are shown in full and every player is clickable, because the
 * question is never "is this trade good" in the abstract. It is "what else
 * could I have offered instead", and that is a question you answer by trying
 * things.
 */
export function TradeClient({ players }: { players: RedraftPlayer[] }) {
    const league = useLeagueSync(players);
    /** Null until the reader picks one; the default below stands in. */
    const [partner, setPartner] = useState<string | null>(null);
    const [myGive, setMyGive] = useState<Set<number>>(new Set());
    const [theirGive, setTheirGive] = useState<Set<number>>(new Set());

    const myKey = league.connection?.teamKey ?? null;

    /** Every team's whole roster, resolved to our own player ids. */
    const teams = useMemo(() => {
        const snap = league.snapshot;
        if (!snap) return null;
        const espn = league.connection?.platform === 'espn';
        const byPlatformId = new Map(players.map(p =>
            [String(espn ? p.espn_nfl_id : p.sleeper_id), p]));
        return snap.teams.map(t => {
            const starting = new Set<number>();
            const roster: TradeRosterPlayer[] = [];
            for (const s of t.slots) {
                const hit = byPlatformId.get(String(s.playerId));
                if (!hit) continue;
                roster.push({
                    id: hit.id,
                    name: hit.full_name ?? String(hit.id),
                    position: hit.position ?? '',
                    // The sync has already dropped injured reserve and taxi,
                    // so whoever is left here can be started.
                    startable: true,
                });
                if (s.starting) starting.add(hit.id);
            }
            return { key: t.key, name: t.name, roster, starting, record: t.record };
        });
    }, [league.snapshot, league.connection?.platform, players]);

    /** The lineup shape, which is what makes a player startable or spare. */
    const slots = useMemo(() => {
        const rp = league.snapshot?.rosterPositions;
        if (!rp?.length) return DEFAULT_SLOTS;
        return rp.filter(s => !BENCH_SLOTS.has(s.toUpperCase()));
    }, [league.snapshot?.rosterPositions]);

    // Every rostered player in the league, not just the starters: a trade is
    // about the bench as much as the lineup, and the partner can change
    // without a new request this way.
    const needed = useMemo(() => {
        const ids = new Set<number>();
        for (const t of teams ?? []) for (const p of t.roster) ids.add(p.id);
        return [...ids].sort((a, b) => a - b);
    }, [teams]);

    const week = league.week;
    // One hook, one cache: every In Season page asks about the same league,
    // so the page a reader lands on second only pays for the ids the first
    // one did not already fetch. It also chunks to the endpoint's own limit,
    // which is the bug four hand-rolled copies of this produced.
    const { data, loading, failed } = useStartSitData(needed, week);

    const ready = needed.length > 0 && data.size > 0 && !failed;

    /** One simulation input per player, built once. */
    const simOf = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]));
        const cache = new Map<number, SimPlayer | null>();
        return (id: number): SimPlayer | null => {
            if (cache.has(id)) return cache.get(id)!;
            const p = byId.get(id);
            const d = data.get(id);
            // A player with no row from the endpoint has no week, and
            // guessing one is how a trade gets evaluated against a lineup
            // nobody ever saw.
            const v = p && d ? simPlayerFrom(simInputFor(p, d, SEASON)) : null;
            cache.set(id, v);
            return v;
        };
    }, [players, data]);

    const meanOf = (id: number) => simOf(id)?.outcome.mean ?? null;

    /**
     * Who to price against before the reader has chosen.
     *
     * This week's opponent, who is the team a reader is most likely thinking
     * about, and otherwise the next one along. Derived rather than stored:
     * writing it into state from an effect means the first paint shows no
     * partner and the second shows one, which is a render cascade and a
     * visible flicker for a value that is a pure function of the snapshot.
     */
    const defaultPartner = useMemo(() => {
        if (!teams || !myKey) return null;
        const opp = league.snapshot?.opponentKeyFor?.[myKey];
        return (opp && opp !== myKey && teams.some(t => t.key === opp))
            ? opp
            : teams.find(t => t.key !== myKey)?.key ?? null;
    }, [teams, myKey, league.snapshot?.opponentKeyFor]);

    const partnerKey = partner ?? defaultPartner;
    const me = teams?.find(t => t.key === myKey) ?? null;
    const them = teams?.find(t => t.key === partnerKey) ?? null;

    const result: TradeResult | null = useMemo(() => {
        if (!ready || !teams || !me || !them) return null;
        if (myGive.size === 0 && theirGive.size === 0) return null;
        const asTeams: TradeTeam[] = teams.map(t => ({
            key: t.key, name: t.name, roster: t.roster, record: t.record,
        }));
        return evaluateTrade(asTeams, slots,
            { teamKey: me.key, give: [...myGive] },
            { teamKey: them.key, give: [...theirGive] },
            simOf, TRIALS);
    }, [ready, teams, me, them, myGive, theirGive, slots, simOf]);

    const nameOf = (id: number) =>
        teams?.flatMap(t => t.roster).find(p => p.id === id)?.name ?? String(id);
    const positionOf = (id: number) =>
        teams?.flatMap(t => t.roster).find(p => p.id === id)?.position ?? '';

    const toggle = (set: Set<number>, setter: (s: Set<number>) => void) =>
        (id: number) => {
            const next = new Set(set);
            if (next.has(id)) next.delete(id); else next.add(id);
            setter(next);
        };

    if (!league.connection || !league.connection.teamKey) {
        return (
            <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground/60 max-w-[660px]">
                    Every trade analyser answers with value, which is the wrong
                    question: a roster is not a pile of value, it is a lineup with a
                    fixed shape, and a third receiver in a league that starts two is
                    worth almost nothing. Connect a league and a trade is judged on
                    what it does instead — both lineups re-filled, the whole league
                    replayed, and the change in how often you win.
                </p>
                <LeagueConnect league={league} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <LeagueConnect league={league} compact />

            {failed ? (
                <p className="text-[12px] py-3" style={{ color: '#FCA5A5' }}>
                    Could not price every roster in the league, so a trade cannot be
                    judged against it. Reload to try again.
                </p>
            ) : !ready ? (
                <p className="text-[12px] text-muted-foreground/55 py-3">
                    {loading
                        ? 'Reading every roster in the league…'
                        : 'Waiting for rosters.'}
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[11px] text-muted-foreground/60"
                            htmlFor="trade-partner">
                            Trade with
                        </label>
                        <select id="trade-partner"
                            value={partnerKey ?? ''}
                            onChange={e => {
                                setPartner(e.target.value);
                                setTheirGive(new Set());
                            }}
                            className="text-[12px] font-semibold rounded-lg px-2 py-1
                                       bg-black/40 border border-white/10">
                            {(teams ?? []).filter(t => t.key !== myKey).map(t => (
                                <option key={t.key} value={t.key}>{t.name}</option>
                            ))}
                        </select>
                        {(myGive.size > 0 || theirGive.size > 0) && (
                            <button type="button"
                                onClick={() => { setMyGive(new Set()); setTheirGive(new Set()); }}
                                className="text-[11px] px-2 py-1 rounded-lg
                                           border border-white/10 text-muted-foreground/70
                                           hover:text-foreground hover:bg-white/[0.05]">
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                        {me && (
                            <RosterPicker
                                title={`${me.name} — you`}
                                subtitle="pick who you would send"
                                roster={me.roster} starting={me.starting}
                                selected={myGive} meanOf={meanOf}
                                onToggle={toggle(myGive, setMyGive)} />
                        )}
                        {them && (
                            <RosterPicker
                                title={them.name}
                                subtitle="pick who you would want"
                                roster={them.roster} starting={them.starting}
                                selected={theirGive} meanOf={meanOf}
                                onToggle={toggle(theirGive, setTheirGive)} />
                        )}
                    </div>

                    {result ? (
                        <TradeVerdict result={result} myKey={myKey}
                            nameOf={nameOf} positionOf={positionOf} trials={TRIALS} />
                    ) : (
                        <p className="text-[12px] text-muted-foreground/50 py-2">
                            Pick a player from either roster. A one-sided offer is a
                            real thing to price too — it is what a waiver claim or a
                            straight gift looks like.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
