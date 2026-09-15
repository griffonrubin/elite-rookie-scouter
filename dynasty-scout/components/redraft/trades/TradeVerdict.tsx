'use client';

import React from 'react';
import { cn, ordinal } from '@/lib/utils';
import type { Horizon } from '@/lib/simInput';
import { DIVERGING, MARK } from '@/lib/vizTokens';
import { ODDS_NOISE, TRADE_NOISE, type LineupChange, type TradeEffect } from '@/lib/trade';

/**
 * What the trade does, for both sides and then for everybody else.
 *
 * The headline is a change in win rate, which is the only number a reader
 * actually cares about — but a change is a two-ended thing, so the bar runs
 * from where the team was to where it lands rather than showing the
 * difference alone. "+4 points" says nothing about whether that is 48 to 52
 * or 71 to 75, and those are different trades.
 *
 * Below it, the lineup. A value ranking stops at "you won", which leaves the
 * reader to guess whether the player arriving can even get on the field. The
 * slot board says who starts now, who lost a place to him, and whether the
 * player leaving was ever in the lineup at all — the three facts that decide
 * whether a trade is worth making and that no value number contains.
 */

/** A rate change, drawn from where it was to where it lands. */
function DeltaBar({ before, after, span = 0.25 }: {
    before: number; after: number; span?: number;
}) {
    // Same even-odds frame as the power table, so a reader moving between
    // the two pages is reading one scale and not two.
    const at = (p: number) => Math.max(0, Math.min(100,
        50 + (Math.max(-1, Math.min(1, (p - 0.5) / span)) * 50)));
    const x0 = at(before), x1 = at(after);
    const up = after >= before;
    return (
        <span className="relative block w-full h-[9px]">
            <span className="absolute" style={{
                left: '50%', top: -2, bottom: -2, width: 1,
                background: 'rgba(255,255,255,0.14)',
            }} />
            {/* The journey, in the colour of its direction. */}
            <span className="absolute top-[2px] h-[5px]" style={{
                left: `${Math.min(x0, x1)}%`,
                width: `${Math.max(Math.abs(x1 - x0), 0.6)}%`,
                background: up ? DIVERGING.positive : DIVERGING.negative,
                borderRadius: MARK.barRadius,
            }} />
            {/* Where it started: a tick, so the reader can see the distance
                travelled rather than infer it from a number. */}
            <span className="absolute top-0 bottom-0" style={{
                left: `${x0}%`, width: 2, marginLeft: -1,
                background: 'rgba(255,255,255,0.55)',
            }} />
            {/* And where it lands, filled. */}
            <span className="absolute top-[-1px] h-[11px]" style={{
                left: `${x1}%`, width: 3, marginLeft: -1.5,
                background: up ? DIVERGING.positive : DIVERGING.negative,
                borderRadius: 1.5,
            }} />
        </span>
    );
}

