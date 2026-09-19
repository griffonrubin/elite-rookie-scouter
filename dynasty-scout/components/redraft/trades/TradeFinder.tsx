'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { POSITION_RAW } from '@/lib/constants';
import { DIVERGING } from '@/lib/vizTokens';
import { findTrades, offerReason, type FinderTeam, type Offer } from '@/lib/tradeFinder';
import { CLAIM_NOISE, type ClaimWorth } from '@/lib/seasonOdds';
import { offerKey } from '@/lib/tradeFinder';
import type { TradeRosterPlayer } from '@/lib/trade';
import type { TeamProfile } from '@/lib/teamProfile';
import type { SosRow } from '@/lib/schedule';
import { SchedChip, schedFor } from '@/components/redraft/SchedChip';

/**
 * Trades worth proposing, found rather than waited for.
 *
 * The analyser below prices a trade you have already thought of, which is
 * the second half of the job. The hard part is noticing that the manager in
 * eighth is two deep at tight end and starting a nine-point receiver while
 * you are the other way round — nobody reads eleven rosters looking for
 * that, so the trades that get made are the ones somebody happened to think
 * of.
 *
 * Every one-for-one and two-for-one against every roster is tried, and only
 * the ones that improve *both* starting lineups are kept. Both, because an
 * offer the other manager should refuse is not a trade, it is a message that
 * goes unanswered — and a finder ranked on your own gain produces a list of
 * those. Clicking one loads it into the analyser, where the same deal gets
 * the full simulation and the whole league's reaction.
 */

function Side({ ids, nameOf, positionOf, teamOf, playoffs, tone }: {
    ids: number[];
    nameOf: (id: number) => string;
    positionOf: (id: number) => string;
    teamOf: (id: number) => string | null;
    playoffs: SosRow[];
    tone: 'out' | 'in';
}) {
    return (
        <span className="flex flex-col gap-0.5 min-w-0">
            {ids.map(id => (
                <span key={id} className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: POSITION_RAW[positionOf(id).toUpperCase()]
                                ?? '#64748b' }} />
                        <span className={cn('text-[12px] truncate',
                            tone === 'in' ? 'font-semibold' : 'text-muted-foreground/70')}>
                            {nameOf(id)}
                        </span>
                    </span>
                    {/* The weeks that decide a season, on both sides of the
                        offer. A deal that is even on points and moves you
                        from the hardest playoff schedule at the position to
                        the easiest is not an even deal. */}
                    <SchedChip className="block pl-3"
                        sos={schedFor(playoffs, teamOf(id), positionOf(id))}
                        label="playoffs" />
                </span>
            ))}
        </span>
    );
}

