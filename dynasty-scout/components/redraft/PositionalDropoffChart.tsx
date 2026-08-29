'use client';

import React, { useMemo, useState } from 'react';
import {
    CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
    Tooltip, XAxis, YAxis,
} from 'recharts';
import { POSITION_PILL_ACTIVE, POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface DropoffPlayer {
    slug: string;
    full_name: string;
    position: string;
    nfl_team: string | null;
    proj_points: number;
    /** 1-based rank within the position, by projected points. */
    pos_rank: number;
}

interface Props {
    players: DropoffPlayer[];
}

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;
type Pos = typeof POSITIONS[number];

/** Dedicated starting slots per team — the same roster the mock draft uses. */
const STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 };

const LEAGUE_SIZES = [10, 12, 14] as const;
const DEPTHS = [24, 48, 96, 0] as const;   // 0 = every ranked player

type Mode = 'points' | 'vor';

interface Row {
    rank: number;
    [key: string]: number | string | null | undefined;
}

export function PositionalDropoffChart({ players }: Props) {
    const [visible, setVisible] = useState<Set<Pos>>(new Set(['QB', 'RB', 'WR', 'TE']));
    const [mode, setMode] = useState<Mode>('points');
    const [teams, setTeams] = useState<number>(12);
    const [depth, setDepth] = useState<number>(48);

    const byPosition = useMemo(() => {
        const m = new Map<Pos, DropoffPlayer[]>();
        for (const p of players) {
            const pos = p.position as Pos;
            if (!POSITIONS.includes(pos)) continue;
            (m.get(pos) ?? m.set(pos, []).get(pos)!).push(p);
        }
        for (const list of m.values()) list.sort((a, b) => a.pos_rank - b.pos_rank);
        return m;
    }, [players]);

    /**
     * The replacement-level player at each position: the last one who would
     * start in a league this size. Only dedicated slots count — the FLEX is
     * left out, so RB and WR baselines are deliberately conservative.
     */
    const replacement = useMemo(() => {
        const out = {} as Record<Pos, { rank: number; points: number; name: string } | null>;
        for (const pos of POSITIONS) {
            const list = byPosition.get(pos) ?? [];
            const rank = teams * STARTERS[pos];
            const player = list[rank - 1];
            out[pos] = player
                ? { rank, points: player.proj_points, name: player.full_name }
                : null;
        }
        return out;
    }, [byPosition, teams]);

    const maxRank = useMemo(() => {
        const longest = Math.max(1, ...POSITIONS
            .filter(p => visible.has(p))
            .map(p => (byPosition.get(p) ?? []).length));
        return depth === 0 ? longest : Math.min(depth, longest);
    }, [byPosition, visible, depth]);

    /** One row per rank, one key per position — so the tooltip can compare them. */
    const data = useMemo<Row[]>(() => {
        const rows: Row[] = [];
        for (let rank = 1; rank <= maxRank; rank++) {
            const row: Row = { rank };
            for (const pos of POSITIONS) {
                if (!visible.has(pos)) continue;
                const p = (byPosition.get(pos) ?? [])[rank - 1];
                if (!p) continue;
                const base = replacement[pos]?.points ?? 0;
                row[pos] = mode === 'vor'
                    ? Math.round((p.proj_points - base) * 10) / 10
                    : Math.round(p.proj_points * 10) / 10;
                row[`${pos}__name`] = p.full_name;
                row[`${pos}__team`] = p.nfl_team ?? 'FA';
                row[`${pos}__slug`] = p.slug;
            }
            rows.push(row);
        }
        return rows;
    }, [byPosition, visible, maxRank, mode, replacement]);

    function togglePosition(pos: Pos) {
        setVisible(prev => {
            const next = new Set(prev);
            if (next.has(pos)) next.delete(pos); else next.add(pos);
            return next;
        });
    }

    const shown = POSITIONS.filter(p => visible.has(p));

    return (
        <div className="space-y-4">
            {/* ── Controls: one row above the chart ── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                    {POSITIONS.map(pos => {
                        const on = visible.has(pos);
                        const style = POSITION_PILL_ACTIVE[pos];
                        return (
                            <button
                                key={pos}
                                onClick={() => togglePosition(pos)}
                                aria-pressed={on}
                                className={cn(
                                    'px-2.5 h-8 rounded-lg border text-[12px] font-bold transition-all',
                                    on ? style.active : style.inactive,
                                )}
                            >
                                {pos === 'DST' ? 'D/ST' : pos}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1">
                    {([['points', 'Points'], ['vor', 'Over replacement']] as const).map(([v, label]) => (
                        <button
                            key={v}
                            onClick={() => setMode(v)}
                            className={cn(
                                'px-2.5 py-1 rounded-md text-[12px] font-bold transition-colors',
                                mode === v ? 'bg-sky-500/20 text-sky-300' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1">
                    {LEAGUE_SIZES.map(n => (
                        <button
                            key={n}
                            onClick={() => setTeams(n)}
                            title={`${n}-team league`}
                            className={cn(
                                'px-2.5 py-1 rounded-md text-[12px] font-bold transition-colors',
                                teams === n ? 'bg-sky-500/20 text-sky-300' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {n}tm
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1 ml-auto">
                    {DEPTHS.map(d => (
                        <button
                            key={d}
                            onClick={() => setDepth(d)}
                            className={cn(
                                'px-2.5 py-1 rounded-md text-[12px] font-bold transition-colors',
                                depth === d ? 'bg-sky-500/20 text-sky-300' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {d === 0 ? 'All' : `Top ${d}`}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Chart ── */}
            <div className="rounded-2xl border border-white/[0.05] p-3 sm:p-4" style={{ background: 'var(--bg-card)' }}>
                {shown.length === 0 ? (
                    <div className="h-[420px] grid place-items-center text-sm text-muted-foreground">
                        Turn a position on to see its curve.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={440}>
                        <LineChart data={data} margin={{ top: 10, right: 44, bottom: 24, left: 4 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis
                                dataKey="rank"
                                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                label={{
                                    value: 'Positional rank', position: 'insideBottom', offset: -12,
                                    fill: 'rgba(255,255,255,0.4)', fontSize: 11,
                                }}
                            />
                            <YAxis
                                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                width={48}
                                label={{
                                    value: mode === 'vor' ? 'Points over replacement' : 'Projected points',
                                    angle: -90, position: 'insideLeft', offset: 12,
                                    fill: 'rgba(255,255,255,0.4)', fontSize: 11,
                                    style: { textAnchor: 'middle' },
                                }}
                            />
                            {mode === 'vor' && (
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
                            )}
                            {/* Where the last starter at each position goes off the board */}
                            {mode === 'points' && shown.map(pos => {
                                const r = replacement[pos];
                                if (!r || r.rank > maxRank) return null;
                                return (
                                    <ReferenceLine
                                        key={`repl-${pos}`}
                                        x={r.rank}
                                        stroke={POSITION_RAW[pos]}
                                        strokeOpacity={0.28}
                                        strokeDasharray="3 4"
                                    />
                                );
                            })}
                            <Tooltip
                                cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                                content={<DropoffTooltip mode={mode} shown={shown} replacement={replacement} />}
                            />
                            {shown.map(pos => (
                                <Line
                                    key={pos}
                                    type="monotone"
                                    dataKey={pos}
                                    name={pos}
                                    stroke={POSITION_RAW[pos]}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--bg-card)' }}
                                    connectNulls={false}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Legend — identity never rests on colour alone */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {shown.map(pos => {
                    const r = replacement[pos];
                    return (
                        <span key={pos} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="w-3 h-[2px] rounded-full" style={{ background: POSITION_RAW[pos] }} />
                            <span className="font-bold text-foreground/80">{pos === 'DST' ? 'D/ST' : pos}</span>
                            {r && (
                                <span className="text-muted-foreground/60">
                                    replacement {pos}{r.rank} · {Math.round(r.points)} pts
                                </span>
                            )}
                        </span>
                    );
                })}
            </div>

            <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
                Each line is a position ordered by 2026 projected PPR points, so the steep stretches
                are where waiting costs you the most and the flat stretches are where it costs you
                nothing. Replacement level is the last player who starts in a {teams}-team league
                ({Object.entries(STARTERS).map(([p, n]) => `${n} ${p}`).join(', ')}); the FLEX is not
                allocated, so the RB and WR baselines are deliberately conservative. Dashed vertical
                lines mark that cutoff. Projections are averaged across sources — positions with few
                projection sources will look smoother than they are.
            </p>
        </div>
    );
}

interface TooltipProps {
    active?: boolean;
    label?: number | string;
    mode: Mode;
    shown: Pos[];
    replacement: Record<Pos, { rank: number; points: number; name: string } | null>;
    payload?: { payload: Row }[];
}

function DropoffTooltip({ active, label, payload, mode, shown, replacement }: TooltipProps) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;

    return (
        <div className="rounded-xl border border-white/[0.08] px-3 py-2 shadow-xl"
            style={{ background: 'rgba(10,15,22,0.96)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold mb-1.5">
                Positional rank {label}
            </div>
            <div className="space-y-1">
                {shown.map(pos => {
                    const value = row[pos];
                    if (typeof value !== 'number') return null;
                    const name = row[`${pos}__name`] as string | undefined;
                    const team = row[`${pos}__team`] as string | undefined;
                    const base = replacement[pos]?.points;
                    const vor = base != null && typeof row[pos] === 'number'
                        ? (mode === 'vor' ? value : value - base)
                        : null;
                    return (
                        <div key={pos} className="flex items-center gap-2 text-[12px]">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                style={{ background: POSITION_RAW[pos] }} />
                            <span className="font-bold w-9 flex-shrink-0 text-foreground/80">
                                {pos === 'DST' ? 'D/ST' : pos}
                            </span>
                            <span className="flex-1 truncate text-foreground">{name ?? '—'}</span>
                            <span className="text-muted-foreground/60 text-[11px]">{team}</span>
                            <span className="font-bold font-[var(--font-jetbrains),monospace] w-12 text-right">
                                {value.toFixed(1)}
                            </span>
                            {mode === 'points' && vor != null && (
                                <span className={cn(
                                    'font-[var(--font-jetbrains),monospace] text-[11px] w-14 text-right',
                                    vor >= 0 ? 'text-emerald-400/80' : 'text-muted-foreground/50',
                                )}>
                                    {vor >= 0 ? '+' : ''}{vor.toFixed(1)} VOR
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] text-[10px] text-muted-foreground/50">
                Click a position chip above to add or remove a curve
            </div>
        </div>
    );
}
