'use client';

import React, { useMemo, useState } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { useLeagueSync } from '@/lib/useLeagueSync';
import type { Horizon } from '@/lib/simInput';
import { playoffOdds, type PowerResult } from '@/lib/power';
import { LeagueConnect } from '@/components/redraft/startsit/LeagueConnect';
import { HorizonToggle } from '@/components/redraft/HorizonToggle';
import { PowerTable } from './PowerTable';
import { Earned } from './Earned';
import { RunHome } from './RunHome';
import { AtStake } from './AtStake';
import { Rooting } from './Rooting';
import { allPlay, pairingTable, scheduleStrength } from '@/lib/leagueSchedule';
import { useLeagueFixtures } from '@/lib/useLeagueFixtures';
import { DEFAULT_PLAYOFF_WEEK, useSeasonOdds } from '@/lib/useSeasonOdds';

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
     * One run of the league's season, shared with every page that asks.
     *
     * This used to be six memos here — rosters, slots, ids, the fetch, the
     * round robin, the odds — and the Start/Sit page needed the last of
     * them. Copying them there would have been two pages quoting different
     * numbers for one thing, so the whole pipeline moved to a hook with a
     * cache behind it and both pages read the same object.
     */
    const season = useSeasonOdds(league, players, { season: SEASON, horizon });
    const result: PowerResult = season.value?.result ?? { rows: [], unranked: [] };
    const remaining = season.value?.remaining
        ?? Math.max(0, (league.snapshot?.playoffWeekStart ?? DEFAULT_PLAYOFF_WEEK)
            - (league.week ?? 1));
    const week = league.week;
    const loading = season.loading;
    const failed = season.failed;
    const ready = season.value != null;

    /**
     * Where the cut is.
     *
     * The platform usually says; Sleeper does not always, and a page that
     * quietly assumes six is a page giving a confident wrong answer to the
     * only question that matters. So the reader can move it, and the table
     * says which number it used.
     */
    const [spots, setSpots] = useState<number | null>(null);
    const cut = spots ?? season.value?.cut
        ?? league.snapshot?.playoffTeams
        ?? Math.max(2, Math.round((league.snapshot?.teams.length ?? 12) / 2));

    const games = useLeagueFixtures(league);
    const firstAhead = week ?? 1;
    const lastWeek = firstAhead + remaining - 1;

    /**
     * The odds the table shows.
     *
     * Straight from the shared run where the reader has not moved the cut,
     * and re-played here where they have — the cut is the only input they
     * can change, and re-ranking twelve rosters to answer it would be
     * paying for the expensive half of the computation to change the cheap
     * one.
     */
    const odds = useMemo(() => {
        if (!season.value) return null;
        if (spots == null || spots === season.value.cut) return season.value.odds;
        if (remaining <= 0 || result.rows.length < 2) return null;
        const keys = result.rows.map(r => r.key);
        const pairs = season.value.realSchedule && games?.length
            ? pairingTable(games, keys, firstAhead, lastWeek)
            : null;
        return playoffOdds(result.rows, remaining, cut, TRIALS / 2, 41, pairs);
    }, [season.value, spots, cut, remaining, result.rows, games, firstAhead, lastWeek]);

    /** What each week's scores were worth against the whole league. */
    const earned = useMemo(() => {
        if (!games?.length || result.rows.length < 2) return null;
        const play = allPlay(games, result.rows.map(r => r.key));
        const rows = result.rows
            .map(r => ({ key: r.key, name: r.name, play: play.get(r.key)! }))
            .filter(r => r.play && r.play.played > 0);
        return rows.length > 1 ? rows : null;
    }, [games, result.rows]);

    /** The rosters left to play, ranked hardest first. */
    const runHome = useMemo(() => {
        if (!games?.length || result.rows.length < 2 || remaining <= 0) return null;
        const sos = scheduleStrength(
            result.rows.map(r => ({ key: r.key, expected: r.expected })),
            games, firstAhead, lastWeek);
        const rows = result.rows
            .map(r => ({ key: r.key, name: r.name, sos: sos.get(r.key)! }))
            .filter(r => r.sos && r.sos.opponents.length > 0);
        return rows.length > 1 ? rows : null;
    }, [games, result.rows, remaining, firstAhead, lastWeek]);

    /**
     * Who each team plays this week, so the panel that weighs the week can
     * name the opponent rather than just the stake.
     */
    const thisWeekOpponents = useMemo(() => {
        if (!games?.length || remaining <= 0) return null;
        const m = new Map<string, string>();
        for (const g of games) {
            if (g.week !== firstAhead) continue;
            m.set(g.home, g.away);
            m.set(g.away, g.home);
        }
        return m.size > 0 ? m : null;
    }, [games, firstAhead, remaining]);

    const weeksAhead = useMemo(() => {
        const ws: number[] = [];
        for (let w = firstAhead; w <= lastWeek; w++) ws.push(w);
        return ws;
    }, [firstAhead, lastWeek]);

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
                <>
                    <PowerTable rows={result.rows} unranked={result.unranked}
                        myKey={league.connection.teamKey ?? null} trials={TRIALS}
                        horizon={horizon} remaining={remaining}
                        odds={odds} spots={cut} onSpots={setSpots}
                        realSchedule={season.value?.realSchedule ?? false}
                        spotsKnown={league.snapshot?.playoffTeams != null} />
                    {/**
                      * Once the regular season is over, three of the four
                      * panels below have nothing to say — a run home with no
                      * weeks in it is not a run home, and a Sunday that
                      * cannot change a seeding is not worth anything.
                      *
                      * That is correct, and vanishing is not. A page that
                      * drops three sections between one Sunday and the next,
                      * with nothing where they were, is indistinguishable
                      * from a page that has broken — which is precisely the
                      * fault this app has shipped before. So it says so.
                      */}
                    {horizon === 'season' && remaining <= 0 && (
                        <p className="text-[11px] text-muted-foreground/45 pt-3
                                      border-t border-white/[0.06] max-w-[660px]">
                            The regular season is over, so there is no run home left
                            to rank and no week left to weigh — those panels are gone
                            because their question has been answered, not because
                            anything failed. The ranking above is still a ranking:
                            it is what these rosters are worth from here, which is
                            the question a playoff matchup asks.
                        </p>
                    )}
                    {(earned || runHome || (odds && horizon === 'season')) && (
                        <div className="space-y-6 pt-2 border-t border-white/[0.06]">
                            {/* The week first, because it is the only one of
                                the three a reader can still do something
                                about before Sunday. */}
                            {odds && horizon === 'season' && (
                                <AtStake rows={result.rows} odds={odds}
                                    myKey={league.connection.teamKey ?? null}
                                    opponentOf={thisWeekOpponents} week={week}
                                    realSchedule={season.value?.realSchedule ?? false} />
                            )}
                            {/* Straight after your own game, because it is the
                                same Sunday and the same question — what is
                                still in play — asked about the games you do
                                not control. */}
                            {odds && horizon === 'season' && league.connection.teamKey
                                && odds.get(league.connection.teamKey) && (
                                <Rooting
                                    mine={odds.get(league.connection.teamKey)!}
                                    myKey={league.connection.teamKey}
                                    nameOf={k => result.rows.find(r => r.key === k)?.name ?? k}
                                    week={week} />
                            )}
                            {earned && (
                                <Earned rows={earned}
                                    myKey={league.connection.teamKey ?? null} />
                            )}
                            {runHome && (
                                <RunHome rows={runHome} weeks={weeksAhead}
                                    myKey={league.connection.teamKey ?? null} />
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
