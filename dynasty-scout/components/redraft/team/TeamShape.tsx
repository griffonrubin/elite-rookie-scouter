'use client';

import React, { useState } from 'react';
import { POSITION_RAW } from '@/lib/constants';
import {
    AXIS_LABEL, AXIS_NOTE, PROFILE_AXES, type TeamProfile,
} from '@/lib/teamProfile';
import { Radar, RadarTable, RADAR_COLOURS, type RadarAxis, type RadarSeries }
    from './Radar';

/**
 * Where this roster stands, and against whom.
 *
 * Two shapes rather than one, because they answer different questions and
 * folding them together would put "receivers" and "upside" on the same axis
 * as if they were the same kind of claim. One is where your points come
 * from; the other is what sort of team you are — whether you win by being
 * reliable or by needing a ceiling game, and what happens when somebody
 * pulls a hamstring.
 *
 * A second roster can be laid over both. That is the feature: "third-best
 * receivers" is a ranking, and "your receivers against the team you play on
 * Sunday" is a matchup. It is also how a trade starts — the shape that shows
 * where you are strong enough to sell.
 */
export function TeamShape({ profiles, myKey }: {
    profiles: TeamProfile[];
    myKey: string | null;
}) {
    const [against, setAgainst] = useState<string | null>(null);
    const me = profiles.find(p => p.key === myKey) ?? profiles[0];
    const them = profiles.find(p => p.key === against) ?? null;
    if (!me) return null;
    const of = profiles.length;

    const positions = [...new Set(profiles.flatMap(p => Object.keys(p.byPosition)))]
        // A fixed order, so the shape is comparable between teams and
        // between visits. Alphabetical would put DST between two offensive
        // positions and make every roster look jagged for no reason.
        .sort((a, b) => {
            const ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
            return ORDER.indexOf(a) - ORDER.indexOf(b);
        })
        .filter(p => ORDERED.has(p));

    const posAxes: RadarAxis[] = positions.map(p => ({
        key: p, label: p,
        value: me.positionPct[p] ?? 50,
        raw: `${(me.byPosition[p] ?? 0).toFixed(1)} a week`,
        rank: me.positionRank[p] ?? 0, of,
    }));
    const qualityAxes: RadarAxis[] = PROFILE_AXES.map(a => ({
        // Short on the chart, full in the table: an SVG clips a long label
        // rather than wrapping it, and "Rest of sea:" is worse than "Season".
        key: a, label: AXIS_SHORT[a], full: AXIS_LABEL[a],
        value: me.axisPct[a],
        raw: a === 'depth' ? `${me.axes[a]}% kept` : `${me.axes[a]} a week`,
        rank: me.axisRank[a], of,
        note: AXIS_NOTE[a],
    }));

    const seriesFor = (kind: 'pos' | 'axis'): RadarSeries[] => {
        const pick = (p: TeamProfile) => kind === 'pos' ? p.positionPct : p.axisPct;
        const out: RadarSeries[] = [{
            key: me.key, name: `${me.name} — you`,
            colour: RADAR_COLOURS.mine, values: pick(me),
        }];
        if (them) {
            out.push({
                key: them.key, name: them.name,
                colour: RADAR_COLOURS.theirs, values: pick(them),
            });
        }
        return out;
    };

    const strongest = [...posAxes].sort((a, b) => a.rank - b.rank)[0];
    const weakest = [...posAxes].sort((a, b) => b.rank - a.rank)[0];

    return (
        <section className="rounded-xl border border-white/[0.07] p-4"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 mb-1">
                <h2 className="text-[10px] uppercase tracking-widest font-bold
                               text-muted-foreground/45">
                    Where this roster stands in the league
                </h2>
                <label className="flex items-center gap-1.5 text-[10px]
                                  text-muted-foreground/45">
                    lay over
                    <select value={against ?? ''}
                        onChange={e => setAgainst(e.target.value || null)}
                        aria-label="Compare against another team"
                        className="rounded px-1 py-0.5 text-[10px] font-bold
                                   text-foreground border border-white/[0.10]"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <option value="">nobody</option>
                        {profiles.filter(p => p.key !== me.key).map(p => (
                            <option key={p.key} value={p.key}>{p.name}</option>
                        ))}
                    </select>
                </label>
            </div>

            {/* The reading, in a sentence, because a shape is not a finding
                until somebody says what it shows. */}
            <p className="text-[11px] text-muted-foreground/60 max-w-[760px] mb-2">
                Strongest at <strong className="text-foreground">{strongest.label}</strong>
                {' '}({strongest.rank} of {of}), weakest at{' '}
                <strong className="text-foreground">{weakest.label}</strong>
                {' '}({weakest.rank} of {of}). Every axis is a place in this league
                rather than a raw total, so the dashed ring is an exactly average
                roster and the numbers behind each one are in the table.
            </p>

            {/* Chart beside its own table rather than above it. Stacked, the
                radar left three hundred pixels of nothing to its right and
                pushed the numbers a scroll away from the shape they explain. */}
            <div className="space-y-4">
                <div className="grid gap-x-5 gap-y-2 sm:grid-cols-[300px_minmax(0,1fr)]
                                items-start">
                    <Radar axes={posAxes} series={seriesFor('pos')}
                        title="Where the points come from"
                        subtitle="starters at each position, per week, ranked in the league" />
                    <RadarTable axes={posAxes} series={seriesFor('pos')} />
                </div>
                <div className="grid gap-x-5 gap-y-2 sm:grid-cols-[300px_minmax(0,1fr)]
                                items-start border-t border-white/[0.05] pt-3">
                    <Radar axes={qualityAxes} series={seriesFor('axis')}
                        title="What sort of team it is"
                        subtitle="the same roster, ranked on five different questions" />
                    <RadarTable axes={qualityAxes} series={seriesFor('axis')} />
                </div>
            </div>

            {/* Two series need a legend; one names itself in the title. */}
            {them && (
                <p className="text-[10px] text-muted-foreground/45 mt-2">
                    <span className="inline-flex items-center gap-1 mr-3">
                        <span className="w-2 h-2 rounded-full"
                            style={{ background: RADAR_COLOURS.mine }} />
                        {me.name} — you
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full"
                            style={{ background: RADAR_COLOURS.theirs }} />
                        {them.name}
                    </span>
                </p>
            )}

            <p className="text-[10px] text-muted-foreground/40 mt-2 leading-snug
                          max-w-[820px]">
                Positions are credited to whoever actually fills a slot, flex included,
                because a team playing three backs is strong at running back whatever
                the slot is called. A percentile rather than the raw number: a league
                where every roster is within four points a week would otherwise draw
                one team at the edge and another at the centre, which is a picture of
                noise — so the rank is the shape and the measurement sits beside it.
            </p>
        </section>
    );
}

const ORDERED = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);

/** Chart labels. The full names live in the table, where there is room. */
const AXIS_SHORT: Record<string, string> = {
    now: 'This week', season: 'Season', upside: 'Upside',
    floor: 'Floor', depth: 'Depth',
};
