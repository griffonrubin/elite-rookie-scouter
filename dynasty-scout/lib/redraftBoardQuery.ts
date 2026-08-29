/**
 * The redraft board query, shared by /redraft and the mock draft so the two
 * can never drift apart. Written in Postgres dialect; lib/db.ts downgrades
 * $N and ILIKE for SQLite.
 *
 * Advanced rates come from the most recent completed season and the Vegas
 * columns from the upcoming one, which is the split the board actually wants:
 * how a player performed, and what environment he is walking into.
 */
// Bayesian shrinkage, same idea as the rookie board: a player ranked by a
// single source shouldn't leapfrog one the whole market agrees on. Pulls each
// average toward a prior rank of 250 (mid-pool) with the weight of ~1.5 sources.
const SHRINK_PRIOR_RANK = 250;
const SHRINK_PRIOR_WEIGHT = 1.5;

export const REDRAFT_BOARD_SQL = `
  WITH
  latest_consensus AS (
    SELECT player_id, rank_overall, rank_positional, avg_rank, best_rank,
           worst_rank, std_deviation, num_sources
    FROM consensus_rankings
    WHERE format = 'REDRAFT'
      AND calculated_at = (
        SELECT MAX(calculated_at) FROM consensus_rankings WHERE format = 'REDRAFT'
      )
  ),
  latest_source_rank AS (
    SELECT r.player_id,
      MAX(CASE WHEN r.source = 'My Rankings'          THEN r.rank_overall END) AS my_rank,
      MAX(CASE WHEN r.source = 'FantasyPros PPR'      THEN r.rank_overall END) AS fp_rank,
      MAX(CASE WHEN r.source = 'ESPN Redraft'         THEN r.rank_overall END) AS espn_rank,
      MAX(CASE WHEN r.source = 'KeepTradeCut Redraft' THEN r.rank_overall END) AS ktc_rank,
      MAX(CASE WHEN r.source = 'CBS Redraft'          THEN r.rank_overall END) AS cbs_rank,
      MAX(CASE WHEN r.source = 'Yahoo Redraft'        THEN r.rank_overall END) AS yahoo_rank,
      MAX(CASE WHEN r.source = 'Sleeper Redraft'      THEN r.rank_overall END) AS sleeper_rank,
      MAX(CASE WHEN r.source = 'FantasyCalc Redraft'  THEN r.rank_overall END) AS fc_rank,
      MAX(CASE WHEN r.source = 'Flock Redraft'        THEN r.rank_overall END) AS flock_rank,
      MAX(CASE WHEN r.source = 'Underdog Redraft'     THEN r.rank_overall END) AS underdog_rank,
      MAX(CASE WHEN r.source = 'FFPC Redraft'         THEN r.rank_overall END) AS ffpc_rank,
      MAX(CASE WHEN r.source = 'FantasyPros PPR'      THEN r.tier END)         AS fp_tier
    FROM rankings r
    JOIN (
      SELECT player_id, source, MAX(scraped_at) AS md
      FROM rankings GROUP BY player_id, source
    ) l ON l.player_id = r.player_id AND l.source = r.source AND r.scraped_at = l.md
    GROUP BY r.player_id
  ),
  season_history AS (
    SELECT player_id,
      MAX(CASE WHEN season = 2021 THEN fantasy_points_ppr END) AS pts21,
      MAX(CASE WHEN season = 2022 THEN fantasy_points_ppr END) AS pts22,
      MAX(CASE WHEN season = 2023 THEN fantasy_points_ppr END) AS pts23,
      MAX(CASE WHEN season = 2024 THEN fantasy_points_ppr END) AS pts24,
      MAX(CASE WHEN season = 2021 THEN finish_positional END)  AS fin21,
      MAX(CASE WHEN season = 2022 THEN finish_positional END)  AS fin22,
      MAX(CASE WHEN season = 2023 THEN finish_positional END)  AS fin23,
      MAX(CASE WHEN season = 2024 THEN finish_positional END)  AS fin24,
      COUNT(*) AS seasons_played
    FROM nfl_season_stats
    GROUP BY player_id
  ),
  proj AS (
    -- Rounding happens in the UI: Postgres ROUND(double, int) needs a ::numeric
    -- cast that SQLite would reject, and lib/db.ts only rewrites $N and ILIKE.
    -- Newest scrape per source, the same shape latest_source_rank uses for
    -- rankings. Averaging every row instead would blend today's projection
    -- with each earlier one and inflate proj_sources a little more every
    -- day the refresh runs.
    SELECT pr.player_id,
           AVG(pr.proj_points) AS proj_points,
           AVG(pr.proj_ppg) AS proj_ppg,
           COUNT(*) AS proj_sources
    FROM projections pr
    JOIN (
      SELECT player_id, source, MAX(scraped_at) AS md
      FROM projections WHERE season = 2026 GROUP BY player_id, source
    ) lp ON lp.player_id = pr.player_id AND lp.source = pr.source
        AND pr.scraped_at = lp.md
    WHERE pr.season = 2026
    GROUP BY pr.player_id
  ),
  -- One season of advanced rates per player. Aliased with an adv_ prefix
  -- because several names (fg_pct, games) also exist on nfl_season_stats.
  adv AS (
    SELECT * FROM nfl_advanced_season WHERE season = 2025
  )
  SELECT
    p.id, p.slug, p.full_name, p.position, p.nfl_team, p.sleeper_id, p.nfl_headshot_url,
    p.headshot_url, p.dob, p.years_exp, p.nfl_draft_year, p.draft_year,
    p.height_inches, p.weight_lbs,
    t.logo_url AS team_logo, t.primary_color AS team_color,
    c.rank_overall, c.rank_positional, c.avg_rank, c.best_rank, c.worst_rank,
    c.std_deviation, c.num_sources,
    lsr.my_rank, lsr.fp_rank, lsr.espn_rank, lsr.ktc_rank, lsr.cbs_rank, lsr.yahoo_rank,
    lsr.sleeper_rank, lsr.fc_rank, lsr.flock_rank, lsr.underdog_rank,
    lsr.ffpc_rank, lsr.fp_tier,
    s.fantasy_points_ppr AS pts25, s.ppg_ppr AS ppg25,
    s.finish_positional AS fin25, s.finish_overall AS fin25_ov,
    s.games AS games25, s.team AS team25,
    s.pass_yards, s.pass_tds, s.interceptions, s.completions, s.pass_attempts,
    s.carries, s.rush_yards, s.rush_tds,
    s.targets, s.receptions, s.rec_yards, s.rec_tds,
    s.fg_made, s.fg_att, s.fg_pct, s.fg_made_50plus, s.fg_long, s.xp_made,
    s.dst_sacks, s.dst_ints, s.dst_tds, s.dst_fum_rec, s.dst_points_allowed,
    h.pts21, h.pts22, h.pts23, h.pts24,
    h.fin21, h.fin22, h.fin23, h.fin24, h.seasons_played,
    pr.proj_points, pr.proj_ppg, pr.proj_sources,
    a.snap_share AS adv_snap_share,
    a.touches_per_game AS adv_touches_per_game,
    a.yards_per_touch AS adv_yards_per_touch,
    a.epa_per_dropback AS adv_epa_per_dropback,
    a.cpoe AS adv_cpoe,
    a.yards_per_attempt AS adv_yards_per_attempt,
    a.pass_td_rate AS adv_pass_td_rate,
    a.int_rate AS adv_int_rate,
    a.pressure_pct AS adv_pressure_pct,
    a.sack_rate AS adv_sack_rate,
    a.carries_per_game AS adv_carries_per_game,
    a.yards_per_carry AS adv_yards_per_carry,
    a.yards_after_contact_att AS adv_yards_after_contact_att,
    a.rush_mtf_rate AS adv_rush_mtf_rate,
    a.breakaway_rush_rate AS adv_breakaway_rush_rate,
    a.epa_per_rush AS adv_epa_per_rush,
    a.target_share AS adv_target_share,
    a.air_yards_share AS adv_air_yards_share,
    a.wopr AS adv_wopr,
    a.targets_per_game AS adv_targets_per_game,
    a.yards_per_snap AS adv_yards_per_snap,
    a.yards_per_target AS adv_yards_per_target,
    a.adot AS adv_adot,
    a.yards_after_catch_rec AS adv_yards_after_catch_rec,
    a.catch_rate AS adv_catch_rate,
    a.epa_per_target AS adv_epa_per_target,
    a.fg_att_per_game AS adv_fg_att_per_game,
    a.fg_pct AS adv_fg_pct,
    a.fg_pct_40plus AS adv_fg_pct_40plus,
    a.avg_fg_distance AS adv_avg_fg_distance,
    a.fg_50plus_att AS adv_fg_50plus_att,
    a.xp_pct AS adv_xp_pct,
    a.dst_sacks_per_game AS adv_dst_sacks_per_game,
    a.dst_takeaways_per_game AS adv_dst_takeaways_per_game,
    a.dst_points_allowed_per_game AS adv_dst_points_allowed_per_game,
    v.avg_implied_total AS vegas_implied_total,
    v.implied_total_rank AS vegas_implied_rank,
    v.avg_total AS vegas_total,
    v.avg_spread AS vegas_spread,
    v.win_pct AS vegas_win_pct,
    v.games_lined AS vegas_games_lined
  FROM players p
  LEFT JOIN latest_consensus  c   ON c.player_id = p.id
  LEFT JOIN latest_source_rank lsr ON lsr.player_id = p.id
  LEFT JOIN nfl_season_stats  s   ON s.player_id = p.id AND s.season = 2025
  LEFT JOIN season_history    h   ON h.player_id = p.id
  LEFT JOIN proj              pr  ON pr.player_id = p.id
  LEFT JOIN adv               a   ON a.player_id = p.id
  LEFT JOIN nfl_teams         t   ON t.abbreviation = p.nfl_team
  LEFT JOIN vegas_team_season v   ON v.team = p.nfl_team AND v.season = 2026
  WHERE p.redraft_pool = 1
  ORDER BY
    CASE
      WHEN c.num_sources IS NULL OR c.num_sources = 0 THEN NULL
      ELSE (c.num_sources * c.avg_rank + ${SHRINK_PRIOR_WEIGHT} * ${SHRINK_PRIOR_RANK})
           / (c.num_sources + ${SHRINK_PRIOR_WEIGHT})
    END ASC NULLS LAST,
    s.fantasy_points_ppr DESC NULLS LAST,
    p.full_name ASC
`;

/** Same query, capped — the mock draft only needs the top of the pool. */
export function redraftBoardSqlLimited(limit: number): string {
  return `${REDRAFT_BOARD_SQL}
  LIMIT ${Math.max(1, Math.floor(limit))}`;
}
