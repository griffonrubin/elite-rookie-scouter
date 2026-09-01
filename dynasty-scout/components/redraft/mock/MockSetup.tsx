'use client';

import React, { useState } from 'react';
import { Dice5, Play, Shuffle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { POSITION_RAW } from '@/lib/constants';
import {
    AI_SOURCES, DEFAULT_POSITION_LIMITS, DEFAULT_ROSTER, MockSettings, Pos,
    POSITIONS, RankSourceKey, RosterSlots, defaultSettings, sourceLabel,
    totalRounds,
} from '@/lib/mockDraft';

interface Props {
    onStart: (settings: MockSettings) => void;
}

const TEAM_SIZES = [8, 10, 12, 14, 16] as const;
const CLOCKS: { value: number; label: string }[] = [
    { value: 0, label: 'No clock' },
    { value: 30, label: '30s' },
    { value: 60, label: '60s' },
    { value: 90, label: '90s' },
    { value: 120, label: '2 min' },
];

const ROSTER_ROWS: { key: keyof RosterSlots; label: string; hint: string }[] = [
    { key: 'QB', label: 'QB', hint: 'Starting quarterbacks' },
    { key: 'RB', label: 'RB', hint: 'Starting running backs' },
    { key: 'WR', label: 'WR', hint: 'Starting receivers' },
    { key: 'TE', label: 'TE', hint: 'Starting tight ends' },
    { key: 'FLEX', label: 'FLEX', hint: 'RB / WR / TE' },
    { key: 'DST', label: 'D/ST', hint: 'Team defense' },
    { key: 'K', label: 'K', hint: 'Kicker' },
    { key: 'BN', label: 'Bench', hint: 'Bench spots' },
];

function Stepper({
    value, onChange, min = 0, max = 12, label,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                aria-label={`Decrease ${label}`}
                onClick={() => onChange(Math.max(min, value - 1))}
                disabled={value <= min}
                className="w-6 h-6 rounded-md border border-border/60 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >−</button>
            <span className="w-7 text-center text-[13px] font-bold font-[var(--font-jetbrains),monospace]">
                {value}
            </span>
            <button
                type="button"
                aria-label={`Increase ${label}`}
                onClick={() => onChange(Math.min(max, value + 1))}
                disabled={value >= max}
                className="w-6 h-6 rounded-md border border-border/60 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >+</button>
        </div>
    );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-white/[0.06] p-4" style={{ background: 'var(--bg-card)' }}>
            <div className="mb-3">
                <h2 className="text-sm font-bold">{title}</h2>
                {hint && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{hint}</p>}
            </div>
            {children}
        </section>
    );
}

