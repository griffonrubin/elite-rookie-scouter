import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { RedraftBoard } from '@/components/redraft/RedraftBoard';
import { RedraftPlayer } from '@/lib/types';
import { TrendingUp, Users } from 'lucide-react';

export const dynamic = "force-dynamic";

// Bayesian shrinkage, same idea as the rookie board: a player ranked by a
// single source shouldn't leapfrog one the whole market agrees on. Pulls each
// average toward a prior rank of 250 (mid-pool) with the weight of ~1.5 sources.
const SHRINK_PRIOR_RANK = 250;
const SHRINK_PRIOR_WEIGHT = 1.5;

const BOARD_SQL = `
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
    SELECT player_id,
           AVG(proj_points) AS proj_points,
           AVG(proj_ppg) AS proj_ppg,
           COUNT(*) AS proj_sources
    FROM projections WHERE season = 2026 GROUP BY player_id
  )
  SELECT
    p.id, p.slug, p.full_name, p.position, p.nfl_team, p.nfl_headshot_url,
    p.headshot_url, p.dob, p.years_exp, p.nfl_draft_year, p.draft_year,
    p.height_inches, p.weight_lbs,
    t.logo_url AS team_logo, t.primary_color AS team_color,
    c.rank_overall, c.rank_positional, c.avg_rank, c.best_rank, c.worst_rank,
    c.std_deviation, c.num_sources,
    lsr.fp_rank, lsr.espn_rank, lsr.ktc_rank, lsr.cbs_rank, lsr.yahoo_rank,
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
    pr.proj_points, pr.proj_ppg, pr.proj_sources
  FROM players p
  LEFT JOIN latest_consensus  c   ON c.player_id = p.id
  LEFT JOIN latest_source_rank lsr ON lsr.player_id = p.id
  LEFT JOIN nfl_season_stats  s   ON s.player_id = p.id AND s.season = 2025
  LEFT JOIN season_history    h   ON h.player_id = p.id
  LEFT JOIN proj              pr  ON pr.player_id = p.id
  LEFT JOIN nfl_teams         t   ON t.abbreviation = p.nfl_team
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

async function getRedraftBoard(): Promise<{ players: RedraftPlayer[]; lastUpdateDate: string | null }> {
  try {
    const players = await query<RedraftPlayer>(BOARD_SQL, []);

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
