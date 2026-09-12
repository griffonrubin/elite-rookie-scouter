'use client';

import React, { useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { useLeagueSync } from '@/lib/useLeagueSync';
import { buildOutcome, MAX_STARTSIT_IDS, SimPlayer, usableSample } from '@/lib/startSit';
import { powerRank, PowerResult, PowerTeam } from '@/lib/power';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';
import { PowerTable } from './PowerTable';

const SEASON = 2026;

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
    const [data, setData] = useState<Map<number, StartSitPlayer>>(new Map());
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    /** Every team's starting lineup, as our own player ids. */
    const lineups = useMemo(() => {
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
            // Three counts, because they come apart: slots the format gives
            // everyone, players the owner has put in them, and players we
            // managed to price. A team starting eight of nine is a fact
            // about that team; eight of nine priced is a fact about us.
            return {
                key: t.key, name: t.name, ids,
                filled: filled.length, slots: lineup.length, record: t.record,
            };
        });
    }, [league.snapshot, league.connection?.platform, players]);

    const needed = useMemo(() => {
        const ids = new Set<number>();
        for (const t of lineups ?? []) for (const id of t.ids) ids.add(id);
        return [...ids];
    }, [lineups]);

    const week = league.week;
    React.useEffect(() => {
        if (needed.length === 0 || week == null) return;
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        // Chunked, because a twelve-team league is more players than the
        // start/sit endpoint prices in one request — and chunked to its own
        // limit rather than to a number that looked about right, which is
        // how a request of a hundred ids came back a 400 nobody read.
        const chunks: number[][] = [];
        for (let i = 0; i < needed.length; i += MAX_STARTSIT_IDS) {
            chunks.push(needed.slice(i, i + MAX_STARTSIT_IDS));
        }
        Promise.all(chunks.map(c =>
            fetch(`/api/redraft/startsit?ids=${c.join(',')}&week=${week}`)
                .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))))
            .then((rs: { players: StartSitPlayer[] }[]) => {
                if (cancelled) return;
                const m = new Map<number, StartSitPlayer>();
                for (const r of rs) for (const p of r.players ?? []) m.set(p.id, p);
                setData(m);
            })
            // A ranking is a comparison, so a league half read is not a
            // partial answer — it is a wrong one with a bar chart on it.
            .catch(() => { if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [needed.join(','), week]);   // eslint-disable-line react-hooks/exhaustive-deps

    const ready = needed.length > 0 && data.size > 0 && !failed;

    const result: PowerResult = useMemo(() => {
        if (!ready || !lineups) return { rows: [], unranked: [] };
        const byId = new Map(players.map(p => [p.id, p]));
        const sim = (id: number): SimPlayer | null => {
            const p = byId.get(id);
            const d = data.get(id);
            if (!p) return null;
            const logs = d?.logs ?? [];
            const outcome = buildOutcome({
                playerId: id, position: p.position ?? '',
                seasonProjection: d?.proj_points ?? null, projectedGames: 17,
                logs,
                marketProjection: d?.market_points ?? null,
                marketMarkets: d?.market_markets ?? null,
                context: {
                    impliedTeamTotal: d?.implied_team_total ?? null,
                    spread: d?.spread ?? null,
                    defenseAllowed: d?.def_allowed ?? null,
                    defenseLeagueAvg: d?.def_league_avg ?? null,
                    defenseSample: d?.def_sample ?? null,
                    reportStatus: d?.report_status ?? null,
                    practiceStatus: d?.practice_status ?? null,
                    onBye: d?.on_bye ?? false,
                },
            }, SEASON);
            const sample = logs.map(l => l.points);
            return { outcome, sample: usableSample(sample) ? sample : undefined };
        };
        const teams: PowerTeam[] = lineups.map(t => ({
            key: t.key, name: t.name, record: t.record,
            filled: t.filled, slots: t.slots,
            lineup: t.ids.map(sim).filter((s): s is SimPlayer => s != null),
        }));
        return powerRank(teams, TRIALS);
    }, [ready, lineups, data, players]);

    if (!league.connection || !league.connection.teamKey) {
        return (
            <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground/60 max-w-[660px]">
                    Connect a league and every roster in it plays every other one
                    twenty thousand times. What comes back is a ranking of teams rather
                    than of their schedules — and the gap between the two, which is
                    the part a standings table cannot show you.
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
                    myKey={league.connection.teamKey ?? null} trials={TRIALS} />
            )}
        </div>
    );
}
