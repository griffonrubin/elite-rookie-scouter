import { query } from '@/lib/db';
import { DraftBoard } from '@/components/DraftBoard';
import { Player } from '@/lib/types';
import { TrendingUp, Users } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = "force-dynamic";

async function getDraftBoardData(): Promise<{ players: Player[], lastUpdateDate: string | null }> {
  try {
    // CTEs replace 30+ correlated subqueries — each table is scanned once instead of once per player.
    const sql = `
      WITH
      cc_latest AS (
        SELECT player_id, school,
          ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY id DESC) AS rn
        FROM college_career
      ),
      cr_latest AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY player_id, format ORDER BY calculated_at DESC) AS rn
        FROM consensus_rankings
      ),
      ranked_r AS (
        SELECT player_id, source, rank_overall,
          ROW_NUMBER() OVER (PARTITION BY player_id, source ORDER BY scraped_at DESC) AS rn
        FROM rankings
      ),
      latest_r AS (
        SELECT
          player_id,
          MAX(CASE WHEN source = 'KeepTradeCut'       THEN rank_overall END) AS ktc_rank,
          MAX(CASE WHEN source = 'KeepTradeCut 1QB'   THEN rank_overall END) AS ktc_1qb_rank,
          MAX(CASE WHEN source = 'FantasyCalc SF'      THEN rank_overall END) AS fantasycalc_sf_rank,
          MAX(CASE WHEN source = 'Sleeper ADP'         THEN rank_overall END) AS sleeper_adp,
          MAX(CASE WHEN source = 'FantasyPros'         THEN rank_overall END) AS fantasypros_rank,
          MAX(CASE WHEN source = 'FantasyPros SF'      THEN rank_overall END) AS fantasypros_sf_rank,
          MAX(CASE WHEN source = 'FantasyCalc'         THEN rank_overall END) AS fantasycalc_rank,
          MAX(CASE WHEN source = 'DynastyNerds'        THEN rank_overall END) AS dynasty_nerds_rank,
          MAX(CASE WHEN source = 'DynastyNerds SF'     THEN rank_overall END) AS dynasty_nerds_sf_rank,
          MAX(CASE WHEN source = 'TylerFFCreator SF'   THEN rank_overall END) AS tyler_ff_sf_rank
        FROM ranked_r WHERE rn = 1
        GROUP BY player_id
      ),
      cs_agg AS (
        SELECT
          player_id,
          MAX(dominator_rating)                                   AS best_dominator,
          COALESCE(SUM(pass_yards),   0)                         AS career_pass_yards,
          COALESCE(SUM(pass_attempts),0)                         AS career_pass_att,
          COALESCE(SUM(completions),  0)                         AS career_completions,
          COALESCE(SUM(rush_yards),0) + COALESCE(SUM(rec_yards),0) AS career_scrim_yards,
          COALESCE(SUM(rush_yards),  0)                          AS career_rush_yards,
          COALESCE(SUM(rec_yards),   0)                          AS career_rec_yards,
          COALESCE(SUM(rush_tds),    0)                          AS career_rush_tds,
          COALESCE(SUM(rec_tds),     0)                          AS career_rec_tds,
          COALESCE(SUM(pass_tds),    0)                          AS career_pass_tds,
          COALESCE(SUM(receptions),  0)                          AS career_receptions,
          COALESCE(SUM(games_played), 0)                         AS career_games_cs,
          MAX(CASE WHEN pass_yards > 0 AND games_played > 0
            THEN ROUND(CAST(pass_yards AS numeric) / games_played, 1) END)               AS best_pass_ypg,
          MAX(CASE WHEN receptions > 5
            THEN ROUND(CAST(rec_yards AS numeric) / NULLIF(receptions, 0), 1) END)       AS best_ypr,
          MAX(CASE WHEN rush_attempts > 20
            THEN ROUND(CAST(rush_yards AS numeric) / NULLIF(rush_attempts, 0), 2) END)   AS best_ypc
        FROM college_stats
        GROUP BY player_id
      ),
      cs_seasons AS (
        SELECT player_id, season,
          COALESCE(rush_yards,0) + COALESCE(rec_yards,0) AS scrim,
          COALESCE(pass_yards, 0)                         AS pass_yds,
          ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY season DESC) AS rn
        FROM college_stats
        WHERE games_played > 0
      ),
      hc_top AS (
        SELECT player_id, comp_name, similarity,
          ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY similarity DESC) AS rn
        FROM historical_comps
      )
      SELECT
        p.*,
        COALESCE(cc.school, p.nfl_team) AS school,
        c_sf.rank_overall,
        c_sf.rank_overall  AS rank_sf,
        c_1qb.rank_overall AS rank_1qb,
        c_sf.avg_rank, c_sf.best_rank, c_sf.worst_rank,
        c_sf.rank_change_1d, c_sf.rank_change_7d, c_sf.rank_change_30d,
        c_sf.num_sources,
        c_1qb.avg_rank        AS avg_rank_1qb,
        c_1qb.best_rank       AS best_rank_1qb,
        c_1qb.worst_rank      AS worst_rank_1qb,
        c_1qb.rank_change_7d  AS rank_change_7d_1qb,
        m.forty_yard, m.vertical_jump, m.broad_jump, m.three_cone,
        m.twenty_yard_shuttle AS shuttle,
        m.bench_press, m.ras, m.hand_size, m.arm_length,
        COALESCE(
          m.speed_score,
          CASE
            WHEN m.forty_yard > 0 AND p.weight_lbs > 0
            THEN ROUND(CAST((p.weight_lbs * 200.0) /
                 (m.forty_yard * m.forty_yard * m.forty_yard * m.forty_yard) AS numeric), 1)
            ELSE NULL
          END
        ) AS speed_score,
        lr.ktc_rank, lr.ktc_1qb_rank, lr.fantasycalc_sf_rank, lr.sleeper_adp,
        lr.fantasypros_rank, lr.fantasypros_sf_rank, lr.fantasycalc_rank,
        lr.dynasty_nerds_rank, lr.dynasty_nerds_sf_rank, lr.tyler_ff_sf_rank,
        ca.best_dominator, ca.career_pass_yards, ca.career_pass_att,
        ca.career_completions, ca.career_scrim_yards, ca.career_games_cs,
        ca.career_rush_yards, ca.career_rec_yards, ca.career_rush_tds,
        ca.career_rec_tds, ca.career_pass_tds, ca.career_receptions,
        ca.best_pass_ypg, ca.best_ypr, ca.best_ypc,
        s1.season AS s1_yr, s1.scrim AS s1_scrim, s1.pass_yds AS s1_pass,
        s2.season AS s2_yr, s2.scrim AS s2_scrim, s2.pass_yds AS s2_pass,
        s3.season AS s3_yr, s3.scrim AS s3_scrim, s3.pass_yds AS s3_pass,
        s4.season AS s4_yr, s4.scrim AS s4_scrim, s4.pass_yds AS s4_pass,
        wa.yprr               AS wr_yprr,
        wa.adot               AS wr_adot,
        wa.catch_rate         AS wr_catch_rate,
        wa.drop_rate          AS wr_drop_rate,
        wa.contested_catch_rate AS wr_contested,
        wa.forced_mtf_pct     AS wr_mtf,
        wa.yac_per_rec        AS wr_yac_per_rec,
        wa.target_rate        AS wr_target_rate,
        wa.open_target_rate   AS wr_open_rate,
        wa.zone_yprr          AS wr_zone_yprr,
        wa.man_yprr           AS wr_man_yprr,
        wa.slot_rate          AS wr_slot_rate,
        ra.yds_after_contact  AS rb_yds_after_contact,
        ra.avoided_tackle_pct AS rb_mtf_pct,
        ra.explosive_rate     AS rb_explosive_rate,
        ra.breakaway_rate     AS rb_breakaway_rate,
        ra.first_down_rate    AS rb_first_down_rate,
        ra.yprr               AS rb_yprr,
        ra.ayprr              AS rb_ayprr,
        ra.target_rate        AS rb_target_rate,
        ra.drop_rate          AS rb_drop_rate,
        ra.fumble_rate        AS rb_fumble_rate,
        ra.gap_rate           AS rb_gap_rate,
        ra.zone_rate          AS rb_zone_rate,
        jg.overall_grade      AS jf_grade,
        jg.round_grade        AS jf_round_grade,
        jg.pos_fit            AS jf_pos_fit,
        jg.nfl_comp           AS jf_nfl_comp,
        jg.athletic_score     AS jf_athletic,
        hc.comp_name          AS hist_comp_name,
        hc.similarity         AS hist_comp_sim
      FROM players p
      LEFT JOIN cc_latest     cc    ON p.id = cc.player_id    AND cc.rn = 1
      LEFT JOIN cr_latest     c_sf  ON p.id = c_sf.player_id  AND c_sf.format  = 'SF'  AND c_sf.rn  = 1
      LEFT JOIN cr_latest     c_1qb ON p.id = c_1qb.player_id AND c_1qb.format = '1QB' AND c_1qb.rn = 1
      LEFT JOIN measurables   m     ON p.id = m.player_id
      LEFT JOIN latest_r      lr    ON p.id = lr.player_id
      LEFT JOIN cs_agg        ca    ON p.id = ca.player_id
      LEFT JOIN cs_seasons    s1    ON p.id = s1.player_id AND s1.rn = 1
      LEFT JOIN cs_seasons    s2    ON p.id = s2.player_id AND s2.rn = 2
      LEFT JOIN cs_seasons    s3    ON p.id = s3.player_id AND s3.rn = 3
      LEFT JOIN cs_seasons    s4    ON p.id = s4.player_id AND s4.rn = 4
      LEFT JOIN wr_advanced_career wa ON p.id = wa.player_id
      LEFT JOIN rb_advanced_career ra ON p.id = ra.player_id
      LEFT JOIN jfoster_grades     jg ON p.id = jg.player_id
      LEFT JOIN hc_top             hc ON p.id = hc.player_id AND hc.rn = 1
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

      {/* Preload top-30 headshots so hover cards feel instant */}
      {players.slice(0, 30).map(p => {
        const src = (p as any).headshot_url || ((p as any).espn_college_id
          ? `https://a.espncdn.com/i/headshots/college-football/players/full/${(p as any).espn_college_id}.png`
          : null);
        return src ? <link key={p.id} rel="preload" as="image" href={src} /> : null;
      })}

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
