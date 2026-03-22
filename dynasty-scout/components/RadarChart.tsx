'use client';

/**
 * RadarChart
 * SVG spider chart showing two players across 6–8 normalized metrics.
 * No external dependencies — pure SVG.
 */

export interface RadarMetric {
    label: string;
    a: number;   // 0–100
    b: number;   // 0–100
}

interface Props {
    metrics: RadarMetric[];
    nameA: string;
    nameB: string;
    colorA?: string;
    colorB?: string;
}

function polarToXY(angle: number, r: number, cx: number, cy: number) {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function polyPath(vals: number[], maxR: number, cx: number, cy: number, n: number): string {
    return vals.map((v, i) => {
        const angle = (360 / n) * i;
        const r = (v / 100) * maxR;
        const p = polarToXY(angle, r, cx, cy);
        return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    }).join(' ') + ' Z';
}

export function RadarChart({ metrics, nameA, nameB, colorA = '#f97316', colorB = '#06b6d4' }: Props) {
    if (!metrics || metrics.length < 3) return null;

    const size = 340;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.37;
    const labelR = maxR + 26;
    const n = metrics.length;
    const rings = [25, 50, 75, 100];

    return (
        <div className="rounded-xl border border-border/40 bg-card/40">
            <div className="px-5 py-4 border-b border-border/30 bg-muted/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Attribute Radar</span>
                <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-1 rounded" style={{ background: colorA }} />
                        <span className="font-semibold text-muted-foreground/70">{nameA.split(' ').slice(-1)[0]}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-1 rounded" style={{ background: colorB }} />
                        <span className="font-semibold text-muted-foreground/70">{nameB.split(' ').slice(-1)[0]}</span>
                    </span>
                </div>
            </div>

            <div className="flex justify-center py-4 sm:py-6 overflow-visible px-2">
                <svg width="100%" height="auto" viewBox={`-40 -40 ${size + 80} ${size + 80}`} style={{ maxWidth: size + 80, maxHeight: size + 80 }}>
                    {/* Ring guides */}
                    {rings.map(pct => {
                        const r = (pct / 100) * maxR;
                        const pts = Array.from({ length: n }, (_, i) => {
                            const angle = (360 / n) * i;
                            const p = polarToXY(angle, r, cx, cy);
                            return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
                        }).join(' ') + ' Z';
                        return (
                            <path
                                key={pct}
                                d={pts}
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth={pct === 50 ? 1.5 : 1}
                            />
                        );
                    })}

                    {/* Axis lines */}
                    {metrics.map((_, i) => {
                        const angle = (360 / n) * i;
                        const outer = polarToXY(angle, maxR, cx, cy);
                        return (
                            <line
                                key={i}
                                x1={cx} y1={cy}
                                x2={outer.x.toFixed(2)} y2={outer.y.toFixed(2)}
                                stroke="rgba(255,255,255,0.07)"
                                strokeWidth={1}
                            />
                        );
                    })}

                    {/* Player A polygon */}
                    <path
                        d={polyPath(metrics.map(m => m.a), maxR, cx, cy, n)}
                        fill={colorA + '25'}
                        stroke={colorA}
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                    />

                    {/* Player B polygon */}
                    <path
                        d={polyPath(metrics.map(m => m.b), maxR, cx, cy, n)}
                        fill={colorB + '25'}
                        stroke={colorB}
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                    />

                    {/* Vertex dots A */}
                    {metrics.map((m, i) => {
                        const angle = (360 / n) * i;
                        const r = (m.a / 100) * maxR;
                        const p = polarToXY(angle, r, cx, cy);
                        return <circle key={`a${i}`} cx={p.x} cy={p.y} r={2.5} fill={colorA} />;
                    })}

                    {/* Vertex dots B */}
                    {metrics.map((m, i) => {
                        const angle = (360 / n) * i;
                        const r = (m.b / 100) * maxR;
                        const p = polarToXY(angle, r, cx, cy);
                        return <circle key={`b${i}`} cx={p.x} cy={p.y} r={2.5} fill={colorB} />;
                    })}

                    {/* Axis labels — overflow=visible lets them render outside SVG bounds */}
                    {metrics.map((m, i) => {
                        const angle = (360 / n) * i;
                        const p = polarToXY(angle, labelR, cx, cy);
                        return (
                            <text
                                key={`lbl${i}`}
                                x={p.x}
                                y={p.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={11}
                                fontFamily="monospace"
                                fontWeight="600"
                                fill="rgba(255,255,255,0.55)"
                            >
                                {m.label}
                            </text>
                        );
                    })}
                </svg>
            </div>

            {/* Score bars below chart */}
            <div className="px-5 pb-5 space-y-2.5">
                {metrics.map((m) => (
                    <div key={m.label} className="grid grid-cols-[1fr_80px_1fr] items-center gap-2">
                        {/* A bar (right-aligned) */}
                        <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs font-mono font-bold" style={{ color: colorA }}>{Math.round(m.a)}</span>
                            <div className="h-1.5 bg-border/20 rounded-full overflow-hidden w-full max-w-[80px]">
                                <div className="h-full rounded-full" style={{ width: `${m.a}%`, background: colorA, marginLeft: 'auto' }} />
                            </div>
                        </div>
                        {/* Label */}
                        <span className="text-xs text-muted-foreground/55 font-medium text-center uppercase tracking-wide">{m.label}</span>
                        {/* B bar (left-aligned) */}
                        <div className="flex items-center gap-2 justify-start">
                            <div className="h-1.5 bg-border/20 rounded-full overflow-hidden w-full max-w-[80px]">
                                <div className="h-full rounded-full" style={{ width: `${m.b}%`, background: colorB }} />
                            </div>
                            <span className="text-xs font-mono font-bold" style={{ color: colorB }}>{Math.round(m.b)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
