'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Scale, GraduationCap } from 'lucide-react';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { RedraftPlayer } from '@/lib/types';
import { WatchlistButton, REDRAFT_WATCHLIST_KEY } from '@/components/WatchlistButton';
import { DraftedButton } from '@/components/DraftedButton';
import { REDRAFT_DRAFTED_KEY } from '@/lib/useDrafted';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
    getRedraftColDefs, getRedraftGridTemplate,
    RedraftDataset, RedraftColDef,
} from '@/lib/redraftColumns';

interface Props {
    player: RedraftPlayer;
    index: number;
    rank: number;
    positionFilter?: string;
    dataset?: RedraftDataset;
    isDrafted?: boolean;
}

/** Tier bands sized for a ~500-deep redraft board (roughly draft rounds). */
function getTier(rank: number) {
    if (rank <= 12)  return { label: 'Round 1',  border: 'rgba(249,115,22,0.5)' };
    if (rank <= 36)  return { label: 'Rounds 2-3', border: 'rgba(34,197,94,0.5)' };
    if (rank <= 72)  return { label: 'Rounds 4-6', border: 'rgba(56,189,248,0.5)' };
    if (rank <= 120) return { label: 'Rounds 7-10', border: 'rgba(167,139,250,0.5)' };
    if (rank <= 200) return { label: 'Late',      border: 'rgba(245,158,11,0.45)' };
    return { label: 'Deep', border: 'rgba(71,85,105,0.3)' };
}

function getRankColor(rank: number): string {
    if (rank <= 12)  return 'text-orange-400 font-extrabold';
    if (rank <= 36)  return 'text-emerald-400 font-extrabold';
    if (rank <= 72)  return 'text-sky-400 font-bold';
    if (rank <= 120) return 'text-violet-400 font-bold';
    return 'text-muted-foreground/70 font-semibold';
}

/** Points-per-game is the clearest read on weekly value, so it gets color. */
function ppgColor(ppg: number, pos: string): string {
    const thresholds: Record<string, [number, number, number]> = {
        QB:  [21, 18, 15], RB: [16, 12, 9], WR: [15, 11, 8],
        TE:  [12, 9, 6],   K:  [9, 8, 7],   DST: [8, 6, 4],
    };
    const [elite, good, ok] = thresholds[pos] ?? [15, 11, 8];
    if (ppg >= elite) return 'text-emerald-400 font-bold';
    if (ppg >= good)  return 'text-sky-400 font-semibold';
    if (ppg >= ok)    return 'text-foreground/70';
    return 'text-muted-foreground/60';
}

/** Wide disagreement between sources is the signal worth surfacing. */
function sdColor(sd: number): string {
    if (sd >= 25) return 'text-amber-400 font-bold';
    if (sd >= 12) return 'text-amber-400/70';
    return 'text-muted-foreground/60';
}

function age(dob: string | null): string {
    if (!dob) return '—';
    const d = new Date(dob);
    if (isNaN(d.getTime())) return '—';
    const yrs = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return yrs > 0 && yrs < 60 ? yrs.toFixed(1) : '—';
}

function StatVal({ val, highlight }: { val: string | null; highlight?: string }) {
    return (
        <span className={cn(
            'text-[11px] sm:text-xs text-center font-[var(--font-jetbrains),monospace] leading-none',
            val == null ? 'text-muted-foreground/25' : highlight || 'text-foreground/80',
        )}>
            {val ?? '—'}
        </span>
    );
}

/** "WR7" from a positional finish. */
function finishLabel(pos: string, fin: number | null): string | null {
    return fin != null ? `${pos}${fin}` : null;
}

function num(v: number | null | undefined, digits = 0): string | null {
    if (v == null) return null;
    return digits > 0 ? Number(v).toFixed(digits) : Math.round(Number(v)).toLocaleString();
}

