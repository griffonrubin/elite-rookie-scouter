'use client';

import { useState } from 'react';
import { Plus, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<Array<{ id: string; name: string }>>([]);
  const [leagueId, setLeagueId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAddLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueId.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: leagueId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add league');
      }

      const data = await res.json();
      setLeagues([...leagues, { id: leagueId, name: data.league_name }]);
      setLeagueId('');
      setSuccess('League added! Trade data will be populated soon.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLeague = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/leagues', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: id }),
      });

      if (!res.ok) throw new Error('Failed to remove league');
      setLeagues(leagues.filter(l => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060a10]">
      <AppHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="text-3xl font-black mb-2">Sleeper Leagues</h1>
        <p className="text-slate-400 mb-8">
          Add your Sleeper dynasty leagues to see trade activity for prospects.
        </p>

        {/* Add League Form */}
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-6 mb-8">
          <h2 className="text-lg font-bold mb-4">Add a League</h2>
          <form onSubmit={handleAddLeague} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">League ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g., 123456789"
                  value={leagueId}
                  onChange={e => setLeagueId(e.target.value)}
                  disabled={loading}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 disabled:opacity-50"
                />
                <Button
                  type="submit"
                  disabled={loading || !leagueId.trim()}
                  className="gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Find your league ID in the Sleeper app URL: sleeper.app/leagues/<strong>your-league-id</strong>
              </p>
            </div>
          </form>
        </div>

        {/* Messages */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 p-3 mb-6 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 mb-6 text-sm">
            {success}
          </div>
        )}

        {/* Leagues List */}
        {leagues.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="font-bold">Your Leagues ({leagues.length})</h2>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {leagues.map(league => (
                <div key={league.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02]">
                  <div>
                    <p className="font-medium">{league.name}</p>
                    <p className="text-xs text-slate-500">ID: {league.id}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveLeague(league.id)}
                    disabled={loading}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {leagues.length === 0 && (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 p-8 text-center">
            <p className="text-slate-400">No leagues added yet. Add one above to get started!</p>
          </div>
        )}

        {/* Info Section */}
        <div className="rounded-2xl border border-white/[0.06] bg-slate-800/20 p-6 mt-8">
          <h3 className="font-bold mb-3">How it works</h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex gap-2">
              <span className="text-orange-400 font-bold shrink-0">1.</span>
              <span>Add your Sleeper league ID above</span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-400 font-bold shrink-0">2.</span>
              <span>We scan the league for trades involving 2026 draft prospects</span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-400 font-bold shrink-0">3.</span>
              <span>Trade activity appears in each player's profile</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
