'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { useLeagueSync } from '@/lib/useLeagueSync';
import {
    buildOutcome, Outcome, rankSwaps, simulateMatchup, SimPlayer,
} from '@/lib/startSit';
import { POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { OutcomeAxis, OutcomeStrip } from './OutcomeStrip';
import { SwapBars, SwapRow } from './SwapBars';
import { LeagueConnect } from './LeagueConnect';
import { HeadToHead } from './HeadToHead';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';

const SEASON = 2026;

/** Slots a bench player may legally fill, so a kicker is never offered at RB. */
const FLEX_OK = new Set(['RB', 'WR', 'TE']);
function canFill(benchPos: string, starterPos: string, slotIsFlex: boolean): boolean {
    const b = benchPos.toUpperCase(), s = starterPos.toUpperCase();
    if (b === s) return true;
    return slotIsFlex && FLEX_OK.has(b) && FLEX_OK.has(s);
}

export function StartSitClient({ players }: { players: RedraftPlayer[] }) {
    const league = useLeagueSync(players);
    const [data, setData] = useState<Map<number, StartSitPlayer>>(new Map());
    const [loading, setLoading] = useState(false);
    const [compare, setCompare] = useState<[number, number] | null>(null);

    // Head-to-head can name anyone on screen, the opponent's starters
    // included — "how does my flex compare to the guy across from him" is a
    // real question, and every one of those rows is clickable.
    const comparePool = useMemo(
        () => [...league.me.starters, ...league.me.bench, ...league.opponent.starters],
        [league.me.starters, league.me.bench, league.opponent.starters]);

    // Everyone on either roster, in one request.
    const needed = useMemo(() => {
        const ids = new Set<number>();
        for (const p of [...league.me.starters, ...league.me.bench,
                         ...league.opponent.starters]) ids.add(p.id);
        return [...ids];
    }, [league.me.starters, league.me.bench, league.opponent.starters]);

    useEffect(() => {
        if (needed.length === 0 || league.week == null) { setData(new Map()); return; }
        let cancelled = false;
        setLoading(true);
        fetch(`/api/redraft/startsit?ids=${needed.join(',')}&week=${league.week}`)
            .then(r => r.json())
            .then((d: { players: StartSitPlayer[] }) => {
                if (cancelled) return;
                setData(new Map(d.players.map(p => [p.id, p])));
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [needed.join(','), league.week]);   // eslint-disable-line react-hooks/exhaustive-deps

    const outcomeFor = useMemo(() => {
        const cache = new Map<number, { outcome: Outcome; sample: number[] }>();
        return (p: RedraftPlayer) => {
            const hit = cache.get(p.id);
            if (hit) return hit;
            const d = data.get(p.id);
            const logs = d?.logs ?? [];
            const outcome = buildOutcome({
                playerId: p.id,
                position: p.position ?? '',
                seasonProjection: d?.proj_points ?? null,
                projectedGames: 17,
                logs,
                context: {
                    impliedTeamTotal: d?.implied_team_total ?? null,
                    spread: d?.spread ?? null,
                    onBye: d?.on_bye ?? false,
                },
            }, SEASON);
            // Last season is the shape sample; this season's games are too few
            // to resample from in September and would collapse the draw.
            const sample = logs.filter(l => l.season === SEASON - 1).map(l => l.points);
            const v = { outcome, sample };
            cache.set(p.id, v);
            return v;
        };
    }, [data]);

    const sim = (p: RedraftPlayer): SimPlayer => {
        const { outcome, sample } = outcomeFor(p);
        return { outcome, sample };
    };

    const matchup = useMemo(() => {
        if (league.me.starters.length === 0 || league.opponent.starters.length === 0) return null;
        return simulateMatchup(
            league.me.starters.map(sim), league.opponent.starters.map(sim), 20000, 11);
    }, [league.me.starters, league.opponent.starters, data]);   // eslint-disable-line react-hooks/exhaustive-deps

    const swaps: SwapRow[] = useMemo(() => {
        if (!matchup || league.me.bench.length === 0) return [];
        const starters = league.me.starters;
        const bench = league.me.bench;
        const verdicts = rankSwaps(
            starters.map(sim), bench.map(sim), league.opponent.starters.map(sim),
            (b, s) => canFill(bench[b].position ?? '', starters[s].position ?? '', true),
            6000);
        const name = (id: number) =>
            [...starters, ...bench].find(p => p.id === id)?.full_name ?? String(id);
        return verdicts.slice(0, 12).map(v => ({
            ...v, inName: name(v.inId), outName: name(v.outId),
        }));
    }, [matchup, league.me.starters, league.me.bench, league.opponent.starters, data]);   // eslint-disable-line react-hooks/exhaustive-deps

    const axisMax = useMemo(() => {
        const all = [...league.me.starters, ...league.me.bench].map(p => outcomeFor(p).outcome.ceiling);
        return Math.max(24, Math.ceil(Math.max(0, ...all) / 5) * 5);
    }, [league.me.starters, league.me.bench, outcomeFor]);

    if (!league.connection || !league.connection.teamKey) {
        return <LeagueConnect league={league} />;
    }

    const winPct = matchup ? Math.round(matchup.winProb * 1000) / 10 : null;

    return (
        <div className="space-y-4">
            <LeagueConnect league={league} compact />

            {/* ── the headline: one number, no chart ── */}
            <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
                <section className="rounded-xl border border-white/[0.07] p-4"
                    style={{ background: 'var(--bg-card)' }}>
                    <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/45">
                        Chance you win week {league.week}
                    </h2>
                    {winPct == null ? (
                        <p className="text-[12px] text-muted-foreground/60 mt-3">
                            {loading ? 'Reading your lineup…'
                                : league.opponent.starters.length === 0
                                    ? 'No opponent is scheduled for this week yet.'
                                    : 'Set a lineup to see this.'}
                        </p>
                    ) : (
                        <>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-5xl font-bold tabular-nums text-foreground">
                                    {winPct}
                                </span>
                                <span className="text-lg text-muted-foreground/60 font-semibold">%</span>
                            </div>
                            <dl className="mt-3 space-y-1 text-[11px]">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground/55">Your expected points</dt>
                                    <dd className="tabular-nums font-semibold">{matchup!.pointsFor}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground/55">Theirs</dt>
                                    <dd className="tabular-nums font-semibold">{matchup!.pointsAgainst}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground/55">Your likely range</dt>
                                    <dd className="tabular-nums font-semibold">
                                        {matchup!.range[0]}–{matchup!.range[1]}
                                    </dd>
                                </div>
                            </dl>
                            <p className="text-[10px] text-muted-foreground/40 mt-3 leading-snug">
                                From 20,000 simulated weeks, both lineups drawn from each player&rsquo;s
                                own distribution rather than their average.
                            </p>
                        </>
                    )}
                </section>

                {/* ── swaps, scored in win probability ── */}
                <section className="rounded-xl border border-white/[0.07] p-4"
                    style={{ background: 'var(--bg-card)' }}>
                    <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/45 mb-2">
                        Every swap you could make
                    </h2>
                    <SwapBars rows={swaps} onPick={r => setCompare([r.inId, r.outId])} />
                </section>
            </div>

            {/* ── the lineup itself ──
                The opponent sits beside your own two panels rather than behind
                a single "Theirs 110.6". How much variance you want is a
                function of their shape, not just their total: the same
                boom-bust flex is the right start against a lineup that can hang
                140 and the wrong one against a lineup that reliably scores 95.
                On the same axis as yours, that comparison is one glance. */}
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                <Roster title="Your starters" players={league.me.starters}
                    outcomeFor={outcomeFor} max={axisMax} series="a"
                    onCompare={id => setCompare(c => c && c[0] !== id ? [c[0], id] : [id, c?.[1] ?? id])} />
                <Roster title="Your bench" players={league.me.bench}
                    outcomeFor={outcomeFor} max={axisMax} series="b"
                    onCompare={id => setCompare(c => c && c[0] !== id ? [c[0], id] : [id, c?.[1] ?? id])} />
                <Roster title={`${league.opponent.team?.name ?? 'Opponent'} starts`}
                    players={league.opponent.starters}
                    outcomeFor={outcomeFor} max={axisMax} series="context"
                    onCompare={id => setCompare(c => c && c[0] !== id ? [c[0], id] : [id, c?.[1] ?? id])} />
            </div>

            {compare && (
                <HeadToHead
                    a={comparePool.find(p => p.id === compare[0]) ?? null}
                    b={comparePool.find(p => p.id === compare[1]) ?? null}
                    data={data}
                    outcomeFor={outcomeFor}
                    onClose={() => setCompare(null)}
                />
            )}
        </div>
    );
}

function Roster({ title, players, outcomeFor, max, series, onCompare }: {
    title: string;
    players: RedraftPlayer[];
    outcomeFor: (p: RedraftPlayer) => { outcome: Outcome; sample: number[] };
    max: number;
    series: 'a' | 'b' | 'context';
    onCompare: (id: number) => void;
}) {
    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/45">
                    {title}
                </h2>
                <span className="text-[10px] text-muted-foreground/45">
                    floor · expected · ceiling, with last season&rsquo;s games
                </span>
            </div>
            {/* The axis has to sit over the plot column, not over the whole
                panel: ticks spanning the name and number columns would put
                "0" under a player's name and make every dot read low. */}
            <div className="grid grid-cols-1 sm:grid-cols-[128px_minmax(0,1fr)_96px]
                            gap-2 px-1.5 mb-1">
                <span className="hidden sm:block" aria-hidden="true" />
                <OutcomeAxis max={max} />
                <span className="hidden sm:block" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
                {players.length === 0 && (
                    <p className="text-[12px] text-muted-foreground/50 py-3">Nothing here.</p>
                )}
                {players.map(p => {
                    const { outcome, sample } = outcomeFor(p);
                    return (
                        <button key={p.id} type="button" onClick={() => onCompare(p.id)}
                            className="w-full grid items-center gap-x-2 gap-y-1
                                       grid-cols-[minmax(0,1fr)_auto]
                                       sm:grid-cols-[128px_minmax(0,1fr)_96px]
                                       px-1.5 py-1 sm:py-0.5 rounded-lg hover:bg-white/[0.04]
                                       text-left transition-colors">
                            <span className="col-start-1 row-start-1 flex items-center gap-1.5 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: POSITION_RAW[(p.position ?? '').toUpperCase()] ?? '#64748b' }} />
                                <span className="text-[12px] font-semibold truncate">{p.full_name}</span>
                            </span>
                            {/* On a phone the strip drops to its own full-width row:
                                squeezed between the name and the numbers it gets
                                ~65px, which turns seventeen games into one blob. */}
                            <span className="col-span-2 row-start-2 sm:col-span-1
                                             sm:col-start-2 sm:row-start-1">
                                <OutcomeStrip outcome={outcome} sample={sample} max={max}
                                    series={series} label={p.full_name} compact />
                            </span>
                            <span className="col-start-2 row-start-1 sm:col-start-3 sm:row-start-1
                                             text-[11px] tabular-nums text-right text-muted-foreground/70">
                                <span className="text-muted-foreground/60">{outcome.floor}</span>
                                <span className="text-foreground font-bold mx-1">{outcome.mean}</span>
                                <span className="text-muted-foreground/60">{outcome.ceiling}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
