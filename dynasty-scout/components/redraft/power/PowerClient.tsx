'use client';

import React, { useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { BENCH_SLOTS, useLeagueSync } from '@/lib/useLeagueSync';
import { SimPlayer } from '@/lib/startSit';
import { useStartSitData } from '@/lib/useStartSit';
import { simInputFor, simPlayerFrom, type Horizon } from '@/lib/simInput';
import { playoffOdds, powerRank, PowerResult, PowerTeam } from '@/lib/power';
import { bestLineup, type TradeRosterPlayer } from '@/lib/trade';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { HorizonToggle } from '@/components/redraft/HorizonToggle';
import { PowerTable } from './PowerTable';

const SEASON = 2026;
/** Where the regular season ends when the platform will not say. */
const DEFAULT_PLAYOFF_WEEK = 15;
const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

/**
 * Weeks simulated per roster.
 *
 * Twenty thousand is what the Start/Sit headline uses, and the round robin
 * can now afford the same: every roster is drawn once per trial and all the
 * pairings are settled on that week, so a twelve-team league costs twelve
 * lineups per trial rather than a hundred and thirty-two.
 */
const TRIALS = 20000;

/**
 * The league, ranked by roster rather than by results.
 *
 * A standings table is a record of what happened and a points column is a
 * record of who drew the soft weeks. Neither is a claim about how good a
 * team is, and early in a season the difference between them is the most
 * interesting thing in the league — which is why this ranks every roster by
 * playing it against every other one, and then shows the gap.
 */
export function PowerClient({ players }: { players: RedraftPlayer[] }) {
    const league = useLeagueSync(players);
    /**
     * Rest of season by default, which is what a power ranking is.
     *
     * Ranked on this week's inputs a roster drops four places because three
     * of its starters are on a bye, and the table calls that a statement
     * about the team. It is a matchup preview with the wrong title. The week
     * is still a real question — it is the one you set a lineup against —
     * so it stays a click away rather than being taken off the page.
     */
    const [horizon, setHorizon] = useState<Horizon>('season');

    /**
     * Every team's lineup and its whole roster, as our own player ids.
     *
     * Both, because the two horizons want different ones. This week the
     * lineup an owner has actually set is the lineup they will field, holes
     * and mistakes included. Over the rest of the season it is not: the
     * flex they left empty in week one will not be empty in week nine, and
     * ranking a roster below a worse one because somebody forgot to set it
     * this Sunday is a fact about one afternoon.
     */
    const teams = useMemo(() => {
        const snap = league.snapshot;
        if (!snap) return null;
        const byPlatformId = new Map(players.map(p => [
            String(league.connection?.platform === 'espn' ? p.espn_nfl_id : p.sleeper_id), p]));
        return snap.teams.map(t => {
            const lineup = t.lineupSlots?.length
                ? t.lineupSlots.map(s => s.playerId)
                : t.slots.filter(s => s.starting).map(s => s.playerId);
            const filled = lineup.filter((pid): pid is string => !!pid);
            const ids = filled
                .map(pid => byPlatformId.get(String(pid))?.id ?? null)
                .filter((id): id is number => id != null);
            const roster: TradeRosterPlayer[] = [];
            let unmatched = 0;
            for (const s of t.slots) {
                const hit = byPlatformId.get(String(s.playerId));
                if (!hit) { unmatched++; continue; }
                roster.push({
                    id: hit.id,
                    name: hit.full_name ?? String(hit.id),
                    position: hit.position ?? '',
                    startable: true,
                });
            }
            // Three counts, because they come apart: slots the format gives
            // everyone, players the owner has put in them, and players we
            // managed to price. A team starting eight of nine is a fact
            // about that team; eight of nine priced is a fact about us.
            return {
                key: t.key, name: t.name, ids, roster, unmatched,
                filled: filled.length, slots: lineup.length, record: t.record,
            };
        });
    }, [league.snapshot, league.connection?.platform, players]);

    const slots = useMemo(() => {
        const rp = league.snapshot?.rosterPositions;
        if (!rp?.length) return DEFAULT_SLOTS;
        return rp.filter(s => !BENCH_SLOTS.has(s.toUpperCase()));
    }, [league.snapshot?.rosterPositions]);

    const needed = useMemo(() => {
        const ids = new Set<number>();
        for (const t of teams ?? []) {
            for (const id of t.ids) ids.add(id);
            for (const p of t.roster) ids.add(p.id);
        }
        return [...ids];
    }, [teams]);

    const week = league.week;
    // One hook, one cache: every In Season page asks about the same league,
    // so the page a reader lands on second only pays for the ids the first
    // one did not already fetch. It also chunks to the endpoint's own limit,
    // which is the bug four hand-rolled copies of this produced.
    const { data, loading, failed } = useStartSitData(needed, week);

    const ready = needed.length > 0 && data.size > 0 && !failed;

    const result: PowerResult = useMemo(() => {
        if (!ready || !teams) return { rows: [], unranked: [] };
        const byId = new Map(players.map(p => [p.id, p]));
        const cache = new Map<number, SimPlayer | null>();
        const sim = (id: number): SimPlayer | null => {
            if (cache.has(id)) return cache.get(id)!;
            const p = byId.get(id);
            const v = p ? simPlayerFrom(simInputFor(p, data.get(id), SEASON, horizon)) : null;
            cache.set(id, v);
            return v;
        };
        const meanOf = (id: number) => sim(id)?.outcome.mean ?? -Infinity;
        const ranked: PowerTeam[] = teams.map(t => {
            // Over a season, the best lineup this roster can field — which
            // is the roster's strength rather than one Sunday's decisions.
            const ids = horizon === 'season'
                ? bestLineup(slots, t.roster, meanOf)
                    .filter((id): id is number => id != null)
                : t.ids;
            /**
             * Two different shortfalls, and the table words them differently.
             *
             * A roster carrying no kicker fills eight of nine slots — a fact
             * about that team, and the reason its row is low. A roster with
             * players we could not match is a gap in our own data, which
             * understates it. Over a season the lineup is ours to pick, so a
             * short one means the roster is short; `filled` is set to what
             * the roster can actually field and the warning about pricing is
             * reserved for the case that really is about us.
             */
            const filled = horizon === 'season'
                ? (t.unmatched > 0 ? slots.length : ids.length)
                : t.filled;
            return {
                key: t.key, name: t.name, record: t.record,
                filled,
                slots: horizon === 'season' ? slots.length : t.slots,
                lineup: ids.map(sim).filter((s): s is SimPlayer => s != null),
            };
        });
        return powerRank(ranked, TRIALS);
    }, [ready, teams, data, players, horizon, slots]);

    /**
     * Regular-season weeks still to play.
     *
     * The playoffs are the deadline a projected record is measured against,
     * so weeks seventeen and eighteen do not count — by then the question
     * has been answered.
     */
    const remaining = useMemo(() => {
        const playoffs = league.snapshot?.playoffWeekStart ?? DEFAULT_PLAYOFF_WEEK;
        return Math.max(0, playoffs - (week ?? 1));
    }, [league.snapshot?.playoffWeekStart, week]);

    /**
     * Where the cut is.
     *
     * The platform usually says; Sleeper does not always, and a page that
     * quietly assumes six is a page giving a confident wrong answer to the
     * only question that matters. So the reader can move it, and the table
     * says which number it used.
     */
    const [spots, setSpots] = useState<number | null>(null);
    const cut = spots
        ?? league.snapshot?.playoffTeams
        ?? Math.max(2, Math.round((teams?.length ?? 12) / 2));

    /**
     * How often each roster is still playing in January.
     *
     * Every remaining week is played rather than assumed — the teams are
     * shuffled into pairs and each pair settled on the head-to-head rate the
     * round robin already produced. Carrying each rate forward on its own,
     * which is what the projected record does, lets every team in the league
     * finish 9-5; pairing conserves the wins, so a finishing position means
     * something.
     */
    const odds = useMemo(
        () => (remaining > 0 && result.rows.length > 1
            ? playoffOdds(result.rows, remaining, cut)
            : null),
        [result.rows, remaining, cut]);

    if (!league.connection || !league.connection.teamKey) {
        return (
            <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground/60 max-w-[660px]">
                    Connect a league and every roster in it plays every other one
                    twenty thousand times, on the rest of the season rather than on
                    this Sunday. What comes back is a ranking of teams rather than of
                    their schedules, a projected record to go with it, and the gap
                    between how good a roster is and how well it has done — which is
                    the part a standings table cannot show you.
                </p>
                <LeagueConnect league={league} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <LeagueConnect league={league} compact />
            <HorizonToggle value={horizon} onChange={setHorizon} remaining={remaining} />
            {failed ? (
                <p className="text-[12px] py-3" style={{ color: '#FCA5A5' }}>
                    Could not price every roster in the league, so there is nothing
                    honest to rank — a round robin missing teams is not a partial
                    ranking, it is a wrong one. Reload to try again.
                </p>
            ) : !ready ? (
                <p className="text-[12px] text-muted-foreground/55 py-3">
                    {loading ? 'Reading every roster in the league…' : 'Waiting for rosters.'}
                </p>
            ) : (
                <PowerTable rows={result.rows} unranked={result.unranked}
                    myKey={league.connection.teamKey ?? null} trials={TRIALS}
                    horizon={horizon} remaining={remaining}
                    odds={odds} spots={cut} onSpots={setSpots}
                    spotsKnown={league.snapshot?.playoffTeams != null} />
            )}
        </div>
    );
}
