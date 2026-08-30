'use client';

import React, { useState } from 'react';
import { Radio, X, Unplug, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    draftLabel, getConnectableDrafts, getUserId, parseDraftId, SleeperDraft,
} from '@/lib/sleeper';
import { parseLeagueId, readEspnCreds, saveEspnCreds } from '@/lib/espn';
import { DraftPlatform, DraftSyncState } from '@/lib/useDraftSync';

const SEASON = '2026';

/**
 * Connect the board to a live draft on Sleeper or ESPN.
 *
 * Sleeper takes a username (which lists that account's drafts) or a pasted
 * draft link, since a mock belongs to no league. ESPN is addressed by league
 * id, and private leagues need the two cookies a signed-in browser holds.
 * Everything is stored in this browser only — see useDraftSync.
 */
export function DraftSync({ sync }: { sync: DraftSyncState }) {
    const [open, setOpen] = useState(false);
    // Reconnecting almost always means the same service you just left.
    const [platform, setPlatform] = useState<DraftPlatform>(
        sync.connection?.platform ?? 'sleeper');
    const [input, setInput] = useState('');
    const [drafts, setDrafts] = useState<SleeperDraft[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showCreds, setShowCreds] = useState(false);
    const [swid, setSwid] = useState('');
    const [s2, setS2] = useState('');

    const live = sync.connection && sync.status === 'drafting';

    async function lookUp() {
        const q = input.trim();
        if (!q || busy) return;
        setBusy(true);
        setError(null);
        setDrafts(null);
        try {
            if (platform === 'espn') {
                const leagueId = parseLeagueId(q);
                if (!leagueId) {
                    setError('That does not look like an ESPN league id or URL.');
                    return;
                }
                if (swid.trim() && s2.trim()) {
                    saveEspnCreds({ swid: swid.trim(), s2: s2.trim() });
                }
                sync.connect({
                    platform: 'espn', id: leagueId, season: SEASON,
                    label: `ESPN ${leagueId.slice(-6)}`,
                });
                setOpen(false);
                setInput('');
                return;
            }

            const directId = parseDraftId(q);
            if (directId) {
                sync.connect({
                    platform: 'sleeper', id: directId,
                    label: `Draft ${directId.slice(-6)}`,
                });
                setOpen(false);
                setInput('');
                return;
            }
            const userId = await getUserId(q);
            if (!userId) {
                setError(`No Sleeper user named “${q}” — or paste the draft link instead.`);
                return;
            }
            const found = await getConnectableDrafts(userId, SEASON);
            if (found.length === 0) {
                setError(`${q} has no ${SEASON} drafts or leagues yet — paste the draft URL instead.`);
                return;
            }
            setDrafts(found);
        } catch {
            setError('That service did not answer — try again in a moment.');
        } finally {
            setBusy(false);
        }
    }

    function pickSleeper(d: SleeperDraft) {
        sync.connect({ platform: 'sleeper', id: d.draft_id, label: draftLabel(d) });
        setOpen(false);
        setInput('');
        setDrafts(null);
    }

    // ── Connected chip ──────────────────────────────────────────────────────
    if (sync.connection) {
        const failing = sync.status === 'error';
        const picks = `${sync.pickCount} ${sync.pickCount === 1 ? 'pick' : 'picks'}`;
        const service = sync.connection.platform === 'espn' ? 'ESPN' : 'Sleeper';
        const statusText =
            sync.status === 'drafting' ? `LIVE · ${picks}`
            : sync.status === 'complete' ? `done · ${picks}`
            : sync.status === 'pre_draft' ? 'not started — no picks'
            : sync.status === 'paused' ? 'paused'
            : sync.needsCreds ? 'private league'
            : failing ? `can't reach ${service}`
            : 'connecting…';

        const detail = sync.needsCreds
            ? 'This ESPN league is private. Disconnect and reconnect with your SWID and '
              + 'espn_s2 cookies to read it.'
            : sync.status === 'pre_draft'
            ? `${sync.connection.label} — ${service} says this draft has not started, so `
              + 'there are no picks yet. In a different draft right now? Disconnect and '
              + 'connect to that one.'
            : `${sync.connection.label} — ${picks} received, `
              + `${sync.takenSlugs.size} matched to board players`
              + (sync.unmatched ? `, ${sync.unmatched} unmatched` : '');

        return (
            <div className={cn(
                'relative flex items-center gap-1.5 pl-2.5 pr-1 h-8 rounded-lg border text-[12px] font-semibold',
                live ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : failing ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                : 'border-sky-500/30 bg-sky-500/5 text-sky-300',
            )} title={detail}>
                <span className="relative flex w-2 h-2" aria-hidden="true">
                    {live && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
                    <span className={cn('relative inline-flex w-2 h-2 rounded-full',
                        live ? 'bg-emerald-400' : failing ? 'bg-amber-400' : 'bg-sky-400')} />
                </span>
                <span className="hidden sm:inline max-w-[130px] truncate">{sync.label}</span>
                <span className="text-[10px] opacity-70 whitespace-nowrap">{statusText}</span>
                {sync.needsCreds && (
                    <button
                        onClick={() => {
                            const saved = readEspnCreds();
                            if (saved) { setSwid(saved.swid); setS2(saved.s2); }
                            setShowCreds(v => !v);
                        }}
                        aria-label="Add your ESPN cookies to read this private league"
                        title="Add your ESPN cookies"
                        className="grid place-items-center w-6 h-6 rounded-md bg-amber-500/20 hover:bg-amber-500/30"
                    >
                        <KeyRound className="w-3 h-3" />
                    </button>
                )}
                {sync.shape && (
                    <select
                        value={sync.connection.slot ?? ''}
                        onChange={e => sync.setSlot(e.target.value ? Number(e.target.value) : undefined)}
                        aria-label="Your draft slot — needed to work out when your next pick lands"
                        title={sync.connection.slot
                            ? `Drafting from slot ${sync.connection.slot}. Every player shows the chance he comes back to you.`
                            : 'Pick your draft slot to see the chance each player comes back to you at your next turn.'}
                        className={cn(
                            'h-6 rounded-md px-1 text-[10px] font-bold focus:outline-none',
                            // Unset, the odds cannot be worked out and nothing
                            // appears — so the control that unlocks them asks
                            // for attention rather than sitting quiet.
                            sync.connection.slot
                                ? 'bg-black/30 border border-current/25 text-current'
                                : 'bg-amber-500/20 border border-amber-400/60 text-amber-300 animate-pulse',
                        )}
                    >
                        <option value="">set slot</option>
                        {Array.from({ length: sync.shape.teams }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{`slot ${n}`}</option>
                        ))}
                    </select>
                )}
                <button
                    onClick={sync.disconnect}
                    aria-label="Disconnect from the draft"
                    title="Disconnect"
                    className="ml-0.5 grid place-items-center w-6 h-6 rounded-md hover:bg-white/10 text-current/70 hover:text-current"
                >
                    <Unplug className="w-3 h-3" />
                </button>
                {sync.needsCreds && showCreds && (
                    // Saving is all it takes: the poll reads the cookies fresh
                    // each time and is still retrying in the background, so the
                    // league comes to life without reconnecting.
                    <SyncSheet onClose={() => setShowCreds(false)}>
                        <div className="text-[12px] font-bold text-foreground">Private ESPN league</div>
                        <EspnCredsFields swid={swid} s2={s2} setSwid={setSwid} setS2={setS2} />
                        <button
                            onClick={() => {
                                saveEspnCreds(swid.trim() && s2.trim()
                                    ? { swid: swid.trim(), s2: s2.trim() } : null);
                                setShowCreds(false);
                            }}
                            className="w-full h-8 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-black text-[12px] font-bold"
                        >
                            Save cookies
                        </button>
                    </SyncSheet>
                )}
            </div>
        );
    }

    // ── Connect button + panel ──────────────────────────────────────────────
    const espn = platform === 'espn';
    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[12px] font-semibold transition-all',
                    open
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'text-muted-foreground border-white/10 hover:text-foreground',
                )}
                title="Sync with a live draft — picks come off the board as they happen"
            >
                <Radio className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sync draft</span>
            </button>

            {open && (
                <SyncSheet onClose={() => setOpen(false)}>
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="text-[13px] font-bold">Sync a live draft</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Players come off the board as they are picked. Saved only in
                                this browser.
                            </p>
                        </div>
                        <button onClick={() => setOpen(false)} aria-label="Close"
                            className="text-muted-foreground/60 hover:text-foreground flex-shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-0.5 bg-black/30 border border-white/10 rounded-lg p-0.5">
                        {(['sleeper', 'espn'] as DraftPlatform[]).map(pf => (
                            <button
                                key={pf}
                                onClick={() => { setPlatform(pf); setDrafts(null); setError(null); }}
                                className={cn(
                                    'flex-1 h-7 rounded-md text-[12px] font-bold transition-all',
                                    platform === pf
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {pf === 'espn' ? 'ESPN' : 'Sleeper'}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-1.5">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') lookUp(); }}
                            placeholder={espn
                                ? 'League id, or any league URL'
                                : 'Username or sleeper.com/draft/nfl/…'}
                            className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-card border border-border/60 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                            autoFocus
                        />
                        <button
                            onClick={lookUp}
                            disabled={busy || !input.trim()}
                            className="px-3 h-9 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-black text-[12px] font-bold disabled:opacity-40 disabled:cursor-default"
                        >
                            {busy ? '…' : espn ? 'Connect' : 'Find'}
                        </button>
                    </div>

                    {espn && (
                        <div className="space-y-1.5">
                            <button
                                onClick={() => {
                                    const saved = readEspnCreds();
                                    if (saved) { setSwid(saved.swid); setS2(saved.s2); }
                                    setShowCreds(v => !v);
                                }}
                                className="text-[11px] text-sky-400 hover:text-sky-300"
                            >
                                {showCreds ? 'Hide' : 'Private league? Add your ESPN cookies'}
                            </button>
                            {showCreds && (
                                <EspnCredsFields swid={swid} s2={s2} setSwid={setSwid} setS2={setS2} />
                            )}
                        </div>
                    )}

                    {error && <div className="text-[11px] text-amber-400">{error}</div>}

                    {drafts && (
                        <>
                            <div className="text-[10px] text-muted-foreground/70">
                                Your mocks and every league draft, live ones first. Pick the one
                                marked <span className="text-emerald-400 font-bold">LIVE</span> — a
                                draft that has not started reports no picks.
                            </div>
                            <div className="max-h-56 overflow-y-auto space-y-1">
                                {drafts.map(d => (
                                    <button
                                        key={d.draft_id}
                                        onClick={() => pickSleeper(d)}
                                        className="w-full text-left px-2.5 py-2 rounded-lg border border-white/[0.06] hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors"
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            {d.status === 'drafting' && (
                                                <span className="px-1.5 py-px rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold flex-shrink-0">
                                                    LIVE
                                                </span>
                                            )}
                                            <span className="text-[12px] font-semibold truncate">{draftLabel(d)}</span>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                                            {d.status === 'pre_draft' ? 'not started' : d.status.replace('_', ' ')} · {d.type}
                                            {!d.league_id && ' · mock'}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </SyncSheet>
            )}
        </div>
    );
}

/**
 * The surface both panels sit on.
 *
 * A dropdown hung off a toolbar button runs off the side of a phone — the
 * button is nowhere near the right edge — so on small screens this is a bottom
 * sheet instead, which needs no positioning math and puts the controls within
 * thumb reach. From `sm` up it is the dropdown it looks like.
 */
function SyncSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    return (
        <>
            <div onClick={onClose} aria-hidden="true"
                className="fixed inset-0 z-40 bg-black/50 sm:hidden" />
            <div className={cn(
                'fixed inset-x-0 bottom-0 z-50 w-full rounded-t-2xl border-t border-white/10 p-4 pb-6 space-y-2.5',
                'shadow-2xl shadow-black/60 max-h-[85vh] overflow-y-auto',
                'sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-10 sm:w-[calc(100vw-2rem)]',
                'sm:max-w-sm sm:rounded-xl sm:border sm:p-3 sm:pb-3',
            )} style={{ background: 'var(--bg-elevated)' }}>
                {children}
            </div>
        </>
    );
}

/** The two cookies an ESPN private league needs, shared by both entry points. */
function EspnCredsFields({ swid, s2, setSwid, setS2 }: {
    swid: string; s2: string;
    setSwid: (v: string) => void; setS2: (v: string) => void;
}) {
    return (
        <div className="space-y-1.5">
            <input
                value={swid} onChange={e => setSwid(e.target.value)}
                placeholder="SWID  {XXXXXXXX-…}"
                className="w-full h-8 px-2 rounded-lg bg-card border border-border/60 text-[12px] placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <input
                value={s2} onChange={e => setS2(e.target.value)}
                placeholder="espn_s2  AEB…"
                className="w-full h-8 px-2 rounded-lg bg-card border border-border/60 text-[12px] placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <p className="text-[10px] text-muted-foreground/70 leading-snug">
                From your browser cookies on fantasy.espn.com — open the site signed in,
                then copy SWID and espn_s2 from your browser&rsquo;s cookie list. Kept in
                this browser and sent with each request to read your league; never stored
                on our side.
            </p>
        </div>
    );
}
