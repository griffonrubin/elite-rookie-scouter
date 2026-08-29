'use client';

import React, { useState } from 'react';
import { Radio, X, Unplug } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    draftLabel, getUserDrafts, getUserId, parseDraftId, SleeperDraft,
} from '@/lib/sleeper';
import { SleeperSyncState } from '@/lib/useSleeperSync';

const SEASON = '2026';

/**
 * Connect the board to a live Sleeper draft.
 *
 * Two ways in: paste a draft link (works for mocks, which belong to no
 * league), or type a Sleeper username and pick from that account's drafts.
 * The chosen draft id is stored in this browser only — see useSleeperSync.
 */
export function SleeperSync({ sync }: { sync: SleeperSyncState }) {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [drafts, setDrafts] = useState<SleeperDraft[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const live = sync.connection && sync.status === 'drafting';

    async function lookUp() {
        const q = input.trim();
        if (!q || busy) return;
        setBusy(true);
        setError(null);
        setDrafts(null);
        try {
            const directId = parseDraftId(q);
            if (directId) {
                sync.connect(directId, `Draft ${directId.slice(-6)}`);
                setOpen(false);
                setInput('');
                return;
            }
            const userId = await getUserId(q);
            if (!userId) {
                setError(`No Sleeper user named “${q}” — or paste the draft link instead.`);
                return;
            }
            const found = (await getUserDrafts(userId, SEASON))
                .sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0));
            if (found.length === 0) {
                setError(`${q} has no ${SEASON} drafts yet.`);
                return;
            }
            setDrafts(found);
        } catch {
            setError('Sleeper did not answer — try again in a moment.');
        } finally {
            setBusy(false);
        }
    }

    function pick(d: SleeperDraft) {
        sync.connect(d.draft_id, draftLabel(d));
        setOpen(false);
        setInput('');
        setDrafts(null);
    }

    // ── Connected chip ──────────────────────────────────────────────────────
    if (sync.connection) {
        const picks = `${sync.pickCount} ${sync.pickCount === 1 ? 'pick' : 'picks'}`;
        const statusText =
            sync.status === 'drafting' ? `LIVE · ${picks}`
            : sync.status === 'complete' ? `done · ${picks}`
            : sync.status === 'pre_draft' ? 'waiting to start'
            : sync.status === 'paused' ? 'paused'
            : sync.status === 'error' ? 'reconnecting…'
            : 'connecting…';
        return (
            <div className={cn(
                'flex items-center gap-1.5 pl-2.5 pr-1 h-8 rounded-lg border text-[12px] font-semibold',
                live
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-sky-500/30 bg-sky-500/5 text-sky-300',
            )}>
                <span className="relative flex w-2 h-2" aria-hidden="true">
                    {live && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
                    <span className={cn('relative inline-flex w-2 h-2 rounded-full', live ? 'bg-emerald-400' : 'bg-sky-400')} />
                </span>
                <span className="hidden sm:inline max-w-[130px] truncate" title={sync.connection.label}>{sync.connection.label}</span>
                <span className="text-[10px] opacity-70 whitespace-nowrap">{statusText}</span>
                <button
                    onClick={sync.disconnect}
                    aria-label="Disconnect from the Sleeper draft"
                    title="Disconnect"
                    className="ml-0.5 grid place-items-center w-6 h-6 rounded-md hover:bg-white/10 text-current/70 hover:text-current"
                >
                    <Unplug className="w-3 h-3" />
                </button>
            </div>
        );
    }

    // ── Connect button + panel ──────────────────────────────────────────────
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
                title="Sync with a live Sleeper draft — picks come off the board as they happen"
            >
                <Radio className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sleeper</span>
            </button>

            {open && (
                <div className="absolute right-0 top-10 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-white/10 p-3 shadow-2xl shadow-black/60 space-y-2.5"
                    style={{ background: 'var(--bg-elevated)' }}>
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="text-[13px] font-bold">Sync a Sleeper draft</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Players come off the board live as they are picked. Paste a draft
                                link (mocks included) or enter your Sleeper username. Saved only
                                in this browser.
                            </p>
                        </div>
                        <button onClick={() => setOpen(false)} aria-label="Close"
                            className="text-muted-foreground/60 hover:text-foreground flex-shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex gap-1.5">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') lookUp(); }}
                            placeholder="Username or sleeper.com/draft/nfl/…"
                            className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-card border border-border/60 text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                            autoFocus
                        />
                        <button
                            onClick={lookUp}
                            disabled={busy || !input.trim()}
                            className="px-3 h-9 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-black text-[12px] font-bold disabled:opacity-40 disabled:cursor-default"
                        >
                            {busy ? '…' : 'Find'}
                        </button>
                    </div>

                    {error && <div className="text-[11px] text-amber-400">{error}</div>}

                    {drafts && (
                        <div className="max-h-56 overflow-y-auto space-y-1">
                            {drafts.map(d => (
                                <button
                                    key={d.draft_id}
                                    onClick={() => pick(d)}
                                    className="w-full text-left px-2.5 py-2 rounded-lg border border-white/[0.06] hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors"
                                >
                                    <div className="text-[12px] font-semibold truncate">{draftLabel(d)}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                                        {d.status.replace('_', ' ')} · {d.type}
                                        {!d.league_id && ' · mock'}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
