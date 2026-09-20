'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIVERGING } from '@/lib/vizTokens';
import type { DynastyAsset } from '@/lib/dynastyAssets';

type Format = '1qb' | 'sf';

const POSITION_TINT: Record<string, string> = {
    QB: '#F97316', RB: '#22C55E', WR: '#38BDF8', TE: '#A78BFA',
};

const valueIn = (a: DynastyAsset, f: Format) =>
    (f === 'sf' ? a.valueSf : a.value1qb) ?? 0;

/**
 * How lopsided a trade has to be before it is worth saying so.
 *
 * Not a fixed number of points, because these values are not a fixed scale:
 * ten per cent of a 1.01 is several hundred, ten per cent of a 4th is
 * eighty. Expressed against the bigger side, which is the side the gap is
 * being measured out of.
 *
 * Ten per cent is where the community's own tolerance sits — trade
 * calculators that colour anything at all tend to call a deal fair inside
 * it, and two humans agreeing a deal are rarely arguing over less.
 */
const FAIR = 0.10;
const LOPSIDED = 0.25;

function verdict(diff: number, bigger: number): { text: string; colour: string } {
    if (bigger === 0) return { text: 'nothing on the table yet', colour: 'rgba(255,255,255,0.4)' };
    const share = Math.abs(diff) / bigger;
    if (share < FAIR) return { text: 'an even trade', colour: 'rgba(255,255,255,0.55)' };
    const side = diff > 0 ? 'you' : 'them';
    if (share < LOPSIDED) {
        return { text: `tilts ${side === 'you' ? 'your' : 'their'} way`, colour: '#93C5FD' };
    }
    return {
        text: `heavily ${side === 'you' ? 'your' : 'their'} way`,
        colour: diff > 0 ? '#93C5FD' : '#FCA5A5',
    };
}

/** One asset, as a removable chip on a side of the table. */
function Chip({ asset, format, onRemove }: {
    asset: DynastyAsset; format: Format; onRemove: () => void;
}) {
    const tint = asset.kind === 'pick'
        ? 'rgba(255,255,255,0.45)'
        : POSITION_TINT[asset.position] ?? 'rgba(255,255,255,0.45)';
    return (
        <li className="flex items-center gap-2 px-2 py-1.5 rounded-lg
                       border border-white/[0.07] bg-black/20">
            <span className="text-[9px] font-bold uppercase tracking-wider w-7 shrink-0"
                style={{ color: tint }}>
                {asset.position}
            </span>
            <span className="text-[12px] font-semibold truncate flex-1 min-w-0">
                {asset.name}
                {asset.detail && (
                    <span className="font-normal text-muted-foreground/40 ml-1.5 text-[10px]">
                        {asset.detail}{asset.age != null ? ` · ${asset.age}` : ''}
                    </span>
                )}
            </span>
            <span className="text-[12px] font-bold tabular-nums shrink-0">
                {valueIn(asset, format).toLocaleString()}
            </span>
            <button type="button" onClick={onRemove}
                aria-label={`Remove ${asset.name}`}
                className="p-0.5 rounded text-muted-foreground/40
                           hover:text-foreground hover:bg-white/[0.06] shrink-0">
                <X className="w-3 h-3" aria-hidden="true" />
            </button>
        </li>
    );
}

