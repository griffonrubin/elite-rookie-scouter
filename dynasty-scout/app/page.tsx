import { query } from '@/lib/db';
import { DraftBoard } from '@/components/DraftBoard';
import { Player } from '@/lib/types';
import { Zap, TrendingUp, Users } from 'lucide-react';

export const dynamic = "force-dynamic";

async function getDraftBoardData(): Promise<{ players: Player[], lastUpdateDate: string | null }> {
  try {
    const sql = `
      SELECT 
        p.*,
        COALESCE(MAX(cc.school), p.nfl_team) as school,
        c.rank_overall,
        c.avg_rank,
        c.best_rank,
        c.worst_rank,
        c.rank_change_1d,
        c.rank_change_7d,
        c.rank_change_30d,
        c.num_sources,
        m.forty_yard as forty_yard,
        m.vertical_jump as vertical_jump,
        m.broad_jump as broad_jump,
        m.three_cone as three_cone,
        m.twenty_yard_shuttle as shuttle,
        m.bench_press as bench_press,
        m.ras as ras,
        COALESCE(
          m.speed_score,
          CASE
            WHEN m.forty_yard > 0 AND p.weight_lbs > 0
            THEN ROUND((p.weight_lbs * 200.0) / (m.forty_yard * m.forty_yard * m.forty_yard * m.forty_yard), 1)
            ELSE NULL
          END
        ) as speed_score,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'KeepTradeCut' ORDER BY scraped_at DESC LIMIT 1) as ktc_rank,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'Sleeper ADP' ORDER BY scraped_at DESC LIMIT 1) as sleeper_adp,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyPros' ORDER BY scraped_at DESC LIMIT 1) as fantasypros_rank
      FROM players p
      LEFT JOIN college_career cc ON p.id = cc.player_id
      LEFT JOIN measurables m ON p.id = m.player_id
      LEFT JOIN consensus_rankings c ON p.id = c.player_id
        AND c.calculated_at = (
          SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id
        )
      WHERE p.draft_year = 2026
      GROUP BY p.id
      ORDER BY c.rank_overall ASC NULLS LAST
    `;
    const players = await query<Player>(sql, []);

    // Get last updated timestamp
    const lastUpdateQuery = await query<{ max_date: string }>(
      `SELECT MAX(scraped_at) as max_date FROM (
        SELECT MAX(scraped_at) as scraped_at FROM rankings
        UNION ALL
        SELECT MAX(calculated_at) as scraped_at FROM consensus_rankings
      ) t`, []
    );
    const rawDate = lastUpdateQuery[0]?.max_date;
    // Append noon UTC offset so date-only strings (e.g. "2026-03-06") never roll back
    // a day due to UTC→local conversion in US timezone environments.
    const lastUpdateDate = rawDate
      ? new Date(rawDate.length === 10 ? rawDate + 'T12:00:00Z' : rawDate)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    // The SQL query already sorts by consensus.rank_overall ASC NULLS LAST.
    // So the array index strictly equates to the true live consensus ranking.
    const playersWithRank = players.map((p, i) => ({
      ...p,
      consensus_rank: i + 1
    }));

    return { players: playersWithRank, lastUpdateDate };
  } catch (error) {
    console.error('Failed to load draft board data:', error);
    return { players: [], lastUpdateDate: null };
  }
}

export default async function Home() {
  const { players, lastUpdateDate } = await getDraftBoardData();
  const rankedCount = players.filter(p => (p as any).rank_overall != null).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top Bar ── */}
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-md sticky top-0 z-50">
        <div className="w-full px-6 sm:px-8 h-14 flex items-center justify-between mx-auto max-w-[1600px]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">
              Elite Rookie Scouter
            </span>
            <span className="text-xs text-muted-foreground font-medium hidden sm:block">
              / 2026 Class
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span className="text-foreground font-semibold">{players.length}</span> players
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-foreground font-semibold">{rankedCount}</span> ranked
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-full">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
              </span>
              <span className="text-primary font-medium">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero Strip ── */}
      <div className="border-b border-border/40 bg-gradient-to-r from-primary/5 via-transparent to-blue-500/5">
        <div className="w-full px-6 sm:px-8 py-4 mx-auto max-w-[1600px] flex items-center">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
            2026 Rookie Scouting Board
            <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border/50">
              {players.length} Players Tracked
            </span>
            {lastUpdateDate && (
              <span className="text-[10px] font-bold tracking-widest uppercase text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                Updated {lastUpdateDate}
              </span>
            )}
          </h1>
        </div>
      </div>

      {/* ── Board ── */}
      <main className="w-full px-6 sm:px-8 py-6 mx-auto max-w-[1600px]">
        {players.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            No players found. Run the seed scripts to populate data.
          </div>
        ) : (
          <DraftBoard players={players} />
        )}
      </main>
    </div>
  );
}
