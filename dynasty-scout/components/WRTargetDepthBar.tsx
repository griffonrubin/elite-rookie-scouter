'use client';
import React from 'react';
import { cn } from '@/lib/utils';

interface Props {
    behindLine: number;
    short: number;
    intermediate: number;
    deep: number;
    peerWrAdv?: any[];
    className?: string;
}

function pctRank(val: number, arr: number[]): number {
    const valid = arr.filter(v => v != null && !isNaN(v));
    if (valid.length === 0) return 50;
    const below = valid.filter(v => v < val).length;
    return Math.round((below / valid.length) * 100);
}

function cellColor(pct: number): string {
    if (pct >= 85) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
    if (pct >= 65) return 'bg-green-500/20 border-green-500/35 text-green-300';
    if (pct >= 45) return 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300';
    if (pct >= 25) return 'bg-orange-500/15 border-orange-500/30 text-orange-300';
    return 'bg-red-500/15 border-red-500/30 text-red-300';
}

function archetypeLabel(bl: number, sh: number, mid: number, dp: number): string {
    if (bl >= 30) return 'SCREEN / CHECK-DOWN';
    if (dp >= 28) return 'DEEP THREAT';
    if (sh >= 45) return 'SHORT / SLOT FOCUS';
    if (mid >= 35 && dp < 20) return 'INTERMEDIATE ROUTE TREE';
    return 'BALANCED ROUTE TREE';
}

const SEGMENTS = [
    { label: 'Behind LOS', abbr: 'BL', color: 'bg-slate-400', key: 'behindLine' as const, invert: true },
    { label: '0-9 yds', abbr: '0-9', color: 'bg-sky-500', key: 'short' as const, invert: false },
    { label: '10-19 yds', abbr: '10-19', color: 'bg-amber-400', key: 'intermediate' as const, invert: false },
    { label: '20+ yds', abbr: '20+', color: 'bg-orange-500', key: 'deep' as const, invert: false },
];

export function WRTargetDepthBar({ behindLine, short, intermediate, deep, peerWrAdv, className }: Props) {
    const total = behindLine + short + intermediate + deep;
    if (total === 0) return null;
    const vals: Record<string, number> = { behindLine, short, intermediate, deep };

    const peers = peerWrAdv && peerWrAdv.length > 0 ? peerWrAdv : null;
    const peerBL  = peers ? peers.map((p: any) => p.depth_behind_line_pct).filter((v: any) => v != null) : [];
    const peerS   = peers ? peers.map((p: any) => p.depth_0_9_pct).filter((v: any) => v != null) : [];
    const peerM   = peers ? peers.map((p: any) => p.depth_10_19_pct).filter((v: any) => v != null) : [];
    const peerD   = peers ? peers.map((p: any) => p.depth_20plus_pct).filter((v: any) => v != null) : [];
    const peerArrs: Record<string, number[]> = { behindLine: peerBL, short: peerS, intermediate: peerM, deep: peerD };
    const archetype = archetypeLabel(behindLine, short, intermediate, deep);

    return (
        <div className={cn('space-y-3', className)}>
            {/* Proportional stacked bar */}
            <div className="flex rounded-lg overflow-hidden h-8 gap-px">
                {SEGMENTS.map(seg => {
                    const pct = vals[seg.key];
                    const width = (pct / total) * 100;
                    return (
                        <div key={seg.key}
                            className={cn('relative flex items-center justify-center', seg.color, 'opacity-80')}
                            style={{ width: `${width}%` }}
                            title={`${seg.label}: ${pct}%`}
                        >
                            {width >= 12 && (
                                <span className="text-[11px] font-black text-white/90 select-none">{pct}%</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 4 percentile cells */}
            {peers && (
                <div className="grid grid-cols-4 gap-2">
                    {SEGMENTS.map(seg => {
                        const val = vals[seg.key];
                        const arr = peerArrs[seg.key];
                        const rawPct = pctRank(val, arr);
                        const displayPct = seg.invert ? (100 - rawPct) : rawPct;
                        const colorClass = cellColor(displayPct);
                        return (
                            <div key={seg.key}
                                className={cn('rounded-lg p-2.5 border text-center', colorClass)}
                            >
                                <div className="text-base font-black font-[var(--font-jetbrains),monospace] leading-none">{val}%</div>
                                <div className="text-[9px] uppercase tracking-widest opacity-70 font-bold mt-1">{seg.abbr}</div>
                                <div className="text-[9px] opacity-50 mt-0.5">{displayPct}th</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* If no peers, show simple legend */}
            {!peers && (
                <div className="flex flex-wrap gap-3">
                    {SEGMENTS.map(seg => (
                        <div key={seg.key} className="flex items-center gap-1.5">
                            <div className={cn('w-2.5 h-2.5 rounded-sm', seg.color, 'opacity-80')} />
                            <span className="text-xs text-muted-foreground/70">
                                {seg.label} <span className="font-bold text-foreground/80">{vals[seg.key]}%</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Archetype tag */}
            <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[9px] uppercase tracking-widest font-black text-muted-foreground/40 px-2"
                    style={{ letterSpacing: '0.15em' }}
                >
                    {archetype}
                </span>
                <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
        </div>
    );
}
