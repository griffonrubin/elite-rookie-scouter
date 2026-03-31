'use client';

/**
 * StatTrendChart
 * Year-over-year production bar chart using Recharts.
 * Shows career arc at a glance — stacked bars by stat category per season.
 * Features: gradient fills, 1000-yard reference line, best-season callout.
 */

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts';

interface SeasonRow {
    season: number;
    games_played?: number | null;
    rush_yards?: number | null;
    rec_yards?: number | null;
    pass_yards?: number | null;
    rush_tds?: number | null;
    rec_tds?: number | null;
    pass_tds?: number | null;
    rush_attempts?: number | null;
    completions?: number | null;
    pass_attempts?: number | null;
}

interface Props {
    stats: SeasonRow[];
    position: string;
}

const COLORS = {
    pass:   { fill: '#22d3ee', gradient: ['#22d3ee', '#0891b2'] },
    rush:   { fill: '#34d399', gradient: ['#34d399', '#059669'] },
    rec:    { fill: '#e879f9', gradient: ['#e879f9', '#a855f7'] },
    rushRB: { fill: '#34d399', gradient: ['#34d399', '#059669'] },
    recRB:  { fill: '#fb923c', gradient: ['#fb923c', '#ea580c'] },
};

function CustomTooltip({ active, payload, label, position }: any) {
    if (!active || !payload?.length) return null;

    const gp = payload[0]?.payload?.games_played;
    const tds = payload[0]?.payload?.total_tds;
    const totalYds = payload.reduce((s: number, e: any) => s + (e.value || 0), 0);

    return (
        <div className="bg-card/95 border border-border/60 rounded-lg px-3 py-2.5 shadow-2xl text-xs backdrop-blur-sm">
            <p className="font-bold text-foreground mb-1.5 text-sm">{label} Season</p>
            {payload.map((entry: any) => (
                <p key={entry.name} style={{ color: entry.color }} className="font-mono font-semibold">
                    {entry.name}: {entry.value?.toLocaleString()}
                </p>
            ))}
            <div className="border-t border-border/30 mt-1.5 pt-1.5 flex items-center justify-between text-muted-foreground">
                <span>GP: {gp || '—'}</span>
                <span>TDs: {tds ?? '—'}</span>
                <span className="font-bold text-foreground">Total: {totalYds.toLocaleString()}</span>
            </div>
        </div>
    );
}

export function StatTrendChart({ stats, position }: Props) {
    if (!stats || stats.length < 1) return null;

    const sorted = [...stats].sort((a, b) => a.season - b.season);

    const data = sorted.map(s => {
        const base = {
            season: String(s.season),
            games_played: s.games_played ?? 0,
            total_tds: (s.rush_tds ?? 0) + (s.rec_tds ?? 0) + (s.pass_tds ?? 0),
        };

        if (position === 'QB') {
            return { ...base, 'Pass Yds': s.pass_yards ?? 0, 'Rush Yds': s.rush_yards ?? 0 };
        }
        if (position === 'RB') {
            return { ...base, 'Rush Yds': s.rush_yards ?? 0, 'Rec Yds': s.rec_yards ?? 0 };
        }
        return {
            ...base,
            'Rec Yds': s.rec_yards ?? 0,
            'Rush Yds': (s.rush_yards ?? 0) > 0 ? s.rush_yards : undefined,
        };
    });

    const bars: { key: string; colorKey: keyof typeof COLORS }[] = position === 'QB'
        ? [{ key: 'Pass Yds', colorKey: 'pass' }, { key: 'Rush Yds', colorKey: 'rush' }]
        : position === 'RB'
        ? [{ key: 'Rush Yds', colorKey: 'rushRB' }, { key: 'Rec Yds', colorKey: 'recRB' }]
        : [{ key: 'Rec Yds', colorKey: 'rec' }, { key: 'Rush Yds', colorKey: 'rush' }];

    // Compute max total yards for reference line visibility
    const maxTotal = Math.max(...data.map(d => {
        const primaryKey = bars[0].key;
        const secondaryKey = bars[1].key;
        return ((d as any)[primaryKey] || 0) + ((d as any)[secondaryKey] || 0);
    }));

    // Find best season (most total yards)
    let bestIdx = 0;
    let bestVal = 0;
    data.forEach((d, i) => {
        const total = bars.reduce((s, b) => s + ((d as any)[b.key] || 0), 0);
        if (total > bestVal) { bestVal = total; bestIdx = i; }
    });

    // Reference line threshold
    const refLine = position === 'QB' ? 3000 : 1000;
    const showRef = maxTotal >= refLine * 0.7;

    // Unique IDs for gradients (avoid SVG ID collisions)
    const gradientIds = bars.map((b, i) => 'grad-' + b.colorKey + '-' + i);

    return (
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/30 bg-muted/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                    Production by Season
                </span>
                <span className="text-[10px] text-muted-foreground/40 font-mono">Yards</span>
            </div>

            <div className="p-4">
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="20%">
                        <defs>
                            {bars.map((b, i) => {
                                const c = COLORS[b.colorKey];
                                return (
                                    <linearGradient key={gradientIds[i]} id={gradientIds[i]} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={c.gradient[0]} stopOpacity={0.9} />
                                        <stop offset="100%" stopColor={c.gradient[1]} stopOpacity={0.6} />
                                    </linearGradient>
                                );
                            })}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                            dataKey="season"
                            tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 9, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v)}
                        />
                        <Tooltip content={<CustomTooltip position={position} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

                        {showRef && (
                            <ReferenceLine
                                y={refLine}
                                stroke="rgba(250,204,21,0.25)"
                                strokeDasharray="6 4"
                                label={{
                                    value: refLine >= 3000 ? '3K yds' : '1K yds',
                                    position: 'right',
                                    fill: 'rgba(250,204,21,0.4)',
                                    fontSize: 9,
                                    fontWeight: 700,
                                }}
                            />
                        )}

                        {bars.map((b, i) => (
                            b.key === 'Rush Yds' && (position === 'WR' || position === 'TE')
                                ? <Bar key={b.key} dataKey={b.key} stackId="a" fill={'url(#' + gradientIds[i] + ')'} radius={[0, 0, 0, 0]} opacity={0.5} />
                                : <Bar key={b.key} dataKey={b.key} stackId="a" fill={'url(#' + gradientIds[i] + ')'} radius={[4, 4, 0, 0]} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Legend + best season callout */}
            <div className="px-5 py-3 border-t border-border/20 flex items-center gap-4 flex-wrap">
                {bars.filter(b => !(b.key === 'Rush Yds' && (position === 'WR' || position === 'TE'))).map(b => (
                    <div key={b.key} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[b.colorKey].fill }} />
                        <span className="text-[10px] text-muted-foreground">{b.key}</span>
                    </div>
                ))}
                {data.length > 1 && (
                    <span className="text-[10px] text-muted-foreground/35 ml-auto">
                        Peak: <span className="text-yellow-300/60 font-bold">{data[bestIdx].season}</span> ({bestVal.toLocaleString()} yds)
                    </span>
                )}
            </div>
        </div>
    );
}
