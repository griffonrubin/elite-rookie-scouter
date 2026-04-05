import { query } from '@/lib/db';
import { DraftBoard } from '@/components/DraftBoard';
import { Player } from '@/lib/types';
import { TrendingUp, Users } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = "force-dynamic";

async function getDraftBoardData(): Promise<{ players: Player[], lastUpdateDate: string | null }> {
  try {
    const sql = `
      SELECT
        p.*,
        COALESCE(
          (SELECT school FROM college_career WHERE player_id = p.id ORDER BY id DESC LIMIT 1),
          p.nfl_team
        ) as school,
        c_sf.rank_overall,
        c_sf.rank_overall as rank_sf,
        c_1qb.rank_overall as rank_1qb,
        c_sf.avg_rank,
        c_sf.best_rank,
        c_sf.worst_rank,
        c_sf.rank_change_1d,
        c_sf.rank_change_7d,
        c_sf.rank_change_30d,
        c_sf.num_sources,
        m.forty_yard as forty_yard,
        m.vertical_jump as vertical_jump,
        m.broad_jump as broad_jump,
        m.three_cone as three_cone,
        m.twenty_yard_shuttle as shuttle,
        m.bench_press as bench_press,
        m.ras as ras,
        m.hand_size as hand_size,
        m.arm_length as arm_length,
        COALESCE(
          m.speed_score,
          CASE
            WHEN m.forty_yard > 0 AND p.weight_lbs > 0
            THEN ROUND(CAST((p.weight_lbs * 200.0) / (m.forty_yard * m.forty_yard * m.forty_yard * m.forty_yard) AS numeric), 1)
            ELSE NULL
          END
        ) as speed_score,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'KeepTradeCut' ORDER BY scraped_at DESC LIMIT 1) as ktc_rank,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'KeepTradeCut 1QB' ORDER BY scraped_at DESC LIMIT 1) as ktc_1qb_rank,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyCalc SF' ORDER BY scraped_at DESC LIMIT 1) as fantasycalc_sf_rank,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'Sleeper ADP' ORDER BY scraped_at DESC LIMIT 1) as sleeper_adp,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyPros' ORDER BY scraped_at DESC LIMIT 1) as fantasypros_rank,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'FantasyCalc' ORDER BY scraped_at DESC LIMIT 1) as fantasycalc_rank,
        (SELECT rank_overall FROM rankings r WHERE r.player_id = p.id AND r.source = 'DynastyNerds' ORDER BY scraped_at DESC LIMIT 1) as dynasty_nerds_rank,
        (SELECT MAX(dominator_rating) FROM college_stats WHERE player_id = p.id) as best_dominator,
        (SELECT COALESCE(SUM(pass_yards),0) FROM college_stats WHERE player_id = p.id) as career_pass_yards,
        (SELECT COALESCE(SUM(pass_attempts),0) FROM college_stats WHERE player_id = p.id) as career_pass_att,
        (SELECT COALESCE(SUM(completions),0) FROM college_stats WHERE player_id = p.id) as career_completions,
        (SELECT COALESCE(SUM(rush_yards),0) + COALESCE(SUM(rec_yards),0) FROM college_stats WHERE player_id = p.id) as career_scrim_yards,
        (SELECT COALESCE(SUM(games_played),0) FROM college_stats WHERE player_id = p.id) as career_games_cs,
        (SELECT ROUND(CAST(pass_yards AS NUMERIC) / NULLIF(games_played, 0), 1)
         FROM college_stats WHERE player_id = p.id AND pass_yards > 0
         ORDER BY CAST(pass_yards AS NUMERIC) / NULLIF(games_played, 0) DESC LIMIT 1) as best_pass_ypg,
        (SELECT ROUND(CAST(rec_yards AS NUMERIC) / NULLIF(receptions, 0), 1)
         FROM college_stats WHERE player_id = p.id AND receptions > 5
         ORDER BY CAST(rec_yards AS NUMERIC) / NULLIF(receptions, 0) DESC LIMIT 1) as best_ypr,
        (SELECT ROUND(CAST(rush_yards AS NUMERIC) / NULLIF(rush_attempts, 0), 2)
         FROM college_stats WHERE player_id = p.id AND rush_attempts > 20
         ORDER BY CAST(rush_yards AS NUMERIC) / NULLIF(rush_attempts, 0) DESC LIMIT 1) as best_ypc,
        (SELECT season     FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 0) as s1_yr,
        (SELECT COALESCE(rush_yards,0)+COALESCE(rec_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 0) as s1_scrim,
        (SELECT COALESCE(pass_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 0) as s1_pass,
        (SELECT season     FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 1) as s2_yr,
        (SELECT COALESCE(rush_yards,0)+COALESCE(rec_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 1) as s2_scrim,
        (SELECT COALESCE(pass_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 1) as s2_pass,
        (SELECT season     FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 2) as s3_yr,
        (SELECT COALESCE(rush_yards,0)+COALESCE(rec_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 2) as s3_scrim,
        (SELECT COALESCE(pass_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 2) as s3_pass,
        (SELECT season     FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 3) as s4_yr,
        (SELECT COALESCE(rush_yards,0)+COALESCE(rec_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 3) as s4_scrim,
        (SELECT COALESCE(pass_yards,0) FROM college_stats WHERE player_id = p.id AND games_played > 0 ORDER BY season DESC LIMIT 1 OFFSET 3) as s4_pass
      FROM players p
      LEFT JOIN measurables m ON p.id = m.player_id
      LEFT JOIN consensus_rankings c_sf ON p.id = c_sf.player_id AND c_sf.format = 'SF'
        AND c_sf.calculated_at = (
          SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id AND format = 'SF'
        )
      LEFT JOIN consensus_rankings c_1qb ON p.id = c_1qb.player_id AND c_1qb.format = '1QB'
        AND c_1qb.calculated_at = (
          SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id AND format = '1QB'
        )
      WHERE p.draft_year = 2026
      ORDER BY c_sf.rank_overall ASC NULLS LAST
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

      {/* ── Board ── */}
      <main className="w-full px-3 sm:px-8 lg:px-12 py-4 sm:py-6 mx-auto">
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
