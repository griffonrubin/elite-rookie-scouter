'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RedraftPlayer } from '@/lib/types';
import { BENCH_SLOTS, useLeagueSync } from '@/lib/useLeagueSync';
import { Outcome } from '@/lib/startSit';
import { simInputFor } from '@/lib/simInput';
import { useStartSitData } from '@/lib/useStartSit';
import { useDefence } from '@/lib/useDefence';
import { useSchedule } from '@/lib/useSchedule';
import { useInheritance } from '@/lib/useSuccessors';
import { schedFor } from '@/components/redraft/SchedChip';
import { planClaims, rosterVsWire } from '@/lib/waiverPlan';
import type { TradeRosterPlayer } from '@/lib/trade';
import { SEASON_GAMES, type PositionShape, type WaiverRow } from '@/lib/waiverRank';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { PlayerDetail } from '@/components/redraft/startsit/PlayerDetail';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';
import { UsageTrend, WireRow, type WireRowData } from './WireRow';
import { RosterVsWire } from './RosterVsWire';

const SEASON = 2026;
const DEFAULT_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
const POSITIONS = ['ALL', 'RB', 'WR', 'TE', 'QB', 'K', 'DST'] as const;
/**
 * How many candidates come back, get priced, and get shown.
 *
 * Priced wider than shown on purpose. The server ranks on the rest of the
 * season; the browser re-ranks on this week or on what a claim is worth,
 * and it can only re-rank rows it holds — so the tenth-best back by season
 * value has to be in hand before "this week" can put him third. It also
 * fixes the comparison above the list: with only thirty rows priced, a
 * league whose top thirty free agents happen to be tight ends and
 * quarterbacks reports no running back available at all, when there are two
 * hundred.
 */
const PRICED = 60;
const SHOWN = 30;

/**
 * How the list is ordered.
 *
 * Three, because the question has three honest answers and which one a
 * manager wants depends on why they are here. Somebody plugging a hole for
 * Sunday wants this week; somebody using their last roster spot for the year
 * wants the rest of the season; and somebody deciding whether a claim is
 * worth a drop at all wants the only column that knows their roster.
 */
type SortKey = 'week' | 'season' | 'upgrade' | 'schedule' | 'stash';
const SORTS: { id: SortKey; label: string; note: string }[] = [
    { id: 'season', label: 'Rest of season',
        note: 'Projected points from here, measured against the last player at that '
            + 'position anybody starts — so a quarterback has to beat a real starting '
            + 'quarterback rather than beat a receiver at arithmetic.' },
    { id: 'week', label: 'This week',
        note: 'This Sunday’s projection, from the same model the lineup board '
            + 'uses — opponent, game total, spread, injury report and all. Across '
            + 'every position at once it puts quarterbacks on top, which is a fact '
            + 'about scoring rather than about claiming; filter to a position to '
            + 'compare like with like.' },
    { id: 'upgrade', label: 'Upgrade to your lineup',
        note: 'What claiming him would actually do: your best lineup this week with '
            + 'him in and somebody dropped, against your best lineup now. Every drop '
            + 'is tried, and the one named is the one that costs least.' },
    { id: 'schedule', label: 'Playoff schedule',
        note: 'Who he plays across the fantasy playoff weeks, measured against what '
            + 'those defences give up to his own position rather than against how '
            + 'good they are. The stash question: whether a bench spot held for two '
            + 'months pays off in the three weeks that decide the season.' },    {
        id: 'stash', label: 'If someone gets hurt',
        note: 'Whose job each of these men was measured taking over — from the weeks '
            + 'the starter did not dress, not from a depth chart. Ranked on the size '
            + 'of the opening: what the starter scores, how often he is absent, and '
            + 'what this man did the last time it happened. The one ordering where a '
            + 'four-point projection can be the right claim.',
    },
];

/**
 * The waiver wire, defined by your league and decided on your roster.
 *
 * "Available" is a property of a player and a league, not of a player: a list
 * of the best free agents in the abstract is a list of people somebody else
 * already has. And "best available" is still the wrong question — you do not
 * claim a man because he leads a list, you claim him because he is better
 * than somebody you are holding. That comparison is the one column no other
 * waiver page shows, and it is the only one that can say no.
 */
