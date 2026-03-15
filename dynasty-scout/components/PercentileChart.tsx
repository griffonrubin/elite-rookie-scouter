'use client';

/**
 * PercentileChart
 * Bloomberg Terminal-style horizontal percentile bars.
 * Shows how a player ranks vs. all 2026 peers at their position.
 */

interface Metric {
    label: string;
    value: string | number;      // display value
    percentile: number;          // 0–100
    unit?: string;               // e.g. "yds", "%", "/g"
}

interface Props {
    metrics: Metric[];
    position: string;
}

function pctColor(p: number): string {
    if (p >= 80) return 'bg-emerald-500';
    if (p >= 60) return 'bg-cyan-500';
    if (p >= 40) return 'bg-yellow-500';
    if (p >= 20) return 'bg-orange-500';
    return 'bg-red-500';
}

function pctLabel(p: number): string {
    if (p >= 90) return 'Elite';
    if (p >= 75) return 'Above Avg';
    if (p >= 50) return 'Average';
    if (p >= 25) return 'Below Avg';
    return 'Low';
}

function pctTextColor(p: number): string {
    if (p >= 80) return 'text-emerald-400';
    if (p >= 60) return 'text-cyan-400';
    if (p >= 40) return 'text-yellow-400';
    if (p >= 20) return 'text-orange-400';
    return 'text-red-400';
}

export function PercentileChart({ metrics, position }: Props) {
    if (!metrics || metrics.length === 0) return null;

    return (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Position Percentiles
                </h3>
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                    vs. 2026 {position}s
                </span>
            </div>

            <div className="space-y-3">
                {metrics.map((m) => (
                    <div key={m.label} className="group">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground font-medium">{m.label}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-semibold text-foreground">
                                    {m.value}{m.unit ? ` ${m.unit}` : ''}
                                </span>
                                <span className={`text-[10px] font-bold font-mono ${pctTextColor(m.percentile)}`}>
                                    {Math.round(m.percentile)}th
                                </span>
                            </div>
                        </div>
                        <div className="relative h-1.5 bg-border/40 rounded-full overflow-hidden">
                            <div
                                className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${pctColor(m.percentile)}`}
                                style={{ width: `${Math.max(2, m.percentile)}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-0.5">
                            <span className="text-[9px] text-muted-foreground/40 font-mono">0</span>
                            <span className={`text-[9px] font-mono ${pctTextColor(m.percentile)}`}>
                                {pctLabel(m.percentile)}
                            </span>
                            <span className="text-[9px] text-muted-foreground/40 font-mono">100</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
