'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { RotateCcw, Trophy } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { POSITION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
    FLEX_POSITIONS, MockPick, MockSettings, Pos, RosterSlots, sourceLabel,
} from '@/lib/mockDraft';

interface Props {
    settings: MockSettings;
    picks: MockPick[];
    byId: Map<number, RedraftPlayer>;
    onRestart: () => void;
}

/** Starters only — bench points don't score, so they shouldn't grade a draft. */
function starters(roster: RosterSlots, players: RedraftPlayer[]): RedraftPlayer[] {
    const pool = [...players];
    const out: RedraftPlayer[] = [];
    const take = (accept: (p: RedraftPlayer) => boolean) => {
        const i = pool.findIndex(accept);
        if (i >= 0) out.push(pool.splice(i, 1)[0]);
    };
    const posIs = (pos: string) => (p: RedraftPlayer) => (p.position || '').toUpperCase() === pos;

    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
        for (let i = 0; i < roster[pos]; i++) take(posIs(pos));
    }
    for (let i = 0; i < roster.FLEX; i++) {
        take(p => FLEX_POSITIONS.includes((p.position || '').toUpperCase() as Pos));
    }
    for (const pos of ['DST', 'K'] as const) {
        for (let i = 0; i < roster[pos]; i++) take(posIs(pos));
    }
    return out;
}

export function MockResults({ settings, picks, byId, onRestart }: Props) {
    const teams = useMemo(() => {
        return Array.from({ length: settings.teams }, (_, t) => {
            const mine = picks
                .filter(p => p.teamIndex === t)
                .sort((a, b) => a.overall - b.overall);
            const players = mine.map(p => byId.get(p.playerId)).filter(Boolean) as RedraftPlayer[];
            const start = starters(settings.roster, players);
            // Projections only cover ~600 players, so a missing one scores 0
            // rather than sinking the whole team's total.
            const projected = start.reduce((sum, p) => sum + (p.proj_points ?? 0), 0);
            return { teamIndex: t, picks: mine, players, starters: start, projected };
        });
    }, [settings, picks, byId]);

    const ranked = [...teams].sort((a, b) => b.projected - a.projected);
    const placeOf = new Map(ranked.map((t, i) => [t.teamIndex, i + 1]));
    const me = teams[settings.mySlot - 1];
    const myPlace = placeOf.get(settings.mySlot - 1);
    const best = ranked[0]?.projected || 1;

    return (
        <div className="space-y-4">
            {/* Headline */}
            <div className="rounded-2xl border border-sky-500/40 px-5 py-4"
                style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.12), transparent 65%)' }}>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground/70 font-bold">
                    <Trophy className="w-3.5 h-3.5" /> Draft complete
                </div>
                <div className="text-2xl font-bold mt-1">
                    Your roster projects {myPlace === 1 ? '1st' : `${myPlace}${myPlace === 2 ? 'nd' : myPlace === 3 ? 'rd' : 'th'}`} of {settings.teams}
                </div>
                <div className="text-[12px] text-muted-foreground mt-1">
                    {Math.round(me?.projected ?? 0).toLocaleString()} projected starter points from pick{' '}
                    {settings.mySlot} · {picks.filter(p => p.teamIndex === settings.mySlot - 1 && p.auto).length} auto-picked
                </div>
                <p className="text-[11px] text-muted-foreground/50 mt-2 max-w-2xl">
                    Graded on projected points from starting slots only — bench depth doesn&apos;t score.
                    Projections come from ESPN and Sleeper, so a player neither projects counts as zero.
                </p>
            </div>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onRestart}
                    className="flex items-center gap-2 px-4 h-9 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-[12px] transition-colors"
                >
                    <RotateCcw className="w-4 h-4" /> New mock draft
                </button>
                <Link href="/redraft"
                    className="px-4 h-9 flex items-center rounded-xl border border-border/60 text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors">
                    Back to board
                </Link>
            </div>

            {/* Rosters */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ranked.map(t => {
                    const isMe = t.teamIndex === settings.mySlot - 1;
                    const place = placeOf.get(t.teamIndex)!;
                    const starterIds = new Set(t.starters.map(p => p.id));
                    return (
                        <div key={t.teamIndex} className={cn(
                            'rounded-2xl border p-3.5',
                            isMe ? 'border-sky-500/50 ring-1 ring-sky-500/20' : 'border-white/[0.06]',
                        )} style={{ background: 'var(--bg-card)' }}>
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                                <div className="font-bold text-[13px]">
                                    <span className="text-muted-foreground/50 mr-1.5">#{place}</span>
                                    {isMe ? <span className="text-sky-400">You</span> : `Team ${t.teamIndex + 1}`}
                                </div>
                                <div className="text-[13px] font-bold font-[var(--font-jetbrains),monospace]">
                                    {Math.round(t.projected).toLocaleString()}
                                </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 mb-2">
                                {isMe ? 'your picks' : sourceLabel(settings.teamSources[t.teamIndex])}
                            </div>

                            {/* Relative strength bar */}
                            <div className="h-1 rounded-full bg-white/[0.05] mb-2.5 overflow-hidden">
                                <div className="h-full rounded-full"
                                    style={{
                                        width: `${(t.projected / best) * 100}%`,
                                        background: isMe ? '#38bdf8' : 'rgba(255,255,255,0.25)',
                                    }} />
                            </div>

                            <div className="space-y-1">
                                {t.picks.map(pk => {
                                    const pl = byId.get(pk.playerId);
                                    if (!pl) return null;
                                    const pos = (pl.position || '').toUpperCase();
                                    const isStarter = starterIds.has(pl.id);
                                    return (
                                        <div key={pk.overall} className={cn(
                                            'flex items-center gap-1.5 text-[11px]',
                                            !isStarter && 'opacity-45',
                                        )}>
                                            <span className="w-9 shrink-0 text-muted-foreground/40 font-[var(--font-jetbrains),monospace]">
                                                {pk.round}.{String(pk.pickInRound).padStart(2, '0')}
                                            </span>
                                            <span className={cn('px-1 rounded text-[9px] font-bold shrink-0', POSITION_COLORS[pos])}>
                                                {pos}
                                            </span>
                                            <Link href={`/redraft/players/${pl.slug}`}
                                                className="truncate hover:text-sky-400 transition-colors">
                                                {pl.full_name}
                                            </Link>
                                            {pk.auto && (
                                                <span className="ml-auto text-[9px] text-amber-400/70 shrink-0">auto</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
