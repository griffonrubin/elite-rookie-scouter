'use client';

import React from 'react';
import { Clock, FastForward, LayoutList, LayoutPanelTop, Columns, X } from 'lucide-react';
import { RedraftPlayer } from '@/lib/types';
import { PlayerOdds } from '@/lib/draftOdds';
import { POSITION_COLORS, POSITION_RAW } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
    EligibilityCtx, MockPick, MockSettings, Pos, RankSourceKey, RosterSlots,
    FLEX_POSITIONS, POSITIONS, sourceLabel, totalRounds,
} from '@/lib/mockDraft';
import { MockPlayerList } from './MockPlayerList';
import { MockPickGrid } from './MockPickGrid';

export type MockLayout = 'board' | 'list' | 'both';

interface Props {
    settings: MockSettings;
    picks: MockPick[];
    available: RedraftPlayer[];
    byId: Map<number, RedraftPlayer>;
    currentOverall: number;
    round: number;
    pickInRound: number;
    onClockTeam: number;
    myTurn: boolean;
    secondsLeft: number | null;
    layout: MockLayout;
    onLayoutChange: (l: MockLayout) => void;
    sortSource: RankSourceKey;
    /** Chance each available player lasts to your next turn. */
    odds?: Map<string, PlayerOdds> | null;
    onSortChange: (s: RankSourceKey) => void;
    myRanks?: Map<number, number>;
    eligibility: EligibilityCtx | null;
    onDraft: (p: RedraftPlayer) => void;
    onSkipToMyPick: () => void;
    onAbandon: () => void;
    myRoster: RedraftPlayer[];
}

/** Lay the user's picks into their starting slots, overflow to bench. */
function fillSlots(roster: RosterSlots, players: RedraftPlayer[]) {
    const slots: { label: string; player?: RedraftPlayer }[] = [];
    const pool = [...players];
    const take = (accept: (p: RedraftPlayer) => boolean) => {
        const i = pool.findIndex(accept);
        return i >= 0 ? pool.splice(i, 1)[0] : undefined;
    };
    const posIs = (pos: string) => (p: RedraftPlayer) => (p.position || '').toUpperCase() === pos;

    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
        for (let i = 0; i < roster[pos]; i++) slots.push({ label: pos, player: take(posIs(pos)) });
    }
    for (let i = 0; i < roster.FLEX; i++) {
        slots.push({
            label: 'FLEX',
            player: take(p => FLEX_POSITIONS.includes((p.position || '').toUpperCase() as Pos)),
        });
    }
    for (const pos of ['DST', 'K'] as const) {
        for (let i = 0; i < roster[pos]; i++) {
            slots.push({ label: pos === 'DST' ? 'D/ST' : pos, player: take(posIs(pos)) });
        }
    }
    for (let i = 0; i < roster.BN; i++) slots.push({ label: 'BN', player: pool.shift() });
    return slots;
}

