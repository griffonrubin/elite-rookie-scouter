'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { useLeagueSync } from '@/lib/useLeagueSync';
import { buildOutcome, Outcome } from '@/lib/startSit';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { PlayerDetail } from '@/components/redraft/startsit/PlayerDetail';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';
import type { WaiverRow } from '@/app/api/redraft/waivers/route';
import { TrendRow } from './TrendRow';

const SEASON = 2026;
const POSITIONS = ['ALL', 'RB', 'WR', 'TE', 'QB'] as const;

/**
 * The waiver wire, defined by your league rather than in general.
 *
 * "Available" is not a property of a player, it is a property of a player and
 * a league: a list of the best free agents in the abstract is a list of
 * people somebody else already has. The league sync already knows every
 * roster, so the taken ids go to the server and what comes back is only ever
 * claimable.
 *
 * Ranked on the change in usage rather than the level of it, because the
 * level is a restatement of who was good in August and the change is the
 * thing a projection has not caught up with. Both halves are shown — a rise
 * from two touches to five is a rise, and it is not the same as six to
 * fifteen, and only showing both lets a reader tell them apart.
 */
export function WaiversClient({ players }: { players: RedraftPlayer[] }) {
    const league = useLeagueSync(players);
    const [rows, setRows] = useState<WaiverRow[]>([]);
    const [considered, setConsidered] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [pos, setPos] = useState<(typeof POSITIONS)[number]>('ALL');
    const [open, setOpen] = useState<number | null>(null);
    const [detail, setDetail] = useState<Map<number, StartSitPlayer>>(new Map());

    /**
     * Everyone on a roster in this league, by our own player id.
     *
     * Every team, not just yours — a free agent is somebody nobody has.
     */
    const taken = useMemo(() => {
        const snap = league.snapshot;
        if (!snap) return null;
        const byPlatformId = new Map(players.map(p => [
            String(league.connection?.platform === 'espn' ? p.espn_nfl_id : p.sleeper_id),
            p.id]));
        const ids = new Set<number>();
        for (const t of snap.teams) {
            for (const s of t.slots) {
                const id = byPlatformId.get(String(s.playerId));
                if (id != null) ids.add(id);
            }
        }
        return ids;
    }, [league.snapshot, league.connection?.platform, players]);

    const week = league.week;
    useEffect(() => {
        if (!taken || week == null) return;
        let cancelled = false;
        setLoading(true);
        const q = `?week=${week}&limit=40`
            + (taken.size ? `&taken=${[...taken].join(',')}` : '');
        fetch(`/api/redraft/waivers${q}`)
            .then(r => r.json())
            .then((d: { players: WaiverRow[]; considered: number }) => {
                if (cancelled) return;
                setRows(d.players ?? []);
                setConsidered(d.considered ?? null);
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [taken, week]);

    // Detail is fetched only for the row somebody opens: forty players of
    // logs is a payload nobody reads.
    useEffect(() => {
        if (open == null || detail.has(open) || week == null) return;
        let cancelled = false;
        fetch(`/api/redraft/startsit?ids=${open}&week=${week}`)
            .then(r => r.json())
            .then((d: { players: StartSitPlayer[] }) => {
                if (cancelled || !d.players?.[0]) return;
                setDetail(m => new Map(m).set(open, d.players[0]));
            });
        return () => { cancelled = true; };
    }, [open, week, detail]);

    const shown = useMemo(
        () => (pos === 'ALL' ? rows : rows.filter(r => r.position === pos)),
        [rows, pos]);

    const outcomeOf = (r: WaiverRow): Outcome | null => {
        const d = detail.get(r.id);
        if (!d) return null;
        return buildOutcome({
            playerId: r.id, position: r.position ?? '',
            seasonProjection: d.proj_points ?? null, projectedGames: 17,
            logs: d.logs ?? [],
            marketProjection: d.market_points ?? null,
            marketMarkets: d.market_markets ?? null,
            context: {
                impliedTeamTotal: d.implied_team_total ?? null,
                spread: d.spread ?? null,
                defenseAllowed: d.def_allowed ?? null,
                defenseLeagueAvg: d.def_league_avg ?? null,
                defenseSample: d.def_sample ?? null,
                reportStatus: d.report_status ?? null,
                practiceStatus: d.practice_status ?? null,
                onBye: d.on_bye ?? false,
            },
        }, SEASON);
    };

    if (!league.connection || !league.connection.teamKey) {
        return (
            <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground/60 max-w-[640px]">
                    Connect a league and this becomes the free agents in{' '}
                    <em>that</em> league — everyone nobody has rostered — ranked by
                    whose role is growing rather than by a projection made in August.
                </p>
                <LeagueConnect league={league} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <LeagueConnect league={league} compact />

            <section className="rounded-xl border border-white/[0.07] p-4"
                style={{ background: 'var(--bg-card)' }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 mb-2">
                    <h2 className="text-[10px] uppercase tracking-widest font-bold
                                   text-muted-foreground/45">
                        Rising roles, free in your league
                    </h2>
                    <div className="flex items-center gap-1">
                        {POSITIONS.map(p => (
                            <button key={p} type="button" onClick={() => setPos(p)}
                                aria-pressed={pos === p}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold
                                            transition-colors ${pos === p
                                    ? 'bg-white/[0.12] text-foreground'
                                    : 'text-muted-foreground/55 hover:text-foreground/80'}`}>
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {loading && rows.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground/55 py-3">
                        Working out who is actually available…
                    </p>
                ) : shown.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground/55 py-3">
                        Nobody at this position has a growing role among the free
                        agents — which is itself the answer, and a better one than
                        a ranked list of people not worth claiming.
                    </p>
                ) : (
                    <>
                        <div className="grid items-end gap-2 px-1 pb-1 text-[10px] uppercase
                                        tracking-widest font-bold text-muted-foreground/45
                                        grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[168px_minmax(0,1fr)_minmax(0,1fr)_92px_20px]">
                            <span>Player</span>
                            <span className="hidden sm:block">Snap share</span>
                            <span className="hidden sm:block">Touches a game</span>
                            <span className="hidden sm:block text-right">This week</span>
                            <span className="hidden sm:block" />
                        </div>
                        <ul className="space-y-0.5">
                            {shown.map(r => (
                                <li key={r.id}>
                                    <TrendRow row={r}
                                        isOpen={open === r.id}
                                        onToggle={() => setOpen(open === r.id ? null : r.id)} />
                                    {open === r.id && (
                                        <div className="px-2 pb-3 pt-1">
                                            {(() => {
                                                const o = outcomeOf(r);
                                                const d = detail.get(r.id);
                                                if (!o || !d) {
                                                    return (
                                                        <p className="text-[11px]
                                                                      text-muted-foreground/50">
                                                            Reading his games…
                                                        </p>
                                                    );
                                                }
                                                return (
                                                    <PlayerDetail outcome={o}
                                                        context={{
                                                            opponent: d.opponent ?? null,
                                                            impliedTeamTotal:
                                                                d.implied_team_total ?? null,
                                                            spread: d.spread ?? null,
                                                            defenseAllowed: d.def_allowed ?? null,
                                                            defenseLeagueAvg:
                                                                d.def_league_avg ?? null,
                                                            defenseSample: d.def_sample ?? null,
                                                        }}
                                                        logs={d.logs ?? []}
                                                        position={r.position ?? null}
                                                        season={SEASON} />
                                                );
                                            })()}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug">
                            {considered != null && (
                                <>Out of {considered} free agents with enough games to read. </>
                            )}
                            Ranked on the change in snaps and touches over the last three
                            games against the five before them, not on the level — the level
                            is what a projection already knows. Open a row for the same
                            breakdown Start/Sit gives your own players.
                        </p>
                    </>
                )}
            </section>
        </div>
    );
}