function RedraftMiniCardInner({
    player, index, rank, positionFilter = 'ALL',
    dataset = 'snapshot', isDrafted = false,
}: Props) {
    const router = useRouter();
    const pos = (player.position || '').toUpperCase();
    const tier = getTier(rank);
    const cols = getRedraftColDefs(dataset, positionFilter);
    const grid = getRedraftGridTemplate(dataset, positionFilter);
    const isRookie = player.draft_year === 2026;

    function renderCell(col: RedraftColDef) {
        const p = player;
        switch (col.key) {
            // ── consensus / market ──────────────────────────────────────────
            case 'avg_rank':      return <StatVal val={num(p.avg_rank, 1)} />;
            case 'best_rank':     return <StatVal val={num(p.best_rank)} />;
            case 'worst_rank':    return <StatVal val={num(p.worst_rank)} />;
            case 'num_sources':   return <StatVal val={num(p.num_sources)} />;
            case 'std_deviation':
                return <StatVal val={num(p.std_deviation, 1)}
                    highlight={p.std_deviation != null ? sdColor(p.std_deviation) : undefined} />;

            case 'fp_rank':      return <StatVal val={num(p.fp_rank)} />;
            case 'espn_rank':    return <StatVal val={num(p.espn_rank)} />;
            case 'ktc_rank':     return <StatVal val={num(p.ktc_rank)} />;
            case 'cbs_rank':     return <StatVal val={num(p.cbs_rank)} />;
            case 'yahoo_rank':   return <StatVal val={num(p.yahoo_rank)} />;
            case 'sleeper_rank': return <StatVal val={num(p.sleeper_rank)} />;
            case 'fc_rank':      return <StatVal val={num(p.fc_rank)} />;
            case 'flock_rank':   return <StatVal val={num(p.flock_rank)} />;

            // ── fantasy production ──────────────────────────────────────────
            case 'pts25':
                return <StatVal val={num(p.pts25, 1)}
                    highlight={p.pts25 != null && p.pts25 >= 250 ? 'text-emerald-400 font-bold' : undefined} />;
            case 'ppg25':
                return <StatVal val={num(p.ppg25, 1)}
                    highlight={p.ppg25 != null ? ppgColor(p.ppg25, pos) : undefined} />;
            case 'fin25':
                return <StatVal val={finishLabel(pos, p.fin25)}
                    highlight={p.fin25 != null && p.fin25 <= 12 ? 'text-emerald-400 font-bold' : undefined} />;
            case 'fin25_ov':  return <StatVal val={num(p.fin25_ov)} />;
            case 'games25':   return <StatVal val={num(p.games25)} />;
            case 'proj_points':
                return <StatVal val={num(p.proj_points)}
                    highlight={p.proj_points != null ? 'text-sky-300 font-semibold' : undefined} />;
            case 'proj_ppg':  return <StatVal val={num(p.proj_ppg, 1)} />;

            // ── profile ─────────────────────────────────────────────────────
            case 'age':        return <StatVal val={age(p.dob)} />;
            case 'years_exp':  return <StatVal val={p.years_exp != null ? String(p.years_exp) : null} />;

            // ── season history: points with the positional finish beneath ───
            case 's21': case 's22': case 's23': case 's24': case 's25': {
                const yr = col.key.slice(1);
                const pts = (p as any)[`pts${yr}`] ?? (yr === '25' ? p.pts25 : null);
                const fin = (p as any)[`fin${yr}`] ?? (yr === '25' ? p.fin25 : null);
                if (pts == null) return <StatVal val={null} />;
                return (
                    <div className="flex flex-col items-center leading-tight">
                        <span className={cn(
                            'text-[11px] sm:text-xs font-[var(--font-jetbrains),monospace]',
                            pts >= 250 ? 'text-emerald-400 font-bold' : 'text-foreground/80',
                        )}>{Number(pts).toFixed(0)}</span>
                        {fin != null && (
                            <span className="text-[9px] text-muted-foreground/50">{pos}{fin}</span>
                        )}
                    </div>
                );
            }

            // ── counting stats ──────────────────────────────────────────────
            case 'pass_yards':    return <StatVal val={num(p.pass_yards)} />;
            case 'pass_tds':      return <StatVal val={num(p.pass_tds)} />;
            case 'interceptions': return <StatVal val={num(p.interceptions)} />;
            case 'carries':       return <StatVal val={num(p.carries)} />;
            case 'rush_yards':    return <StatVal val={num(p.rush_yards)} />;
            case 'rush_tds':      return <StatVal val={num(p.rush_tds)} />;
            case 'targets':       return <StatVal val={num(p.targets)} />;
            case 'receptions':    return <StatVal val={num(p.receptions)} />;
            case 'rec_yards':     return <StatVal val={num(p.rec_yards)} />;
            case 'rec_tds':       return <StatVal val={num(p.rec_tds)} />;

            case 'fg_made':        return <StatVal val={num(p.fg_made)} />;
            case 'fg_att':         return <StatVal val={num(p.fg_att)} />;
            case 'fg_pct':         return <StatVal val={num(p.fg_pct, 1)} />;
            case 'fg_made_50plus': return <StatVal val={num(p.fg_made_50plus)}
                highlight={p.fg_made_50plus != null && p.fg_made_50plus >= 8 ? 'text-emerald-400 font-bold' : undefined} />;
            case 'xp_made':        return <StatVal val={num(p.xp_made)} />;

            case 'dst_sacks':          return <StatVal val={num(p.dst_sacks)} />;
            case 'dst_ints':           return <StatVal val={num(p.dst_ints)} />;
            case 'dst_tds':            return <StatVal val={num(p.dst_tds)} />;
            case 'dst_points_allowed': return <StatVal val={num(p.dst_points_allowed)} />;

            default: return <StatVal val={null} />;
        }
    }

    const headshot = player.nfl_headshot_url || player.headshot_url;
    const isEven = index % 2 === 0;

    return (
        <Link href={`/redraft/players/${player.slug}`} className="block group">
            <div className={cn(
                'relative flex items-center px-4 py-3 transition-all duration-150 gap-3',
                'border-b border-white/[0.04] hover:bg-white/[0.03]',
                isEven ? 'bg-transparent' : 'bg-white/[0.015]',
                isDrafted && 'opacity-45',
            )}>
                {/* Tier accent bar */}
                <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tier.border }} />

                {/* Sticky identity group */}
                <div className="sticky left-0 z-10 flex items-center self-stretch gap-1 sm:gap-2.5 pr-1 sm:pr-2 flex-shrink-0 min-w-0 lg:w-[340px]">
                    <WatchlistButton
                        playerSlug={player.slug}
                        storageKey={REDRAFT_WATCHLIST_KEY}
                        className="flex-shrink-0"
                    />

                    <div className="w-7 sm:w-10 flex-shrink-0 flex items-center justify-center">
                        <span className={`text-sm sm:text-base font-[var(--font-jetbrains),monospace] leading-none ${getRankColor(rank)}`}>
                            {rank}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/redraft/compare?a=${player.slug}`); }}
                        className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 rounded-md text-muted-foreground/25 hover:text-sky-400 hover:bg-sky-400/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
                        aria-label={`Compare ${player.full_name}`}
                    >
                        <Scale className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>

                    <DraftedButton
                        playerSlug={player.slug}
                        storageKey={REDRAFT_DRAFTED_KEY}
                        className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0"
                    />

                    <HoverCard openDelay={200} closeDelay={80}>
                        <HoverCardTrigger asChild>
                            <div className="flex-1 min-w-0 lg:w-[224px] lg:min-w-[224px] lg:flex-none cursor-default">
                                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 overflow-hidden">
                                    <span className="text-[13px] sm:text-sm font-semibold text-foreground truncate group-hover:text-sky-400 transition-colors">
                                        {player.full_name}
                                    </span>
                                    {isRookie && (
                                        <GraduationCap
                                            className="w-3 h-3 text-primary/70 flex-shrink-0"
                                            aria-label="2026 rookie — college profile available"
                                        />
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
                                    <span className={cn('px-1.5 py-0.5 rounded font-bold', POSITION_COLORS[pos] || 'text-muted-foreground')}>
                                        {pos}{player.rank_positional ?? ''}
                                    </span>
                                    <span className="text-muted-foreground truncate">
                                        {player.nfl_team || 'FA'}
                                    </span>
                                    {player.years_exp === 0 && (
                                        <span className="text-emerald-400/70 font-semibold">R</span>
                                    )}
                                </div>
                            </div>
                        </HoverCardTrigger>

                        <HoverCardContent side="right" align="start" className="w-72 p-0 overflow-hidden">
                            <div className="flex items-center gap-3 p-3 border-b border-white/[0.06]"
                                style={{ background: player.team_color ? `${player.team_color}18` : undefined }}>
                                {headshot && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={headshot} alt="" className="w-12 h-12 rounded-full object-cover bg-white/5" />
                                )}
                                <div className="min-w-0">
                                    <div className="text-sm font-bold truncate">{player.full_name}</div>
                                    <div className="text-[11px] text-muted-foreground">
                                        {pos}{player.rank_positional ?? ''} · {player.nfl_team || 'Free agent'}
                                        {player.years_exp != null && ` · ${player.years_exp} yr${player.years_exp === 1 ? '' : 's'}`}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-px bg-white/[0.06]">
                                {[
                                    { label: '2025 Pts', val: num(player.pts25, 1) },
                                    { label: 'PPG', val: num(player.ppg25, 1) },
                                    { label: 'Finish', val: finishLabel(pos, player.fin25) },
                                ].map(s => (
                                    <div key={s.label} className="bg-card px-2 py-2 text-center">
                                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{s.label}</div>
                                        <div className="text-sm font-bold font-[var(--font-jetbrains),monospace]">{s.val ?? '—'}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-3 space-y-1.5">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-semibold">
                                    Source ranks
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {([
                                        ['FP', player.fp_rank], ['ESPN', player.espn_rank],
                                        ['KTC', player.ktc_rank], ['CBS', player.cbs_rank],
                                        ['YHO', player.yahoo_rank], ['SLP', player.sleeper_rank],
                                        ['FC', player.fc_rank], ['FLK', player.flock_rank],
                                    ] as [string, number | null][])
                                        .filter(([, v]) => v != null)
                                        .map(([label, v]) => (
                                            <span key={label} className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[10px]">
                                                <span className="text-muted-foreground/70">{label}</span>{' '}
                                                <span className="font-semibold font-[var(--font-jetbrains),monospace]">{v}</span>
                                            </span>
                                        ))}
                                </div>
                                {player.num_sources != null && player.num_sources > 1 && (
                                    <div className="text-[10px] text-muted-foreground pt-1">
                                        Range {player.best_rank}–{player.worst_rank} across {player.num_sources} sources
                                        {player.std_deviation != null && player.std_deviation >= 15 && (
                                            <span className="text-amber-400/80 font-semibold"> · contested</span>
                                        )}
                                    </div>
                                )}
                                {isRookie && (
                                    <div className="text-[10px] text-primary/80 pt-1 flex items-center gap-1">
                                        <GraduationCap className="w-3 h-3" /> 2026 rookie — college profile on the rookie board
                                    </div>
                                )}
                            </div>
                        </HoverCardContent>
                    </HoverCard>
                </div>

                {/* Scrollable stat columns */}
                <div className="grid flex-1 items-center gap-1 sm:gap-2 min-w-0" style={{ gridTemplateColumns: grid }}>
                    {cols.map(col => (
                        <div key={col.key} className="flex items-center justify-center min-w-0">
                            {renderCell(col)}
                        </div>
                    ))}
                </div>
            </div>
        </Link>
    );
}

export const RedraftMiniCard = React.memo(RedraftMiniCardInner);
