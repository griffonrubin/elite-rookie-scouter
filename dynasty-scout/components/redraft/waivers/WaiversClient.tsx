'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RedraftPlayer } from '@/lib/types';
import { useLeagueSync } from '@/lib/useLeagueSync';
import { Outcome } from '@/lib/startSit';
import { simInputFor } from '@/lib/simInput';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { PlayerDetail } from '@/components/redraft/startsit/PlayerDetail';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';
import type { WaiverRow } from '@/app/api/redraft/waivers/route';
import { TrendRow } from './TrendRow';

const SEASON = 2026;
/**
 * Kickers and defences are offered now that the ranking happens server-side.
 *
 * They were left off because filtering the top forty in the browser gave
 * zero of each every time — the forty biggest movers in a league are backs
 * and receivers. Ranked within their own position there are nineteen
 * claimable kickers, which is a real answer. A defence still has nothing to
 * trend on, and the empty state says so rather than leaving a reader to
 * wonder whether it looked.
 */
const POSITIONS = ['ALL', 'RB', 'WR', 'TE', 'QB', 'K', 'DST'] as const;

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
    /**
     * Opens on the position the URL asks for.
     *
     * Team Analysis links here when a slot has nobody behind it — "your only
     * tight end is your whole tight end" is a finding, and a finding you
     * cannot act on is half a tool.
     */
    const [pos, setPos] = useState<(typeof POSITIONS)[number] | null>(null);
    /**
     * Read through Next's hook rather than off `window`.
     *
     * A `useState` initialiser reading `window.location.search` looks like it
     * works and does not: this page is server-rendered, so the initialiser
     * runs where there is no window, returns "ALL", and hydration keeps the
     * server's answer. Arriving from Team Analysis on `?pos=TE` landed on an
     * unfiltered list.
     */
    const asked = useSearchParams().get('pos')?.toUpperCase() ?? '';
    const urlPos = (POSITIONS as readonly string[]).includes(asked)
        ? asked as (typeof POSITIONS)[number]
        : 'ALL';
    // The reader's own choice wins once they have made one.
    const shownPos = pos ?? urlPos;
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
        // The position goes to the server, not to a filter over the answer.
        // Trend is ranked across every position at once, so a league's forty
        // biggest movers are mostly backs and receivers — filtering those in
        // the browser showed three tight ends and no kicker at all while
        // eighty-nine and nineteen sat in the pool.
        const q = `?week=${week}&limit=40`
            + (shownPos === 'ALL' ? '' : `&pos=${shownPos}`)
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
    }, [taken, week, shownPos]);

    // Detail is fetched only for the row somebody opens: forty players of
    // logs is a payload nobody reads.
    useEffect(() => {
        if (open == null || detail.has(open) || week == null) return;
        let cancelled = false;
        fetch(`/api/redraft/startsit?ids=${open}&week=${week}&detail=1`)
            .then(r => r.json())
            .then((d: { players: StartSitPlayer[] }) => {
                if (cancelled || !d.players?.[0]) return;
                setDetail(m => new Map(m).set(open, d.players[0]));
            });
        return () => { cancelled = true; };
    }, [open, week, detail]);

    // The server already ranked within the position, so there is nothing
    // left to filter here.
    const shown = rows;

    const outcomeOf = (r: WaiverRow): Outcome | null => {
        const d = detail.get(r.id);
        if (!d) return null;
        return simInputFor({ id: r.id, position: r.position ?? '' }, d, SEASON).outcome;
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
                                aria-pressed={shownPos === p}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold
                                            transition-colors ${shownPos === p
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
                    <p className="text-[12px] text-muted-foreground/55 py-3 max-w-[620px]">
                        {/* A defence has no snaps and no touches, so there is
                            nothing here to trend — which is a different thing
                            from having looked and found nobody, and worth
                            saying rather than showing a reader a blank. */}
                        {shownPos === 'DST'
                            ? 'A defence has no snap count and no touches, so there is no '
                              + 'change in role to rank one on. This page has nothing '
                              + 'useful to say about them; the waiver list on your '
                              + 'platform is as good as anything here.'
                            : 'Nobody at this position has a growing role among the free '
                              + 'agents — which is itself the answer, and a better one '
                              + 'than a ranked list of people not worth claiming.'}
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
