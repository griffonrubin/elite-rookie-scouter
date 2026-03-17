export interface RankingMetric {
    label: string;
    value: string;
    rank: number | null;
    total: number;
    higherIsBetter?: boolean;
}

interface SeasonRankingsChartProps {
    metrics: RankingMetric[];
    title?: string;
}

function rankColor(rank: number, total: number): string {
    const pct = ((total - rank + 1) / total) * 100;
    if (pct >= 80) return '#10b981';
    if (pct >= 60) return '#06b6d4';
    if (pct >= 40) return '#eab308';
    if (pct >= 20) return '#f97316';
    return '#ef4444';
}

export function SeasonRankingsChart({ metrics, title = 'Class Rankings' }: SeasonRankingsChartProps) {
    const visible = metrics.filter(m => m.rank != null && m.total > 0);
    if (visible.length === 0) return null;

    return (
        <div className="bg-card/50 border border-border/40 rounded-xl p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">{title}</h4>
            <div className="space-y-2">
                {metrics.map((m) => {
                    if (m.rank == null || m.total === 0) {
                        return (
                            <div key={m.label} className="flex items-center gap-2">
                                <span className="w-20 text-[10px] text-muted-foreground/50 font-medium shrink-0">{m.label}</span>
                                <div className="flex-1 h-4 rounded bg-white/5" />
                                <span className="w-16 text-right text-[10px] font-mono text-muted-foreground/30">—</span>
                            </div>
                        );
                    }
                    const fillPct = ((m.total - m.rank + 1) / m.total) * 100;
                    const color = rankColor(m.rank, m.total);
                    return (
                        <div key={m.label} className="flex items-center gap-2">
                            <span className="w-20 text-[10px] text-muted-foreground/70 font-medium shrink-0 truncate">{m.label}</span>
                            <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden relative">
                                <div
                                    className="h-full rounded transition-all"
                                    style={{
                                        width: `${Math.max(fillPct, 2)}%`,
                                        background: `linear-gradient(90deg, ${color}40, ${color}90)`,
                                        boxShadow: `inset 0 0 0 1px ${color}50`,
                                    }}
                                />
                            </div>
                            <div className="w-24 flex items-center justify-end gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono font-bold" style={{ color }}>
                                    Rnk: {m.rank}
                                </span>
                                <span className="text-[9px] text-muted-foreground/40 font-mono">
                                    ({m.value})
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
