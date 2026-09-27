'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIVERGING } from '@/lib/vizTokens';
import type { Horizon } from '@/lib/simInput';

/** What every hit carries, whichever kind it is. */
interface HitBase {
    name: string;
    /** The team holding it. */
    teamKey: string;
    teamName: string;
    /** Already on the table, either way. */
    onTable: boolean;
}

/** One rostered player, with the team that holds him. */
export interface PlayerHit extends HitBase {
    kind: 'player';
    id: number;
    position: string;
    /** True where he is in that team's lineup as it stands. */
    starting: boolean;
    mean: number | null;
}

/**
 * One future draft pick.
 *
 * Searchable for the same reason players are. Picks became things a trade
 * can be made of, and then stayed findable only by scrolling the holdings
 * of whichever manager happened to be selected — so "who has a 2027 first"
 * was back to reading eleven panels, which is the exact question this box
 * was added to stop anybody having to answer that way.
 */
export interface PickHit extends HitBase {
    kind: 'pick';
    /** The id `tradePicks` builds, '2027-1-8'. */
    id: string;
    /** Market price, where the feed carries one. */
    value: number | null;
    /** Its projected band, where the season is far enough along to say. */
    slot: string | null;
}

export type SearchHit = PlayerHit | PickHit;

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
    /** Whether this league has picks at all, which the wording follows. */
    const hasPicks = hits.some(h => h.kind === 'pick');

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
        const matched = hits.filter(h => h.name.toLowerCase().includes(needle));
        // Players by what they score, picks by what they cost, players first.
        // The two rarely mix — a query matching "2027" matches no player and
        // a surname matches no pick — so this is about ordering within a
        // kind rather than ranking one kind above the other.
        const players = matched.filter((h): h is PlayerHit => h.kind === 'player')
            .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
        const picks = matched.filter((h): h is PickHit => h.kind === 'pick')
            .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
        return [...players, ...picks].slice(0, 10);
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
                    placeholder={hasPicks
                        ? 'Find a player or a pick anywhere in the league…'
                        : 'Find a player anywhere in the league…'}
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
                                            color: h.kind === 'pick'
                                                ? 'rgba(255,255,255,0.35)'
                                                : POSITION_TINT[h.position.toUpperCase()]
                                                  ?? 'rgba(255,255,255,0.45)',
                                        }}>
                                        {h.kind === 'pick' ? 'PICK' : h.position}
                                    </span>
                                    <span className="text-[12px] truncate">
                                        {h.name}
                                        {h.kind === 'player' && h.starting && (
                                            <span className="text-[8px] font-bold uppercase
                                                             tracking-wide ml-1.5
                                                             text-muted-foreground/45">
                                                ST
                                            </span>
                                        )}
                                        {h.kind === 'pick' && h.slot && (
                                            <span className="text-[9px] ml-1.5
                                                             text-muted-foreground/45">
                                                {h.slot}
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
                                    {/* Points a week for a player, market
                                        price for a pick. Different units in
                                        one column, but never in one row and
                                        never for the same kind of thing —
                                        and the alternative is a column of
                                        dashes beside every pick. */}
                                    <span className="text-[10px] tabular-nums text-right
                                                     text-muted-foreground/50"
                                        title={h.kind === 'pick'
                                            ? 'Market value'
                                            : 'Expected points'}>
                                        {h.kind === 'pick'
                                            ? (h.value == null
                                                ? '—' : h.value.toLocaleString())
                                            : (h.mean == null
                                                ? '—' : h.mean.toFixed(1))}
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
                    Nothing in this league matches &ldquo;{q.trim()}&rdquo;. Free
                    agents cannot be traded for — the waiver page prices those.
                </p>
            )}

            <p className="text-[9px] text-muted-foreground/30 mt-2">
                Searches every roster, yours included{hasPicks
                    ? ', and every future pick — type a year or a round'
                    : ''}. Picking somebody else&rsquo;s
                player asks their manager for him and switches who you are trading
                with; picking one of yours offers him. The number is expected points
                {horizon === 'season' ? ' in a typical week from here' : ' this Sunday'}.
            </p>
        </section>
    );
}