/** One side of the table: what it holds, and what that is worth. */
function Side({ title, subtitle, ids, assets, format, total, onRemove }: {
    title: string; subtitle: string;
    ids: string[]; assets: Map<string, DynastyAsset>;
    format: Format; total: number;
    onRemove: (id: string) => void;
}) {
    return (
        <section className="rounded-xl border border-white/[0.07] p-3 min-w-0"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="text-[11px] font-bold">{title}</h3>
                <span className="text-[14px] font-bold tabular-nums">
                    {total.toLocaleString()}
                </span>
            </div>
            {ids.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/40 py-3">{subtitle}</p>
            ) : (
                <ul className="space-y-1">
                    {ids.map(id => {
                        const a = assets.get(id);
                        return a ? (
                            <Chip key={id} asset={a} format={format}
                                onRemove={() => onRemove(id)} />
                        ) : null;
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * A dynasty trade, priced without a league.
 *
 * The In Season analyser answers a better question than this one — it
 * re-fills both lineups, replays the league, and tells you what a trade does
 * to your playoff odds. It can only do that because it knows your roster,
 * your lineup shape and your schedule, which means connecting a league and
 * picking a manager to trade with.
 *
 * Most of the time you do not have any of that to hand. Somebody texts you
 * an offer and you want to know whether it is roughly fair before you think
 * about it properly. That is a question about value, and value is the thing
 * the other page deliberately refuses to answer — so it gets answered here,
 * where nothing is claimed about your season and nothing needs to be known
 * about your team.
 *
 * Players and picks are one list on purpose. A dynasty trade is made of both
 * and you should not have to tell the search which you are looking for.
 */
export function TradeCalculator({ assets }: { assets: DynastyAsset[] }) {
    const [format, setFormat] = useState<Format>('1qb');
    const [q, setQ] = useState('');
    const [side, setSide] = useState<'a' | 'b'>('a');
    const [aIds, setAIds] = useState<string[]>([]);
    const [bIds, setBIds] = useState<string[]>([]);

    const byId = useMemo(
        () => new Map(assets.map(a => [a.id, a])), [assets]);

    const taken = useMemo(
        () => new Set([...aIds, ...bIds]), [aIds, bIds]);

    /**
     * Matches, best-valued first.
     *
     * A plain substring rather than a fuzzy match, because the failure mode
     * of fuzzy here is putting a 4th-round pick above the receiver you
     * actually typed. Picks match on the way people write them — "2027 1st"
     * finds all four of them.
     */
    const results = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return [];
        return assets
            .filter(a => !taken.has(a.id)
                && (a.name.toLowerCase().includes(needle)
                    || `${a.position} ${a.detail ?? ''}`.toLowerCase().includes(needle)))
            .sort((x, y) => valueIn(y, format) - valueIn(x, format))
            .slice(0, 8);
    }, [q, assets, taken, format]);

    const totalA = aIds.reduce((s, id) => s + valueIn(byId.get(id)!, format), 0);
    const totalB = bIds.reduce((s, id) => s + valueIn(byId.get(id)!, format), 0);
    // Positive means the side you receive is worth more.
    const diff = totalB - totalA;
    const bigger = Math.max(totalA, totalB);
    const call = verdict(diff, bigger);
    const share = bigger > 0 ? Math.abs(diff) / bigger : 0;

    const add = (id: string) => {
        (side === 'a' ? setAIds : setBIds)(prev => [...prev, id]);
        setQ('');
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                    {(['1qb', 'sf'] as const).map(f => (
                        <button key={f} type="button" onClick={() => setFormat(f)}
                            aria-pressed={format === f}
                            className={cn('text-[11px] font-semibold px-2.5 py-1',
                                format === f
                                    ? 'bg-white/[0.10] text-foreground'
                                    : 'text-muted-foreground/60 hover:text-foreground')}>
                            {f === '1qb' ? '1QB' : 'Superflex'}
                        </button>
                    ))}
                </div>
                {(aIds.length > 0 || bIds.length > 0) && (
                    <button type="button"
                        onClick={() => { setAIds([]); setBIds([]); }}
                        className="text-[11px] px-2 py-1 rounded-lg border border-white/10
                                   text-muted-foreground/70 hover:text-foreground
                                   hover:bg-white/[0.05]">
                        Clear
                    </button>
                )}
                <span className="text-[10px] text-muted-foreground/40 ml-auto">
                    {assets.length.toLocaleString()} players and picks priced
                </span>
            </div>

            {/* Search. One box for both kinds, and a switch for which side
                the next thing you pick lands on — faster than dragging, and
                it works the same on a phone. */}
            <div className="rounded-xl border border-white/[0.07] p-3"
                style={{ background: 'var(--bg-card)' }}>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2
                                           w-3.5 h-3.5 text-muted-foreground/40"
                            aria-hidden="true" />
                        <input value={q} onChange={e => setQ(e.target.value)}
                            placeholder="Search a player or a pick — Chase, 2027 1st…"
                            aria-label="Search players and picks"
                            className="w-full text-[12px] rounded-lg pl-7 pr-2 py-1.5
                                       bg-black/40 border border-white/10
                                       placeholder:text-muted-foreground/35" />
                    </div>
                    <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                        {(['a', 'b'] as const).map(s => (
                            <button key={s} type="button" onClick={() => setSide(s)}
                                aria-pressed={side === s}
                                className={cn('text-[11px] font-semibold px-2.5 py-1.5',
                                    side === s
                                        ? 'bg-white/[0.10] text-foreground'
                                        : 'text-muted-foreground/55 hover:text-foreground')}>
                                {s === 'a' ? 'You give' : 'You get'}
                            </button>
                        ))}
                    </div>
                </div>

                {results.length > 0 && (
                    <ul className="mt-2 space-y-px">
                        {results.map(a => (
                            <li key={a.id}>
                                <button type="button" onClick={() => add(a.id)}
                                    className="w-full grid items-center gap-x-2 px-2 py-1.5
                                               rounded-lg text-left hover:bg-white/[0.06]
                                               grid-cols-[28px_minmax(0,1fr)_auto_18px]">
                                    <span className="text-[9px] font-bold uppercase
                                                     tracking-wider"
                                        style={{
                                            color: a.kind === 'pick'
                                                ? 'rgba(255,255,255,0.45)'
                                                : POSITION_TINT[a.position]
                                                  ?? 'rgba(255,255,255,0.45)',
                                        }}>
                                        {a.position}
                                    </span>
                                    <span className="text-[12px] truncate">
                                        {a.name}
                                        {a.detail && (
                                            <span className="text-muted-foreground/40
                                                             ml-1.5 text-[10px]">
                                                {a.detail}
                                                {a.age != null ? ` · ${a.age}` : ''}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-[11px] font-semibold tabular-nums
                                                     text-muted-foreground/70">
                                        {valueIn(a, format).toLocaleString()}
                                    </span>
                                    <Plus className="w-3 h-3 text-muted-foreground/35"
                                        aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {q.trim() && results.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/45 mt-2 px-1">
                        Nothing matching &ldquo;{q.trim()}&rdquo;. Only players and picks
                        with a dynasty value can be priced.
                    </p>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Side title="You give" subtitle="Search above and add what you send."
                    ids={aIds} assets={byId} format={format} total={totalA}
                    onRemove={id => setAIds(prev => prev.filter(x => x !== id))} />
                <Side title="You get" subtitle="And what comes back."
                    ids={bIds} assets={byId} format={format} total={totalB}
                    onRemove={id => setBIds(prev => prev.filter(x => x !== id))} />
            </div>

            <section className="rounded-xl border border-white/[0.07] p-4"
                style={{ background: 'var(--bg-card)' }}
                aria-live="polite">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold
                                     text-muted-foreground/45">
                        The gap
                    </span>
                    <span className="text-[18px] font-bold tabular-nums"
                        style={{ color: call.colour }}>
                        {diff > 0 ? '+' : diff < 0 ? '−' : ''}
                        {Math.abs(diff).toLocaleString()}
                    </span>
                    <span className="text-[12px]" style={{ color: call.colour }}>
                        {call.text}
                    </span>
                    {bigger > 0 && (
                        <span className="text-[10px] text-muted-foreground/45 tabular-nums">
                            {(share * 100).toFixed(0)}% of the bigger side
                        </span>
                    )}
                </div>
                {/* The two sides drawn against each other, because a gap of
                    900 means one thing on a 1.01 and another on a 4th. */}
                {bigger > 0 && (
                    <div className="mt-2 flex h-[10px] rounded-[3px] overflow-hidden"
                        role="img"
                        aria-label={`You give ${totalA.toLocaleString()}, `
                            + `you get ${totalB.toLocaleString()}`}>
                        <span style={{
                            width: `${(totalA / (totalA + totalB)) * 100}%`,
                            background: DIVERGING.negative, opacity: 0.85,
                        }} />
                        <span style={{
                            width: `${(totalB / (totalA + totalB)) * 100}%`,
                            background: DIVERGING.positive, opacity: 0.85,
                        }} />
                    </div>
                )}
                <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug
                              max-w-[780px]">
                    Market values, in the {format === 'sf' ? 'superflex' : '1QB'} format,
                    refreshed daily. This says whether an offer is roughly fair, which is
                    the question you have when somebody texts you one. It does not say
                    what the trade would do to your team — a third receiver in a league
                    that starts two is worth far less to you than his value here, and
                    that is the question the{' '}
                    <a href="/in-season/trades"
                        className="underline decoration-white/20 hover:decoration-white/60">
                        In Season analyser
                    </a>{' '}
                    answers by replaying your actual league.
                </p>
            </section>
        </div>
    );
}