export function MockDraftRoom(props: Props) {
    const {
        settings, picks, available, byId, currentOverall, round, pickInRound,
        onClockTeam, myTurn, secondsLeft, layout, onLayoutChange, sortSource, odds,
        onSortChange, myRanks, eligibility, onDraft, onSkipToMyPick, onAbandon, myRoster,
    } = props;

    const rounds = totalRounds(settings.roster);
    const slots = fillSlots(settings.roster, myRoster);
    const recent = [...picks].slice(-4).reverse();
    const urgent = secondsLeft != null && secondsLeft <= 10;

    const list = (
        <MockPlayerList
            available={available}
            odds={odds}
            sortSource={sortSource}
            onSortChange={onSortChange}
            myRanks={myRanks}
            eligibility={eligibility}
            onDraft={onDraft}
            myTurn={myTurn}
        />
    );
    const grid = (
        <MockPickGrid settings={settings} picks={picks} byId={byId} currentOverall={currentOverall} />
    );

    return (
        <div className="space-y-3">
            {/* ── Status bar ── */}
            <div className={cn(
                'rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2',
                myTurn ? 'border-sky-500/50 bg-sky-500/[0.07]' : 'border-white/[0.06]',
            )} style={!myTurn ? { background: 'var(--bg-card)' } : undefined}>
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-bold">
                        Round {round} · Pick {pickInRound}
                    </div>
                    <div className="text-lg font-bold leading-tight">
                        {myTurn ? (
                            <span className="text-sky-400">You&apos;re on the clock</span>
                        ) : (
                            <span>
                                Team {onClockTeam + 1}
                                <span className="text-[12px] font-normal text-muted-foreground ml-2">
                                    drafting from {sourceLabel(settings.teamSources[onClockTeam])}
                                </span>
                            </span>
                        )}
                    </div>
                </div>

                <div className="text-[11px] text-muted-foreground">
                    Pick <span className="font-bold text-foreground">{currentOverall}</span>
                    {' '}of {rounds * settings.teams}
                </div>

                {secondsLeft != null && (
                    <div className={cn('flex items-center gap-1.5 font-bold font-[var(--font-jetbrains),monospace]',
                        urgent ? 'text-red-400 animate-pulse' : 'text-foreground')}>
                        <Clock className="w-4 h-4" />
                        {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                        {String(secondsLeft % 60).padStart(2, '0')}
                    </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    {!myTurn && (
                        <button
                            type="button"
                            onClick={onSkipToMyPick}
                            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-border/60 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <FastForward className="w-3.5 h-3.5" /> Skip to my pick
                        </button>
                    )}

                    <div className="flex items-center gap-0.5 bg-card border border-border/60 rounded-lg p-1">
                        {([
                            ['board', LayoutPanelTop, 'Board only'],
                            ['list', LayoutList, 'List only'],
                            ['both', Columns, 'Board and list'],
                        ] as const).map(([mode, Icon, label]) => (
                            <button
                                key={mode}
                                type="button"
                                aria-label={label}
                                onClick={() => onLayoutChange(mode)}
                                className={cn('flex h-6 w-6 items-center justify-center rounded-md transition-all',
                                    layout === mode ? 'bg-sky-500/20 text-sky-400'
                                        : 'text-muted-foreground hover:text-foreground')}
                            >
                                <Icon className="h-3.5 w-3.5" />
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={onAbandon}
                        title="Abandon this mock draft"
                        aria-label="Abandon mock draft"
                        className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground/60 hover:text-red-400 hover:border-red-400/40 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
                {/* ── Main area ── */}
                <div className="min-w-0">
                    {layout === 'both' ? (
                        <div className="grid gap-3 xl:grid-cols-2">
                            <div className="h-[560px] min-w-0">{grid}</div>
                            <div className="h-[560px] min-w-0">{list}</div>
                        </div>
                    ) : layout === 'board' ? (
                        <div className="h-[620px]">{grid}</div>
                    ) : (
                        <div className="h-[620px]">{list}</div>
                    )}
                </div>

                {/* ── My roster + recent picks ── */}
                <aside className="space-y-3 min-w-0">
                    <div className="rounded-xl border border-white/[0.06] p-3" style={{ background: 'var(--bg-card)' }}>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-bold mb-2">
                            My roster · pick {settings.mySlot}
                        </div>
                        <div className="space-y-1">
                            {slots.map((s, i) => {
                                const pos = (s.player?.position || '').toUpperCase();
                                return (
                                    <div key={i} className="flex items-center gap-2 text-[11px]">
                                        <span className="w-9 shrink-0 font-bold text-muted-foreground/50">{s.label}</span>
                                        {s.player ? (
                                            <>
                                                <span className={cn('px-1 rounded text-[9px] font-bold shrink-0', POSITION_COLORS[pos])}>
                                                    {pos}
                                                </span>
                                                <span className="truncate font-semibold">{s.player.full_name}</span>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground/25">empty</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/[0.06] p-3" style={{ background: 'var(--bg-card)' }}>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-bold mb-2">
                            Recent picks
                        </div>
                        {recent.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground/40">No picks yet.</div>
                        ) : (
                            <div className="space-y-1.5">
                                {recent.map(pk => {
                                    const pl = byId.get(pk.playerId);
                                    const pos = (pl?.position || '').toUpperCase();
                                    return (
                                        <div key={pk.overall} className="flex items-center gap-1.5 text-[11px]">
                                            <span className="text-muted-foreground/50 font-[var(--font-jetbrains),monospace] shrink-0">
                                                {pk.round}.{String(pk.pickInRound).padStart(2, '0')}
                                            </span>
                                            <span className="w-1 h-3 rounded-sm shrink-0"
                                                style={{ background: POSITION_RAW[pos] }} />
                                            <span className="truncate">{pl?.full_name ?? '—'}</span>
                                            {pk.teamIndex === settings.mySlot - 1 && (
                                                <span className="ml-auto text-sky-400 font-bold shrink-0">you</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
