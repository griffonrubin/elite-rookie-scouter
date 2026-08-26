'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, GraduationCap, Scale, TrendingUp, TrendingDown } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { WatchlistButton, REDRAFT_WATCHLIST_KEY } from '@/components/WatchlistButton';
import { POSITION_COLORS, POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { RedraftPlayer, NflSeasonStat, Projection } from '@/lib/types';
import { RedraftSourceRankings } from './RedraftSourceRankings';
import { SeasonTrendChart } from './SeasonTrendChart';

interface SourceRank {
    source: string;
    rank_overall: number;
    rank_positional: number | null;
    tier: number | null;
}

interface Props {
    player: RedraftPlayer & Record<string, any>;
    seasons: NflSeasonStat[];
    sourceRanks: SourceRank[];
    projections: Projection[];
    boardRank: number | null;
    prev: { slug: string; full_name: string } | null;
    next: { slug: string; full_name: string } | null;
}

/** Stat columns shown in the season table, per position. */
const SEASON_COLUMNS: Record<string, { key: string; label: string }[]> = {
    QB: [
        { key: 'completions', label: 'Cmp' }, { key: 'pass_attempts', label: 'Att' },
        { key: 'pass_yards', label: 'Yds' }, { key: 'pass_tds', label: 'TD' },
        { key: 'interceptions', label: 'Int' }, { key: 'carries', label: 'Ru' },
        { key: 'rush_yards', label: 'RuYd' }, { key: 'rush_tds', label: 'RuTD' },
    ],
    RB: [
        { key: 'carries', label: 'Att' }, { key: 'rush_yards', label: 'RuYd' },
        { key: 'rush_tds', label: 'RuTD' }, { key: 'targets', label: 'Tgt' },
        { key: 'receptions', label: 'Rec' }, { key: 'rec_yards', label: 'ReYd' },
        { key: 'rec_tds', label: 'ReTD' },
    ],
    WR: [
        { key: 'targets', label: 'Tgt' }, { key: 'receptions', label: 'Rec' },
        { key: 'rec_yards', label: 'ReYd' }, { key: 'rec_tds', label: 'ReTD' },
        { key: 'carries', label: 'Ru' }, { key: 'rush_yards', label: 'RuYd' },
    ],
    K: [
        { key: 'fg_made', label: 'FGM' }, { key: 'fg_att', label: 'FGA' },
        { key: 'fg_pct', label: 'FG%' }, { key: 'fg_made_50plus', label: '50+' },
        { key: 'fg_long', label: 'Long' }, { key: 'xp_made', label: 'XP' },
    ],
    DST: [
        { key: 'dst_sacks', label: 'Sck' }, { key: 'dst_ints', label: 'Int' },
        { key: 'dst_fum_rec', label: 'FR' }, { key: 'dst_tds', label: 'TD' },
        { key: 'dst_safeties', label: 'Sfty' }, { key: 'dst_points_allowed', label: 'PA' },
    ],
};

function fmt(v: any, digits = 0): string {
    if (v == null) return '—';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return digits > 0 ? n.toFixed(digits) : Math.round(n).toLocaleString();
}

function ageFrom(dob: string | null): string {
    if (!dob) return '—';
    const d = new Date(dob);
    if (isNaN(d.getTime())) return '—';
    const yrs = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return yrs > 0 && yrs < 60 ? yrs.toFixed(1) : '—';
}

function heightStr(inches: number | null): string {
    if (!inches) return '—';
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

const SECTIONS = [
    { id: 'seasons', label: 'Production' },
    { id: 'trend', label: 'Trend' },
    { id: 'rankings', label: 'Rankings' },
    { id: 'projections', label: 'Projections' },
];

export function RedraftProfileClient({
    player, seasons, sourceRanks, projections, boardRank, prev, next,
}: Props) {
    const pos = (player.position || '').toUpperCase();
    const cols = SEASON_COLUMNS[pos] || SEASON_COLUMNS.WR;
    const headshot = player.nfl_headshot_url || player.headshot_url;
    const isRookie = player.draft_year === 2026;
    const accent = POSITION_RAW[pos] || '#38bdf8';

    const latest = seasons[0];
    const bestSeason = useMemo(
        () => seasons.reduce<NflSeasonStat | null>(
            (best, s) => (!best || (s.fantasy_points_ppr ?? 0) > (best.fantasy_points_ppr ?? 0)) ? s : best,
            null
        ),
        [seasons]
    );

    const avgProj = projections.length
        ? projections.reduce((a, p) => a + (p.proj_points ?? 0), 0) / projections.length
        : null;

    // Year-over-year direction, the fastest read on where a player is trending.
    const trend = useMemo(() => {
        if (seasons.length < 2) return null;
        const [cur, prevS] = seasons;
        const a = cur.ppg_ppr, b = prevS.ppg_ppr;
        if (a == null || b == null) return null;
        return { delta: a - b, from: prevS.season, to: cur.season };
    }, [seasons]);

    const kpis = [
        { label: 'Consensus', value: boardRank != null ? `#${boardRank}` : '—',
          sub: player.rank_positional ? `${pos}${player.rank_positional}` : undefined },
        { label: `${latest?.season ?? 'Last'} Points`, value: fmt(latest?.fantasy_points_ppr, 1),
          sub: latest?.games ? `${latest.games} games` : undefined },
        { label: 'Points / Game', value: fmt(latest?.ppg_ppr, 1),
          sub: latest?.finish_positional ? `${pos}${latest.finish_positional} finish` : undefined },
        { label: '2026 Projection', value: avgProj != null ? fmt(avgProj) : '—',
          sub: projections.length ? `${projections.length} source${projections.length === 1 ? '' : 's'}` : 'pending' },
    ];

    return (
        <div className="min-h-screen bg-background text-foreground">
            <AppHeader>
                <div className="flex items-center gap-2 text-[12px]">
                    {prev && (
                        <Link href={`/redraft/players/${prev.slug}`}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[120px]">{prev.full_name}</span>
                        </Link>
                    )}
                    {next && (
                        <Link href={`/redraft/players/${next.slug}`}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                            <span className="truncate max-w-[120px]">{next.full_name}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>
            </AppHeader>

            {/* ── Hero ── */}
            <div className="border-b border-white/[0.06]"
                style={{
                    background: player.team_color
                        ? `linear-gradient(135deg, ${player.team_color}22 0%, transparent 60%)`
                        : undefined,
                }}>
                <div className="w-full px-3 sm:px-8 lg:px-12 py-5 mx-auto max-w-7xl">
                    <div className="flex items-start gap-4 sm:gap-5">
                        {headshot && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={headshot} alt=""
                                className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover bg-white/5 flex-shrink-0"
                                style={{ border: `2px solid ${accent}40` }} />
                        )}

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{player.full_name}</h1>
                                <WatchlistButton playerSlug={player.slug} variant="badge"
                                    storageKey={REDRAFT_WATCHLIST_KEY} />
                                <Link href={`/redraft/compare?a=${player.slug}`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-muted/30 text-muted-foreground border border-border/60 hover:text-foreground transition-colors">
                                    <Scale className="w-3.5 h-3.5" /> Compare
                                </Link>
                            </div>

                            <div className="flex items-center gap-2 mt-2 flex-wrap text-[12px]">
                                <span className={cn('px-2 py-0.5 rounded font-bold', POSITION_COLORS[pos])}>
                                    {pos}{player.rank_positional ?? ''}
                                </span>
                                {player.team_logo && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={player.team_logo} alt="" className="w-5 h-5 object-contain" />
                                )}
                                <span className="text-muted-foreground">
                                    {player.team_name || player.nfl_team || 'Free agent'}
                                </span>
                                <span className="text-muted-foreground/40">·</span>
                                <span className="text-muted-foreground">Age {ageFrom(player.dob)}</span>
                                {player.height_inches && (
                                    <>
                                        <span className="text-muted-foreground/40">·</span>
                                        <span className="text-muted-foreground">
                                            {heightStr(player.height_inches)}
                                            {player.weight_lbs ? `, ${player.weight_lbs} lb` : ''}
                                        </span>
                                    </>
                                )}
                                {player.years_exp != null && (
                                    <>
                                        <span className="text-muted-foreground/40">·</span>
                                        <span className="text-muted-foreground">
                                            {player.years_exp === 0 ? 'Rookie' : `${player.years_exp} yr${player.years_exp === 1 ? '' : 's'} exp`}
                                        </span>
                                    </>
                                )}
                            </div>

                            {isRookie && (
                                <Link href={`/players/${player.slug}`}
                                    className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors">
                                    <GraduationCap className="w-3.5 h-3.5" />
                                    2026 rookie — view full college scouting profile
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* KPI strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
                        {kpis.map(k => (
                            <div key={k.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-semibold">
                                    {k.label}
                                </div>
                                <div className="text-xl font-bold font-[var(--font-jetbrains),monospace] leading-tight mt-0.5">
                                    {k.value}
                                </div>
                                {k.sub && <div className="text-[10px] text-muted-foreground/70">{k.sub}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section jump nav */}
            <div className="sticky top-[52px] z-30 border-b border-white/[0.06] backdrop-blur"
                style={{ background: 'rgba(6,10,16,0.85)' }}>
                <div className="w-full px-3 sm:px-8 lg:px-12 mx-auto max-w-7xl flex items-center gap-1 overflow-x-auto">
                    {SECTIONS.map(s => (
                        <a key={s.id} href={`#${s.id}`}
                            className="px-3 py-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors">
                            {s.label}
                        </a>
                    ))}
                </div>
            </div>

            <main className="w-full px-3 sm:px-8 lg:px-12 py-6 mx-auto max-w-7xl space-y-8">
                {/* ── Season production ── */}
                <section id="seasons" className="scroll-mt-28">
                    <div className="flex items-baseline justify-between mb-3">
                        <h2 className="text-lg font-bold">NFL Production</h2>
                        <span className="text-[11px] text-muted-foreground">
                            PPR scoring · {seasons.length} season{seasons.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    {seasons.length === 0 ? (
                        <div className="p-10 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                            No NFL production yet
                            {isRookie && ' — this is a 2026 rookie. College numbers are on the rookie profile.'}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-white/[0.05] overflow-x-auto" style={{ background: 'var(--bg-card)' }}>
                            <table className="w-full text-[12px] min-w-[640px]">
                                <thead>
                                    <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground">
                                        <th className="text-left font-bold px-3 py-2.5">Season</th>
                                        <th className="text-center font-bold px-2">Tm</th>
                                        <th className="text-center font-bold px-2">G</th>
                                        {cols.map(c => (
                                            <th key={c.key} className="text-center font-bold px-2">{c.label}</th>
                                        ))}
                                        <th className="text-center font-bold px-2">Pts</th>
                                        <th className="text-center font-bold px-2">PPG</th>
                                        <th className="text-center font-bold px-2">Finish</th>
                                    </tr>
                                </thead>
                                <tbody className="font-[var(--font-jetbrains),monospace]">
                                    {seasons.map(s => {
                                        const isBest = bestSeason && s.season === bestSeason.season && seasons.length > 1;
                                        return (
                                            <tr key={s.season} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                                                <td className="px-3 py-2.5 font-bold text-left">
                                                    {s.season}
                                                    {isBest && <span className="text-yellow-400 ml-1" title="Best fantasy season">★</span>}
                                                </td>
                                                <td className="text-center px-2 text-muted-foreground">{s.team ?? '—'}</td>
                                                <td className="text-center px-2">{fmt(s.games)}</td>
                                                {cols.map(c => (
                                                    <td key={c.key} className="text-center px-2">
                                                        {fmt(s[c.key], c.key === 'fg_pct' ? 1 : 0)}
                                                    </td>
                                                ))}
                                                <td className={cn('text-center px-2 font-bold', isBest && 'text-yellow-400')}>
                                                    {fmt(s.fantasy_points_ppr, 1)}
                                                </td>
                                                <td className="text-center px-2 font-semibold">{fmt(s.ppg_ppr, 1)}</td>
                                                <td className="text-center px-2">
                                                    {s.finish_positional != null ? (
                                                        <span className={cn(
                                                            'font-bold',
                                                            s.finish_positional <= 12 ? 'text-emerald-400' : 'text-muted-foreground',
                                                        )}>
                                                            {pos}{s.finish_positional}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {trend && (
                        <div className="mt-3 flex items-center gap-2 text-[12px]">
                            {trend.delta >= 0
                                ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                                : <TrendingDown className="w-4 h-4 text-red-400" />}
                            <span className="text-muted-foreground">
                                <span className={cn('font-bold', trend.delta >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                    {trend.delta >= 0 ? '+' : ''}{trend.delta.toFixed(1)} PPG
                                </span>{' '}
                                from {trend.from} to {trend.to}
                            </span>
                        </div>
                    )}
                </section>

                {/* ── Trend chart ── */}
                {seasons.length > 1 && (
                    <section id="trend" className="scroll-mt-28">
                        <h2 className="text-lg font-bold mb-3">Season Trend</h2>
                        <SeasonTrendChart seasons={seasons} position={pos} accent={accent} />
                    </section>
                )}

                {/* ── Source rankings ── */}
                <section id="rankings" className="scroll-mt-28">
                    <h2 className="text-lg font-bold mb-3">Where the Market Has Them</h2>
                    <RedraftSourceRankings
                        sourceRanks={sourceRanks}
                        consensusRank={boardRank}
                        avgRank={player.avg_rank}
                        bestRank={player.best_rank}
                        worstRank={player.worst_rank}
                        stdDev={player.std_deviation}
                    />
                </section>

                {/* ── Projections ── */}
                <section id="projections" className="scroll-mt-28">
                    <h2 className="text-lg font-bold mb-3">2026 Projections</h2>
                    {projections.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
                            Projection sources are still being wired up.
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-white/[0.05] divide-y divide-white/[0.04]"
                            style={{ background: 'var(--bg-card)' }}>
                            {projections.map(p => (
                                <div key={p.source} className="flex items-center justify-between px-4 py-3">
                                    <span className="text-[13px] font-semibold">{p.source}</span>
                                    <div className="flex items-center gap-5 text-[12px] font-[var(--font-jetbrains),monospace]">
                                        <span><span className="text-muted-foreground/60">Pts </span>{fmt(p.proj_points, 1)}</span>
                                        <span><span className="text-muted-foreground/60">P/G </span>{fmt(p.proj_ppg, 1)}</span>
                                        <span><span className="text-muted-foreground/60">Rk </span>{fmt(p.proj_rank_overall)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
