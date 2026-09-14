'use client';

import React from 'react';
import Link from 'next/link';
import { CHART_INK, DIVERGING, MARK, SERIES } from '@/lib/vizTokens';
import { MIN_ATTENDANCE_GAMES } from '@/lib/durability';
import type { ProfileAvailability } from '@/app/redraft/players/[slug]/page';

/**
 * Whether he is there, and who plays if he is not.
 *
 * A profile can show three seasons of production in full and never once say
 * that one of them was ten games rather than seventeen. It is the largest
 * single input to what a player is worth over a season and the one every
 * projection assumes away by pricing a full year, and it was missing from a
 * page that finds room for yards before contact.
 *
 * Two halves, because a reader arrives here for one or the other. From the
 * board or a lineup, the question is his own attendance and who takes over.
 * From the waiver wire, it is the opposite one — whose job this man was
 * measured taking, which is the entire case for holding him.
 */

/**
 * Missed games against the position, on a scale a reader can place.
 *
 * The raw count is nearly useless alone: "missed seven" means one thing for
 * a running back and another for a kicker, and nobody carries thirty
 * positional baselines in their head. The percentile is the comparison, and
 * the median peer beside it is what gives the percentile a size.
 */
function DurabilityBar({ percentile }: { percentile: number }) {
    /**
     * Green above the middle and red below it, because this axis has a real
     * middle: the median man at the position. A sequential ramp would be
     * saying "more is more", and what is actually being said is "better or
     * worse than the men you would compare him to".
     */
    const tone = percentile >= 60 ? DIVERGING.positive
        : percentile <= 40 ? DIVERGING.negative
        : DIVERGING.zero;
    return (
        <span className="relative block h-[7px] rounded-full overflow-hidden"
            style={{ background: CHART_INK.grid }} aria-hidden>
            <span className="absolute inset-y-0 left-0"
                style={{ width: `${percentile}%`, background: tone,
                    borderRadius: MARK.barRadius }} />
            {/* The median, drawn rather than implied. */}
            <span className="absolute inset-y-0"
                style={{ left: '50%', width: 1, background: 'rgba(255,255,255,0.35)' }} />
        </span>
    );
}

function Line({ children }: { children: React.ReactNode }) {
    return <p className="text-[11.5px] leading-relaxed">{children}</p>;
}

const linked = (name: string, slug: string | null) => slug
    ? <Link href={`/redraft/players/${slug}`} className="font-semibold
        hover:underline underline-offset-2">{name}</Link>
    : <span className="font-semibold">{name}</span>;

export function Availability({ data, name }: {
    data: ProfileAvailability;
    name: string;
}) {
    const d = data.durability;
    const games = d.played + d.missed;
    const surname = name.split(' ').slice(-1)[0];

    return (
        <section id="availability" className="scroll-mt-28">
            <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-bold">Availability</h2>
                <span className="text-[11px] text-muted-foreground">
                    {data.from}–{data.to} · measured from the game logs
                </span>
            </div>

            <div className="rounded-2xl border border-white/[0.05] p-4 space-y-4"
                style={{ background: 'var(--bg-card)' }}>

                <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-[13px] font-bold tabular-nums">
                            {d.missed === 0
                                ? `Played all ${games}`
                                : `Missed ${d.missed} of ${games}`}
                        </span>
                        {d.percentile != null && (
                            <span className="text-[11px] tabular-nums"
                                style={{ color: CHART_INK.context }}>
                                more available than {d.percentile.toFixed(0)}% of{' '}
                                {d.peers} others at the position
                            </span>
                        )}
                    </div>
                    {d.percentile != null && (
                        <div className="mt-1.5"><DurabilityBar percentile={d.percentile} /></div>
                    )}
                    <p className="text-[10.5px] mt-1.5" style={{ color: CHART_INK.context }}>
                        {d.percentile != null ? (
                            <>
                                He has missed {(d.rate * 100).toFixed(0)}% of his team&rsquo;s
                                games; the middle man at his position missed{' '}
                                {d.medianRate == null ? '—' : `${(d.medianRate * 100).toFixed(0)}%`}.
                                {' '}A missed game is a week his team played and he did not
                                — byes are not counted, and neither are weeks before he
                                joined the team.
                            </>
                        ) : (
                            <>
                                {games < MIN_ATTENDANCE_GAMES
                                    // Not a gap in the data: a rate off four
                                    // games would swing further on one absence
                                    // than the whole league spans.
                                    ? `Too few games in the window to rank — ${games} is not `
                                      + 'enough for a rate to mean anything.'
                                    : 'Too few comparable men at this position to rank '
                                      + 'against in this window.'}
                            </>
                        )}
                    </p>
                </div>

                {data.covers.length > 0 && (
                    <div className="pt-3 border-t border-white/[0.06]">
                        <h3 className="text-[10px] uppercase tracking-widest font-bold
                                       text-muted-foreground/45 mb-1.5">
                            Whose job he was measured taking
                        </h3>
                        <div className="space-y-1.5">
                            {data.covers.map(c => {
                                const theirs = c.missed + c.played;
                                return (
                                    <Line key={c.id}>
                                        <span style={{ color: SERIES.b }}>●</span>{' '}
                                        {linked(c.name, c.slug)}
                                        <span style={{ color: CHART_INK.context }}>
                                            {' '}scores {c.points.toFixed(1)} a game and has
                                            missed {c.missed} of {theirs}. Across those,{' '}
                                            {surname} scored{' '}
                                            <span className="font-semibold tabular-nums"
                                                style={{ color: 'inherit' }}>
                                                {c.pointsOut.toFixed(1)}
                                            </span>{' '}
                                            a game over {c.games}
                                            {c.absorbed != null
                                                && `, on ${(c.absorbed * 100).toFixed(0)}% of his touches`}.
                                        </span>
                                    </Line>
                                );
                            })}
                        </div>
                    </div>
                )}

                {data.successors.length > 0 && (
                    <div className="pt-3 border-t border-white/[0.06]">
                        <h3 className="text-[10px] uppercase tracking-widest font-bold
                                       text-muted-foreground/45 mb-1.5">
                            Who took the work when he was out
                        </h3>
                        <div className="space-y-1.5">
                            {data.successors.map((s, i) => (
                                <Line key={s.id}>
                                    <span style={{ color: i === 0 ? SERIES.a : SERIES.b }}>●</span>{' '}
                                    {linked(s.name, s.slug)}
                                    <span style={{ color: CHART_INK.context }}>
                                        {' '}scored{' '}
                                        <span className="font-semibold tabular-nums">
                                            {s.pointsOut.toFixed(1)}
                                        </span>{' '}
                                        a game over {s.games}
                                        {s.lift != null && (
                                            <>
                                                , {s.lift >= 0 ? 'up' : 'down'}{' '}
                                                {Math.abs(s.lift).toFixed(1)} on his own average
                                            </>
                                        )}
                                        {s.absorbed != null
                                            && `, on ${(s.absorbed * 100).toFixed(0)}% of ${surname}'s touches`}.
                                    </span>
                                </Line>
                            ))}
                        </div>
                    </div>
                )}

                {d.missed > 0 && data.successors.length === 0 && data.covers.length === 0 && (
                    <p className="text-[10.5px] pt-3 border-t border-white/[0.06]"
                        style={{ color: CHART_INK.context }}>
                        Nobody at his position picked up enough of the work across those
                        weeks to name — or the men who did have since left the team.
                    </p>
                )}
            </div>
        </section>
    );
}
