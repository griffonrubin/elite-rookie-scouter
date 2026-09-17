'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { TradeEffect } from '@/lib/trade';
import type { Horizon } from '@/lib/simInput';
import { headline, pp, replyCallFor } from '@/lib/tradeCall';

/**
 * An offer held still, so the next one has something to beat.
 *
 * The analyser's own note says the question is never whether a trade is good
 * in the abstract, it is "what else could I have offered instead" — and then
 * answered it one offer at a time, so finding out cost you the answer you
 * already had. You would price Jefferson for Robinson, remember four numbers,
 * price Hall and Collins for Robinson, and compare against your memory.
 *
 * The verdict is frozen at the moment it is held rather than recomputed, and
 * that is the honest thing as well as the cheap one: twenty thousand seasons
 * per offer is not something to re-run on every click, and a held offer is
 * meant to be the thing that does not move while you change the other one.
 *
 * It is dropped rather than kept when the horizon or the week changes,
 * because a verdict priced over thirteen weeks and one priced over this
 * Sunday are not two answers to one question.
 */
export interface HeldOffer {
    partnerKey: string;
    partnerName: string;
    give: number[];
    get: number[];
    mine: TradeEffect | null;
    theirs: TradeEffect | null;
    /** What it was priced over, so a stale hold can be spotted and dropped. */
    horizon: Horizon;
    week: number | null;
}

function names(ids: number[], nameOf: (id: number) => string): string {
    if (!ids.length) return 'nobody';
    return ids.map(id => {
        const parts = nameOf(id).split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    }).join(' + ');
}

/** One column: an offer and what it does. */
function Column({ title, offer, mine, theirs, nameOf, better, children }: {
    title: string;
    offer: { give: number[]; get: number[]; partnerName: string };
    mine: TradeEffect | null;
    theirs: TradeEffect | null;
    nameOf: (id: number) => string;
    /** True where this column is the better of the two for you. */
    better: boolean;
    children?: React.ReactNode;
}) {
    const h = mine ? headline(mine) : null;
    const reply = replyCallFor(theirs);
    return (
        <div className={cn('rounded-lg p-2.5 min-w-0 border',
            better ? 'border-white/20 bg-white/[0.04]' : 'border-white/[0.06]')}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-widest font-bold
                                 text-muted-foreground/45">
                    {title}
                </span>
                {better && (
                    <span className="text-[9px] font-bold" style={{ color: '#93C5FD' }}>
                        better for you
                    </span>
                )}
            </div>
            <p className="text-[11px] mb-1.5 leading-snug">
                <span className="font-semibold text-foreground/80">
                    {names(offer.give, nameOf)}
                </span>
                <span className="text-muted-foreground/35"> &rarr; </span>
                <span className="font-semibold text-foreground/80">
                    {names(offer.get, nameOf)}
                </span>
                <span className="block text-[9px] text-muted-foreground/40">
                    with {offer.partnerName}
                </span>
            </p>
            {h && (
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[15px] font-bold tabular-nums"
                        style={{ color: h.call.colour }}>
                        {pp(h.delta)}
                    </span>
                    <span className="text-[9px] text-muted-foreground/45">
                        {h.odds ? 'pts of playoff odds' : 'pts of win rate'}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground/50">
                        {Math.round(h.before * 100)}&rarr;{Math.round(h.after * 100)}%
                    </span>
                </div>
            )}
            {reply && (
                <p className="text-[10px] mt-0.5" style={{ color: reply.colour }}>
                    {reply.text}
                </p>
            )}
            {children}
        </div>
    );
}

export function TradeCompare({
    held, current, nameOf, onRestore, onDrop,
}: {
    held: HeldOffer;
    current: {
        give: number[]; get: number[]; partnerName: string;
        mine: TradeEffect | null; theirs: TradeEffect | null;
    } | null;
    nameOf: (id: number) => string;
    onRestore: () => void;
    onDrop: () => void;
}) {
    const heldDelta = held.mine ? headline(held.mine).delta : null;
    const nowDelta = current?.mine ? headline(current.mine).delta : null;
    // Only call one better when there are two to compare and they differ.
    const heldBetter = heldDelta != null && nowDelta != null && heldDelta > nowDelta;
    const nowBetter = heldDelta != null && nowDelta != null && nowDelta > heldDelta;

    return (
        <section className="rounded-xl border border-white/[0.07] p-3"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Held against current
                </h2>
                <span className="text-[9px] text-muted-foreground/35">
                    the held offer keeps the verdict it had when you held it
                </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <Column title="Held" offer={held} mine={held.mine} theirs={held.theirs}
                    nameOf={nameOf} better={heldBetter}>
                    <div className="flex gap-1 mt-2">
                        <button type="button" onClick={onRestore}
                            className="text-[10px] px-2 py-0.5 rounded-lg border
                                       border-white/10 text-muted-foreground/70
                                       hover:text-foreground hover:bg-white/[0.06]">
                            Put it back on the table
                        </button>
                        <button type="button" onClick={onDrop}
                            className="text-[10px] px-2 py-0.5 rounded-lg border
                                       border-white/10 text-muted-foreground/50
                                       hover:text-foreground hover:bg-white/[0.06]">
                            Drop
                        </button>
                    </div>
                </Column>
                {current ? (
                    <Column title="Current" offer={current} mine={current.mine}
                        theirs={current.theirs} nameOf={nameOf} better={nowBetter} />
                ) : (
                    <div className="rounded-lg p-2.5 border border-dashed
                                    border-white/[0.08] flex items-center">
                        <p className="text-[11px] text-muted-foreground/45">
                            Build another offer and it lands here, beside the one you
                            are holding.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
