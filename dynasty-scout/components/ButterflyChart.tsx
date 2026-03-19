export interface ButterflyRow {
    /** Left side: efficiency metric */
    effLabel: string;
    effValue: string;
    /** Percentile rank (1 = best) for the efficiency metric */
    rank: number | null;
    total: number;
    /** Right side: production / career total */
    prodLabel: string;
    prodValue: string;
}

interface ButterflyChartProps {
    rows: ButterflyRow[];
    effTitle?: string;
    prodTitle?: string;
    rankTitle?: string;
}

function rankColor(rank: number, total: number): string {
    const pct = ((total - rank + 1) / total) * 100;
    if (pct >= 80) return '#10b981';
    if (pct >= 60) return '#06b6d4';
    if (pct >= 40) return '#eab308';
    if (pct >= 20) return '#f97316';
    return '#ef4444';
}

export function ButterflyChart({
    rows,
    effTitle = 'Efficiency',
    prodTitle = 'Production',
    rankTitle = 'Percentile Ranks',
}: ButterflyChartProps) {
    const visible = rows.filter(r => r.effValue !== '—' || r.prodValue !== '—');
    if (visible.length === 0) return null;

    return (
        <div className="bg-card/50 border border-border/40 rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_2fr_1fr] border-b border-border/30 px-4 py-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-right pr-3">{effTitle}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center">{rankTitle}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-left pl-3">{prodTitle}</span>
            </div>

            <div className="divide-y divide-border/20">
                {rows.map((row, i) => {
                    const hasPct = row.rank != null && row.total > 0;
                    const fillPct = hasPct ? Math.max(2, ((row.total - row.rank! + 1) / row.total) * 100) : 0;
                    const color = hasPct ? rankColor(row.rank!, row.total) : 'rgba(255,255,255,0.12)';
                    const pctLabel = hasPct ? `${Math.round(fillPct)}%` : null;

                    return (
                        <div key={i} className="grid grid-cols-[1fr_2fr_1fr] items-center px-4 py-[5px] hover:bg-white/[0.02] transition-colors">
                            {/* Left: eff value + label */}
                            <div className="flex items-center justify-end gap-2 pr-3 min-w-0">
                                <span className="text-[10px] text-muted-foreground/50 font-medium truncate text-right">{row.effLabel}</span>
                                <span className="text-[11px] font-mono font-bold text-foreground/80 shrink-0 tabular-nums">{row.effValue}</span>
                            </div>

                            {/* Center: percentile bar */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-[14px] bg-white/5 rounded overflow-hidden relative">
                                    <div
                                        className="h-full rounded transition-all duration-300"
                                        style={{
                                            width: hasPct ? `${fillPct}%` : '0%',
                                            background: hasPct
                                                ? `linear-gradient(90deg, ${color}50, ${color}95)`
                                                : undefined,
                                            boxShadow: hasPct ? `inset 0 0 0 1px ${color}40` : undefined,
                                        }}
                                    />
                                </div>
                                <span
                                    className="text-[10px] font-bold font-mono w-8 text-right shrink-0 tabular-nums"
                                    style={{ color: hasPct ? color : 'rgba(255,255,255,0.2)' }}
                                >
                                    {pctLabel ?? '—'}
                                </span>
                            </div>

                            {/* Right: prod label + value */}
                            <div className="flex items-center justify-start gap-2 pl-3 min-w-0">
                                <span className="text-[11px] font-mono font-bold text-foreground/80 shrink-0 tabular-nums">{row.prodValue}</span>
                                <span className="text-[10px] text-muted-foreground/50 font-medium truncate">{row.prodLabel}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
