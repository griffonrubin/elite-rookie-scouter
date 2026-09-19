'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Link2, Pin, PinOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TradeEffect } from '@/lib/trade';
import { headline, pp, replyCallFor } from '@/lib/tradeCall';

/**
 * Whether an element has left the screen.
 *
 * The detail panel is the real answer and this bar is a stand-in for it, so
 * the stand-in should not be on the page at the same time. Two copies of one
 * verdict a hand's width apart is a reader checking whether they disagree.
 */
export function useOutOfView(el: HTMLElement | null): boolean {
    const [out, setOut] = useState(false);
    useEffect(() => {
        // Takes the element rather than a ref on purpose. The verdict only
        // exists once there is a verdict, so a ref passed here is still null
        // on the render that sets up the observer, and nothing is ever
        // observed — the bar stayed hidden at every scroll position and the
        // whole point of it was lost. A callback ref puts the element into
        // state, which re-runs this the moment it appears.
        // Nothing to reset when there is no element: the bar's own
        // `visible` is gated on there being a result at all, and when
        // there is no result there is no element either.
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver(
            ([entry]) => setOut(!entry.isIntersecting),
            // A verdict one pixel onto the screen is not one a reader can
            // read, so it has to be properly in view before the bar goes.
            { rootMargin: '-90px 0px -40px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [el]);
    return out;
}

/** Two names and a count, because the bar has one line and a trade has six. */
function shorthand(ids: number[], nameOf: (id: number) => string): string {
    if (ids.length === 0) return 'nobody';
    const last = (id: number) => {
        const parts = nameOf(id).split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    };
    if (ids.length <= 2) return ids.map(last).join(' + ');
    return `${last(ids[0])} + ${ids.length - 1} more`;
}

/** One side's number, said the way the panel below says it. */
function Side({ e, label, strong }: {
    e: TradeEffect | null; label: string; strong?: boolean;
}) {
    if (!e) return null;
    const h = headline(e);
    return (
        <span className="flex items-baseline gap-1.5 min-w-0">
            <span className={cn('text-[10px] uppercase tracking-wider',
                strong ? 'text-foreground/55' : 'text-muted-foreground/40')}>
                {label}
            </span>
            <span className={cn('tabular-nums', strong
                ? 'text-[13px] font-bold' : 'text-[12px] font-semibold')}
                style={{ color: h.call.colour }}>
                {pp(h.delta)}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground/45
                             hidden sm:inline">
                {Math.round(h.before * 100)}&rarr;{Math.round(h.after * 100)}%
            </span>
        </span>
    );
}

/**
 * The verdict, following you down the page.
 *
 * The analyser answers at the bottom, under two rosters as long as the league
 * allows. On a laptop that put the answer two thirds of a page below the
 * click that changed it, and on a phone two and a half screens below. You
 * could not see the number move, which meant you could not do the thing the
 * page is for: try another name and watch what happens. The panel below stays
 * exactly as it was; this is the same verdict, where your hands already are.
 *
 * It carries the other thing the panel makes you hunt for, too. Whether the
 * manager on the other side has any reason to say yes was always four lines
 * down in somebody else's row, and it is the difference between an offer and
 * a message nobody answers.
 */
export function TradeSummaryBar({
    mine, theirs, partnerName, give, get, nameOf, href,
    visible, pinned, onPin, onClear, onSeeDetail,
}: {
    mine: TradeEffect | null;
    theirs: TradeEffect | null;
    partnerName: string;
    give: number[];
    get: number[];
    nameOf: (id: number) => string;
    /** The page's own address with this trade in it, for the copy button. */
    href: string;
    visible: boolean;
    pinned: boolean;
    onPin: () => void;
    onClear: () => void;
    onSeeDetail: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const copy = useCallback(() => {
        const url = typeof window === 'undefined' ? href
            : new URL(href, window.location.origin).toString();
        const done = () => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
        };
        const api = typeof navigator === 'undefined' ? null : navigator.clipboard;
        if (!api) { fallback(url); done(); return; }
        api.writeText(url).then(done).catch(() => { fallback(url); done(); });
    }, [href]);

    const reply = replyCallFor(theirs);

    return (
        <div aria-hidden={!visible}
            className={cn(`fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08]
                           transition-transform duration-200 print:hidden`,
                visible ? 'translate-y-0' : 'translate-y-full pointer-events-none')}
            style={{
                background: 'rgba(10,17,26,0.92)',
                backdropFilter: 'blur(12px)',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}>
            <div className="max-w-[1500px] mx-auto px-3 sm:px-5 py-2
                            flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {/* What is on the table, so the numbers have a subject. */}
                <span className="text-[11px] min-w-0 flex-1 basis-full sm:basis-auto
                                 sm:max-w-[320px] truncate text-muted-foreground/60">
                    <span className="text-foreground/75 font-semibold">
                        {shorthand(give, nameOf)}
                    </span>
                    <span className="text-muted-foreground/35"> &rarr; </span>
                    <span className="text-foreground/75 font-semibold">
                        {shorthand(get, nameOf)}
                    </span>
                    <span className="hidden md:inline"> &middot; {partnerName}</span>
                </span>

                {/* The verdict. Announced, because it changes under the
                    reader's hands and a screen reader would otherwise have
                    no idea that anything had happened. */}
                <span className="flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0"
                    aria-live="polite" aria-atomic="true">
                    <Side e={mine} label="you" strong />
                    <Side e={theirs} label="them" />
                    {/* Shown at every width, and it was not at first. This
                        is the line that decides whether the offer is worth
                        sending, and hiding it on a phone hides it from most
                        of the people reading. It wraps to its own row down
                        there rather than going away. */}
                    {reply && (
                        <span className="text-[10px] basis-full lg:basis-auto"
                            style={{ color: reply.colour }}>
                            {reply.text}
                        </span>
                    )}
                </span>

                <span className="flex items-center gap-1 ml-auto">
                    <button type="button" onClick={copy}
                        title="Copy a link to this exact offer"
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg
                                   border border-white/10 text-muted-foreground/70
                                   hover:text-foreground hover:bg-white/[0.06]">
                        {copied
                            ? <Check className="w-3 h-3" aria-hidden="true" />
                            : <Link2 className="w-3 h-3" aria-hidden="true" />}
                        <span className="hidden sm:inline">
                            {copied ? 'Copied' : 'Copy link'}
                        </span>
                    </button>
                    <button type="button" onClick={onPin}
                        title={pinned
                            ? 'Stop holding this offer for comparison'
                            : 'Hold this offer, then build another beside it'}
                        aria-pressed={pinned}
                        className={cn(`flex items-center gap-1 text-[10px] px-2 py-1
                                       rounded-lg border`,
                            pinned
                                ? 'border-white/25 bg-white/[0.08] text-foreground'
                                : `border-white/10 text-muted-foreground/70
                                   hover:text-foreground hover:bg-white/[0.06]`)}>
                        {pinned
                            ? <PinOff className="w-3 h-3" aria-hidden="true" />
                            : <Pin className="w-3 h-3" aria-hidden="true" />}
                        <span className="hidden sm:inline">{pinned ? 'Held' : 'Hold'}</span>
                    </button>
                    <button type="button" onClick={onSeeDetail}
                        className="text-[10px] px-2 py-1 rounded-lg border border-white/10
                                   text-muted-foreground/70 hover:text-foreground
                                   hover:bg-white/[0.06]">
                        Detail
                    </button>
                    <button type="button" onClick={onClear} title="Clear the trade"
                        aria-label="Clear the trade"
                        className="p-1 rounded-lg border border-white/10
                                   text-muted-foreground/60 hover:text-foreground
                                   hover:bg-white/[0.06]">
                        <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                </span>
            </div>
        </div>
    );
}

/** The clipboard the old way, for insecure origins and older browsers. */
function fallback(url: string) {
    const el = document.createElement('textarea');
    el.value = url;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    try { document.execCommand('copy'); } finally { document.body.removeChild(el); }
}
