'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { POSITION_RAW } from '@/lib/constants';
import { DIVERGING } from '@/lib/vizTokens';
import {
    findTrades, offerReason,
    type FinderTeam, type MarketInput, type Offer, type Stance, type WireInput,
} from '@/lib/tradeFinder';
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

function Side({ ids, picks, nameOf, positionOf, teamOf, playoffs, tone }: {
    ids: number[];
    /** Pick labels, already shortened to "2027 1st". */
    picks?: string[];
    nameOf: (id: number) => string;
    positionOf: (id: number) => string;
    teamOf: (id: number) => string | null;
    playoffs: SosRow[];
    tone: 'out' | 'in';
}) {
    return (
        <span className="flex flex-col gap-0.5 min-w-0">
            {/* Picks first: in a buying offer they are the whole of this
                side, and a side that renders nothing reads as an offer of
                nothing — which is what the summary bar used to do. */}
            {(picks ?? []).map(label => (
                <span key={label} className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: 'rgba(255,255,255,0.35)' }} />
                    <span className={cn('text-[12px] truncate tabular-nums',
                        tone === 'in' ? 'font-semibold' : 'text-muted-foreground/70')}>
                        {label}
                    </span>
                </span>
            ))}
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
    profiles, myKey, rosterSize, onPick, partnerKey, worth, onOffers, wire,
    market, pickLabel,
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
    /**
     * Prices and pick holdings, where the league has picks worth trading.
     *
     * Absent in a redraft league, and its absence is what hides the stance
     * control: there is no buying or selling to be done when every roster is
     * torn up in August.
     */
    market?: MarketInput;
    /**
     * What a roster spot is worth, so a full league still gets uneven offers.
     *
     * Without it the sweep scores an unfillable lineup slot at zero and a
     * trade that needs a cut is refused outright — which on a full roster
     * is every uneven offer there is.
     */
    wire?: WireInput;
    /** A pick id, as it should read on the page. */
    pickLabel?: (id: string) => string;
}) {
    const [only, setOnly] = useState(false);
    /**
     * What the reader is trying to do.
     *
     * Opens on the mutual sweep, which is the only honest default: it is the
     * one shape that needs no assumption about whether this reader is
     * chasing this season or next, and the only one a redraft league has.
     */
    const [stance, setStance] = useState<Stance>('mutual');
    const others = useMemo(
        () => teams.filter(t => t.key !== myKey
            && (!only || !partnerKey || t.key === partnerKey)),
        [teams, myKey, only, partnerKey]);

    // A stance the league cannot support falls back rather than showing an
    // empty list that looks like "no offers exist".
    const active: Stance = market ? stance : 'mutual';
    const offers = useMemo(
        () => (myRoster.length && others.length
            ? findTrades({ roster: myRoster, slots, meanOf }, others, rosterSize, 12,
                active, market, wire)
            : []),
        [myRoster, others, slots, meanOf, rosterSize, active, market, wire]);

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
                    {active === 'buy' ? 'Picks for a player'
                        : active === 'sell' ? 'A player for picks'
                            : 'Offers both sides gain from'}
                </h2>
                {/* Only where picks exist to trade. In a redraft league
                    there is no buying or selling — every roster is torn up
                    in August — and a control offering it would be offering
                    nothing. */}
                {market && (
                    <div className="inline-flex rounded-lg border border-white/10
                                    overflow-hidden" data-stance="">
                        {([
                            ['mutual', 'Both gain'],
                            ['buy', 'Buy now'],
                            ['sell', 'Build later'],
                        ] as const).map(([k, label]) => (
                            <button key={k} type="button" onClick={() => setStance(k)}
                                aria-pressed={stance === k}
                                data-stance-option={k}
                                title={k === 'mutual'
                                    ? 'Offers where both starting lineups improve'
                                    : k === 'buy'
                                        ? 'Send picks for a player who improves your '
                                          + 'lineup — they get paid on the market'
                                        : 'Send a player for picks — they improve their '
                                          + 'lineup, you gain on the market'}
                                className={cn('text-[10px] font-semibold px-2 py-1',
                                    stance === k
                                        ? 'bg-white/[0.10] text-foreground'
                                        : 'text-muted-foreground/55 hover:text-foreground')}>
                                {label}
                            </button>
                        ))}
                    </div>
                )}
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
                    <span data-finder-empty="">
                        {active === 'mutual'
                            ? 'Nothing improves both lineups right now.'
                            : active === 'buy'
                                ? 'Nothing your picks can buy improves your lineup '
                                  + 'at a price the other manager would take.'
                                : 'Nothing you could sell improves a rival\u2019s lineup '
                                  + 'enough for them to pay over the odds for it.'}
                    </span>
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
                    <p className="text-[11px] text-muted-foreground/55 max-w-[820px] mb-2"
                        data-finder-blurb="">
                {active === 'mutual' ? (<>
                Every one-for-one and two-for-one against {others.length}{' '}
                {others.length === 1 ? 'roster' : 'rosters'}, keeping the ones where
                both starting lineups improve. Ranked on the <em>smaller</em> of the two
                gains: an offer worth eight points to you and a tenth of one to them is
                not a deal, it is a message that goes unanswered.{market && (<>{' '}
                The market number beside each one is what it does to the players you
                own afterwards — both lineups improve either way, and that is the
                part the lineups cannot see. It does not change the order.
                </>)}
                </>) : active === 'buy' ? (<>
                Your picks against every player on {others.length}{' '}
                {others.length === 1 ? 'roster' : 'rosters'}, keeping the ones that
                improve your starting lineup and pay the other manager more than the
                player is worth. Their lineup gets <em>worse</em> in every one of these
                — that is what they are selling — and the mutual search above can
                therefore never find them. Ranked on points a week bought per thousand
                spent, because the question is not which upgrade is biggest but what
                each one costs.
                </>) : (<>
                Each of your players against the picks held on {others.length}{' '}
                {others.length === 1 ? 'roster' : 'rosters'}, keeping the ones that
                improve <em>their</em> lineup and leave you better off on the market.
                You are the seller here: this season gets worse and what you own
                afterwards gets better, which is the trade a rebuild is made of.
                </>)}
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
                                    /* The offer's own identity, so a check can
                                       assert what a click was supposed to load
                                       rather than reading it back out of the
                                       prose in the row. */
                                    data-offer={offerKey(o)}
                                    className="w-full grid items-center gap-x-3 gap-y-1
                                               px-1 py-1.5 rounded-lg text-left
                                               transition-colors hover:bg-white/[0.05]
                                               grid-cols-[minmax(0,1fr)_auto]
                                               sm:grid-cols-[128px_minmax(0,1fr)_18px_minmax(0,1fr)_112px]">
                                    <span className="text-[10px] text-muted-foreground/50
                                                     truncate">
                                        {o.teamName}
                                        {/**
                                          * What the trade costs beyond the
                                          * names in it.
                                          *
                                          * A full roster settles an uneven
                                          * trade by cutting, and the lineup
                                          * arithmetic already charges what
                                          * that costs — usually nothing,
                                          * because the man cut is the last
                                          * one on the bench. But nothing in
                                          * points is not nothing to read: a
                                          * reader is entitled to know a name
                                          * leaves their roster that is not in
                                          * the trade, before they send it.
                                          */}
                                        {o.drops.length > 0 ? (
                                            <span className="block text-[9px]
                                                             text-muted-foreground/35"
                                                title={'Your roster is full, so '
                                                    + 'sending this means cutting '
                                                    + o.drops.map(nameOf).join(' and ')
                                                    + ' — already counted in the '
                                                    + 'points, since the lineup does '
                                                    + 'not miss him'}>
                                                drop {o.drops.map(nameOf).join(' + ')}
                                            </span>
                                        ) : o.unevenCount && (
                                            <span className="block text-[9px]
                                                             text-muted-foreground/35">
                                                {o.give.length} for {o.get.length}
                                            </span>
                                        )}
                                    </span>
                                    <Side ids={o.give}
                                        picks={o.givePicks.map(
                                            id => pickLabel?.(id) ?? id)}
                                        nameOf={nameOf}
                                        positionOf={positionOf} teamOf={teamOf}
                                        playoffs={playoffs} tone="out" />
                                    <ArrowRight className="hidden sm:block w-3 h-3
                                                           text-muted-foreground/30"
                                        aria-hidden="true" />
                                    <Side ids={o.get}
                                        picks={o.getPicks.map(
                                            id => pickLabel?.(id) ?? id)}
                                        nameOf={nameOf}
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
                                        {/* Their lineup, on a mutual offer
                                            only. On a bought or sold one the
                                            other side's lineup is meant to
                                            get worse, so printing it beside a
                                            positive number of yours would
                                            read as a warning about a deal
                                            that is working as intended —
                                            there, what they gain is the
                                            price, which the market line
                                            below says. */}
                                        {active === 'mutual' && (
                                            <span className="block text-[10px] tabular-nums
                                                             text-muted-foreground/50">
                                                +{o.theirGain.toFixed(1)} them
                                            </span>
                                        )}
                                        {/**
                                          * The market, wherever it is known.
                                          *
                                          * On a bought or sold offer this is
                                          * the price, and the reason the
                                          * other manager would say yes.
                                          *
                                          * On a mutual one it is the half of
                                          * the trade the lineups cannot see.
                                          * "Both lineups improve" is equally
                                          * true of giving up a 23-year-old
                                          * for a 28-year-old and of the
                                          * reverse; in a dynasty league those
                                          * are not the same offer, and the
                                          * reader was being shown only the
                                          * part that expires in January. It
                                          * does not reorder the list — this
                                          * is information, not a verdict.
                                          */}
                                        {o.myMarketGain != null && (
                                            <span className="block text-[10px] tabular-nums
                                                             text-muted-foreground/50"
                                                title={active === 'buy'
                                                    ? 'What this costs you on the dynasty '
                                                      + 'market — the picks are worth this '
                                                      + 'much more than the player'
                                                    : active === 'sell'
                                                        ? 'What this gains you on the '
                                                          + 'dynasty market'
                                                        : 'What this does to your holdings '
                                                          + 'on the dynasty market. Both '
                                                          + 'lineups improve either way; '
                                                          + 'this is the part that outlives '
                                                          + 'the season, and the list is '
                                                          + 'not ordered on it'}>
                                                {o.myMarketGain > 0 ? '+' : '−'}
                                                {Math.abs(o.myMarketGain).toLocaleString()}
                                                {' market'}
                                            </span>
                                        )}
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
