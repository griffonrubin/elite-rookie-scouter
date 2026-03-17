interface DonutSplitProps {
    title: string;
    labelA: string;
    valueA: number | null;
    labelB: string;
    valueB: number | null;
    colorA: string;  // CSS hex color
    colorB: string;
}

export function DonutSplit({ title, labelA, valueA, colorA, labelB, valueB, colorB }: DonutSplitProps) {
    const hasData = valueA != null && valueB != null && (valueA + valueB) > 0;
    const total = hasData ? (valueA! + valueB!) : 1;
    const pctA = hasData ? valueA! / total : 0.5;
    const pctB = hasData ? valueB! / total : 0.5;

    const size = 84;
    const strokeWidth = 14;
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * radius;
    // Small gap between segments (2° in arc length)
    const gapFraction = 0.015;
    const dashA = (pctA - gapFraction) * circumference;
    const dashB = (pctB - gapFraction) * circumference;
    // Rotate so A starts at top (-90°)
    const rotA = -90;
    const rotB = rotA + pctA * 360;

    const fmtPct = (p: number) => `${Math.round(p * 100)}%`;
    const fmtVal = (v: number | null) => v != null ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)) : '—';

    return (
        <div className="bg-card border border-border/60 rounded-xl p-3 flex flex-col items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-widest">{title}</span>
            <div className="relative">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {/* Background circle */}
                    <circle
                        cx={cx} cy={cy} r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth={strokeWidth}
                    />
                    {/* Segment A */}
                    <circle
                        cx={cx} cy={cy} r={radius}
                        fill="none"
                        stroke={hasData ? colorA : 'rgba(255,255,255,0.15)'}
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${hasData ? dashA : circumference * 0.5} ${circumference}`}
                        strokeDashoffset={0}
                        transform={`rotate(${rotA} ${cx} ${cy})`}
                        strokeLinecap="butt"
                    />
                    {/* Segment B */}
                    <circle
                        cx={cx} cy={cy} r={radius}
                        fill="none"
                        stroke={hasData ? colorB : 'rgba(255,255,255,0.08)'}
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${hasData ? dashB : circumference * 0.5} ${circumference}`}
                        strokeDashoffset={0}
                        transform={`rotate(${rotB} ${cx} ${cy})`}
                        strokeLinecap="butt"
                    />
                    {/* Center text */}
                    {hasData ? (
                        <>
                            <text x={cx} y={cy - 5} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight="700" fill={colorA}>{fmtPct(pctA)}</text>
                            <text x={cx} y={cy + 9} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={colorB}>{fmtPct(pctB)}</text>
                        </>
                    ) : (
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontFamily="monospace" fill="rgba(255,255,255,0.2)">—</text>
                    )}
                </svg>
            </div>
            {/* Legend */}
            <div className="w-full space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorA }} />
                        <span className="text-muted-foreground/70">{labelA}</span>
                    </div>
                    <span className="font-mono font-bold" style={{ color: colorA }}>
                        {hasData ? fmtVal(valueA) : '—'}
                    </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorB }} />
                        <span className="text-muted-foreground/70">{labelB}</span>
                    </div>
                    <span className="font-mono font-bold" style={{ color: colorB }}>
                        {hasData ? fmtVal(valueB) : '—'}
                    </span>
                </div>
            </div>
        </div>
    );
}
