'use client';

import React, { useEffect, useRef } from 'react';
import { RedraftPlayer } from '@/lib/types';
import { POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { MockPick, MockSettings, teamOnClock, totalRounds } from '@/lib/mockDraft';

interface Props {
    settings: MockSettings;
    picks: MockPick[];
    byId: Map<number, RedraftPlayer>;
    currentOverall: number;
}

function shortName(p: RedraftPlayer): string {
    if ((p.position || '').toUpperCase() === 'DST') {
        return p.full_name.replace(/\s*D\/ST$/i, '').split(' ').slice(-1)[0];
    }
    const parts = p.full_name.trim().split(' ');
    return parts.length === 1 ? parts[0] : `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

export function MockPickGrid({ settings, picks, byId, currentOverall }: Props) {
    const rounds = totalRounds(settings.roster);
    const byOverall = new Map(picks.map(p => [p.overall, p]));
    const activeRef = useRef<HTMLDivElement | null>(null);

    // Keep the pick that's on the clock in view as the draft rolls on.
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [currentOverall]);

    return (
        <div className="overflow-auto rounded-xl border border-white/[0.05] h-full"
            style={{ background: 'var(--bg-card)' }}>
            <div style={{ minWidth: `${44 + settings.teams * 84}px` }}>
                {/* Team header */}
                <div className="flex items-stretch gap-1 sticky top-0 z-10 px-1 py-1"
                    style={{ background: 'var(--bg-elevated)' }}>
                    <div className="w-9 shrink-0" />
                    {Array.from({ length: settings.teams }, (_, t) => (
                        <div key={t} className={cn(
                            'flex-1 min-w-[76px] text-center text-[9px] font-bold uppercase tracking-wide py-1 rounded',
                            t === settings.mySlot - 1
                                ? 'text-sky-300 bg-sky-500/15'
                                : 'text-muted-foreground/50',
                        )}>
                            {t === settings.mySlot - 1 ? 'You' : `T${t + 1}`}
                        </div>
                    ))}
                </div>

                {Array.from({ length: rounds }, (_, r) => {
                    const round = r + 1;
                    return (
                        <div key={round} className="flex items-stretch gap-1 px-1 mb-1">
                            <div className="w-9 shrink-0 flex items-center justify-center">
                                <span className="text-[9px] font-black uppercase text-muted-foreground/40">
                                    R{round}
                                </span>
                            </div>
                            {Array.from({ length: settings.teams }, (_, col) => {
                                // Columns are teams, so find which overall pick this team owns
                                // in this round — under snake that isn't left-to-right.
                                const base = (round - 1) * settings.teams;
                                let overall = base + col + 1;
                                for (let i = 1; i <= settings.teams; i++) {
                                    if (teamOnClock(base + i, settings.teams, settings.snake) === col) {
                                        overall = base + i;
                                        break;
                                    }
                                }
                                const pick = byOverall.get(overall);
                                const isCurrent = overall === currentOverall;
                                const player = pick ? byId.get(pick.playerId) : undefined;
                                const pos = (player?.position || '').toUpperCase();
                                const accent = POSITION_RAW[pos];

                                return (
                                    <div
                                        key={col}
                                        ref={isCurrent ? activeRef : undefined}
                                        className={cn(
                                            'flex-1 min-w-[76px] rounded border px-1.5 py-1 overflow-hidden',
                                            isCurrent && 'ring-2 ring-sky-400/70 animate-pulse-glow',
                                            !player && 'border-border/10 bg-muted/[0.03]',
                                        )}
                                        style={player ? {
                                            minHeight: '38px',
                                            borderColor: `${accent}66`,
                                            background: `linear-gradient(160deg, ${accent}1f, transparent)`,
                                        } : { minHeight: '38px' }}
                                        title={player ? `${overall}. ${player.full_name}` : `Pick ${overall}`}
                                    >
                                        <div className="text-[8px] font-bold font-[var(--font-jetbrains),monospace]"
                                            style={{ color: player ? accent : undefined }}>
                                            {round}.{String(((overall - 1) % settings.teams) + 1).padStart(2, '0')}
                                        </div>
                                        {player && (
                                            <div className="text-[10px] font-bold leading-tight truncate">
                                                {shortName(player)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
