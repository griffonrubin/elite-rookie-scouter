'use client';

import { cn } from '@/lib/utils';

interface WRTargetDepthBarProps {
    behindLine: number;
    short: number;
    intermediate: number;
    deep: number;
    className?: string;
}

const SEGMENTS = [
    { key: 'behindLine',    label: 'BL',    fullLabel: 'Behind LOS', color: 'bg-slate-400',   textColor: 'text-slate-300' },
    { key: 'short',         label: '0-9',   fullLabel: '0-9 yds',    color: 'bg-sky-500',     textColor: 'text-sky-300'   },
    { key: 'intermediate',  label: '10-19', fullLabel: '10-19 yds',  color: 'bg-amber-400',   textColor: 'text-amber-300' },
    { key: 'deep',          label: '20+',   fullLabel: '20+ yds',    color: 'bg-orange-500',  textColor: 'text-orange-300'},
] as const;

export function WRTargetDepthBar({ behindLine, short, intermediate, deep, className }: WRTargetDepthBarProps) {
    const values: Record<string, number> = { behindLine, short, intermediate, deep };
    const total = behindLine + short + intermediate + deep;
    if (total === 0) return null;

    return (
        <div className={cn('space-y-2', className)}>
            {/* Stacked bar */}
            <div className="flex h-7 rounded-md overflow-hidden gap-px">
                {SEGMENTS.map(seg => {
                    const pct = (values[seg.key] / total) * 100;
                    const show = pct >= 12;
                    return (
                        <div
                            key={seg.key}
                            className={cn('flex items-center justify-center transition-all', seg.color, 'opacity-80 hover:opacity-100')}
                            style={{ width: `${pct}%` }}
                            title={`${seg.fullLabel}: ${values[seg.key]}%`}
                        >
                            {show && (
                                <span className="text-[10px] font-bold text-white/90 leading-none">
                                    {values[seg.key]}%
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap">
                {SEGMENTS.map(seg => (
                    <span key={seg.key} className="flex items-center gap-1">
                        <span className={cn('inline-block w-2 h-2 rounded-sm', seg.color, 'opacity-80')} />
                        <span className="text-[10px] text-muted-foreground/70 font-medium">
                            {seg.fullLabel} <span className="font-bold text-foreground/80">{values[seg.key]}%</span>
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
}
