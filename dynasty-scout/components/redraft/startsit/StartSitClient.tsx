'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { useLeagueSync } from '@/lib/useLeagueSync';
import {
    beatsProbability, buildOutcome, Outcome, simulateMatchup, SimPlayer,
    usableSample,
} from '@/lib/startSit';
import { POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { OutcomeAxis, OutcomeStrip, SampleGame } from './OutcomeStrip';
import { findProblems, LineupAlerts, SwapRow } from './LineupAlerts';
import { SlotBoard } from './SlotBoard';
import { MatchupChart } from './MatchupChart';
import { formatDelta, optimalLineup, rankSlots, resolveConflicts, SlotDecision } from '@/lib/lineup';
import { LeagueConnect } from './LeagueConnect';
import { SwapPreview } from './SwapPreview';
import { PlayerDetail } from './PlayerDetail';
import { MatchupBySlot, SlotPair } from './MatchupBySlot';
import { HeadToHead } from './HeadToHead';
import type { StartSitPlayer } from '@/app/api/redraft/startsit/route';

const SEASON = 2026;

/**
 * How many recent games form a player's shape.
 *
 * One NFL season. Long enough that the floor and ceiling are not decided by
 * three games, short enough that it drops out of a role the player no longer
 * has.
 */
const SAMPLE_GAMES = 17;

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

    /**
     * Whether the week's data has arrived.
     *
     * `data` starts empty, so every simulation on this page used to run once
     * against nothing — no logs, no lines, no injury report — produce a set
     * of meaningless outcomes, render the whole board from them, and then do
     * it all again when the fetch landed. A third of the wait was spent
     * computing an answer that was always going to be thrown away, and for a
     * moment the board showed it.
     */
    const ready = needed.length === 0 || data.size > 0;

    const outcomeFor = useMemo(() => {
        const cache = new Map<number, { outcome: Outcome; sample: SampleGame[] }>();
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
            // A rolling window of the most recent games, not "last season".
            //
            // Filtering to last season is right in September and quietly wrong
            // by November: a player would be nine games into a new role with
            // all nine excluded from the shape, resampled instead from a season
            // that no longer describes them. Taking the last SAMPLE_GAMES
            // regardless of season slides on its own — 16 of last year in week
            // 1, mostly this year by midseason — and every dot names its own
            // season, so a mixed window still reads honestly.
            const sample: SampleGame[] = logs
                .slice()
                .sort((x, y) => y.season - x.season || y.week - x.week)
                .slice(0, SAMPLE_GAMES)
                .map(l => ({ points: l.points, week: l.week, season: l.season, opponent: l.opponent }))
                .reverse();
            // A sample that cannot stand in for the player is not shown either.
            // nflverse scores no kicking, so a kicker's games are seventeen
            // zeroes — plotted as evidence they would say a nine-point kicker
            // has never scored.
            const v = { outcome, sample: usableSample(sample.map(g => g.points)) ? sample : [] };
            cache.set(p.id, v);
            return v;
        };
    }, [data]);

    // The simulator resamples points and has no use for which game each came
    // from; the strip is the other way round. Same games, two shapes.
    /**
     * A player's simulation input, built once.
     *
     * This was a plain function, so every call allocated a fresh points
     * array — and it is called for each of nine players for each candidate
     * for each slot, on top of every `.map(sim)` across five other memos.
     * The outcome behind it was already cached; the array was not.
     */
    const sim = useMemo(() => {
        const cache = new Map<number, SimPlayer>();
        return (p: RedraftPlayer): SimPlayer => {
            const hit = cache.get(p.id);
            if (hit) return hit;
            const { outcome, sample } = outcomeFor(p);
            const made = { outcome, sample: sample.map(g => g.points) };
            cache.set(p.id, made);
            return made;
        };
    }, [outcomeFor]);

    const matchup = useMemo(() => {
        if (!ready) return null;
        if (league.me.starters.length === 0 || league.opponent.starters.length === 0) return null;
        return simulateMatchup(
            league.me.starters.map(sim), league.opponent.starters.map(sim), 20000, 11,
            { bins: 40 });
    }, [ready, league.me.starters, league.opponent.starters, data]);   // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * The lineup as slots, which is how it is actually set.
     *
     * Where the platform reports its slot order we use it. Where it does not
     * — an older ESPN payload, a league shape we have not seen — the
     * starters' own positions stand in, with the last one treated as a flex,
     * which is wrong less often than refusing to show anything.
     */
    /**
     * A side's lineup as slots, from whatever the platform reported.
     *
     * Both sides need this now: the opponent's lineup pairs with yours slot
     * for slot — same league, same roster_positions — and that pairing is
     * what turns one aggregate matchup into the nine small contests it
     * actually is.
     */
    const resolveSlots = React.useCallback((
        team: typeof league.me.team, roster: RedraftPlayer[],
    ) => {
        const byPlatformId = new Map(roster.map(p => [
            String(league.connection?.platform === 'espn' ? p.espn_nfl_id : p.sleeper_id), p]));
        const reported = team?.lineupSlots;
        if (reported?.length) {
            return reported.map(r => ({
                slot: r.slot,
                playerId: r.playerId ? byPlatformId.get(String(r.playerId))?.id ?? null : null,
            }));
        }
        return roster.map((p, i) => ({
            slot: i === roster.length - 1 ? 'FLEX' : (p.position ?? 'FLEX').toUpperCase(),
            playerId: p.id,
        }));
    }, [league.connection?.platform]);

    const slotLineup = useMemo(() => {
        const reported = league.me.team?.lineupSlots;
        const byPlatformId = new Map(league.me.starters.map(p => [
            String(league.connection?.platform === 'espn' ? p.espn_nfl_id : p.sleeper_id), p]));
        if (reported?.length) {
            return reported.map(r => ({
                slot: r.slot,
                playerId: r.playerId ? byPlatformId.get(String(r.playerId))?.id ?? null : null,
            }));
        }
        return league.me.starters.map((p, i) => ({
            slot: i === league.me.starters.length - 1 ? 'FLEX' : (p.position ?? 'FLEX').toUpperCase(),
            playerId: p.id,
        }));
    }, [league.me.team, league.me.starters, league.connection?.platform]);

    /**
     * Best ball has no start/sit decision in it.
     *
     * Sleeper scores whichever of your players did best in each slot, so
     * there is no lineup to set and no move to make. A board offering
     * "start Kincaid over Bowers" there is offering a move the platform will
     * not let you make — and does not need you to. What is still worth
     * showing is every player's distribution and the week's odds, so the
     * board stays and the calls come off it.
     */
    const bestBall = league.snapshot?.bestBall === true;

    /** Which candidate is open for inspection, and in which slot. */
    const [preview, setPreview] = useState<{ index: number; playerId: number } | null>(null);
    const [openBench, setOpenBench] = useState<number | null>(null);
    const [openOpp, setOpenOpp] = useState<number | null>(null);

    /** The week's evidence for one player, in one place rather than four. */
    const contextFor = (id: number) => {
        const d = data.get(id);
        return {
            opponent: d?.opponent ?? null,
            impliedTeamTotal: d?.implied_team_total ?? null,
            spread: d?.spread ?? null,
            defenseAllowed: d?.def_allowed ?? null,
            defenseLeagueAvg: d?.def_league_avg ?? null,
            defenseSample: d?.def_sample ?? null,
        };
    };

    const decisions: SlotDecision[] = useMemo(() => {
        if (!matchup || slotLineup.length === 0) return [];
        const all = [...league.me.starters, ...league.me.bench];
        const posOf = (id: number) =>
            (all.find(p => p.id === id)?.position ?? '').toUpperCase();
        const byId = new Map(all.map(p => [p.id, p]));
        // Resolved, not raw: scored on its own every running back slot asks
        // for the best back on the bench, and being told to start the same
        // man twice is how a tool tells you it cannot count.
        const ranked = resolveConflicts(rankSlots(
            slotLineup, posOf, id => sim(byId.get(id)!),
            league.me.bench.map(p => p.id),
            league.opponent.starters.map(sim), 6000));
        // The candidates stay — comparing your flex against your bench is
        // still worth seeing — but nothing is a "change" you could make.
        return bestBall ? ranked.map(d => ({ ...d, verdict: 'set' as const })) : ranked;
    }, [matchup, slotLineup, league.me.bench, league.opponent.starters, data, bestBall]);   // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * The replacement for a starter who cannot play, from the slot board.
     *
     * This was its own engine — rankSwaps over every bench-and-starter pair,
     * a full lineup simulation each, 445ms of the page's compute — feeding
     * one alert about at most two players. The board already ranks every
     * slot's candidates by the same measure, so the answer was being
     * computed twice and the expensive copy thrown away.
     */
    const fixFor = React.useCallback((playerId: number): SwapRow | undefined => {
        const d = decisions.find(x => x.currentId === playerId);
        const best = d?.candidates.find(c => !c.current);
        if (!d || !best) return undefined;
        const all = [...league.me.starters, ...league.me.bench];
        const inP = all.find(p => p.id === best.playerId);
        const outP = all.find(p => p.id === playerId);
        if (!inP || !outP) return undefined;
        return {
            inId: inP.id, outId: outP.id,
            inName: inP.full_name, outName: outP.full_name,
            deltaWinProb: best.deltaWinProb, deltaPoints: best.deltaPoints,
        };
    }, [decisions, league.me.starters, league.me.bench]);

    /**
     * The lineup the simulation would set, and what it is worth.
     *
     * The single most useful number on the page is not your win probability —
     * it is the gap between yours and the best one available, because that is
     * the part you can still do something about. Most weeks it is zero, and
     * saying so is worth as much as naming a change.
     */
    const best = useMemo(() => {
        if (!matchup || decisions.length === 0) return null;
        const all = [...league.me.starters, ...league.me.bench];
        const byId = new Map(all.map(p => [p.id, p]));
        const chosen = optimalLineup(decisions);
        const ids = decisions.map(d => chosen.get(d.index) ?? d.currentId);
        const lineup = ids.filter((id): id is number => id != null)
            .map(id => sim(byId.get(id)!));
        if (lineup.length === 0) return null;
        // Most weeks the best lineup is the one already set, and simulating
        // it again is twenty thousand trials to re-derive a number that is
        // already on screen — same players, same opponent, same seed, so
        // necessarily the same answer.
        const unchanged = ids.length === decisions.length
            && ids.every((id, i) => id === decisions[i].currentId);
        const prob = unchanged
            ? matchup.winProb
            : simulateMatchup(lineup, league.opponent.starters.map(sim), 20000, 11).winProb;
        const changes = decisions
            .map(d => ({ d, to: chosen.get(d.index) ?? null }))
            .filter(c => c.to != null && c.to !== c.d.currentId)
            .map(c => ({
                slot: c.d.slot,
                out: c.d.currentId != null ? byId.get(c.d.currentId)?.full_name ?? null : null,
                in: byId.get(c.to!)?.full_name ?? '',
                inId: c.to!,
                outId: c.d.currentId,
            }));
        return { prob, changes, gain: Math.round((prob - matchup.winProb) * 1000) / 10 };
    }, [matchup, decisions, league.me.starters, league.me.bench, league.opponent.starters]);   // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * The matchup with one slot's occupant replaced.
     *
     * Same opponent, same trial count, same seed as the headline, so the
     * difference between the two numbers is the swap rather than the dice.
     */
    const previewSim = useMemo(() => {
        if (!preview || !matchup || slotLineup.length === 0) return null;
        const all = [...league.me.starters, ...league.me.bench];
        const byId = new Map(all.map(p => [p.id, p]));
        const ids = slotLineup.map((s, i) =>
            i === preview.index ? preview.playerId : s.playerId);
        const lineup = ids
            .filter((id): id is number => id != null && byId.has(id))
            .map(id => sim(byId.get(id)!));
        if (lineup.length === 0) return null;
        return simulateMatchup(lineup, league.opponent.starters.map(sim), 20000, 11,
            { bins: 40 });
    }, [preview, matchup, slotLineup, league.me.starters, league.me.bench,
        league.opponent.starters, data]);   // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Your lineup against theirs, one slot at a time.
     *
     * `beatsProbability` per pair rather than a points gap alone: a
     * four-point edge between two steady players is nearly settled and the
     * same edge between two spiky ones is not, and the gap cannot tell them
     * apart.
     */
    const slotPairs: SlotPair[] = useMemo(() => {
        if (!ready) return [];
        const oppSlots = resolveSlots(league.opponent.team, league.opponent.starters);
        if (slotLineup.length === 0 || oppSlots.length === 0) return [];
        const all = [...league.me.starters, ...league.me.bench, ...league.opponent.starters];
        const byId = new Map(all.map(p => [p.id, p]));
        const look = (id: number | null) => (id != null ? byId.get(id) ?? null : null);
        return slotLineup.map((s, i) => {
            const mineP = look(s.playerId);
            const theirsP = look(oppSlots[i]?.playerId ?? null);
            const mineO = mineP ? outcomeFor(mineP).outcome : null;
            const theirsO = theirsP ? outcomeFor(theirsP).outcome : null;
            return {
                slot: s.slot,
                mine: { player: mineP, outcome: mineO },
                theirs: { player: theirsP, outcome: theirsO },
                beats: mineP && theirsP
                    ? beatsProbability(sim(mineP), sim(theirsP), 3000, 17) : null,
            };
        });
    }, [ready, slotLineup, league.opponent.team, league.opponent.starters,
        league.me.starters, league.me.bench, resolveSlots, data]);   // eslint-disable-line react-hooks/exhaustive-deps

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

            {/* Before anything that needs weighing: anyone who cannot play.
                Silent in best ball, where every problem it would name is one
                the platform resolves for you. */}
            {!bestBall && <LineupAlerts
                problems={findProblems(league.me.starters,
                    p => outcomeFor(p).outcome, fixFor)}
                onPick={r => setCompare([r.inId, r.outId])} />}

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
                            {matchup?.hist && (
                                <div className="mt-3">
                                    <MatchupChart hist={matchup.hist} winProb={matchup.winProb}
                                        mineLabel={league.me.team?.name ?? 'You'}
                                        theirsLabel={league.opponent.team?.name ?? 'Them'} />
                                </div>
                            )}
                            {best && !bestBall && (
                                <div className="mt-3 pt-3 border-t border-white/[0.07]">
                                    {best.changes.length === 0 ? (
                                        <p className="text-[12px]">
                                            <span className="font-bold" style={{ color: '#86EFAC' }}>
                                                This is the best lineup available.
                                            </span>
                                            <span className="text-muted-foreground/60"> Nothing on your
                                                bench raises your chances.</span>
                                        </p>
                                    ) : (
                                        <>
                                            <p className="text-[12px] mb-1.5">
                                                <span className="text-muted-foreground/60">Best available </span>
                                                <span className="font-bold tabular-nums"
                                                    style={{ color: '#93C5FD' }}>
                                                    {Math.round(best.prob * 1000) / 10}%
                                                </span>
                                                <span className="text-muted-foreground/60">
                                                    {' '}— {formatDelta(best.gain)} from
                                                    {best.changes.length === 1 ? ' one change' : ` ${best.changes.length} changes`}
                                                </span>
                                            </p>
                                            <ul className="space-y-0.5">
                                                {best.changes.map(c => (
                                                    <li key={`${c.slot}-${c.inId}`}>
                                                        <button type="button"
                                                            onClick={() => c.outId != null && setCompare([c.inId, c.outId])}
                                                            className="text-left text-[11px] hover:underline">
                                                            <span className="text-muted-foreground/50 font-bold mr-1">
                                                                {c.slot}
                                                            </span>
                                                            <span className="font-semibold">{c.in}</span>
                                                            {c.out && (
                                                                <span className="text-muted-foreground/50"> for {c.out}</span>
                                                            )}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            )}
                            {bestBall && (
                                <div className="mt-3 pt-3 border-t border-white/[0.07]">
                                    <p className="text-[12px]">
                                        <span className="font-bold" style={{ color: '#86EFAC' }}>
                                            Best ball — there is nothing to set.
                                        </span>
                                        <span className="text-muted-foreground/60"> The platform
                                            scores your best lineup after the games, and picking
                                            with hindsight can only beat picking in advance — so
                                            the {winPct}% above is a floor on your real chance,
                                            not the figure.</span>
                                    </p>
                                </div>
                            )}
                            <p className="text-[10px] text-muted-foreground/40 mt-3 leading-snug">
                                From 20,000 simulated weeks, both lineups drawn from each player&rsquo;s
                                own distribution rather than their average.
                            </p>
                            {/* What the availability numbers rest on, stated rather
                                than left to be assumed. The report is real and the
                                play rates on it are conventional readings, not a
                                fitted model — and a report that has not been filed
                                yet reads as healthy, which is the honest default and
                                still worth knowing. */}
                            <p className="text-[10px] text-muted-foreground/40 mt-1.5 leading-snug">
                                Byes and the official injury report are both accounted
                                for. A player with no report is treated as healthy, and
                                reports land mid-week — so late news will not be here yet.
                            </p>
                        </>
                    )}
                </section>

                {/* ── swaps, scored in win probability ── */}
                <section className="rounded-xl border border-white/[0.07] p-4"
                    style={{ background: 'var(--bg-card)' }}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                        <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/45">
                            Your lineup, slot by slot
                        </h2>
                        {(() => {
                            if (bestBall) return (
                                <span className="text-[10px] text-muted-foreground/50">
                                    Best ball — the platform fills these slots for you
                                </span>
                            );
                            const changes = decisions.filter(d => d.verdict !== 'set');
                            return (
                                <span className="text-[10px] text-muted-foreground/50">
                                    {changes.length === 0
                                        ? 'Every slot is already the one the simulation would pick.'
                                        : `${changes.length} slot${changes.length > 1 ? 's' : ''} worth a second look`}
                                </span>
                            );
                        })()}
                    </div>
                    <SlotBoard
                        decisions={decisions}
                        max={axisMax}
                        playerOf={id => [...league.me.starters, ...league.me.bench]
                            .find(p => p.id === id)}
                        outcomeOf={id => {
                            const p = [...league.me.starters, ...league.me.bench]
                                .find(x => x.id === id);
                            return p ? outcomeFor(p)
                                : { outcome: buildOutcome({ playerId: id, position: '', logs: [] }, SEASON),
                                    sample: [] };
                        }}
                        showCall={!bestBall}
                        contextOf={contextFor}
                        season={SEASON}
                        logsOf={id => data.get(id)?.logs ?? []}
                        selected={preview}
                        onSelect={(index, playerId) =>
                            setPreview(playerId == null ? null : { index, playerId })}
                        renderPreview={(index, playerId) => {
                            const all = [...league.me.starters, ...league.me.bench];
                            const p = all.find(x => x.id === playerId);
                            const d = decisions.find(x => x.index === index);
                            const outId = d?.currentId ?? null;
                            const out = outId != null
                                ? all.find(x => x.id === outId) : undefined;
                            if (!p || !matchup || !previewSim) return null;
                            return (
                                <SwapPreview
                                    inName={p.full_name}
                                    outName={out?.full_name ?? null}
                                    before={matchup} after={previewSim}
                                    mineLabel={league.me.team?.name ?? 'You'}
                                    theirsLabel={league.opponent.team?.name ?? 'Them'}
                                    onFullCompare={outId != null
                                        ? () => setCompare([playerId, outId]) : undefined}>
                                    <PlayerDetail
                                        outcome={outcomeFor(p).outcome}
                                        context={contextFor(p.id)}
                                        logs={data.get(p.id)?.logs ?? []}
                                        position={p.position ?? null}
                                        season={SEASON} />
                                </SwapPreview>
                            );
                        }}
                        onCompare={(a, b) => setCompare([a, b])} />
                </section>
            </div>

            {/* Where the week is won, before the rosters that might change it. */}
            <MatchupBySlot pairs={slotPairs}
                onPick={(a, b) => setCompare([a, b])} />

            {/* ── the lineup itself ──
                The opponent sits beside your own two panels rather than behind
                a single "Theirs 110.6". How much variance you want is a
                function of their shape, not just their total: the same
                boom-bust flex is the right start against a lineup that can hang
                140 and the wrong one against a lineup that reliably scores 95.
                On the same axis as yours, that comparison is one glance. */}
            <div className="grid gap-3 lg:grid-cols-2">
                {/* No starters panel: the slot board above is the starting
                    lineup, with the same strips and the decision attached.
                    Printing it twice made the page longer and said nothing
                    the first one had not. */}
                <Roster title="Your bench" players={league.me.bench}
                    outcomeFor={outcomeFor} max={axisMax} series="b"
                    openId={openBench} onOpen={setOpenBench}
                    detailFor={p => <PlayerDetail outcome={outcomeFor(p).outcome}
                        context={contextFor(p.id)} logs={data.get(p.id)?.logs ?? []}
                        position={p.position ?? null} season={SEASON} stacked />}
                    onCompare={id => setCompare(c => c && c[0] !== id ? [c[0], id] : [id, c?.[1] ?? id])} />
                <Roster title={`${league.opponent.team?.name ?? 'Opponent'} starts`}
                    players={league.opponent.starters}
                    outcomeFor={outcomeFor} max={axisMax} series="context"
                    openId={openOpp} onOpen={setOpenOpp}
                    detailFor={p => <PlayerDetail outcome={outcomeFor(p).outcome}
                        context={contextFor(p.id)} logs={data.get(p.id)?.logs ?? []}
                        position={p.position ?? null} season={SEASON} stacked />}
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

/** Short enough to sit beside a name without pushing it out of its column. */
const AVAILABILITY_TOKEN: Record<string, string> = {
    Out: 'OUT', Doubtful: 'D', Questionable: 'Q',
    'No practice': 'DNP', Limited: 'LTD',
};

/**
 * A panel of players, each of which opens.
 *
 * Rows here looked clickable and were: clicking jumped straight into a
 * two-player comparison, which is a different question from "what is this
 * guy's week?". The receiver on the other side of the matchup decides your
 * week as much as anyone on your own bench, and until now the page had a
 * full account of him nowhere.
 */
function Roster({ title, players, outcomeFor, max, series, onCompare,
    detailFor, openId, onOpen }: {
    title: string;
    players: RedraftPlayer[];
    outcomeFor: (p: RedraftPlayer) => { outcome: Outcome; sample: SampleGame[] };
    max: number;
    series: 'a' | 'b' | 'context';
    onCompare: (id: number) => void;
    detailFor?: (p: RedraftPlayer) => React.ReactNode;
    openId?: number | null;
    onOpen?: (id: number | null) => void;
}) {
    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/45">
                    {title}
                </h2>
                <span className="text-[10px] text-muted-foreground/45">
                    floor · expected · ceiling, with recent games
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
                        <React.Fragment key={p.id}>
                        <button type="button"
                            aria-expanded={openId === p.id}
                            onClick={() => onOpen?.(openId === p.id ? null : p.id)}
                            className="w-full grid items-center gap-x-2 gap-y-1
                                       grid-cols-[minmax(0,1fr)_auto]
                                       sm:grid-cols-[128px_minmax(0,1fr)_96px]
                                       px-1.5 py-1 sm:py-0.5 rounded-lg hover:bg-white/[0.04]
                                       text-left transition-colors">
                            <span className="col-start-1 row-start-1 flex items-center gap-1.5 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: POSITION_RAW[(p.position ?? '').toUpperCase()] ?? '#64748b' }} />
                                <span className="text-[12px] font-semibold truncate">{p.full_name}</span>
                                {/* Named, not just hatched: a texture on a bar is
                                    not something a screen reader or a colour-blind
                                    reader can be asked to carry alone. */}
                                {/* A number from the betting market is a different
                                    kind of claim from a number we modelled, and
                                    worth saying so on the row that shows it. */}
                                {outcome.centreSource === 'market' && (
                                    <span className="shrink-0 px-1 rounded text-[9px] font-bold tracking-wide"
                                        style={{ background: 'rgba(2,132,199,0.18)', color: '#7DD3FC' }}
                                        title="Expected points come from this week's prop market, which already prices the matchup, the game script and the injury news">
                                        MKT
                                    </span>
                                )}
                                {outcome.availability && (
                                    <span className="shrink-0 px-1 rounded text-[9px] font-bold tracking-wide"
                                        style={outcome.playProbability === 0
                                            ? { background: 'rgba(220,38,38,0.16)', color: '#FCA5A5' }
                                            : { background: 'rgba(234,88,12,0.16)', color: '#FDBA74' }}
                                        title={`${outcome.availability} — `
                                            + `${Math.round(outcome.playProbability * 100)}% chance of playing`}>
                                        {AVAILABILITY_TOKEN[outcome.availability]
                                            ?? outcome.availability.toUpperCase()}
                                    </span>
                                )}
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
                                {/* A ruled-out player has no floor, expected or
                                    ceiling. Printing them invites reading a number
                                    that cannot happen. */}
                                {outcome.playProbability === 0 ? (
                                    <span className="text-muted-foreground/35">&mdash;</span>
                                ) : (<>
                                    <span className="text-muted-foreground/60">{outcome.floor}</span>
                                    <span className="text-foreground font-bold mx-1">{outcome.mean}</span>
                                    <span className="text-muted-foreground/60">{outcome.ceiling}</span>
                                </>)}
                            </span>
                        </button>
                        {openId === p.id && detailFor && (
                            <div className="px-1.5 pb-2 pt-1">
                                {detailFor(p)}
                                <button type="button" onClick={() => onCompare(p.id)}
                                    className="mt-2 text-[10px] text-muted-foreground/50
                                               hover:text-foreground/80 underline
                                               underline-offset-2">
                                    Compare with someone
                                </button>
                            </div>
                        )}
                        </React.Fragment>
                    );
                })}
            </div>
        </section>
    );
}
