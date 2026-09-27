'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIVERGING } from '@/lib/vizTokens';
import type { Horizon } from '@/lib/simInput';

/** One rostered player, with the team that holds him. */
export interface SearchHit {
    id: number;
    name: string;
    position: string;
    teamKey: string;
    teamName: string;
    /** True where he is in that team's lineup as it stands. */
    starting: boolean;
    mean: number | null;
    /** Already on the table, either way. */
    onTable: boolean;
}

const POSITION_TINT: Record<string, string> = {
    QB: '#F97316', RB: '#22C55E', WR: '#38BDF8', TE: '#A78BFA',
};

/**
 * Find a player anywhere in the league.
 *
 * The analyser opened on two rosters and a partner dropdown, which answers
 * "what could I get out of this manager" and cannot answer the question
 * people actually arrive with: I want *that* player — who has him, and what
 * would it take? Answering it meant picking each of eleven managers in turn
 * and reading their bench.
 *
 * So one box searches every roster, and a hit carries the manager who holds
 * him. Clicking a player on somebody else's roster switches the partner to
 * them and puts him on the table, because those are the same action: there
 * is no reason to want Chase and not want to trade with whoever has Chase.
 *
 * Mine are matched too, and land on my side of the table. Typing a name is
 * the fastest way to put a specific player in an offer, and on a phone —
 * where both rosters are a long scroll — it is the only quick way.
 */
export function PlayerSearch({
    hits, myKey, partnerKey, onPick, horizon, disabled,
}: {
    /** Every rostered player in the league. */
    hits: SearchHit[];
    myKey: string | null;
    /** Who the analyser is currently pricing against. */
    partnerKey: string | null;
    /**
     * Put him on the table. The page decides which side from the team that
     * holds him, and switches partner where it has to.
     */
    onPick: (hit: SearchHit) => void;
    horizon: Horizon;
    disabled?: boolean;
}) {
    const [q, setQ] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);

    /**
     * Matches, best first.
     *
     * A plain substring rather than a fuzzy match: in a twelve-team league
     * the name you typed is almost always there, and the failure mode of
     * fuzzy is putting somebody else's kicker above the receiver you meant.
     * Ordered by expected points so that "jones" leads with the one worth
     * trading for rather than whichever Jones sorts first.
     *
     * Capped, because a two-letter query matches half the league and a list
     * that long is a scroll, which is the thing this exists to remove.
     */
    const results = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (needle.length < 2) return [];
        return hits
            .filter(h => h.name.toLowerCase().includes(needle))
            .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))
            .slice(0, 10);
    }, [q, hits]);

    const take = (hit: SearchHit) => {
        onPick(hit);
        setQ('');
        // Focus stays in the box so a three-player offer is three names typed
        // rather than three names and three clicks back into the field.
        inputRef.current?.focus();
    };

    return (
        <section className="rounded-xl border border-white/[0.07] p-3"
            style={{ background: 'var(--bg-card)' }}>
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2
                                   w-3.5 h-3.5 text-muted-foreground/40"
                    aria-hidden="true" />
                <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                    disabled={disabled}
                    placeholder="Find a player anywhere in the league…"
                    aria-label="Find a player anywhere in the league"
                    data-search="league"
                    className="w-full text-[12px] rounded-lg pl-7 pr-7 py-1.5
                               bg-black/40 border border-white/10
                               placeholder:text-muted-foreground/35
                               disabled:opacity-40" />
                {q.length > 0 && (
                    <button type="button" onClick={() => { setQ(''); inputRef.current?.focus(); }}
                        aria-label="Clear the search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded
                                   text-muted-foreground/40 hover:text-foreground
                                   hover:bg-white/[0.06]">
                        <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                )}
            </div>

            {results.length > 0 && (
                <ul className="mt-2 space-y-px" data-search-results="">
                    {results.map(h => {
                        const mine = h.teamKey === myKey;
                        return (
                            <li key={h.id}>
                                <button type="button" onClick={() => take(h)}
                                    disabled={disabled || h.onTable}
                                    data-hit-player-id={h.id}
                                    data-hit-team={h.teamKey}
                                    title={h.onTable
                                        ? 'Already on the table'
                                        : mine
                                            ? `Offer ${h.name}`
                                            : h.teamKey === partnerKey
                                                ? `Ask for ${h.name}`
                                                : `Ask ${h.teamName} for ${h.name} — `
                                                  + 'switches who you are trading with'}
                                    className={cn(`w-full grid items-center gap-x-2
                                        px-2 py-1.5 rounded text-left
                                        grid-cols-[26px_minmax(0,1fr)_auto_38px]
                                        disabled:opacity-35 disabled:cursor-default
                                        enabled:hover:bg-white/[0.06]`)}>
                                    <span className="text-[9px] font-bold uppercase
                                                     tracking-wider"
                                        style={{
                                            color: POSITION_TINT[h.position.toUpperCase()]
                                                ?? 'rgba(255,255,255,0.45)',
                                        }}>
                                        {h.position}
                                    </span>
                                    <span className="text-[12px] truncate">
                                        {h.name}
                                        {h.starting && (
                                            <span className="text-[8px] font-bold uppercase
                                                             tracking-wide ml-1.5
                                                             text-muted-foreground/45">
                                                ST
                                            </span>
                                        )}
                                    </span>
                                    {/* Whose he is, which is the whole reason
                                        for searching rather than scrolling. */}
                                    <span className="text-[10px] truncate max-w-[130px]"
                                        style={{
                                            color: mine
                                                ? DIVERGING.negative
                                                : 'rgba(255,255,255,0.5)',
                                        }}>
                                        {mine ? 'you' : h.teamName}
                                    </span>
                                    <span className="text-[10px] tabular-nums text-right
                                                     text-muted-foreground/50">
                                        {h.mean == null ? '—' : h.mean.toFixed(1)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {q.trim().length >= 2 && results.length === 0 && (
                <p className="text-[11px] text-muted-foreground/45 mt-2 px-1"
                    data-search-empty="">
                    Nobody on any roster in this league matches
                    &ldquo;{q.trim()}&rdquo;. Free agents cannot be traded for — the
                    waiver page prices those.
                </p>
            )}

            <p className="text-[9px] text-muted-foreground/30 mt-2">
                Searches every roster, yours included. Picking somebody else&rsquo;s
                player asks their manager for him and switches who you are trading
                with; picking one of yours offers him. The number is expected points
                {horizon === 'season' ? ' in a typical week from here' : ' this Sunday'}.
            </p>
        </section>
    );
}
