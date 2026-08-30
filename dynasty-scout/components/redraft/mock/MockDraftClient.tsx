'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import {
    EligibilityCtx, MockPick, MockSettings, MockState, Pos, RankSourceKey,
    aiPick, canAutoDraft, clearMock, countsFor, loadMock, makeRng, pickInRoundOf,
    rankUnder, roundOf, saveMock, sortBySource, teamOnClock, totalPicks, totalRounds,
} from '@/lib/mockDraft';
import {
    buildOddsContext, oddsFor, PlayerOdds, weightsFromRoom,
} from '@/lib/draftOdds';
import { MockSetup } from './MockSetup';
import { MockDraftRoom, MockLayout } from './MockDraftRoom';
import { MockResults } from './MockResults';

interface Props {
    players: RedraftPlayer[];
}

/** How long an AI pick lingers so the draft reads as live rather than instant. */
const AI_DELAY_MS = 700;

interface TierApiRow { tier_order: number; players?: { id: number }[] }

export function MockDraftClient({ players }: Props) {
    const [state, setState] = useState<MockState | null>(null);
    const [resumable, setResumable] = useState<MockState | null>(null);
    const [checkedStorage, setCheckedStorage] = useState(false);
    const [layout, setLayout] = useState<MockLayout>('both');
    const [sortSource, setSortSource] = useState<RankSourceKey>('consensus');
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [myRanks, setMyRanks] = useState<Map<number, number>>(new Map());
    const skipping = useRef(false);

    const byId = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);

    // ── Load persisted draft + tier ranks ────────────────────────────────────
    useEffect(() => {
        const saved = loadMock();
        if (saved && saved.status === 'active' && saved.picks.length > 0) setResumable(saved);
        setCheckedStorage(true);

        fetch('/api/tiers?mode=redraft')
            .then(r => r.json())
            .then((tiers: TierApiRow[]) => {
                if (!Array.isArray(tiers)) return;
                const ranks = new Map<number, number>();
                let n = 0;
                [...tiers].sort((a, b) => (a.tier_order ?? 0) - (b.tier_order ?? 0))
                    .forEach(t => (t.players || []).forEach(pl => {
                        if (!ranks.has(pl.id)) ranks.set(pl.id, ++n);
                    }));
                setMyRanks(ranks);
            })
            .catch(() => { /* tiers are optional */ });
    }, []);

    useEffect(() => { if (state) saveMock(state); }, [state]);

    // ── Derived draft position ───────────────────────────────────────────────
    const settings = state?.settings;
    const picks = state?.picks ?? [];
    const currentOverall = picks.length + 1;
    const finished = !!settings && picks.length >= totalPicks(settings);

    const onClockTeam = settings && !finished
        ? teamOnClock(currentOverall, settings.teams, settings.snake) : -1;
    const myTeamIndex = settings ? settings.mySlot - 1 : -1;
    const myTurn = !finished && onClockTeam === myTeamIndex;
    const round = settings ? roundOf(currentOverall, settings.teams) : 0;

    const takenIds = useMemo(() => new Set(picks.map(p => p.playerId)), [picks]);
    const available = useMemo(
        () => players.filter(p => !takenIds.has(p.id)), [players, takenIds]);

    /**
     * Chance each available player is still there at your next turn.
     *
     * The room's own boards drive it: every opponent picking between now and
     * your turn drafts off an assigned source, so the weighting is counted
     * straight off those teams rather than assumed. Wait two rounds and the
     * mix changes with whoever is on the clock.
     */
    const oddsBySlug = useMemo(() => {
        if (!settings || finished) return null;
        const shape = { teams: settings.teams, slot: settings.mySlot, snake: settings.snake };
        const ctx0 = buildOddsContext(shape, picks.length, totalRounds(settings.roster));
        if (ctx0.nextPick == null) return null;

        const between: string[] = [];
        for (let o = picks.length + 1; o < ctx0.nextPick; o++) {
            between.push(settings.teamSources[teamOnClock(o, settings.teams, settings.snake)]);
        }
        const weights = weightsFromRoom(between);
        const ctx = buildOddsContext(
            shape, picks.length, totalRounds(settings.roster),
            weights, weights ? 'the boards this room drafts off' : undefined,
        );

        const map = new Map<string, PlayerOdds>();
        for (const p of available) {
            const o = oddsFor(p, ctx, false);
            if (o) map.set(p.slug, o);
        }
        return map;
    }, [settings, finished, picks.length, available]);

    const rosterOf = useCallback((teamIndex: number) =>
        picks.filter(p => p.teamIndex === teamIndex).map(p => p.playerId),
        [picks]);

    const eligibilityFor = useCallback((teamIndex: number): EligibilityCtx | null => {
        if (!settings) return null;
        const ids = rosterOf(teamIndex);
        return {
            counts: countsFor(ids, byId),
            settings,
            round: roundOf(picks.length + 1, settings.teams),
            picksMade: ids.length,
        };
    }, [settings, rosterOf, byId, picks.length]);

    // ── Committing a pick ────────────────────────────────────────────────────
    const commit = useCallback((playerId: number, teamIndex: number, auto: boolean) => {
        setState(prev => {
            if (!prev) return prev;
            const overall = prev.picks.length + 1;
            if (overall > totalPicks(prev.settings)) return prev;
            // Guard against a double-commit racing the AI timer.
            if (prev.picks.some(p => p.playerId === playerId)) return prev;

            const next: MockPick = {
                overall,
                round: roundOf(overall, prev.settings.teams),
                pickInRound: pickInRoundOf(overall, prev.settings.teams),
                teamIndex,
                playerId,
                auto,
            };
            const allPicks = [...prev.picks, next];
            const done = allPicks.length >= totalPicks(prev.settings);
            return { ...prev, picks: allPicks, status: done ? 'complete' : 'active' };
        });
    }, []);

    /** Best available for a team under a given source that fits its roster. */
    const bestFor = useCallback((teamIndex: number, source: RankSourceKey): RedraftPlayer | null => {
        const ctx = eligibilityFor(teamIndex);
        if (!ctx) return null;
        const sorted = sortBySource(available, source, myRanks);
        return sorted.find(p => canAutoDraft((p.position || '').toUpperCase() as Pos, ctx)) ?? null;
    }, [available, eligibilityFor, myRanks]);

    // ── AI turns ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!settings || finished || myTurn || onClockTeam < 0) return;
        const ctx = eligibilityFor(onClockTeam);
        if (!ctx) return;

        const run = () => {
            // Seeded per pick so randomness 0 replays a draft exactly.
            const rng = makeRng(state!.startedAt + currentOverall * 7919);
            const choice = aiPick(available, settings.teamSources[onClockTeam], ctx, rng, myRanks)
                ?? bestFor(onClockTeam, 'consensus');
            if (choice) commit(choice.id, onClockTeam, false);
        };

        if (skipping.current) { run(); return; }
        const t = setTimeout(run, AI_DELAY_MS);
        return () => clearTimeout(t);
    }, [settings, finished, myTurn, onClockTeam, currentOverall, available,
        eligibilityFor, bestFor, commit, myRanks, state]);

    // Stop fast-forwarding once it's the user's pick again.
    useEffect(() => { if (myTurn || finished) skipping.current = false; }, [myTurn, finished]);

    // ── Clock ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!settings || !myTurn || finished || !settings.secondsPerPick) {
            setSecondsLeft(null);
            return;
        }
        setSecondsLeft(settings.secondsPerPick);
        const id = setInterval(() => {
            setSecondsLeft(s => (s == null ? null : Math.max(0, s - 1)));
        }, 1000);
        return () => clearInterval(id);
    }, [settings, myTurn, finished, currentOverall]);

    // Expiry auto-picks the top of the user's current sort, so the pick reflects
    // whichever ranking they were actually looking at.
    useEffect(() => {
        if (secondsLeft !== 0 || !myTurn || finished) return;
        const choice = bestFor(myTeamIndex, sortSource) ?? bestFor(myTeamIndex, 'consensus');
        if (choice) commit(choice.id, myTeamIndex, true);
    }, [secondsLeft, myTurn, finished, bestFor, myTeamIndex, sortSource, commit]);

    // ── Actions ──────────────────────────────────────────────────────────────
    const start = (s: MockSettings) => {
        setResumable(null);
        setState({ settings: s, picks: [], status: 'active', startedAt: Date.now() });
    };

    const restart = () => { clearMock(); setState(null); setResumable(null); };

    const abandon = () => {
        if (typeof window !== 'undefined'
            && !window.confirm('Abandon this mock draft? Your picks will be lost.')) return;
        restart();
    };

    const draftPlayer = (p: RedraftPlayer) => {
        if (!myTurn) return;
        commit(p.id, myTeamIndex, false);
    };

    const myRoster = useMemo(
        () => rosterOf(myTeamIndex).map(id => byId.get(id)).filter(Boolean) as RedraftPlayer[],
        [rosterOf, myTeamIndex, byId]);

    // ── Render ───────────────────────────────────────────────────────────────
    if (!checkedStorage) {
        return <div className="py-16 text-center text-muted-foreground text-sm animate-pulse">Loading…</div>;
    }

    if (!state) {
        return (
            <div className="space-y-4">
                {resumable && (
                    <div className="rounded-2xl border border-sky-500/40 px-4 py-3 flex flex-wrap items-center gap-3"
                        style={{ background: 'rgba(56,189,248,0.07)' }}>
                        <div className="text-[13px]">
                            <span className="font-bold">Draft in progress</span>
                            <span className="text-muted-foreground ml-2">
                                {resumable.picks.length} picks made ·{' '}
                                {resumable.settings.teams} teams · pick {resumable.settings.mySlot}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                            <button
                                type="button"
                                onClick={() => { setState(resumable); setResumable(null); }}
                                className="px-3 h-8 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-[12px] font-bold"
                            >
                                Resume draft
                            </button>
                            <button
                                type="button"
                                onClick={() => { clearMock(); setResumable(null); }}
                                className="px-3 h-8 rounded-lg border border-border/60 text-[12px] font-bold text-muted-foreground hover:text-foreground"
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                )}
                <MockSetup onStart={start} />
            </div>
        );
    }

    if (finished) {
        return <MockResults settings={state.settings} picks={picks} byId={byId} onRestart={restart} />;
    }

    return (
        <MockDraftRoom
            settings={state.settings}
            picks={picks}
            available={available}
            byId={byId}
            currentOverall={currentOverall}
            round={round}
            pickInRound={pickInRoundOf(currentOverall, state.settings.teams)}
            onClockTeam={onClockTeam}
            myTurn={myTurn}
            secondsLeft={secondsLeft}
            layout={layout}
            onLayoutChange={setLayout}
            sortSource={sortSource}
            odds={oddsBySlug}
            onSortChange={setSortSource}
            myRanks={myRanks}
            eligibility={myTurn ? eligibilityFor(myTeamIndex) : null}
            onDraft={draftPlayer}
            onSkipToMyPick={() => { skipping.current = true; }}
            onAbandon={abandon}
            myRoster={myRoster}
        />
    );
}
