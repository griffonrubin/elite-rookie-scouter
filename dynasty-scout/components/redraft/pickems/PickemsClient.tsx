'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PickemsResponse } from '@/app/api/redraft/pickems/route';
import { CoverChart } from './CoverChart';
import { GameTable } from './GameTable';

/**
 * Spreads, and the honest answer about them.
 *
 * The request was a tool to help decide on spreads every week. The
 * defensible version of that tool has to start by saying what twenty-seven
 * seasons of closing lines say plainly: against the spread there is no edge
 * in the line, because the line is set to remove it. Favourites cover 48.9%
 * of the time and have never strayed far from that in any bucket.
 *
 * Which is not a reason to show nothing. It relocates the decision. Picking
 * winners straight up is highly predictable and the market ranks them for
 * you, which is exactly what a confidence pool wants; the totals and the
 * implied team scores are where a view about a game turns into a number; and
 * knowing that the spread is a coin flip is worth more than a page of
 * invented leans pretending otherwise.
 */
export function PickemsClient() {
    const [data, setData] = useState<PickemsResponse | null>(null);
    const [week, setWeek] = useState<number | null>(null);
    const [sort, setSort] = useState<'kickoff' | 'confidence'>('kickoff');
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setError(false);
        fetch(`/api/redraft/pickems${week ? `?week=${week}` : ''}`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((j: PickemsResponse) => { if (!cancelled) setData(j); })
            .catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, [week]);

    if (error) {
        return (
            <p className="text-[12px] py-3" style={{ color: '#FCA5A5' }}>
                Could not read this week&rsquo;s lines. Reload to try again.
            </p>
        );
    }
    if (!data) {
        return (
            <p className="text-[12px] text-muted-foreground/55 py-3">
                Reading the week&rsquo;s lines…
            </p>
        );
    }

    const cover = data.overall
        ? `${(data.overall.favCoverRate * 100).toFixed(1)}%`
        : null;

    return (
        <div className="space-y-4">
            {data.overall && (
                <section className="rounded-xl border border-white/[0.07] p-4"
                    style={{ background: 'var(--bg-card)' }}>
                    <h2 className="text-[10px] uppercase tracking-widest font-bold
                                   text-muted-foreground/45 mb-1">
                        A spread predicts the winner, not the cover
                    </h2>
                    <p className="text-[12px] text-muted-foreground/70 max-w-[760px] mb-3">
                        Across{' '}
                        <span className="font-bold text-foreground">
                            {data.overall.games.toLocaleString()} regular-season games
                        </span>{' '}
                        from {data.overall.fromSeason} to {data.overall.toSeason}, the
                        favourite covered{' '}
                        <span className="font-bold text-foreground">{cover}</span> of the
                        time — and in every bucket below, between 47 and 51. That is not a
                        flaw in the market, it is the market doing its job: the line moves
                        until the money is even. Straight up is a different story, and the
                        same chart tells it.
                    </p>
                    <CoverChart rows={data.calibration} />
                </section>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-widest font-bold
                                 text-muted-foreground/40 mr-1">
                    Week
                </span>
                {data.weeks.map(w => (
                    <button key={w} type="button" onClick={() => setWeek(w)}
                        aria-pressed={w === data.week}
                        className={cn(`px-2 py-0.5 rounded text-[11px] font-semibold
                                       tabular-nums transition-colors`,
                            w === data.week
                                ? 'bg-white/[0.12] text-foreground'
                                : 'text-muted-foreground/50 hover:text-foreground/80 '
                                  + 'hover:bg-white/[0.05]')}>
                        {w}
                    </button>
                ))}
            </div>

            {data.games.length === 0 ? (
                <p className="text-[12px] text-muted-foreground/50 py-2">
                    No games priced for this week yet.
                </p>
            ) : (
                <GameTable games={data.games} sort={sort} onSort={setSort} />
            )}
        </div>
    );
}
