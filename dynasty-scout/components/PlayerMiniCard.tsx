import Link from 'next/link';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ConsensusRanking, Player } from '@/lib/types';
import { WatchlistButton } from './WatchlistButton';
import { getColDefs, getGridTemplate, ColDef } from '@/lib/boardColumns';

interface PlayerMiniCardProps {
    player: Player;
    ranking: ConsensusRanking;
    period: '1d' | '7d' | '30d';
    index: number;
    positionFilter?: string;
}

function getDraftSlot(rank: number): string {
    const round = Math.ceil(rank / 12);
    const pick  = rank - (round - 1) * 12;
    return `${round}.${String(pick).padStart(2, '0')}`;
}

function getTier(rank: number): { label: string; color: string } {
    if (rank <= 5)  return { label: 'S Tier', color: 'bg-[#FF6B00]/20 text-[#FF9A50] border-[#FF6B00]/40'   };
    if (rank <= 12) return { label: 'A Tier', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    if (rank <= 24) return { label: 'B Tier', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'       };
    if (rank <= 48) return { label: 'C Tier', color: 'bg-violet-500/20 text-violet-300 border-violet-500/40' };
    return { label: 'Depth', color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
}

function getRankColor(rank: number): string {
    if (rank <= 12) return 'text-emerald-400 font-extrabold';
    if (rank <= 24) return 'text-[#FF9A50] font-bold';
    if (rank <= 48) return 'text-violet-400 font-bold';
    return 'text-muted-foreground font-semibold';
}

function formatHeight(inches?: number | null) {
    if (!inches) return '—';
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function getFortyColor(v: number, pos: string): string {
    const p = pos.toUpperCase();
    if (p === 'RB') { if (v < 4.40) return 'text-emerald-400 font-bold'; if (v < 4.50) return 'text-yellow-400'; if (v < 4.60) return 'text-orange-400'; return 'text-red-400'; }
    if (p === 'WR') { if (v < 4.38) return 'text-emerald-400 font-bold'; if (v < 4.47) return 'text-yellow-400'; if (v < 4.56) return 'text-orange-400'; return 'text-red-400'; }
    if (p === 'TE') { if (v < 4.50) return 'text-emerald-400 font-bold'; if (v < 4.62) return 'text-yellow-400'; if (v < 4.75) return 'text-orange-400'; return 'text-red-400'; }
    if (p === 'QB') { if (v < 4.65) return 'text-emerald-400 font-bold'; if (v < 4.78) return 'text-yellow-400'; return 'text-orange-400'; }
    return 'text-foreground/70';
}

function StatVal({ val, highlight }: { val: string | number | null | undefined; highlight?: string }) {
    const display = val != null && val !== '' ? String(val) : '—';
    const empty   = display === '—';
    return (
        <span className={`font-mono font-bold text-sm ${empty ? 'text-muted-foreground/30' : (highlight || 'text-foreground/80')}`}>
            {display}
        </span>
    );
}

function RecruitStars({ stars }: { stars: number | null | undefined }) {
    if (!stars) return <StatVal val={null} />;
    const color = stars >= 5 ? 'text-yellow-400' : stars >= 4 ? 'text-yellow-300/80' : 'text-muted-foreground/60';
    return <span className={`text-sm font-bold ${color}`}>{'★'.repeat(stars)}</span>;
}

export function PlayerMiniCard({ player, ranking, period, index, positionFilter = 'ALL' }: PlayerMiniCardProps) {
    const p = player as any;
    const positionColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';

    const rookieRank = ranking?.rank_overall ?? (index + 1);
    const tier       = getTier(rookieRank);
    const draftSlot  = getDraftSlot(rookieRank);
    const rankColor  = getRankColor(rookieRank);
    const schoolDisplay = p.school || '';

    const ht        = player.height_inches ? formatHeight(player.height_inches) : '—';
    const wt        = player.weight_lbs    ? `${player.weight_lbs}lb`           : '—';
    const fortyYard = p.forty_yard as number | null | undefined;

    const colDefs      = getColDefs(positionFilter);
    const gridTemplate = getGridTemplate(positionFilter);

    // Computed career stats used by position-specific columns
    const compPct   = p.career_pass_att > 0  ? ((p.career_completions  / p.career_pass_att)  * 100).toFixed(1) + '%' : null;
    const ypa       = p.career_pass_att > 0  ? (p.career_pass_yards    / p.career_pass_att).toFixed(1)              : null;
    const scrimYpg  = p.career_games_cs > 0  ? (p.career_scrim_yards   / p.career_games_cs).toFixed(1)              : null;
    const domPct    = p.best_dominator != null ? Number(p.best_dominator).toFixed(1) + '%'                           : null;

    function renderCell(col: ColDef) {
        switch (col.key) {

            // ── Individual sortable measurable columns ─────────────────────────
            case 'hw':
                return (
                    <div className="flex flex-col leading-tight text-left">
                        <span className="font-mono font-bold text-sm text-foreground/80">{ht}</span>
                        <span className="font-mono text-[10px] text-muted-foreground/50">{wt}</span>
                    </div>
                );

            case 'forty':
                return fortyYard
                    ? <span className={`font-mono font-bold text-sm ${getFortyColor(fortyYard, player.position)}`}>{fortyYard.toFixed(2)}s</span>
                    : <StatVal val={null} />;

            case 'ras':
                return <StatVal val={p.ras ? Number(p.ras).toFixed(1) : null} highlight="text-purple-400 font-bold" />;

            case 'arm':
                return <StatVal val={p.arm_length ? `${Number(p.arm_length).toFixed(2)}"` : null} />;

            case 'hand':
                return <StatVal val={p.hand_size ? `${Number(p.hand_size).toFixed(2)}"` : null} />;

            case 'stars':
                return <RecruitStars stars={p.recruiting_stars} />;

            // ── Legacy compact measurables (fallback) ─────────────────────────
            case 'measurables':
                return (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-foreground/80 truncate">
                        <span className="shrink-0">{ht} / {wt}</span>
                        {fortyYard ? <span className={`shrink-0 ${getFortyColor(fortyYard, player.position)}`}>· {fortyYard.toFixed(2)}s</span> : null}
                        {p.ras      ? <span className="text-purple-400 shrink-0">· RAS {Number(p.ras).toFixed(1)}</span> : null}
                        {p.speed_score && !p.ras ? <span className="text-cyan-400/80 shrink-0 text-[10px]">· Spd {Number(p.speed_score).toFixed(0)}</span> : null}
                    </div>
                );

            // ── Ranking sources ────────────────────────────────────────────────
            case 'fp':  return <StatVal val={p.fantasypros_rank}   />;
            case 'ktc': return <StatVal val={p.ktc_rank}           />;
            case 'fc':  return <StatVal val={p.fantasycalc_rank}   />;
            case 'dn':  return <StatVal val={p.dynasty_nerds_rank} />;
            case 'adp': return <span className="font-mono font-bold text-sm text-foreground/80">{draftSlot}</span>;

            // ── Tier badge ────────────────────────────────────────────────────
            case 'tier':
                return (ranking?.num_sources ?? 0) < 2 ? (
                    <span
                        title={`Ranked by ${ranking?.num_sources ?? 0} of 4 sources — limited data`}
                        style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}
                        className={cn('border', 'bg-gray-500/10 text-gray-400/80 border-gray-500/30')}
                    >⚠ Limited</span>
                ) : (
                    <span
                        style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}
                        className={cn('border', tier.color)}
                    >{tier.label}</span>
                );

            // ── Position-specific stats ────────────────────────────────────────
            case 'career_pass_yards': return <StatVal val={p.career_pass_yards > 0 ? Number(p.career_pass_yards).toLocaleString() : null} />;
            case 'comp_pct':          return <StatVal val={compPct} />;
            case 'ypa':               return <StatVal val={ypa} />;
            case 'breakout_age':      return <StatVal val={p.breakout_age ? Number(p.breakout_age).toFixed(1) : null} highlight={p.breakout_age && p.breakout_age <= 19 ? 'text-emerald-400 font-extrabold' : p.breakout_age <= 20 ? 'text-cyan-400 font-bold' : undefined} />;
            case 'best_dominator':    return <StatVal val={domPct} highlight={p.best_dominator >= 30 ? 'text-emerald-400 font-bold' : p.best_dominator >= 20 ? 'text-cyan-400' : undefined} />;
            case 'scrim_ypg':         return <StatVal val={scrimYpg} />;
            case 'recruiting_stars':  return <RecruitStars stars={p.recruiting_stars} />;

            default: return <StatVal val={null} />;
        }
    }

    return (
        <Link href={`/players/${player.slug}`} className="block group">
            <div className="flex items-center px-4 py-2.5 hover:bg-accent/40 transition-all duration-150 border-b border-border/20 gap-3">

                {/* 1. Rank + inline watchlist */}
                <div className="w-16 flex-shrink-0 flex flex-row items-center justify-center gap-1.5">
                    <span className={`text-sm font-mono leading-none ${rankColor}`}>{rookieRank}</span>
                    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="cursor-pointer flex items-center">
                        <WatchlistButton playerSlug={player.slug} />
                    </div>
                </div>

                {/* 2. Player info */}
                <div style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }} className="flex-shrink-0">
                    <div className="flex items-center gap-2 mb-0.5 overflow-hidden">
                        <span className="font-bold text-[14px] text-foreground truncate group-hover:text-primary transition-colors leading-snug">
                            {player.full_name}
                        </span>
                        <span
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 8px', lineHeight: 1, whiteSpace: 'nowrap', borderRadius: 9999, flexShrink: 0, fontSize: 10, fontWeight: 800 }}
                            className={cn('border', positionColor)}
                        >{player.position}</span>
                    </div>
                    <div className="flex items-center text-[11px] text-muted-foreground/70 gap-1.5 leading-none">
                        <span className="truncate">{schoolDisplay || 'School TBD'}</span>
                        {player.age_at_draft && (
                            <><span className="opacity-40">•</span><span className="whitespace-nowrap">Age {player.age_at_draft}</span></>
                        )}
                    </div>
                </div>

                {/* 3. Dynamic stat columns — CSS grid */}
                <div
                    className="hidden lg:grid flex-1 min-w-0"
                    style={{ gridTemplateColumns: gridTemplate }}
                >
                    {colDefs.map((col, i) => (
                        <div
                            key={col.key}
                            className={`flex items-center min-h-[36px] overflow-hidden ${
                                i === 0
                                    ? 'border-l border-border/30 pl-3'
                                    : 'justify-center'
                            }`}
                        >
                            {renderCell(col)}
                        </div>
                    ))}
                </div>

            </div>
        </Link>
    );
}