export function WaiversClient({ players }: { players: RedraftPlayer[] }) {
    const league = useLeagueSync(players);
    const defence = useDefence();
    const [rows, setRows] = useState<WaiverRow[]>([]);
    const [considered, setConsidered] = useState<number | null>(null);
    const [shape, setShape] = useState<Record<string, PositionShape>>({});
    const [loading, setLoading] = useState(false);
    const [sort, setSort] = useState<SortKey>('season');
    const [pos, setPos] = useState<(typeof POSITIONS)[number] | null>(null);
    /**
     * Read through Next's hook rather than off `window`.
     *
     * A `useState` initialiser reading `window.location.search` looks like it
     * works and does not: this page is server-rendered, so the initialiser
     * runs where there is no window and hydration keeps the server's answer.
     */
    const asked = useSearchParams().get('pos')?.toUpperCase() ?? '';
    const urlPos = (POSITIONS as readonly string[]).includes(asked)
        ? asked as (typeof POSITIONS)[number]
        : 'ALL';
    const shownPos = pos ?? urlPos;
    const [open, setOpen] = useState<number | null>(null);

    const byPlatformId = useMemo(() => new Map(players.map(p => [
        String(league.connection?.platform === 'espn' ? p.espn_nfl_id : p.sleeper_id),
        p])), [players, league.connection?.platform]);

    /**
     * Everyone on a roster in this league, by our own player id.
     *
     * Read off `rostered` rather than `slots`, which is the list of spots
     * that can hold a lineup and so leaves out injured reserve and the taxi
     * squad. Those players are as rostered as anybody; taking the startable
     * list for the roster offered three of them as free agents in a
     * twelve-team league, the best of them at the top.
     */
    const taken = useMemo(() => {
        const snap = league.snapshot;
        if (!snap) return null;
        const ids = new Set<number>();
        for (const t of snap.teams) {
            for (const pid of t.rostered ?? t.slots.map(s => s.playerId)) {
                const id = byPlatformId.get(String(pid))?.id;
                if (id != null) ids.add(id);
            }
        }
        return ids;
    }, [league.snapshot, byPlatformId]);

    /** My own roster, which is what a claim is measured against. */
    const myRoster = useMemo((): TradeRosterPlayer[] => {
        const snap = league.snapshot;
        const key = league.connection?.teamKey;
        const me = snap?.teams.find(t => t.key === key);
        if (!me) return [];
        const out: TradeRosterPlayer[] = [];
        for (const pid of me.rostered ?? me.slots.map(s => s.playerId)) {
            const hit = byPlatformId.get(String(pid));
            if (!hit) continue;
            out.push({
                id: hit.id, name: hit.full_name ?? String(hit.id),
                position: hit.position ?? '', startable: true,
            });
        }
        return out;
    }, [league.snapshot, league.connection?.teamKey, byPlatformId]);

    const slots = useMemo(() => {
        const rp = league.snapshot?.rosterPositions;
        if (!rp?.length) return DEFAULT_SLOTS;
        return rp.filter(s => !BENCH_SLOTS.has(s.toUpperCase()));
    }, [league.snapshot?.rosterPositions]);

    const rosterSize = league.snapshot?.rosterPositions?.length;
    /**
     * The league's remaining schedule, from this week on.
     *
     * A waiver claim is a roster spot held for months, so the fixtures behind
     * a candidate are part of the decision — and the playoff weeks more than
     * the rest of them.
     */
    const schedule = useSchedule(league.week, league.snapshot?.playoffWeekStart ?? null);

    const week = league.week;
    useEffect(() => {
        if (!taken || week == null) return;
        let cancelled = false;
        setLoading(true);
        const q = `?week=${week}&limit=60`
            + (shownPos === 'ALL' ? '' : `&pos=${shownPos}`)
            + (taken.size ? `&taken=${[...taken].join(',')}` : '');
        fetch(`/api/redraft/waivers${q}`)
            .then(r => r.json())
            .then((d: {
                players: WaiverRow[]; considered: number;
                byPosition: Record<string, PositionShape>;
            }) => {
                if (cancelled) return;
                setRows(d.players ?? []);
                setConsidered(d.considered ?? null);
                setShape(d.byPosition ?? {});
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [taken, week, shownPos]);

    /**
     * This week's projection for the candidates and for my own roster.
     *
     * Computed here from the same endpoint and the same model the lineup
     * board uses, rather than recomputed on the server: a waiver page quoting
     * 9.2 where the start/sit page says 9.5 for the same player is the kind
     * of disagreement that costs a reader all their trust in both.
     */
    const needed = useMemo(() => {
        const ids = new Set<number>(rows.slice(0, PRICED).map(r => r.id));
        for (const p of myRoster) ids.add(p.id);
        return [...ids];
    }, [rows, myRoster]);
    const { data, loading: pricing } = useStartSitData(needed, week);

    const outcomeOf = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]));
        const cache = new Map<number, Outcome | null>();
        return (id: number): Outcome | null => {
            if (cache.has(id)) return cache.get(id)!;
            const p = byId.get(id);
            const d = data.get(id);
            const v = p && d
                ? simInputFor({ id, position: p.position ?? '' }, d, SEASON).outcome
                : null;
            cache.set(id, v);
            return v;
        };
    }, [players, data]);
    const meanOf = (id: number) => outcomeOf(id)?.mean ?? 0;

    /** Priced candidates, in the order the reader asked for. */
    /**
     * Whose absence each candidate was measured covering.
     *
     * Asked for the whole priced set rather than for the visible rows,
     * because the page re-sorts in the browser and a line that appeared and
     * vanished as the reader changed the order would read as a bug.
     */
    const inheritance = useInheritance(useMemo(
        () => rows.slice(0, PRICED).map(r => r.id), [rows]));

    const shown: WireRowData[] = useMemo(() => {
        const top = rows.slice(0, PRICED);
        const candidates: TradeRosterPlayer[] = top.map(r => ({
            id: r.id, name: r.full_name, position: r.position ?? '', startable: true,
        }));
        const plans = myRoster.length && data.size
            ? planClaims(myRoster, candidates, slots, meanOf, rosterSize)
            : new Map();
        const priced = top.map(r => ({
            row: r,
            week: data.has(r.id) ? Math.round(meanOf(r.id) * 10) / 10 : null,
            plan: plans.get(r.id) ?? null,
            rest: schedFor(schedule.rest, r.nfl_team ?? null, r.position ?? null),
            playoffs: schedFor(schedule.playoffs, r.nfl_team ?? null, r.position ?? null),
            inherits: inheritance.byPlayer.get(r.id) ?? [],
        }));
        const by: Record<SortKey, (d: WireRowData) => number> = {
            week: d => d.week ?? -Infinity,
            season: d => d.row.over_replacement ?? -Infinity,
            upgrade: d => d.plan?.net ?? -Infinity,
            // Ranked on the fixtures alone, which is the stash question: who
            // is worth a bench spot for two months because of who he plays.
            schedule: d => d.playoffs?.ease ?? d.rest?.ease ?? -Infinity,
            /**
             * The size of the opening, not the man's own projection.
             *
             * Three things multiplied rather than one: what the starter
             * scores when he plays, how often he is absent, and what this
             * man did the last time he was. A successor to a twenty-point
             * back who has missed a third of his games outranks a successor
             * to a nine-point tight end who has missed two, which is the
             * right order and is not the order any of the three alone gives.
             */
            stash: d => {
                const best = d.inherits[0];
                if (!best) return -Infinity;
                const games = best.missed + best.played;
                const rate = games > 0 ? best.missed / games : 0;
                return best.points * rate + best.pointsOut;
            },
        };
        /**
         * This one ordering also filters.
         *
         * The other four rank every candidate on a number every candidate
         * has. "If someone gets hurt" ranks them on a measurement most of
         * them do not have, and padding the list back out to thirty with men
         * who inherit from nobody turns a finding into a haystack — the page
         * would promise "whose job each of these men was measured taking
         * over" and then answer it for seven of thirty.
         */
        const pool = sort === 'stash'
            ? priced.filter(d => d.inherits.length > 0)
            : priced;
        return [...pool].sort((a, b) => by[sort](b) - by[sort](a)).slice(0, SHOWN);
    }, [rows, data, myRoster, slots, sort, rosterSize, outcomeOf, schedule,
        inheritance.byPlayer]);

    /** And the summary that answers "is any of this better than what I have". */
    const versus = useMemo(() => {
        if (!myRoster.length || !data.size) return [];
        const candidates: TradeRosterPlayer[] = rows.slice(0, PRICED).map(r => ({
            id: r.id, name: r.full_name, position: r.position ?? '', startable: true,
        }));
        const depth: Record<string, { startable: number; count: number }> = {};
        for (const [k, v] of Object.entries(shape)) {
            depth[k] = { startable: v.startable, count: v.count };
        }
        return rosterVsWire(myRoster, candidates,
            ['QB', 'RB', 'WR', 'TE'], meanOf, depth);
    }, [myRoster, rows, data, outcomeOf, shape]);

    if (!league.connection || !league.connection.teamKey) {
        return (
            <div className="space-y-4">
                <p className="text-[12px] text-muted-foreground/60 max-w-[660px]">
                    Connect a league and this becomes the free agents in{' '}
                    <em>that</em> league — everyone nobody has rostered — with what
                    each would score this Sunday, where he ranks at his position for
                    the rest of the year, and what claiming him would do to your own
                    lineup, naming the player who would have to go.
                </p>
                <LeagueConnect league={league} />
            </div>
        );
    }

    const sortNote = SORTS.find(s => s.id === sort)!.note;

    return (
        <div className="space-y-4">
            <LeagueConnect league={league} compact />

            {versus.length > 0 && (
                <RosterVsWire rows={versus} onPick={p =>
                    setPos(p as (typeof POSITIONS)[number])} />
            )}

            <section className="rounded-xl border border-white/[0.07] p-4"
                style={{ background: 'var(--bg-card)' }}>
                <div className="flex flex-wrap items-baseline justify-between
                                gap-x-3 gap-y-2 mb-1">
                    <h2 className="text-[10px] uppercase tracking-widest font-bold
                                   text-muted-foreground/45">
                        Best available in your league
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

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold
                                     text-muted-foreground/35">Rank by</span>
                    <div className="inline-flex items-center gap-1 rounded-lg p-0.5"
                        style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {SORTS.map(s => (
                            <button key={s.id} type="button" onClick={() => setSort(s.id)}
                                aria-pressed={sort === s.id}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold
                                            transition-colors ${sort === s.id
                                    ? 'bg-white/[0.12] text-foreground'
                                    : 'text-muted-foreground/55 hover:text-foreground/80'}`}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="text-[10px] text-muted-foreground/45 leading-snug
                              max-w-[760px] mb-2">
                    {sortNote}
                </p>

                {loading && rows.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground/55 py-3">
                        Working out who is actually available…
                    </p>
                ) : shown.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground/55 py-3 max-w-[620px]">
                        {sort === 'stash'
                            // A different emptiness from the one below, and
                            // saying so matters: the pool is not empty, it is
                            // that none of it has this particular answer.
                            ? inheritance.loading
                                ? 'Reading the weeks these men’s teammates missed…'
                                : 'None of the free agents here was measured taking over '
                                  + 'anybody’s job — either the starters ahead of them have '
                                  + 'not missed a game, or the men who covered are rostered.'
                            : 'Nobody at this position is projected at all among the free '
                              + 'agents in this league, which is itself the answer.'}
                    </p>
                ) : (
                    <>
                        <div className="grid items-end gap-x-3 px-1 pb-1 text-[10px] uppercase
                                        tracking-widest font-bold text-muted-foreground/45
                                        grid-cols-[minmax(0,1fr)_auto]
                                        sm:grid-cols-[190px_84px_minmax(0,1fr)_116px_92px_20px]">
                            <span>Player</span>
                            <span className="text-right">Week</span>
                            <span className="hidden sm:block">Rest of season</span>
                            <span className="hidden sm:block text-right">Your lineup</span>
                            <span className="hidden sm:block text-right">Matchup</span>
                            <span className="hidden sm:block" />
                        </div>
                        <ul className="space-y-0.5">
                            {shown.map(d => (
                                <li key={d.row.id}>
                                    <WireRow data={d} cells={defence.cells} of={defence.of}
                                        isOpen={open === d.row.id}
                                        onToggle={() =>
                                            setOpen(open === d.row.id ? null : d.row.id)} />
                                    {open === d.row.id && (
                                        <div className="px-2 pb-3 pt-1 space-y-3">
                                            <UsageTrend row={d.row} />
                                            {(() => {
                                                const o = outcomeOf(d.row.id);
                                                const full = data.get(d.row.id);
                                                if (!o || !full) {
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
                                                            opponent: full.opponent ?? null,
                                                            impliedTeamTotal:
                                                                full.implied_team_total ?? null,
                                                            spread: full.spread ?? null,
                                                            defenseAllowed:
                                                                full.def_allowed ?? null,
                                                            defenseLeagueAvg:
                                                                full.def_league_avg ?? null,
                                                            defenseSample:
                                                                full.def_sample ?? null,
                                                        }}
                                                        logs={full.logs ?? []}
                                                        position={d.row.position ?? null}
                                                        season={SEASON} />
                                                );
                                            })()}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug
                                      max-w-[820px]">
                            {considered != null && (
                                <>Out of {considered.toLocaleString()} free agents in this
                                league, the {PRICED} best by rest-of-season value are priced
                                in full; the top {SHOWN} on whichever order you picked are
                                shown. </>
                            )}
                            {pricing && <>Still pricing this week&rsquo;s games. </>}
                            Kickers and defences are kept out of the combined list and
                            keep their own filters: almost every startable one is
                            unrostered, so they top a value-over-replacement ranking
                            every week and are worth about two points a game at
                            positions that swing further than that. Week projections are
                            the same model the lineup board uses, so a player&rsquo;s
                            number does not change when you open a different page. Open a row for the usage behind it and the same breakdown
                            Start/Sit gives your own players.
                        </p>
                    </>
                )}
            </section>
        </div>
    );
}