export function MockSetup({ onStart }: Props) {
    const [s, setS] = useState<MockSettings>(() => defaultSettings(12, 1));
    const [randomSlot, setRandomSlot] = useState(false);

    const rounds = totalRounds(s.roster);
    const set = (patch: Partial<MockSettings>) => setS(prev => ({ ...prev, ...patch }));

    function setTeams(n: number) {
        setS(prev => ({
            ...prev,
            teams: n,
            mySlot: Math.min(prev.mySlot, n),
            teamSources: Array.from({ length: n },
                (_, i) => prev.teamSources[i] ?? AI_SOURCES[i % AI_SOURCES.length].key),
        }));
    }

    function setRoster(key: keyof RosterSlots, n: number) {
        setS(prev => ({ ...prev, roster: { ...prev.roster, [key]: n } }));
    }

    function setSource(teamIdx: number, key: RankSourceKey) {
        setS(prev => {
            const next = [...prev.teamSources];
            next[teamIdx] = key;
            return { ...prev, teamSources: next };
        });
    }

    const allSame = (key: RankSourceKey) =>
        set({ teamSources: Array.from({ length: s.teams }, () => key) });

    const randomizeSources = () =>
        set({
            teamSources: Array.from({ length: s.teams },
                () => AI_SOURCES[Math.floor(Math.random() * AI_SOURCES.length)].key),
        });

    const spreadSources = () =>
        set({
            teamSources: Array.from({ length: s.teams },
                (_, i) => AI_SOURCES[i % AI_SOURCES.length].key),
        });

    function start() {
        const mySlot = randomSlot ? 1 + Math.floor(Math.random() * s.teams) : s.mySlot;
        onStart({ ...s, mySlot });
    }

    return (
        <div className="space-y-4 max-w-5xl">
            <div className="grid gap-4 lg:grid-cols-2">
                {/* ── League ── */}
                <Section title="League" hint="Snake order reverses every other round, as most leagues do.">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-muted-foreground">Teams</span>
                            <div className="flex items-center gap-0.5 bg-black/30 border border-border/60 rounded-lg p-1">
                                {TEAM_SIZES.map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setTeams(n)}
                                        className={cn('px-2.5 h-6 rounded-md text-[11px] font-bold transition-all',
                                            s.teams === n ? 'bg-sky-500/20 text-sky-400'
                                                : 'text-muted-foreground hover:text-foreground')}
                                    >{n}</button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-muted-foreground">My draft slot</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRandomSlot(v => !v)}
                                    className={cn('flex items-center gap-1 px-2 h-7 rounded-lg border text-[11px] font-bold transition-all',
                                        randomSlot ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                                            : 'border-border/60 text-muted-foreground hover:text-foreground')}
                                >
                                    <Dice5 className="w-3.5 h-3.5" /> Random
                                </button>
                                <select
                                    aria-label="My draft slot"
                                    disabled={randomSlot}
                                    value={s.mySlot}
                                    onChange={e => set({ mySlot: Number(e.target.value) })}
                                    className="h-7 rounded-lg bg-card border border-border/60 px-2 text-[11px] font-semibold disabled:opacity-40"
                                >
                                    {Array.from({ length: s.teams }, (_, i) => i + 1).map(n => (
                                        <option key={n} value={n}>Pick {n}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-muted-foreground">Draft type</span>
                            <div className="flex items-center gap-0.5 bg-black/30 border border-border/60 rounded-lg p-1">
                                {[[true, 'Snake'], [false, 'Linear']].map(([val, label]) => (
                                    <button
                                        key={String(label)}
                                        type="button"
                                        onClick={() => set({ snake: val as boolean })}
                                        className={cn('px-2.5 h-6 rounded-md text-[11px] font-bold transition-all',
                                            s.snake === val ? 'bg-sky-500/20 text-sky-400'
                                                : 'text-muted-foreground hover:text-foreground')}
                                    >{label as string}</button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-muted-foreground">Time per pick</span>
                            <select
                                aria-label="Time per pick"
                                value={s.secondsPerPick}
                                onChange={e => set({ secondsPerPick: Number(e.target.value) })}
                                className="h-7 rounded-lg bg-card border border-border/60 px-2 text-[11px] font-semibold"
                            >
                                {CLOCKS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>

                        <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground/60">
                                When your clock expires the top available player is taken for you.
                            </span>
                        </div>
                    </div>
                </Section>

                {/* ── Roster ── */}
                <Section title="Roster" hint={`${rounds} rounds · ${rounds * s.teams} total picks`}>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {ROSTER_ROWS.map(r => (
                            <div key={r.key} className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-semibold" title={r.hint}
                                    style={{ color: POSITION_RAW[r.key as string] ?? undefined }}>
                                    {r.label}
                                </span>
                                <Stepper
                                    label={r.label}
                                    value={s.roster[r.key]}
                                    onChange={n => setRoster(r.key, n)}
                                    max={r.key === 'BN' ? 12 : 6}
                                />
                            </div>
                        ))}
                    </div>
                </Section>

                {/* ── Position limits ── */}
                <Section title="Position limits" hint="Most a single team may roster at each position.">
                    <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                        {POSITIONS.map(pos => (
                            <div key={pos} className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-semibold" style={{ color: POSITION_RAW[pos] }}>
                                    {pos === 'DST' ? 'D/ST' : pos}
                                </span>
                                <Stepper
                                    label={pos}
                                    value={s.positionLimits[pos]}
                                    min={1}
                                    max={10}
                                    onChange={n => set({ positionLimits: { ...s.positionLimits, [pos]: n } })}
                                />
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 mt-3">
                        Kickers and defenses are held back until the final two rounds, the way a real
                        room drafts them.
                    </p>
                </Section>

                {/* ── AI behaviour ── */}
                <Section title="Opponent behaviour" hint="How closely the other managers follow their rankings.">
                    <div className="space-y-2">
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={s.randomness}
                            aria-label="Opponent randomness"
                            onChange={e => set({ randomness: Number(e.target.value) })}
                            className="w-full accent-sky-500"
                        />
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
                            <span>Strict rankings</span>
                            <span className="font-bold text-sky-400">{s.randomness}</span>
                            <span>Frequent reaches</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/50">
                            {s.randomness === 0
                                ? 'Fully deterministic — the same settings replay the same draft.'
                                : 'Opponents mostly take their best available, but sometimes reach.'}
                        </p>
                    </div>
                </Section>
            </div>

            {/* ── Per-team sources ── */}
            <Section
                title="Who each team drafts from"
                hint="Give the room different rankings and you find out what actually falls to your slot."
            >
                <div className="flex flex-wrap gap-2 mb-3">
                    <button type="button" onClick={spreadSources}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg border border-border/60 text-[11px] font-bold text-muted-foreground hover:text-foreground">
                        <Users className="w-3.5 h-3.5" /> Spread across sources
                    </button>
                    <button type="button" onClick={randomizeSources}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg border border-border/60 text-[11px] font-bold text-muted-foreground hover:text-foreground">
                        <Shuffle className="w-3.5 h-3.5" /> Randomize
                    </button>
                    {/* Setting the whole room to one platform is the common
                        case — it answers "what would this draft look like on
                        Sleeper" — so it is a source picker rather than a
                        button hard-wired to consensus. Any team can still be
                        changed individually afterwards. */}
                    <label className="flex items-center gap-1.5 pl-2.5 pr-1 h-7 rounded-lg border border-border/60 text-[11px] font-bold text-muted-foreground focus-within:text-foreground hover:text-foreground">
                        Set all to
                        <select
                            aria-label="Set every team to one ranking source"
                            value=""
                            onChange={e => {
                                if (e.target.value) allSame(e.target.value as RankSourceKey);
                                // Snap back to the prompt: this is an action,
                                // not a setting, and the room may not be all
                                // one source a moment later.
                                e.target.value = '';
                            }}
                            className="h-6 rounded-md bg-card border border-border/60 px-1 text-[11px] font-bold text-foreground"
                        >
                            <option value="">choose…</option>
                            {AI_SOURCES.map(src => (
                                <option key={src.key} value={src.key}>{src.label}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: s.teams }, (_, i) => {
                        const isMe = !randomSlot && i + 1 === s.mySlot;
                        return (
                            <div key={i} className={cn(
                                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
                                isMe ? 'border-sky-500/50 bg-sky-500/10' : 'border-white/[0.06]',
                            )}>
                                <span className={cn('text-[11px] font-bold w-14 shrink-0',
                                    isMe ? 'text-sky-300' : 'text-muted-foreground')}>
                                    {isMe ? 'You' : `Team ${i + 1}`}
                                </span>
                                <select
                                    aria-label={`Rankings for team ${i + 1}`}
                                    value={s.teamSources[i]}
                                    disabled={isMe}
                                    onChange={e => setSource(i, e.target.value as RankSourceKey)}
                                    className="flex-1 h-7 rounded-md bg-card border border-border/60 px-1.5 text-[11px] font-semibold disabled:opacity-40 min-w-0"
                                >
                                    {AI_SOURCES.map(src => (
                                        <option key={src.key} value={src.key}>{src.label}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
                {randomSlot && (
                    <p className="text-[11px] text-muted-foreground/50 mt-3">
                        Your slot is drawn at random when the draft starts, so every team shows a source here.
                    </p>
                )}
            </Section>

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={start}
                    className="flex items-center gap-2 px-5 h-10 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-[13px] transition-colors"
                >
                    <Play className="w-4 h-4" /> Start mock draft
                </button>
                <span className="text-[11px] text-muted-foreground/60">
                    {s.teams} teams · {rounds} rounds ·{' '}
                    {randomSlot ? 'random slot' : `pick ${s.mySlot}`} ·{' '}
                    {s.secondsPerPick ? `${s.secondsPerPick}s per pick` : 'no clock'}
                </span>
            </div>
        </div>
    );
}
