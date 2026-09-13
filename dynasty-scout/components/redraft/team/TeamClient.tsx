'use client';

import React, { useMemo } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { BENCH_SLOTS, useLeagueSync } from '@/lib/useLeagueSync';
import { SimPlayer } from '@/lib/startSit';
import { useStartSitData } from '@/lib/useStartSit';
import { simInputFor, simPlayerFrom } from '@/lib/simInput';
import { replacementCost, type DepthReport } from '@/lib/depth';
import { bestLineup, type TradeRosterPlayer } from '@/lib/trade';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { DepthTable } from './DepthTable';

const SEASON = 2026;
const TRIALS = 20000;
const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

/**
 * Where this roster is actually thin.
 *
 * Start/Sit answers this week, the waiver wire answers who to add, the power
 * table answers where you stand and the trade page answers whether a deal
 * helps. The question none of them answers is the one an owner asks in
 * October: which of my players am I one hamstring away from missing, and
 * which could I lose without noticing?
 *
 * That is not a property of a player, it is a property of a player and the
 * bench behind him — so it is computed the way everything else here is, by
 * removing him and replaying the league.
 */
export function TeamClient({ players }: { players: RedraftPlayer[] }) {
    const league = useLeagueSync(players);

    const myKey = league.connection?.teamKey ?? null;

    const teams = useMemo(() => {
        const snap = league.snapshot;
        if (!snap) return null;
        const espn = league.connection?.platform === 'espn';
        const byPlatformId = new Map(players.map(p =>
            [String(espn ? p.espn_nfl_id : p.sleeper_id), p]));
        return snap.teams.map(t => {
            const roster: TradeRosterPlayer[] = [];
            for (const s of t.slots) {
                const hit = byPlatformId.get(String(s.playerId));
                if (!hit) continue;
                roster.push({
                    id: hit.id,
                    name: hit.full_name ?? String(hit.id),
                    position: hit.position ?? '',
                    startable: true,
                });
            }
            return { key: t.key, name: t.name, roster };
        });
    }, [league.snapshot, league.connection?.platform, players]);

    const slots = useMemo(() => {
        const rp = league.snapshot?.rosterPositions;
        if (!rp?.length) return DEFAULT_SLOTS;
        return rp.filter(s => !BENCH_SLOTS.has(s.toUpperCase()));
    }, [league.snapshot?.rosterPositions]);

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

    const simOf = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]));
        const cache = new Map<number, SimPlayer | null>();
        return (id: number): SimPlayer | null => {
            if (cache.has(id)) return cache.get(id)!;
            const p = byId.get(id);
            const d = data.get(id);
            const v = p && d ? simPlayerFrom(simInputFor(p, d, SEASON)) : null;
            cache.set(id, v);
            return v;
        };
    }, [players, data]);

    const report: DepthReport | null = useMemo(() => {
        if (!ready || !teams || !myKey) return null;
        const me = teams.find(t => t.key === myKey);
        if (!me) return null;
        // The field is every other roster in the league, each fielding the
        // best lineup it can — the same yardstick the power table uses, so
        // the two pages cannot disagree about where this team stands.
        const meanOf = (id: number) => simOf(id)?.outcome.mean ?? -Infinity;
        const field = teams
            .filter(t => t.key !== myKey)
            .map(t => bestLineup(slots, t.roster, meanOf)
                .map(id => (id == null ? null : simOf(id)))
                .filter((s): s is SimPlayer => s != null))
            .filter(l => l.length > 0);
        if (field.length === 0) return null;
        return replacementCost(me.roster, slots, field, simOf, TRIALS);
    }, [ready, teams, myKey, slots, simOf]);

    if (!league.connection || !league.connection.teamKey) {
        return (
            <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground/60 max-w-[680px]">
                    A projection tells you what a player is worth. It cannot tell you what
                    he is worth <em>to you</em>, because that depends on who is behind him:
                    a fifteen-point back with a fourteen-point back on your bench costs you
                    almost nothing, and a ten-point tight end with nobody costs you ten.
                    Connect a league and every starter is removed in turn to find out which
                    is which.
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
                    Could not price the league, so there is nothing to measure this roster
                    against. Reload to try again.
                </p>
            ) : !report ? (
                <p className="text-[12px] text-muted-foreground/55 py-3">
                    {loading || !ready
                        ? 'Reading every roster in the league…'
                        : 'Waiting for rosters.'}
                </p>
            ) : (
                <DepthTable report={report} />
            )}
        </div>
    );
}
