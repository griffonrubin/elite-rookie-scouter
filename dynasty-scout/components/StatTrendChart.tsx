'use client';

/**
 * StatTrendChart
 * Year-over-year production bar chart using Recharts.
 * Shows career arc at a glance — stacked bars by stat category per season.
 */

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    Legend,
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
    pass:  '#22d3ee',   // cyan
    rush:  '#34d399',   // emerald
    rec:   '#e879f9',   // fuchsia
    rushRB:'#34d399',
    recRB: '#fb923c',   // orange
};

function CustomTooltip({ active, payload, label, position }: any) {
    if (!active || !payload?.length) return null;

    const gp = payload[0]?.payload?.games_played;
    const tds = payload[0]?.payload?.total_tds;

    return (
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
            <p className="font-bold text-foreground mb-1">{label} Season</p>
            {payload.map((entry: any) => (
                <p key={entry.name} style={{ color: entry.color }} className="font-mono">
                    {entry.name}: {entry.value?.toLocaleString()}
                </p>
            ))}
            {gp && <p className="text-muted-foreground mt-1">GP: {gp} | TDs: {tds ?? '—'}</p>}
        </div>
    );
}

export function StatTrendChart({ stats, position }: Props) {
    if (!stats || stats.length < 2) return null;

    // Build chart data sorted ascending by year
    const sorted = [...stats].sort((a, b) => a.season - b.season);

    const data = sorted.map(s => {
        const base = {
            season: String(s.season),
            games_played: s.games_played ?? 0,
            total_tds: (s.rush_tds ?? 0) + (s.rec_tds ?? 0) + (s.pass_tds ?? 0),
        };

        if (position === 'QB') {
            return {
                ...base,
                'Pass Yds': s.pass_yards ?? 0,
                'Rush Yds': s.rush_yards ?? 0,
            };
        }
        if (position === 'RB') {
            return {
                ...base,
                'Rush Yds': s.rush_yards ?? 0,
                'Rec Yds': s.rec_yards ?? 0,
            };
        }
        // WR / TE
        return {
            ...base,
            'Rec Yds': s.rec_yards ?? 0,
            'Rush Yds': (s.rush_yards ?? 0) > 0 ? s.rush_yards : undefined,
        };
    });

    const bars: { key: string; color: string }[] = position === 'QB'
        ? [{ key: 'Pass Yds', color: COLORS.pass }, { key: 'Rush Yds', color: COLORS.rush }]
        : position === 'RB'
        ? [{ key: 'Rush Yds', color: COLORS.rushRB }, { key: 'Rec Yds', color: COLORS.recRB }]
        : [{ key: 'Rec Yds', color: COLORS.rec }, { key: 'Rush Yds', color: COLORS.rush }];

    return (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Production by Season
                </h3>
                <span className="text-[10px] text-muted-foreground/60 font-mono">Yards</span>
            </div>

            <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                        dataKey="season"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 9, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                    />
                    <Tooltip content={<CustomTooltip position={position} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    {bars.map(({ key, color }) => (
                        key === 'Rush Yds' && (position === 'WR' || position === 'TE')
                            ? <Bar key={key} dataKey={key} stackId="a" fill={color} radius={[0, 0, 0, 0]} opacity={0.6} />
                            : <Bar key={key} dataKey={key} stackId="a" fill={color} radius={[3, 3, 0, 0]} />
                    ))}
                </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 justify-center">
                {bars.filter(b => !(b.key === 'Rush Yds' && (position === 'WR' || position === 'TE'))).map(({ key, color }) => (
                    <div key={key} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                        <span className="text-[10px] text-muted-foreground">{key}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
