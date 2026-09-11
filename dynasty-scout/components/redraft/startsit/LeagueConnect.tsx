'use client';

import React, { useState } from 'react';
import { Users, Unplug, RefreshCw, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUserId, getUserLeagues } from '@/lib/sleeper';
import { parseLeagueId, readEspnCreds, saveEspnCreds } from '@/lib/espn';
import { connectionKey, LeaguePlatform, LeagueSyncState } from '@/lib/useLeagueSync';

const SEASON = '2026';

/**
 * Point the page at one team in one league.
 *
 * Same shape as the draft connector, and for the same reason: the connection
 * lives in this browser only, so two people can open the app and each see
 * their own lineup.
 */
export function LeagueConnect({ league, compact = false }: {
    league: LeagueSyncState;
    compact?: boolean;
}) {
    const [platform, setPlatform] = useState<LeaguePlatform>(
        league.connection?.platform ?? 'sleeper');
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [found, setFound] = useState<{ league_id: string; name: string | null }[] | null>(null);
    const [swid, setSwid] = useState('');
    const [s2, setS2] = useState('');

    async function lookUp() {
        const q = input.trim();
        if (!q || busy) return;
        setBusy(true); setError(null); setFound(null);
        try {
            if (platform === 'espn') {
                const id = parseLeagueId(q);
                if (!id) { setError('That does not look like an ESPN league id or URL.'); return; }
                if (swid.trim() && s2.trim()) saveEspnCreds({ swid: swid.trim(), s2: s2.trim() });
                league.connect({ platform: 'espn', id, season: SEASON, label: `ESPN ${id.slice(-6)}` });
                return;
            }
            const userId = await getUserId(q);
            if (!userId) { setError(`No Sleeper user named “${q}”.`); return; }
            const leagues = await getUserLeagues(userId, SEASON);
            if (leagues.length === 0) { setError(`${q} has no ${SEASON} leagues.`); return; }
            setFound(leagues);
        } catch {
            setError('That service did not answer — try again in a moment.');
        } finally {
            setBusy(false);
        }
    }

    // ── connected: a compact bar with the team and week pickers ──
    if (league.connection && compact) {
        const teams = league.snapshot?.teams ?? [];
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] px-3 py-2"
                style={{ background: 'var(--bg-card)' }}>
                {/* The league picker, not a label.
                    Managing several teams is the normal case, and making
                    someone disconnect and retype a username to look at their
                    other league is the kind of friction that stops a tool
                    being opened. Every team this browser has connected stays
                    one select away. */}
                {league.saved.length > 1 ? (
                    <select
                        aria-label="Which league"
                        value={connectionKey(league.connection)}
                        onChange={e => {
                            const next = league.saved.find(c => connectionKey(c) === e.target.value);
                            if (next) league.switchTo(next);
                        }}
                        className="h-7 max-w-[240px] rounded-lg bg-card border border-border/60 px-2 text-[11px]
                                   font-bold text-foreground [&>option]:bg-card [&>option]:text-foreground">
                        {league.saved.map(c => (
                            <option key={connectionKey(c)} value={connectionKey(c)}>{c.label}</option>
                        ))}
                    </select>
                ) : (
                    <span className="text-[11px] font-bold text-foreground truncate max-w-[220px]">
                        {league.snapshot?.leagueName ?? league.connection.label}
                    </span>
                )}
                <button
                    onClick={league.disconnect}
                    title="Connect another league"
                    aria-label="Connect another league"
                    className="grid place-items-center w-7 h-7 rounded-lg hover:bg-white/10
                               text-muted-foreground hover:text-foreground">
                    <Plus className="w-3.5 h-3.5" />
                </button>
                <select
                    aria-label="Which team is yours"
                    value={league.connection.teamKey ?? ''}
                    onChange={e => league.setTeam(e.target.value)}
                    className="h-7 rounded-lg bg-card border border-border/60 px-2 text-[11px] font-semibold text-foreground
                               [&>option]:bg-card [&>option]:text-foreground">
                    <option value="">pick your team</option>
                    {teams.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
                <select
                    aria-label="Week"
                    value={league.week ?? ''}
                    onChange={e => league.setWeek(Number(e.target.value))}
                    className="h-7 rounded-lg bg-card border border-border/60 px-2 text-[11px] font-semibold text-foreground
                               [&>option]:bg-card [&>option]:text-foreground">
                    {Array.from({ length: 18 }, (_, i) => i + 1).map(w => (
                        <option key={w} value={w}>Week {w}</option>
                    ))}
                </select>
                {league.opponent.team && (
                    <span className="text-[11px] text-muted-foreground/70">
                        vs <span className="font-semibold text-foreground">{league.opponent.team.name}</span>
                    </span>
                )}
                {(league.me.unmatched > 0 || league.opponent.unmatched > 0) && (
                    <span className="text-[10px] text-amber-400/80"
                        title="Roster spots that matched no player in the pool — usually a just-signed free agent.">
                        {league.me.unmatched + league.opponent.unmatched} unmatched
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                    <button onClick={league.refresh} title="Reload the lineup"
                        aria-label="Reload the lineup"
                        className="grid place-items-center w-7 h-7 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground">
                        <RefreshCw className={cn('w-3.5 h-3.5', league.status === 'loading' && 'animate-spin')} />
                    </button>
                    <button onClick={league.disconnect} title="Disconnect" aria-label="Disconnect the league"
                        className="grid place-items-center w-7 h-7 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground">
                        <Unplug className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    // ── not connected, or connected without a team chosen ──
    const savedOthers = league.saved.filter(
        c => !league.connection || connectionKey(c) !== connectionKey(league.connection));

    const teams = league.snapshot?.teams ?? [];
    return (
        <div className="max-w-lg mx-auto mt-10 rounded-xl border border-white/[0.07] p-5 space-y-3"
            style={{ background: 'var(--bg-card)' }}>
            <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <h1 className="text-[15px] font-bold">Connect your league</h1>
            </div>
            <p className="text-[12px] text-muted-foreground/70">
                Start/sit advice needs your actual roster and the team you are playing this
                week. Saved in this browser only, so anyone can connect their own league.
            </p>

            {/* Teams already connected in this browser, so clearing one to add
                another is recoverable in a click rather than a re-entered
                username. */}
            {savedOthers.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-muted-foreground/70">
                        Your teams
                    </p>
                    <div className="grid gap-1">
                        {savedOthers.map(c => (
                            <div key={connectionKey(c)} className="flex items-center gap-1">
                                <button onClick={() => league.switchTo(c)}
                                    className="flex-1 text-left px-3 py-2 rounded-lg border border-white/[0.06]
                                               hover:border-sky-500/40 hover:bg-sky-500/5 text-[12px] font-semibold">
                                    {c.label}
                                    <span className="ml-1.5 text-[10px] font-normal uppercase
                                                     text-muted-foreground/45">{c.platform}</span>
                                </button>
                                <button onClick={() => league.forget(c)}
                                    title={`Forget ${c.label}`} aria-label={`Forget ${c.label}`}
                                    className="grid place-items-center w-7 h-7 rounded-lg shrink-0
                                               hover:bg-white/10 text-muted-foreground/50 hover:text-foreground">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {league.connection && teams.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-[12px] font-semibold">Which team is yours?</p>
                    <div className="grid gap-1 max-h-72 overflow-y-auto">
                        {teams.map(t => (
                            <button key={t.key} onClick={() => league.setTeam(t.key)}
                                className="text-left px-3 py-2 rounded-lg border border-white/[0.06]
                                           hover:border-sky-500/40 hover:bg-sky-500/5 text-[12px] font-semibold">
                                {t.name}
                            </button>
                        ))}
                    </div>
                    <button onClick={league.disconnect}
                        className="text-[11px] text-muted-foreground/60 hover:text-foreground">
                        use a different league
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-0.5 bg-black/30 border border-white/10 rounded-lg p-0.5">
                        {(['sleeper', 'espn'] as LeaguePlatform[]).map(pf => (
                            <button key={pf} onClick={() => { setPlatform(pf); setFound(null); setError(null); }}
                                className={cn('flex-1 h-7 rounded-md text-[12px] font-bold transition-all',
                                    platform === pf ? 'bg-sky-500/20 text-sky-300'
                                        : 'text-muted-foreground hover:text-foreground')}>
                                {pf === 'espn' ? 'ESPN' : 'Sleeper'}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-1.5">
                        <input value={input} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') lookUp(); }}
                            placeholder={platform === 'espn' ? 'League id, or any league URL' : 'Sleeper username'}
                            className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-card border border-border/60 text-[13px]
                                       placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-sky-400/40" />
                        <button onClick={lookUp} disabled={busy || !input.trim()}
                            className="px-3 h-9 rounded-lg bg-sky-500/90 hover:bg-sky-500 text-white text-[12px] font-bold
                                       disabled:opacity-40 disabled:cursor-default">
                            {busy ? '…' : 'Find'}
                        </button>
                    </div>

                    {platform === 'espn' && (
                        <div className="space-y-1.5">
                            <input value={swid} onChange={e => setSwid(e.target.value)} placeholder="SWID  {XXXXXXXX-…}"
                                className="w-full h-8 px-2 rounded-lg bg-card border border-border/60 text-[12px]
                                           placeholder:text-muted-foreground/50 focus:outline-none" />
                            <input value={s2} onChange={e => setS2(e.target.value)} placeholder="espn_s2  AEB…"
                                className="w-full h-8 px-2 rounded-lg bg-card border border-border/60 text-[12px]
                                           placeholder:text-muted-foreground/50 focus:outline-none" />
                            <p className="text-[10px] text-muted-foreground/60 leading-snug">
                                Private leagues need these two cookies from fantasy.espn.com. Kept in this
                                browser and sent with each request; never stored on our side.
                            </p>
                        </div>
                    )}

                    {error && <p className="text-[11px] text-amber-400">{error}</p>}

                    {found && (
                        <div className="grid gap-1 max-h-64 overflow-y-auto">
                            {found.map(l => (
                                <button key={l.league_id}
                                    onClick={() => league.connect({
                                        platform: 'sleeper', id: l.league_id, season: SEASON,
                                        label: l.name ?? `League ${l.league_id.slice(-6)}`,
                                    })}
                                    className="text-left px-3 py-2 rounded-lg border border-white/[0.06]
                                               hover:border-sky-500/40 hover:bg-sky-500/5 text-[12px] font-semibold">
                                    {l.name ?? l.league_id}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
            {league.status === 'needsCreds' && (
                <p className="text-[11px] text-amber-400">
                    That ESPN league is private — add your SWID and espn_s2 above.
                </p>
            )}
        </div>
    );
}
