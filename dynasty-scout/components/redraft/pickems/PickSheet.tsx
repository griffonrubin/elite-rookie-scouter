'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHART_INK, DIVERGING, MARK } from '@/lib/vizTokens';
import {
    BREAK_EVEN, confidencePoints, devig, impliedProbability, marketVsHistory,
    overround, rateError, THIN_SAMPLE,
} from '@/lib/pickem';
import type { PickemGame } from '@/app/api/redraft/pickems/route';

/**
 * The week's picks, ranked, with the working shown.
 *
 * A confidence pool has as many points as games and each may be used once,
 * so the whole exercise is a stack rank — which makes a page that lists the
 * games in kickoff order a page that has not done the job. The points go on
 * the left because they are the answer.
 *
 * Everything to the right of them is the audit. Two independent estimates of
 * the same thing sit side by side: what the market is charging, and what
 * lines this size have actually done across twenty-seven seasons. They are
 * not blended. A single number would be more convenient and would hide the
 * only thing on the row worth arguing with — where two honest sources
 * disagree, and by how much, over how many games.
 */

function Bar({ p, compare }: { p: number; compare?: number | null }) {
    return (
        <span className="relative block w-full h-[7px]">
            <span className="absolute inset-0 rounded"
                style={{ background: CHART_INK.grid }} />
            {/* Even odds, which is where a pick stops being a pick. */}
            <span className="absolute" style={{
                left: '50%', top: -2, bottom: -2, width: 1,
                background: 'rgba(255,255,255,0.28)',
            }} />
            <span className="absolute" style={{
                left: 0, top: 0, height: 7, width: `${Math.max(1, p * 100)}%`,
                background: DIVERGING.positive, borderRadius: MARK.barRadius,
            }} />
            {/* The other source, as a tick rather than a second bar: it is a
                check on this number, not a second quantity. */}
            {compare != null && (
                <span className="absolute" style={{
                    left: `${compare * 100}%`, top: -3, bottom: -3, width: 2,
                    background: 'rgba(255,255,255,0.75)',
                }} />
            )}
        </span>
    );
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function PickSheet({ games, overall }: {
    games: PickemGame[];
    overall: { games: number; favCoverRate: number;
        fromSeason: number | null; toSeason: number | null } | null;
}) {
    /**
     * Which source orders the sheet.
     *
     * The market is sharper — it knows who is hurt and the bucket does not —
     * so it leads. But a reader who wants to see what a quarter century of
     * games says, uncontaminated by this week's price, can have that too,
     * and the two orders disagreeing is information.
     */
    const [by, setBy] = useState<'market' | 'history' | 'kickoff'>('market');
    const [open, setOpen] = useState<string | null>(null);
    if (games.length === 0) return null;

    /**
     * The points are always the market's ranking; only the order changes.
     *
     * A reader sorting by kickoff is checking Thursday's game, not asking
     * for different picks, and renumbering the sheet under them would be a
     * page that changes its advice when you change how you look at it. The
     * record ordering is the exception and says so: it is a different
     * question, so it gets different numbers.
     */
    const probOf = (g: PickemGame) => by === 'history'
        ? g.history?.favWinRate ?? null
        : g.favWinProb;
    const points = confidencePoints(games.map(g => ({
        gameId: g.gameId, probability: probOf(g),
    })));
    const ranked = [...games].sort((a, b) => by === 'kickoff'
        ? String(a.gameday ?? '').localeCompare(String(b.gameday ?? ''))
          || a.gameId.localeCompare(b.gameId)
        : (points.get(b.gameId) ?? 0) - (points.get(a.gameId) ?? 0));

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    This week&rsquo;s picks, most confident first
                </h2>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest font-bold
                                     text-muted-foreground/35">order by</span>
                    <div className="inline-flex items-center gap-1 rounded-lg p-0.5"
                        style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {(['market', 'history', 'kickoff'] as const).map(k => (
                            <button key={k} type="button" onClick={() => setBy(k)}
                                aria-pressed={by === k}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold
                                            transition-colors ${by === k
                                    ? 'bg-white/[0.12] text-foreground'
                                    : 'text-muted-foreground/55 hover:text-foreground/80'}`}>
                                {k === 'market' ? 'The market'
                                    : k === 'history' ? 'The record' : 'Kickoff'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <p className="text-[11px] text-muted-foreground/55 max-w-[820px] mb-2">
                {games.length} games, so {games.length} points to give out and each one
                used once — the pool is a stack rank and this is it. Sorting by kickoff
                reorders the sheet without renumbering it, because looking at Thursday
                is not asking for different picks. The two probability
                columns are independent: what the book is charging, and what lines this
                size have done since {overall?.fromSeason ?? 1999}. They are not blended,
                because where they disagree is the only thing here worth arguing with.
            </p>

            <div className="grid items-end gap-x-3 px-1 pb-1 text-[10px] uppercase
                            tracking-widest font-bold text-muted-foreground/45
                            grid-cols-[28px_minmax(0,1fr)_auto]
                            sm:grid-cols-[28px_128px_86px_minmax(0,1fr)_62px_96px_20px]">
                <span className="text-right">Pts</span>
                <span>Pick</span>
                <span className="hidden sm:block text-right">Market</span>
                <span className="hidden sm:block">Win probability</span>
                <span className="hidden sm:block text-right">Record</span>
                <span className="hidden sm:block text-right">Against the spread</span>
                <span className="hidden sm:block" />
            </div>

            <ul className="space-y-0.5">
                {ranked.map(g => {
                    const isOpen = open === g.gameId;
                    const market = g.favWinProb;
                    const hist = g.history?.favWinRate ?? null;
                    const n = g.history?.games ?? 0;
                    const gap = marketVsHistory(market, hist);
                    const cover = g.history?.favCoverRate ?? null;
                    const thin = n > 0 && n < THIN_SAMPLE;
                    const shown = probOf(g);
                    return (
                        <li key={g.gameId}>
                            <button type="button" aria-expanded={isOpen}
                                onClick={() => setOpen(isOpen ? null : g.gameId)}
                                className={cn(`w-full grid items-center gap-x-3 gap-y-1
                                    px-1 py-1.5 rounded-lg text-left transition-colors
                                    hover:bg-white/[0.05]
                                    grid-cols-[28px_minmax(0,1fr)_auto]
                                    sm:grid-cols-[28px_128px_86px_minmax(0,1fr)_62px_96px_20px]`,
                                    isOpen && 'bg-white/[0.04]')}>
                                <span className="text-[13px] font-bold tabular-nums
                                                 text-right text-muted-foreground/70">
                                    {points.get(g.gameId)}
                                </span>

                                <span className="min-w-0">
                                    <span className="block text-[12px] font-semibold truncate">
                                        {g.favourite ?? '—'}
                                        {g.laying != null && (
                                            <span className="text-muted-foreground/50
                                                             font-normal tabular-nums">
                                                {' '}−{g.laying}
                                            </span>
                                        )}
                                    </span>
                                    <span className="block text-[10px]
                                                     text-muted-foreground/45 truncate">
                                        {g.away} at {g.home}
                                        {g.gameday && (
                                            <span className="text-muted-foreground/30">
                                                {' · '}{new Date(g.gameday + 'T12:00:00Z')
                                                    .toLocaleDateString('en-GB',
                                                        { weekday: 'short',
                                                          day: 'numeric', month: 'short',
                                                          timeZone: 'UTC' })}
                                            </span>
                                        )}
                                    </span>
                                </span>

                                <span className="hidden sm:block text-[12px] tabular-nums
                                                 font-bold text-right">
                                    {market != null ? pct(market)
                                        : <span className="text-muted-foreground/30">—</span>}
                                </span>

                                <span className="col-span-3 row-start-2 sm:col-span-1
                                                 sm:col-start-4 sm:row-start-1"
                                    title={market != null && hist != null
                                        ? `The market says ${pct(market)}; lines this `
                                          + `size have won ${pct(hist)} of ${n} games. `
                                          + 'The white tick is the historical rate.'
                                        : undefined}>
                                    {shown != null && (
                                        <Bar p={shown}
                                            compare={by === 'market' ? hist : market} />
                                    )}
                                    <span className="sm:hidden block text-[10px]
                                                     tabular-nums text-muted-foreground/60
                                                     mt-0.5">
                                        {market != null && `market ${pct(market)}`}
                                        {hist != null && ` · record ${pct(hist)}`}
                                    </span>
                                </span>

                                <span className="hidden sm:block text-[11px] tabular-nums
                                                 text-right">
                                    {hist != null ? (
                                        <>
                                            <span className="font-semibold">{pct(hist)}</span>
                                            <span className={cn('block text-[9px]',
                                                thin ? '' : 'text-muted-foreground/35')}
                                                style={thin ? { color: '#FDBA74' } : undefined}>
                                                {n.toLocaleString()} games
                                            </span>
                                        </>
                                    ) : <span className="text-muted-foreground/30">—</span>}
                                </span>

                                {/* The finding this page was built on, per row
                                    rather than as a chart nobody reads twice:
                                    the spread is priced to be a coin flip and
                                    twenty-seven seasons agree. */}
                                <span className="col-start-3 row-start-1 sm:col-start-6
                                                 text-[11px] tabular-nums text-right">
                                    {cover != null ? (
                                        <>
                                            <span className="font-semibold"
                                                style={{ color: cover >= BREAK_EVEN
                                                    ? DIVERGING.positive
                                                    : 'rgba(255,255,255,0.55)' }}>
                                                {pct(cover)}
                                            </span>
                                            <span className="block text-[9px]
                                                             text-muted-foreground/35">
                                                {cover >= BREAK_EVEN ? 'beats −110'
                                                    : 'coin flip'}
                                            </span>
                                        </>
                                    ) : <span className="text-muted-foreground/30">—</span>}
                                </span>

                                <span className="hidden sm:flex sm:col-start-7 justify-end">
                                    <ChevronDown className={cn(`w-3 h-3
                                        text-muted-foreground/30 transition-transform`,
                                        isOpen && 'rotate-180')} aria-hidden="true" />
                                </span>
                            </button>

                            {isOpen && <Audit game={g} gap={gap} />}
                        </li>
                    );
                })}
            </ul>

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug
                          max-w-[860px]">
                {overall && (
                    <>Across {overall.games.toLocaleString()} regular-season games from{' '}
                    {overall.fromSeason} to {overall.toSeason} the favourite covered{' '}
                    {pct(overall.favCoverRate)} of the time, against the{' '}
                    {pct(BREAK_EVEN)} a standard −110 bet needs to break even. That is
                    not a flaw in the market, it is the market working: the line moves
                    until the money is even. </>
                )}
                Straight up is a different question and the same games answer it — which
                is why the confidence column is built on who wins rather than on who
                covers. Open a row for the prices, the margin taken out of them, and the
                bucket behind the historical rate.
            </p>
        </section>
    );
}

/**
 * The working, for one game.
 *
 * Not a tooltip: a reader who wants to know why the page says eighty per
 * cent should be able to see the two prices, the margin between them, the
 * division that removes it, and the count of finished games behind the other
 * number. Every step is one a reader can redo on paper, which is the only
 * form of "trust me" worth offering.
 */
function Audit({ game: g, gap }: { game: PickemGame; gap: number | null }) {
    const homeRaw = impliedProbability(g.homeMoneyline);
    const awayRaw = impliedProbability(g.awayMoneyline);
    const juice = overround(g.homeMoneyline, g.awayMoneyline);
    const clean = devig(g.homeMoneyline, g.awayMoneyline);
    const h = g.history;
    const err = h ? rateError(h.favWinRate, h.games) : null;

    const Row = ({ label, value, note }: {
        label: string; value: React.ReactNode; note?: string;
    }) => (
        <div className="grid gap-x-3 items-baseline
                        grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[168px_92px_minmax(0,1fr)]">
            <span className="text-[10px] text-muted-foreground/55">{label}</span>
            <span className="text-[10px] tabular-nums font-semibold text-right">{value}</span>
            {note && (
                <span className="col-span-2 sm:col-span-1 text-[9px]
                                 text-muted-foreground/35 leading-snug">{note}</span>
            )}
        </div>
    );

    return (
        <div className="ml-3 sm:ml-8 pl-3 pb-3 pt-1 border-l border-white/[0.08]
                        grid gap-x-8 gap-y-3 lg:grid-cols-2">
            <div className="space-y-1">
                <h4 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    What the book is charging
                </h4>
                <Row label={`${g.home} moneyline`}
                    value={g.homeMoneyline != null
                        ? `${g.homeMoneyline > 0 ? '+' : ''}${g.homeMoneyline}` : '—'}
                    note={homeRaw != null ? `implies ${pct(homeRaw)}` : undefined} />
                <Row label={`${g.away} moneyline`}
                    value={g.awayMoneyline != null
                        ? `${g.awayMoneyline > 0 ? '+' : ''}${g.awayMoneyline}` : '—'}
                    note={awayRaw != null ? `implies ${pct(awayRaw)}` : undefined} />
                <Row label="the two together"
                    value={homeRaw != null && awayRaw != null
                        ? pct(homeRaw + awayRaw) : '—'}
                    note={juice != null
                        ? `more than one hundred by ${(juice * 100).toFixed(1)} points — `
                          + 'the book’s margin, which is why the prices cannot be '
                          + 'read as probabilities until it is removed'
                        : undefined} />
                <Row label={`${g.home} after removing it`}
                    value={clean ? pct(clean.a) : '—'}
                    note={clean ? 'each side divided by the two added together' : undefined} />
                <Row label={`${g.away} after removing it`}
                    value={clean ? pct(clean.b) : '—'} />
                <Row label="spread and total"
                    value={g.spread != null
                        ? `${g.home} ${g.spread > 0 ? '+' : ''}${g.spread}` : '—'}
                    note={g.totalLine != null
                        ? `total ${g.totalLine} — ${g.home} ${g.homeTotal ?? '—'}, `
                          + `${g.away} ${g.awayTotal ?? '—'}`
                        : undefined} />
            </div>

            <div className="space-y-1">
                <h4 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    What lines this size have done
                </h4>
                {h ? (
                    <>
                        <Row label="spreads in this bucket" value={h.label}
                            note={'Three and seven get buckets of their own: they are '
                                + 'where NFL margins pile up, and lumping three in with '
                                + 'three and a half would blur the two most common '
                                + 'results in the sport.'} />
                        <Row label="games counted" value={h.games.toLocaleString()}
                            note={h.games < THIN_SAMPLE
                                ? 'Thin — under two hundred games a rate moves by more '
                                  + 'than the disagreements anybody would act on.'
                                : undefined} />
                        <Row label="favourite won" value={pct(h.favWinRate)}
                            note={err != null
                                ? `give or take ${(err * 100 * 1.96).toFixed(1)} points `
                                  + 'at ninety-five per cent'
                                : undefined} />
                        <Row label="favourite covered" value={pct(h.favCoverRate)}
                            note={`against ${pct(BREAK_EVEN)} to break even at −110, `
                                + `over ${h.coverSample.toLocaleString()} games that `
                                + 'did not land on the number'} />
                        {h.overRate != null && (
                            <Row label="went over the total" value={pct(h.overRate)} />
                        )}
                        {gap != null && (
                            <Row label="market against record"
                                value={`${gap > 0 ? '+' : ''}${gap.toFixed(1)} pts`}
                                note={Math.abs(gap) < 3
                                    ? 'The two agree, which is the usual case and is '
                                      + 'worth seeing rather than assuming.'
                                    : gap > 0
                                        ? 'The market likes this favourite more than '
                                          + 'lines his size have deserved. Not an edge: '
                                          + 'the market knows who is playing and who is '
                                          + 'hurt, and the bucket knows neither.'
                                        : 'The market likes this favourite less than '
                                          + 'lines his size have deserved — usually an '
                                          + 'injury or a short week the bucket cannot '
                                          + 'see.'} />
                        )}
                    </>
                ) : (
                    <p className="text-[10px] text-muted-foreground/45">
                        No spread posted, so there is no bucket to compare against.
                    </p>
                )}
            </div>
        </div>
    );
}
