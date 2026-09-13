'use client';

import React, { useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { BENCH_SLOTS, useLeagueSync } from '@/lib/useLeagueSync';
import { SimPlayer } from '@/lib/startSit';
import { useStartSitData } from '@/lib/useStartSit';
import { simInputFor, simPlayerFrom, type Horizon } from '@/lib/simInput';
import type { Outcome } from '@/lib/startSit';
import { replacementCost, type DepthReport } from '@/lib/depth';
import { bestLineup, type TradeRosterPlayer } from '@/lib/trade';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { HorizonToggle } from '@/components/redraft/HorizonToggle';
import { DepthTable } from './DepthTable';
import { TeamShape } from './TeamShape';
import { SchedulePanel } from './SchedulePanel';
import { useSchedule } from '@/lib/useSchedule';
import { measureTeam, rankLeague, type TeamProfile } from '@/lib/teamProfile';

const SEASON = 2026;
const TRIALS = 20000;
const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
/** Where the regular season ends when the platform will not say. */
const DEFAULT_PLAYOFF_WEEK = 15;

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
    /**
     * The rest of the season by default, because that is the question.
     *
     * "Which of my players am I one hamstring away from missing" is asked
     * about a season, not about Sunday — an injury costs you the weeks after
     * it, and it is those weeks the bench has to cover. Priced on this week's
     * inputs the answer moves for reasons that have nothing to do with depth:
     * a starter on a bye is worth nothing this Sunday, so the page reports
     * you can afford to lose him, which is the exact opposite of true.
     */
    const [horizon, setHorizon] = useState<Horizon>('season');

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
            const v = p && d ? simPlayerFrom(simInputFor(p, d, SEASON, horizon)) : null;
            cache.set(id, v);
            return v;
        };
    }, [players, data, horizon]);

    /**
     * The league's remaining schedule, position by position.
     *
     * Asked for from this week rather than from week one: a schedule that
     * has already been played is not ahead of anybody.
     */
    const schedule = useSchedule(week, league.snapshot?.playoffWeekStart ?? null);

    /** Regular-season weeks still to play, for the toggle to name. */
    const remaining = useMemo(() => {
        const playoffs = league.snapshot?.playoffWeekStart ?? DEFAULT_PLAYOFF_WEEK;
        return Math.max(0, playoffs - (week ?? 1));
    }, [league.snapshot?.playoffWeekStart, week]);

    /**
     * Every roster's shape, on both horizons at once.
     *
     * The season horizon is what the roster *is*; the week horizon is what
     * it does this Sunday, and the profile wants both on the same picture —
     * so these are built independently of the toggle above rather than
     * following it. A radar that redrew when you changed a setting meant for
     * the table below it would be answering a question nobody asked.
     */
    const outcomeAt = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]));
        const cache = new Map<string, Outcome | null>();
        return (id: number, h: Horizon): Outcome | null => {
            const k = `${id}:${h}`;
            if (cache.has(k)) return cache.get(k)!;
            const p = byId.get(id);
            const d = data.get(id);
            const v = p && d
                ? simInputFor({ id, position: p.position ?? '' }, d, SEASON, h).outcome
                : null;
            cache.set(k, v);
            return v;
        };
    }, [players, data]);

    const profiles: TeamProfile[] = useMemo(() => {
        if (!ready || !teams) return [];
        const measured = teams
            .filter(t => t.roster.length > 0)
            .map(t => measureTeam(t.key, t.name, t.roster, slots,
                id => outcomeAt(id, 'season'), id => outcomeAt(id, 'week')));
        return measured.length >= 2 ? rankLeague(measured) : [];
    }, [ready, teams, slots, outcomeAt]);

    /** My own roster, and the NFL team each of them plays for. */
    const myRoster = useMemo(
        () => teams?.find(t => t.key === myKey)?.roster ?? [],
        [teams, myKey]);
    const teamOf = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p.nfl_team ?? null]));
        return (id: number) => byId.get(id) ?? null;
    }, [players]);

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
                    Connect a league and this shows where your roster stands against the
                    eleven it has to beat — position by position, and on the five
                    questions that decide a season: what you score this week, what you
                    score from here, how far your starters can beat their projections,
                    how far they can fall short, and what survives an injury. Lay any
                    other team over it to see a matchup or find a trade.
                    <br /><br />
                    Underneath, the other half: a projection tells you what a player is
                    worth, not what he is worth <em>to you</em>. A fifteen-point back
                    with a fourteen-point back behind him costs you almost nothing; a
                    ten-point tight end with nobody costs you ten.
                </p>
                <LeagueConnect league={league} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <LeagueConnect league={league} compact />
            {profiles.length > 0 && (
                <TeamShape profiles={profiles} myKey={myKey} />
            )}
            {myRoster.length > 0 && (
                <SchedulePanel roster={myRoster}
                    rest={schedule.rest} playoffs={schedule.playoffs}
                    restWeeks={schedule.restWeeks} playoffWeeks={schedule.playoffWeeks}
                    loading={schedule.loading} teamOf={teamOf} />
            )}
            <HorizonToggle value={horizon} onChange={setHorizon} remaining={remaining} />
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
                <DepthTable report={report} horizon={horizon} remaining={remaining} />
            )}
        </div>
    );
}
