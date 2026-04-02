'use client';

import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp, User, BarChart2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

interface Pick {
  season: number;
  round: number;
}

interface TradeRecord {
  id: string;
  date: string;
  side: 'sent' | 'received';
  picks_sent: Pick[];
  picks_received: Pick[];
  counterpart_players: { full_name?: string; name?: string; position: string; slug?: string }[];
  subject_player?: { name: string; position: string; slug: string } | null;
  league_name: string;
  roster_count: number;
}

interface TradesResponse {
  player: { id: number; full_name: string; position: string };
  trades: TradeRecord[];
  pick_label?: string;
  round?: number;
  mode: 'player' | 'picks';
}

const POS_COLORS: Record<string, string> = {
  QB: '#ef4444',
  RB: '#38bdf8',
  WR: '#34d399',
  TE: '#a78bfa',
};

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const day = Math.floor((now.getTime() - date.getTime()) / 86400000);
  const week = Math.floor(day / 7);
  const month = Math.floor(day / 30);
  if (day === 0) return 'today';
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  if (week < 4) return `${week}w ago`;
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(month / 12)}y ago`;
}

function formatPick(pick: Pick): string {
  const names: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
  return `${pick.season} ${names[pick.round] ?? `R${pick.round}`}`;
}

function getPlayerName(p: { full_name?: string; name?: string }): string {
  return p.full_name ?? p.name ?? 'Unknown';
}

interface RecentTradesProps {
  playerSlug: string;
  projRank?: number | null;
  playerName?: string;
}

export function RecentTrades({ playerSlug, projRank, playerName }: RecentTradesProps) {
  const [mode, setMode] = useState<'player' | 'picks'>('player');
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [pickLabel, setPickLabel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pickRound = projRank
    ? (projRank <= 12 ? 1 : projRank <= 24 ? 2 : projRank <= 36 ? 3 : 4)
    : null;

  useEffect(() => {
    const fetchTrades = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ mode });
        const res = await fetch(`/api/trades/${playerSlug}?${params}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data: TradesResponse = await res.json();
        setTrades(data.trades || []);
        if (data.pick_label) setPickLabel(data.pick_label);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trades');
      } finally {
        setLoading(false);
      }
    };
    fetchTrades();
  }, [playerSlug, mode]);

  const pickRoundNames: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  const tabLabel = pickRound
    ? `${pickRoundNames[pickRound] ?? pickRound + 'th'} Round Pick`
    : 'Pick';

  return (
    <div className="space-y-3">
      {/* Toggle */}
      {pickRound && (
        <div className="flex gap-1 p-1 rounded-lg bg-slate-800/50 border border-white/[0.06]">
          <button
            onClick={() => setMode('player')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              mode === 'player'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3 h-3" />
            {playerName ?? 'Player'}
          </button>
          <button
            onClick={() => setMode('picks')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              mode === 'picks'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3 h-3" />
            {tabLabel}
          </button>
        </div>
      )}

      {mode === 'picks' && pickLabel && (
        <p className="text-xs text-slate-500 px-1">
          Showing trades involving <span className="text-slate-300 font-semibold">{pickLabel}</span> picks
        </p>
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          Failed to load trades: {error}
        </div>
      )}

      {!loading && !error && trades.length === 0 && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-8 text-center">
          <p className="text-sm text-slate-400 mb-1">No recent trades found</p>
          <p className="text-xs text-slate-500">
            {mode === 'picks'
              ? `No ${pickLabel} trades recorded yet`
              : 'Add your Sleeper league in settings to see trade data'}
          </p>
        </div>
      )}

      {!loading && !error && trades.length > 0 && (
        <div className="space-y-2">
          {trades.slice(0, 20).map(trade => (
            <div
              key={trade.id}
              className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {trade.side === 'sent' ? (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">SOLD</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">BOUGHT</span>
                    </div>
                  )}
                  {/* In pick mode, show which player was the subject */}
                  {mode === 'picks' && trade.subject_player && (
                    <Link
                      href={`/players/${trade.subject_player.slug}`}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: (POS_COLORS[trade.subject_player.position] || '#a78bfa') + '20',
                        color: POS_COLORS[trade.subject_player.position] || '#a78bfa',
                        border: `1px solid ${(POS_COLORS[trade.subject_player.position] || '#a78bfa') + '40'}`,
                      }}
                    >
                      {trade.subject_player.name}
                    </Link>
                  )}
                </div>
                <div className="text-xs text-slate-400 shrink-0">{relativeDate(trade.date)}</div>
              </div>

              {trade.counterpart_players.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {trade.counterpart_players.map((p, i) => {
                    const name = getPlayerName(p);
                    const tag = (
                      <div
                        key={i}
                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: (POS_COLORS[p.position] || '#a78bfa') + '15',
                          color: POS_COLORS[p.position] || '#a78bfa',
                          border: `1px solid ${(POS_COLORS[p.position] || '#a78bfa') + '40'}`,
                        }}
                      >
                        {name}
                      </div>
                    );
                    return p.slug ? <Link key={i} href={`/players/${p.slug}`}>{tag}</Link> : tag;
                  })}
                </div>
              )}

              {(trade.picks_sent.length > 0 || trade.picks_received.length > 0) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {trade.picks_sent.map((pick, i) => (
                    <div key={`sent-${i}`} className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400">
                      -{formatPick(pick)}
                    </div>
                  ))}
                  {trade.picks_received.map((pick, i) => (
                    <div key={`recv-${i}`} className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                      +{formatPick(pick)}
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs text-slate-500">
                {trade.league_name} &middot; {trade.roster_count} teams
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center text-xs text-slate-600 mt-4 pt-4 border-t border-slate-700/30">
        Powered by <span className="text-violet-400 font-medium">Sleeper</span>
        <span className="mx-2 text-slate-700">&middot;</span>
        <span className="text-slate-600">Updated hourly</span>
      </div>
    </div>
  );
}