const pp = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d * 100).toFixed(1)}`;

/**
 * The odds journey, on the whole scale rather than around even.
 *
 * A win rate belongs on an even-odds frame because fifty per cent is the
 * rate of a team exactly as good as its league. Playoff odds have no such
 * middle — nought and one hundred are both ordinary places for a team to
 * be in November — so this runs the full track, and the distance travelled
 * is the distance drawn.
 */
function OddsBar({ before, after }: { before: number; after: number }) {
    const at = (p: number) => Math.max(0, Math.min(100, p * 100));
    const x0 = at(before), x1 = at(after);
    const up = after >= before;
    return (
        <span className="relative block w-full h-[9px] rounded-[3px]"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            role="img"
            aria-label={`${Math.round(before * 100)} to ${Math.round(after * 100)} `
                + 'per cent to make the playoffs'}>
            <span className="absolute top-[2px] h-[5px]" style={{
                left: `${Math.min(x0, x1)}%`,
                width: `${Math.max(Math.abs(x1 - x0), 0.6)}%`,
                background: up ? DIVERGING.positive : DIVERGING.negative,
                borderRadius: MARK.barRadius,
            }} />
            <span className="absolute top-0 bottom-0" style={{
                left: `${x0}%`, width: 2, marginLeft: -1,
                background: 'rgba(255,255,255,0.55)',
            }} />
            <span className="absolute top-[-1px] h-[11px]" style={{
                left: `${x1}%`, width: 3, marginLeft: -1.5,
                background: up ? DIVERGING.positive : DIVERGING.negative,
                borderRadius: 1.5,
            }} />
        </span>
    );
}

/**
 * The verdict, in playoff odds where the season is being played out.
 *
 * Deliberately different wording from the win-rate call, because it is a
 * different claim: a roster getting better and an owner getting closer to
 * January are not the same thing, and the gap between them is the most
 * useful thing this page knows. A team already in or already out converts
 * a real improvement into nothing at all, and saying so is worth more than
 * a compliment about the roster.
 */
function oddsCallFor(delta: number, after: number): { text: string; colour: string } {
    if (Math.abs(delta) < ODDS_NOISE) {
        return {
            text: after >= 0.9 ? 'already in either way'
                : after <= 0.1 ? 'not enough to matter from here'
                : 'no real change to your season',
            colour: 'rgba(255,255,255,0.45)',
        };
    }
    const big = Math.abs(delta) >= 0.05;
    return delta > 0
        ? { text: big ? 'a materially better season' : 'a slightly better season',
            colour: '#93C5FD' }
        : { text: big ? 'a materially worse season' : 'a slightly worse season',
            colour: '#FCA5A5' };
}

/** The verdict in words, because a signed number needs a direction named. */
function callFor(delta: number): { text: string; colour: string } {
    if (Math.abs(delta) < TRADE_NOISE) {
        return { text: 'no real change', colour: 'rgba(255,255,255,0.45)' };
    }
    const big = Math.abs(delta) >= 0.03;
    if (delta > 0) {
        return {
            text: big ? 'clearly better off' : 'a little better off',
            colour: '#93C5FD',
        };
    }
    return {
        text: big ? 'clearly worse off' : 'a little worse off',
        colour: '#FCA5A5',
    };
}

function TraderRow({ e, mine, span }: {
    e: TradeEffect; mine: boolean; span: number;
}) {
    const call = callFor(e.delta);
    const rankMoved = e.rankAfter !== e.rankBefore;
    /**
     * The headline is the season where there is a season left to play.
     *
     * A win rate is the honest measure of a roster and it is not what an
     * owner is playing for. Given the choice, lead with the number they
     * are actually holding: the share of seasons that end with them still
     * playing. The rate stays a line below, because it is what the odds
     * are computed from and a reader checking the working deserves it.
     */
    const odds = e.oddsDelta != null && e.oddsBefore != null && e.oddsAfter != null
        ? { delta: e.oddsDelta, before: e.oddsBefore, after: e.oddsAfter }
        : null;
    const oddsCall = odds ? oddsCallFor(odds.delta, odds.after) : null;
    return (
        <div className="py-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                <span className={cn('text-[13px]', mine ? 'font-bold' : 'font-semibold')}>
                    {e.name}{mine && ' — you'}
                </span>
                {odds && oddsCall ? (
                    <>
                        <span className="text-[12px] font-bold tabular-nums"
                            style={{ color: oddsCall.colour }}
                            title="Share of simulated seasons finishing inside the
                                   playoff cut, before and after this trade">
                            {pp(odds.delta)} pts of playoff odds
                        </span>
                        <span className="text-[11px]" style={{ color: oddsCall.colour }}>
                            {oddsCall.text}
                        </span>
                    </>
                ) : (
                    <>
                        <span className="text-[12px] font-bold tabular-nums"
                            style={{ color: call.colour }}>
                            {pp(e.delta)} pts of win rate
                        </span>
                        <span className="text-[11px]" style={{ color: call.colour }}>
                            {call.text}
                        </span>
                    </>
                )}
            </div>
            {odds ? (
                <OddsBar before={odds.before} after={odds.after} />
            ) : (
                <DeltaBar before={e.before} after={e.after} span={span} />
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px]
                            text-muted-foreground/55 tabular-nums">
                {odds && (
                    <span className="font-semibold text-foreground/70"
                        title="Share of simulated seasons finishing inside the cut">
                        {Math.round(odds.before * 100)}% → {Math.round(odds.after * 100)}%
                        {' '}to make the playoffs
                    </span>
                )}
                <span title="Share of simulated games won against the rest of the league">
                    {(e.before * 100).toFixed(1)}% → {(e.after * 100).toFixed(1)}%
                    {' '}win rate {pp(e.delta)}
                </span>
                <span title="Mean simulated score for the best lineup this roster can field">
                    lineup {e.pointsBefore} → {e.pointsAfter}
                </span>
                <span className={rankMoved ? 'font-semibold text-foreground/70' : undefined}
                    title="Place in the league by roster strength">
                    {rankMoved
                        ? `${ordinal(e.rankBefore)} → ${ordinal(e.rankAfter)} in the league`
                        : `still ${ordinal(e.rankBefore)} in the league`}
                </span>
            </div>
        </div>
    );
}

/** The slot board, before against after, for one side of the trade. */
function LineupPanel({ change, nameOf, positionOf }: {
    change: LineupChange;
    nameOf: (id: number) => string;
    positionOf: (id: number) => string;
}) {
    const moved = change.slots
        .map((slot, i) => ({ slot, before: change.before[i], after: change.after[i] }))
        .filter(r => r.before !== r.after);
    return (
        <div>
            <h4 className="text-[10px] uppercase tracking-widest font-bold
                           text-muted-foreground/45 mb-1">
                {change.name}&rsquo;s lineup
            </h4>
            {moved.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/50">
                    The lineup does not change — nobody arriving can beat a player
                    already in it, and nobody leaving was in it. Whatever this trade
                    is worth, it is not worth anything on the field.
                </p>
            ) : (
                <ul className="space-y-1">
                    {moved.map(({ slot, before, after }) => (
                        <li key={slot + String(before) + String(after)}
                            className="grid items-baseline gap-x-2 text-[11px]
                                       grid-cols-[46px_minmax(0,1fr)]">
                            <span className="text-[9px] uppercase tracking-wider font-bold
                                             text-muted-foreground/40">
                                {slot}
                            </span>
                            <span className="min-w-0">
                                {before != null && (
                                    <span className="text-muted-foreground/50 line-through">
                                        {nameOf(before)}
                                    </span>
                                )}
                                {/* The arrow is drawn whenever somebody left
                                    the slot, including when nobody replaces
                                    him — "Jalen Hurtsnobody left to fill it"
                                    is what omitting it looks like. */}
                                {before != null && (
                                    <span className="text-muted-foreground/35"> → </span>
                                )}
                                {after != null ? (
                                    <span className="font-semibold"
                                        style={{ color: DIVERGING.positive }}>
                                        {nameOf(after)}
                                        <span className="font-normal
                                                         text-muted-foreground/40">
                                            {' '}{positionOf(after)}
                                        </span>
                                    </span>
                                ) : (
                                    <span style={{ color: DIVERGING.negative }}>
                                        nobody left to fill it
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {change.displaced.length > 0 && (
                <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                    Loses a starting place: {change.displaced.map(nameOf).join(', ')}.
                    {' '}Still on the roster, no longer on the field — which is the
                    part of the cost a value number leaves out.
                </p>
            )}
            {change.wasStarting.length > 0 && (
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                    Gives up a starter: {change.wasStarting.map(nameOf).join(', ')}.
                </p>
            )}
        </div>
    );
}

export function TradeVerdict({
    result, myKey, nameOf, positionOf, trials, horizon,
    spots, realSchedule = false, spotsKnown = false,
}: {
    result: { effects: TradeEffect[]; changes: LineupChange[]; unpriced: number[] };
    myKey: string | null;
    nameOf: (id: number) => string;
    positionOf: (id: number) => string;
    trials: number;
    horizon: Horizon;
    /** How many teams make the playoffs, which is where the verdict is set. */
    spots?: number | null;
    /** True when the odds played the league's own fixtures. */
    realSchedule?: boolean;
    /** True when the platform gave the cut, rather than the page assuming. */
    spotsKnown?: boolean;
}) {
    const { effects, changes, unpriced } = result;
    if (effects.length === 0) return null;
    const traders = effects.filter(e => e.trading);
    const others = effects.filter(e => !e.trading);
    // One scale across both sides and the bystanders, fitted to the widest
    // rate on the board — two bars that look alike have to mean alike.
    const span = Math.max(0.05, Math.ceil(Math.max(
        ...effects.flatMap(e => [Math.abs(e.before - 0.5), Math.abs(e.after - 0.5)]),
    ) * 20) / 20);
    const hasOdds = traders.some(e => e.oddsDelta != null);

    return (
        <div className="space-y-3">
            {unpriced.length > 0 && (
                <p className="text-[11px] rounded-lg px-3 py-2"
                    style={{ background: 'rgba(220,38,38,0.10)', color: '#FCA5A5' }}>
                    {unpriced.length} player{unpriced.length === 1 ? '' : 's'} in this trade
                    could not be priced, so the lineups below were built without{' '}
                    {unpriced.length === 1 ? 'him' : 'them'} and the verdict is not
                    trustworthy.
                </p>
            )}

            <section className="rounded-xl border border-white/[0.07] p-4"
                style={{ background: 'var(--bg-card)' }}>
                <div className="flex flex-wrap items-baseline justify-between
                                gap-x-3 gap-y-1 mb-1">
                    <h2 className="text-[10px] uppercase tracking-widest font-bold
                                   text-muted-foreground/45">
                        What it does to each side
                    </h2>
                    <span className="text-[9px] text-muted-foreground/35">
                        {hasOdds
                            ? `tick is where the team was · the track is 0 to 100% · `
                              + `top ${spots} make the playoffs`
                            : `tick is where the team was · line is even odds · `
                              + `±${Math.round(span * 100)} points fills the track`}
                    </span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                    {traders.map(e => (
                        <TraderRow key={e.key} e={e} mine={e.key === myKey} span={span} />
                    ))}
                </div>
            </section>

            <section className="rounded-xl border border-white/[0.07] p-4
                                grid gap-x-6 gap-y-4 sm:grid-cols-2"
                style={{ background: 'var(--bg-card)' }}>
                {changes.map(c => (
                    <LineupPanel key={c.key} change={c}
                        nameOf={nameOf} positionOf={positionOf} />
                ))}
            </section>

            {others.length > 0 && (
                <section className="rounded-xl border border-white/[0.07] p-4"
                    style={{ background: 'var(--bg-card)' }}>
                    <div className="flex flex-wrap items-baseline justify-between
                                    gap-x-3 mb-1">
                        <h2 className="text-[10px] uppercase tracking-widest font-bold
                                       text-muted-foreground/45">
                            And to everybody else
                        </h2>
                        <span className="text-[9px] text-muted-foreground/35">
                            {hasOdds
                                ? 'points of playoff odds, and where they land'
                                : 'points of win rate, and where they land'}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/45 mb-2 max-w-[640px]">
                        A trade you are not in still changes where you stand, because
                        your rate is measured against these rosters{hasOdds
                            ? ' and your season is played against them'
                            : ''}. Anything inside{' '}
                        {hasOdds
                            ? `${(ODDS_NOISE * 100).toFixed(0)} point of odds`
                            : `${(TRADE_NOISE * 100).toFixed(1)} points`}{' '}
                        is the simulation rather than the trade.
                    </p>
                    <ul className="grid gap-x-5 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                        {others.map(e => {
                            const real = Math.abs(e.delta) >= TRADE_NOISE;
                            /**
                             * For a team watching, the odds are the whole
                             * story and the rate is the working. Two rivals
                             * improving each other costs you a place you
                             * were counting on, and a rate change of two
                             * points does not say that; six points of
                             * playoff odds does.
                             */
                            const od = e.oddsDelta;
                            const oddsReal = od != null && Math.abs(od) >= ODDS_NOISE;
                            const lead = od != null ? od : e.delta;
                            const leadReal = od != null ? oddsReal : real;
                            return (
                                <li key={e.key}
                                    className="grid items-center gap-x-2 text-[11px]
                                               grid-cols-[minmax(0,1fr)_46px_auto]"
                                    title={`${e.name}: win rate `
                                        + `${(e.before * 100).toFixed(1)}% → `
                                        + `${(e.after * 100).toFixed(1)}%, `
                                        + `${ordinal(e.rankBefore)} → `
                                        + `${ordinal(e.rankAfter)} in the league`
                                        + (od != null
                                            ? `, playoffs ${Math.round(e.oddsBefore! * 100)}%`
                                              + ` → ${Math.round(e.oddsAfter! * 100)}%`
                                            : '')}>
                                    <span className={cn('truncate',
                                        e.key === myKey
                                            ? 'font-bold' : 'text-muted-foreground/70')}>
                                        {e.name}{e.key === myKey && ' — you'}
                                    </span>
                                    <span className="tabular-nums text-right font-semibold"
                                        style={{
                                            color: !leadReal ? 'rgba(255,255,255,0.3)'
                                                : lead > 0 ? '#93C5FD' : '#FCA5A5',
                                        }}>
                                        {leadReal ? pp(lead) : '—'}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/40
                                                     tabular-nums truncate">
                                        {od != null
                                            ? `${Math.round(e.oddsBefore! * 100)}→`
                                              + `${Math.round(e.oddsAfter! * 100)}%`
                                            : e.rankAfter !== e.rankBefore
                                                ? `${e.rankBefore} → ${e.rankAfter}`
                                                : ''}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <p className="text-[10px] text-muted-foreground/40 leading-snug">
                Both rosters are re-filled from their own best available players, then
                the whole league plays its round robin again — {trials.toLocaleString()}{' '}
                games a pairing, from the same seed either side of the trade, so every
                unchanged roster draws identical weeks and what moves is the trade
                rather than the simulation. That pairing is why a change of{' '}
                {(TRADE_NOISE * 100).toFixed(1)} points can be believed here when a
                place in the power table needs 1.5.
                {hasOdds && (
                    <>
                        {' '}The rest of the season is then played out on both sides,
                        {realSchedule
                            ? ' on your league\u2019s own fixtures read from your '
                              + 'platform — which matters more here than anywhere, '
                              + 'because two points a week is worth a great deal to a '
                              + 'team on the cut line with the best rosters left to '
                              + 'play and almost nothing to the same team with the '
                              + 'worst.'
                            : ' on a schedule drawn at random, because your platform '
                              + 'would not give a complete fixture list — which '
                              + 'averages away exactly the hard and easy runs home '
                              + 'that decide whether a trade was worth making.'}
                        {' '}Playoff odds are a step function of wins, so the same
                        trade honestly reads as enormous for a team on the cut line
                        and as nothing for a team already in or already out: that is
                        the answer rather than a flaw in it. Anything inside{' '}
                        {(ODDS_NOISE * 100).toFixed(0)} point of odds is the
                        simulation.
                        {spots != null && !spotsKnown && (
                            <>
                                {' '}Your platform did not say how many teams make the
                                playoffs, so this assumes {spots}.
                            </>
                        )}
                    </>
                )}
                {horizon === 'season' ? (
                    <>
                        {' '}Priced on a typical week from here rather than on this
                        Sunday, because nobody trades for one Sunday: a man on a bye
                        is worth nothing this week, so acquiring him would read as
                        giving a player away for free, and it inverts on Tuesday.
                    </>
                ) : (
                    <>
                        {' '}Priced on this Sunday alone — byes, lines and the injury
                        report included. Right for a must-win before the playoffs,
                        misleading for everything else a trade is about.
                    </>
                )}
            </p>
        </div>
    );
}