export function TradeFinder({
    myRoster, teams, slots, meanOf, nameOf, positionOf, teamOf, playoffs,
    profiles, myKey, rosterSize, onPick, partnerKey, worth, onOffers,
}: {
    myRoster: TradeRosterPlayer[];
    teams: FinderTeam[];
    slots: string[];
    meanOf: (id: number) => number;
    nameOf: (id: number) => string;
    positionOf: (id: number) => string;
    /** The NFL team a player plays for, for the schedule behind him. */
    teamOf: (id: number) => string | null;
    /** Fantasy playoff-week schedule strength, by team and position. */
    playoffs: SosRow[];
    /** Positional ranks, for saying why an offer exists. */
    profiles: TeamProfile[];
    myKey: string | null;
    rosterSize?: number;
    /** Load an offer into the analyser below. */
    onPick: (offer: Offer) => void;
    /** Narrow to one partner, following the analyser's own selector. */
    partnerKey: string | null;
    /**
     * What each of the best few offers does to your season, where the page
     * has priced them. Keyed by the offer's own identity.
     */
    worth?: Map<string | number, ClaimWorth>;
    /** Report the offers, so the page above can price the best few. */
    onOffers?: (offers: Offer[]) => void;
}) {
    const [only, setOnly] = useState(false);
    const others = useMemo(
        () => teams.filter(t => t.key !== myKey
            && (!only || !partnerKey || t.key === partnerKey)),
        [teams, myKey, only, partnerKey]);

    const offers = useMemo(
        () => (myRoster.length && others.length
            ? findTrades({ roster: myRoster, slots, meanOf }, others, rosterSize, 12)
            : []),
        [myRoster, others, slots, meanOf, rosterSize]);

    /**
     * Handed up rather than priced here, because pricing one needs the
     * whole league's season and this component is given a roster and a
     * list of opponents. The page above has the run; it prices the best
     * few and hands the answers back.
     */
    useEffect(() => { onOffers?.(offers); }, [offers, onOffers]);

    const me = profiles.find(p => p.key === myKey);
    const of = profiles.length;

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Offers both sides gain from
                </h2>
                {partnerKey && (
                    <label className="flex items-center gap-1.5 text-[10px]
                                      text-muted-foreground/45 cursor-pointer">
                        <input type="checkbox" checked={only}
                            onChange={e => setOnly(e.target.checked)}
                            className="accent-sky-600" />
                        only the manager selected below
                    </label>
                )}
            </div>
            {offers.length === 0 ? (
                /* Nothing found is the usual answer, and it used to cost the
                   top of the page three paragraphs to say so — about three
                   hundred pixels on a laptop and nearer five hundred on a
                   phone, all of it above the rosters and the verdict. The
                   reasoning is good and worth keeping; it is just not worth
                   the best space on the screen when the finding is that
                   there is no finding. So it says the one sentence and holds
                   the rest behind a disclosure, where a reader who wants to
                   know why can have all of it. */
                <div className="text-[11px] text-muted-foreground/55">
                    <span>Nothing improves both lineups right now.</span>
                    <details className="inline-block align-baseline ml-1.5 group">
                        <summary className="inline-flex items-center gap-0.5 cursor-pointer
                                            list-none text-[10px] text-muted-foreground/45
                                            hover:text-foreground/70">
                            why not
                            <ChevronDown className="w-3 h-3 transition-transform
                                                    group-open:rotate-180"
                                aria-hidden="true" />
                        </summary>
                        <div className="mt-2 space-y-2 max-w-[820px]">
                            <p>
                Nothing here improves both lineups. That is the usual answer in a
                league where everybody starts what they hold — a one-for-one moves
                exactly as much onto one side as it takes off the other, so a trade
                that helps both needs somebody to be holding a player they cannot
                start. Come back when an injury or a bye has made one.
                            </p>
                            <p>
                Every one-for-one and two-for-one against {others.length}{' '}
                {others.length === 1 ? 'roster' : 'rosters'}, keeping the ones where
                both starting lineups improve. Ranked on the <em>smaller</em> of the two
                gains: an offer worth eight points to you and a tenth of one to them is
                not a deal, it is a message that goes unanswered.
                            </p>
                            <p className="text-[10px] text-muted-foreground/40 leading-snug">
                Priced on the best lineup each side could field, a week at a time, with
                no simulation — the lineup is a function of the projections and thirty
                thousand Monte Carlo runs per offer would take a minute to say the same
                thing. Click one to load it into the analyser below, where it gets the
                full round robin and the rest of the league&rsquo;s reaction to it. Two
                names for one shrinks your roster and grows theirs, so those are only
                offered where the league has room. The playoff rank under each name is
                that player&rsquo;s own position against his own remaining opponents
                across the weeks that decide a season — a deal even on points that
                moves you from the hardest of those schedules to the easiest is not an
                even deal.
                            </p>
                        </div>
                    </details>
                </div>
            ) : (
                <>
                    <p className="text-[11px] text-muted-foreground/55 max-w-[820px] mb-2">
                Every one-for-one and two-for-one against {others.length}{' '}
                {others.length === 1 ? 'roster' : 'rosters'}, keeping the ones where
                both starting lineups improve. Ranked on the <em>smaller</em> of the two
                gains: an offer worth eight points to you and a tenth of one to them is
                not a deal, it is a message that goes unanswered.
                    </p>
                <ul className="space-y-0.5">
                    {offers.map((o) => {
                        const them = profiles.find(p => p.key === o.teamKey);
                        const why = me && them
                            ? offerReason(o, me.positionRank, them.positionRank,
                                positionOf, of)
                            : null;
                        return (
                            <li key={`${o.teamKey}-${o.give.join()}-${o.get.join()}`}>
                                <button type="button" onClick={() => onPick(o)}
                                    className="w-full grid items-center gap-x-3 gap-y-1
                                               px-1 py-1.5 rounded-lg text-left
                                               transition-colors hover:bg-white/[0.05]
                                               grid-cols-[minmax(0,1fr)_auto]
                                               sm:grid-cols-[128px_minmax(0,1fr)_18px_minmax(0,1fr)_112px]">
                                    <span className="text-[10px] text-muted-foreground/50
                                                     truncate">
                                        {o.teamName}
                                        {o.unevenCount && (
                                            <span className="block text-[9px]
                                                             text-muted-foreground/35">
                                                {o.give.length} for {o.get.length}
                                            </span>
                                        )}
                                    </span>
                                    <Side ids={o.give} nameOf={nameOf}
                                        positionOf={positionOf} teamOf={teamOf}
                                        playoffs={playoffs} tone="out" />
                                    <ArrowRight className="hidden sm:block w-3 h-3
                                                           text-muted-foreground/30"
                                        aria-hidden="true" />
                                    <Side ids={o.get} nameOf={nameOf}
                                        positionOf={positionOf} teamOf={teamOf}
                                        playoffs={playoffs} tone="in" />
                                    <span className="text-right">
                                        {/* Both numbers, always. The one that
                                            decides whether to send it is
                                            theirs, and a finder that shows
                                            only yours is selling you a
                                            message nobody answers. */}
                                        <span className="block text-[11px] font-bold
                                                         tabular-nums"
                                            style={{ color: DIVERGING.positive }}>
                                            +{o.myGain.toFixed(1)} you
                                        </span>
                                        <span className="block text-[10px] tabular-nums
                                                         text-muted-foreground/50">
                                            +{o.theirGain.toFixed(1)} them
                                        </span>
                                        {/**
                                          * What it does to your season, for
                                          * the few offers that were priced,
                                          * and only when it clears the floor.
                                          *
                                          * Points a week is what both sides
                                          * are bargaining over; this is what
                                          * it is worth to you, which is a
                                          * different question and the one
                                          * that decides which of six
                                          * suggestions to actually send.
                                          */}
                                        {(() => {
                                            const w = worth?.get(offerKey(o));
                                            if (!w) return null;
                                            const pts = w.delta * 100;
                                            if (Math.abs(pts) < CLAIM_NOISE * 100) {
                                                return null;
                                            }
                                            return (
                                                <span className="block text-[9px]
                                                                 font-semibold tabular-nums"
                                                    style={{ color: '#93C5FD' }}
                                                    title={`Sending this takes your season `
                                                        + `from ${Math.round(w.before * 100)}% `
                                                        + `to make the playoffs to `
                                                        + `${Math.round(w.after * 100)}%.`}>
                                                    {pts > 0 ? '+' : '−'}
                                                    {Math.abs(Math.round(pts))} pts of season
                                                </span>
                                            );
                                        })()}
                                    </span>
                                    {why && (
                                        <span className="col-span-2 sm:col-start-2
                                                         sm:col-span-4 text-[9px]
                                                         text-muted-foreground/40
                                                         leading-snug">
                                            {why}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
                    <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug
                                  max-w-[860px]">
                Priced on the best lineup each side could field, a week at a time, with
                no simulation — the lineup is a function of the projections and thirty
                thousand Monte Carlo runs per offer would take a minute to say the same
                thing. Click one to load it into the analyser below, where it gets the
                full round robin and the rest of the league&rsquo;s reaction to it. Two
                names for one shrinks your roster and grows theirs, so those are only
                offered where the league has room. The playoff rank under each name is
                that player&rsquo;s own position against his own remaining opponents
                across the weeks that decide a season — a deal even on points that
                moves you from the hardest of those schedules to the easiest is not an
                even deal.
                    </p>
                </>
            )}
        </section>
    );
}
