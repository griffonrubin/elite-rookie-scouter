'use client';

import Link from 'next/link';
import { Player } from '@/lib/types';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { NflTeamLogo, getDraftStatus } from '@/components/NflTeamLogo';

interface HexViewProps {
    players: Player[];
    period: '1d' | '7d' | '30d';
}

const PICKS_PER_ROUND = 12;

function getTierStyle(rank: number): { border: string; bg: string; pickColor: string } {
    if (rank <= 5)  return { border: 'border-orange-500/70',   bg: 'bg-orange-500/[0.08]',  pickColor: 'text-orange-400'          };
    if (rank <= 12) return { border: 'border-emerald-500/60',  bg: 'bg-emerald-500/[0.06]', pickColor: 'text-emerald-400'         };
    if (rank <= 24) return { border: 'border-cyan-500/50',     bg: 'bg-cyan-500/[0.05]',    pickColor: 'text-cyan-400'            };
    if (rank <= 48) return { border: 'border-violet-500/50',   bg: 'bg-violet-500/[0.05]',  pickColor: 'text-violet-400'          };
    if (rank <= 80) return { border: 'border-amber-500/40',    bg: 'bg-amber-500/[0.05]',   pickColor: 'text-amber-400'           };
    return                 { border: 'border-border/25',        bg: 'bg-card/50',            pickColor: 'text-muted-foreground/50' };
}

export function HexView({ players, period }: HexViewProps) {
    if (players.length === 0) {
        return <div className="p-12 text-center text-muted-foreground">No players found.</div>;
    }

    // Group players into rounds of 12
    const rounds: Player[][] = [];
    for (let i = 0; i < players.length; i += PICKS_PER_ROUND) {
        rounds.push(players.slice(i, i + PICKS_PER_ROUND));
    }

    return (
        <div className="space-y-1">
            {/* Tier legend */}
            <div className="flex items-center gap-4 px-2 pb-3 flex-wrap">
                <span className="text-muted-foreground/40 uppercase tracking-widest text-[9px] font-bold">Tier</span>
                {[
                    { label: 'S (1–5)',    color: 'bg-orange-500' },
                    { label: 'A (6–12)',   color: 'bg-emerald-500' },
                    { label: 'B (13–24)',  color: 'bg-cyan-500'    },
                    { label: 'C (25–48)',  color: 'bg-violet-500'  },
                    { label: 'D (49–80)',  color: 'bg-amber-500'   },
                    { label: 'Depth 81+', color: 'bg-border'       },
                ].map(t => (
                    <span key={t.label} className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-semibold">
                        <span className={`inline-block w-2 h-2 rounded-sm ${t.color}`} />
                        {t.label}
                    </span>
                ))}
            </div>

            {/* Draft board — scrolls horizontally on small screens */}
            <div className="overflow-x-auto">
                <div style={{ minWidth: `${10 + PICKS_PER_ROUND * 96}px` }}>
                    {rounds.map((roundPlayers, roundIdx) => {
                        const roundNum = roundIdx + 1;
                        return (
                            <div key={roundIdx} className="flex items-stretch gap-1 mb-1">
                                {/* Round label sidebar */}
                                <div className="w-10 flex-shrink-0 flex items-center justify-center border-r border-border/20 mr-1">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/40">
                                        Rd {roundNum}
                                    </span>
                                </div>

                                {/* 12 pick slots */}
                                {Array.from({ length: PICKS_PER_ROUND }).map((_, pickIdx) => {
                                    const player = roundPlayers[pickIdx];
                                    const globalRank = roundIdx * PICKS_PER_ROUND + pickIdx + 1;
                                    const pickLabel = `${roundNum}.${String(pickIdx + 1).padStart(2, '0')}`;

                                    if (!player) {
                                        return (
                                            <div
                                                key={pickIdx}
                                                className="flex-1 min-w-[90px] rounded border border-border/10 bg-muted/[0.03]"
                                                style={{ minHeight: '58px' }}
                                            />
                                        );
                                    }

                                    const rank = (player as any).consensus_rank ?? globalRank;
                                    const tier = getTierStyle(rank);
                                    const posColor = POSITION_COLORS[player.position] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
                                    const draftStatus = getDraftStatus(player);

                                    return (
                                        <Link
                                            key={player.id}
                                            href={`/players/${player.slug}`}
                                            className={cn(
                                                'group flex-1 min-w-[90px] flex flex-col rounded border px-2 py-1.5 cursor-pointer overflow-hidden',
                                                'transition-all duration-150 hover:scale-[1.04] hover:z-10 hover:shadow-lg hover:shadow-black/40',
                                                tier.border, tier.bg
                                            )}
                                        >
                                            {/* Pick + position */}
                                            <div className="flex items-center justify-between gap-1">
                                                <span className={`text-[9px] font-black font-mono leading-none ${tier.pickColor}`}>
                                                    {pickLabel}
                                                </span>
                                                <span
                                                    style={{ padding: '1px 5px', borderRadius: 9999, fontSize: 7, fontWeight: 800, lineHeight: 1.4, whiteSpace: 'nowrap' }}
                                                    className={cn('border inline-flex items-center flex-shrink-0', posColor)}
                                                >
                                                    {player.position}
                                                </span>
                                            </div>

                                            {/* Name */}
                                            <div
                                                className="text-[11px] font-bold text-foreground leading-snug group-hover:text-primary transition-colors mt-1"
                                                title={player.full_name}
                                                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                            >
                                                {player.first_name?.[0] ? `${player.first_name[0]}.` : ''} {player.last_name}
                                            </div>

                                            {/* NFL team / draft status */}
                                            {draftStatus.type === 'drafted' && (
                                                <div className="flex items-center gap-0.5 mt-0.5">
                                                    <NflTeamLogo abbr={draftStatus.team} size={10} />
                                                    <span className="text-[8px] font-bold text-yellow-300/70 truncate leading-tight">{draftStatus.team} {draftStatus.slot}</span>
                                                </div>
                                            )}
                                            {draftStatus.type === 'udfa' && (
                                                <div className="flex items-center gap-0.5 mt-0.5">
                                                    <NflTeamLogo abbr={draftStatus.team} size={10} />
                                                    <span className="text-[8px] font-semibold text-sky-300/60 truncate leading-tight">UDFA</span>
                                                </div>
                                            )}
                                            {draftStatus.type === 'undrafted' && (
                                                <div className="text-[8px] text-muted-foreground/30 mt-0.5">—</div>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
