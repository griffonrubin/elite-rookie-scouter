import { query } from '@/lib/db';
import { REDRAFT_BOARD_SQL } from '@/lib/redraftBoardQuery';
import { AppHeader } from '@/components/AppHeader';
import { RedraftBoard } from '@/components/redraft/RedraftBoard';
import { RedraftPlayer } from '@/lib/types';
import { TrendingUp, Users } from 'lucide-react';

export const dynamic = "force-dynamic";

async function getRedraftBoard(): Promise<{ players: RedraftPlayer[]; lastUpdateDate: string | null }> {
  try {
    const players = await query<RedraftPlayer>(REDRAFT_BOARD_SQL, []);

    // The SQL already orders by shrunk consensus, so array position IS the
    // live board rank — same contract the rookie board relies on.
    const withRank = players.map((p, i) => ({ ...p, board_rank: i + 1 }));

    const updated = await query<{ max_date: string }>(
      `SELECT MAX(calculated_at) AS max_date FROM consensus_rankings WHERE format = 'REDRAFT'`,
      []
    );
    const raw = updated[0]?.max_date;
    const lastUpdateDate = raw
      ? new Date(raw.length === 10 ? raw + 'T12:00:00Z' : raw)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    return { players: withRank, lastUpdateDate };
  } catch (error) {
    console.error('Failed to load redraft board:', error);
    return { players: [], lastUpdateDate: null };
  }
}

export default async function RedraftPage() {
  const { players, lastUpdateDate } = await getRedraftBoard();
  const rankedCount = players.filter(p => p.rank_overall != null).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span className="text-foreground font-semibold">{players.length}</span> players
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-foreground font-semibold">{rankedCount}</span> ranked
          </div>
          {lastUpdateDate && (
            <span className="text-muted-foreground/60 hidden sm:block">Updated {lastUpdateDate}</span>
          )}
        </div>
      </AppHeader>

      <main className="w-full px-3 sm:px-8 lg:px-12 py-4 sm:py-6 mx-auto">
        {players.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            No redraft players found. Run{' '}
            <code className="text-foreground">py -m scrapers.redraft.seed_player_pool</code> to populate.
          </div>
        ) : (
          <RedraftBoard players={players} />
        )}
      </main>
    </div>
  );
}
