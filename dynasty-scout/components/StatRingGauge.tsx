interface StatRingGaugeProps {
    label: string;
    displayValue: string;
    /** 0–100 fill percentage for the arc */
    pct: number;
    size?: number;
    strokeWidth?: number;
}

function pctColor(pct: number): string {
    if (pct >= 80) return '#10b981'; // emerald
    if (pct >= 60) return '#06b6d4'; // cyan
    if (pct >= 40) return '#eab308'; // yellow
    if (pct >= 20) return '#f97316'; // orange
    return '#ef4444';                // red
}

export function StatRingGauge({ label, displayValue, pct, size = 88, strokeWidth = 9 }: StatRingGaugeProps) {
    const hasData = displayValue !== '—' && !isNaN(pct);
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;
    // 270° arc: starts at 135° (bottom-left), sweeps clockwise
    const startAngle = 135;
    const sweep = 270;
    const filled = hasData ? Math.min(100, Math.max(0, pct)) / 100 * sweep : 0;
    const color = hasData ? pctColor(pct) : 'rgba(255,255,255,0.12)';

    function polarToXY(angleDeg: number, r: number) {
        const rad = (angleDeg - 90) * (Math.PI / 180);
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    function describeArc(startDeg: number, sweepDeg: number, r: number) {
        const end = startDeg + sweepDeg;
        const s = polarToXY(startDeg, r);
        const e = polarToXY(end, r);
        const large = sweepDeg > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
    }

    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Track arc */}
                <path
                    d={describeArc(startAngle, sweep, radius)}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
                {/* Filled arc */}
                {filled > 1 && (
                    <path
                        d={describeArc(startAngle, filled, radius)}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        style={{ filter: hasData ? `drop-shadow(0 0 4px ${color}60)` : undefined }}
                    />
                )}
                {/* Center value */}
                <text
                    x={cx}
                    y={cy - 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={size < 80 ? 11 : 13}
                    fontFamily="monospace"
                    fontWeight="700"
                    fill={hasData ? color : 'rgba(255,255,255,0.3)'}
                >
                    {displayValue}
                </text>
            </svg>
            <span className="text-[10px] text-muted-foreground/70 font-medium text-center leading-tight">
                {label}
            </span>
        </div>
    );
}
