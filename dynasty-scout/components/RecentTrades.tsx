'use client';

import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

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
  counterpart_players: { name: string; position: string }[];
  league_name: string;
  roster_count: number;
}

interface TradesResponse {
  player: { id: number; full_name: string; position: string };
  trades: TradeRecord[];
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
  const ms = now.getTime() - date.getTime();
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
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
  const roundNames: Record<number, string> = {
    1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th',
    6: '6th', 7: '7th', 8: '8th', 9: '9th', 10: '10th',
    11: '11th', 12: '12th',
  };
  return `${pick.season} ${roundNames[pick.round] || `R${pick.round}`}`;
}

export default function RecentTrades({ playerSlug }: { playerSlug: string }) {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch_trades = async () => {
      try {
        const res = await fetch(`/api/trades/${playerSlug}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data: TradesResponse = await res.json();
        setTrades(data.trades || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trades');
      } finally {
        setLoading(false);
      }
    };
    fetch_trades();
  }, [playerSlug]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
        Failed to load trades: {error}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-8 text-center">
        <p className="text-sm text-slate-400 mb-4">No recent trades found</p>
        <a
          href="/settings/leagues"
          className="text-sm text-orange-400 hover:text-orange-300 font-medium inline-flex items-center gap-1"
        >
          Add your Sleeper league <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {trades.slice(0, 20).map(trade => (
        <div
          key={trade.id}
          className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
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
            </div>
            <div className="text-xs text-slate-400">{relativeDate(trade.date)}</div>
          </div>

          {trade.counterpart_players.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {trade.counterpart_players.map((p, i) => (
                <div
                  key={i}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: (POS_COLORS[p.position] || '#a78bfa') + '15',
                    color: POS_COLORS[p.position] || '#a78bfa',
                    border: `1px solid ${(POS_COLORS[p.position] || '#a78bfa') + '40'}`,
                  }}
                >
                  {p.name}
                </div>
              ))}
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
            {trade.league_name} · {trade.roster_count} teams
          </div>
        </div>
      ))}

      <div className="text-center text-xs text-slate-600 mt-4 pt-4 border-t border-slate-700/30">
        Powered by <span className="text-violet-400 font-medium">Sleeper</span>
      </div>
    </div>
  );
}