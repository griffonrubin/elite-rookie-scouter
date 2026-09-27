'use client';

import React from 'react';
import { DIVERGING } from '@/lib/vizTokens';
import { marketVerdict } from '@/lib/marketGap';

/** One asset on the table, priced or knowingly not. */
export interface PricedAsset {
    key: string;
    name: string;
    value: number | null;
    /** True for a draft pick, which is the half that cannot play this season. */
    pick: boolean;
}

/**
 * The same trade, on the market's scale instead of the season's.
 *
 * The verdict above this answers the question this app exists to answer:
 * what a trade does to how often you win. It is the better question, and it
 * is also structurally incapable of pricing a future draft pick, because a
 * pick does not play. Folding one into a playoff-odds figure would mean
 * inventing the exchange rate between this season and the next two, and that
 * rate is the whole substance of the trade — a contender and a rebuilding
 * team can look at one offer and both be right.
 *
 * So the pick side of a dynasty trade is totalled here, on the market's own
 * numbers, and the two answers sit next to each other unreconciled on
 * purpose. Reconciling them is the reader's job and we do not have what it
 * would take: whether they are trying to win this year.
 */
export function MarketValue({
    give, get, superflex, partnerName,
}: {
    give: PricedAsset[];
    get: PricedAsset[];
    superflex: boolean;
    partnerName: string;
}) {
    const sum = (list: PricedAsset[]) =>
        list.reduce((s, a) => s + (a.value ?? 0), 0);
    const totalGive = sum(give);
    const totalGet = sum(get);
    const missing = [...give, ...get].filter(a => a.value == null);
    const diff = totalGet - totalGive;
    const bigger = Math.max(totalGive, totalGet);
    const call = marketVerdict(diff, bigger);
    const anyPicks = [...give, ...get].some(a => a.pick);

    if (give.length === 0 && get.length === 0) return null;

    return (
        <section className="rounded-xl border border-white/[0.07] p-3"
            style={{ background: 'var(--bg-card)' }}
            data-panel="market" aria-live="polite">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[10px] uppercase tracking-widest font-bold
                                 text-muted-foreground/45">
                    On the market
                </span>
                <span className="text-[16px] font-bold tabular-nums"
                    style={{ color: call.colour }} data-market-gap="">
                    {diff > 0 ? '+' : diff < 0 ? '−' : ''}
                    {Math.abs(diff).toLocaleString()}
                </span>
                <span className="text-[12px]" style={{ color: call.colour }}>
                    {call.text}
                </span>
                {bigger > 0 && (
                    <span className="text-[10px] text-muted-foreground/45 tabular-nums">
                        {(call.share * 100).toFixed(0)}% of the bigger side
                    </span>
                )}
                <span className="text-[10px] text-muted-foreground/40 ml-auto">
                    {superflex ? 'superflex' : '1QB'} dynasty values
                </span>
            </div>

            {bigger > 0 && (
                <div className="mt-2 flex h-[8px] rounded-[3px] overflow-hidden"
                    role="img"
                    aria-label={`You give ${totalGive.toLocaleString()}, `
                        + `you get ${totalGet.toLocaleString()}`}>
                    <span style={{
                        width: `${(totalGive / (totalGive + totalGet)) * 100}%`,
                        background: DIVERGING.negative, opacity: 0.85,
                    }} />
                    <span style={{
                        width: `${(totalGet / (totalGive + totalGet)) * 100}%`,
                        background: DIVERGING.positive, opacity: 0.85,
                    }} />
                </div>
            )}

            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 mt-2">
                {([
                    { label: 'You send', list: give, total: totalGive },
                    { label: `From ${partnerName || 'them'}`, list: get, total: totalGet },
                ]).map(({ label, list, total }) => (
                    <div key={label} className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10px] font-bold
                                             text-muted-foreground/55">
                                {label}
                            </span>
                            <span className="text-[11px] font-bold tabular-nums">
                                {total.toLocaleString()}
                            </span>
                        </div>
                        {list.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground/35">nothing</p>
                        ) : (
                            <ul className="space-y-px">
                                {list.map(a => (
                                    <li key={a.key}
                                        className="flex items-baseline justify-between
                                                   gap-2 text-[10px]">
                                        <span className="truncate text-muted-foreground/60">
                                            {a.name}
                                            {a.pick && (
                                                <span className="text-muted-foreground/35
                                                                 ml-1">
                                                    pick
                                                </span>
                                            )}
                                        </span>
                                        <span className="tabular-nums shrink-0
                                                         text-muted-foreground/50">
                                            {a.value == null
                                                ? '—'
                                                : a.value.toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </div>

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug
                          max-w-[780px]">
                {anyPicks
                    ? 'Picks cannot change this season, so they are absent from the '
                      + 'playoff odds above and priced only here. '
                    : 'Everything in this trade also plays this season, so the verdict '
                      + 'above already prices it — this is the second question: what '
                      + 'you own afterwards. '}
                A contender should let the odds decide and a rebuilding team should let
                this decide, and the two disagreeing is information rather than a
                problem: it is exactly what the other manager is hoping you will not
                notice.
                {missing.length > 0 && ` ${missing.length === 1
                    ? 'One asset has'
                    : `${missing.length} assets have`} no market price and count as `
                    + 'nothing in these totals — they are further out than the feed goes.'}
            </p>
        </section>
    );
}
