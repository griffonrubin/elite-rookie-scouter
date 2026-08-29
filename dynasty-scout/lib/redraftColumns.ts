// Shared column definitions for the REDRAFT board table.
// RedraftBoard.tsx (header row) and RedraftMiniCard.tsx (data rows) both import
// this so the header and the data cells stay pixel-perfectly aligned — same
// contract as lib/boardColumns.ts on the rookie side.

export type RedraftSortKey =
    | 'rank' | 'pos_rank' | 'avg_rank' | 'best' | 'worst' | 'sd' | 'sources'
    | 'my_rank'
    | 'fp' | 'ktc' | 'fc' | 'espn' | 'yahoo' | 'cbs' | 'sleeper' | 'flock'
    | 'underdog' | 'ffpc'
    | 'proj' | 'proj_ppg'
    | 'pts25' | 'ppg25' | 'fin25' | 'fin25_ov'
    | 'pts24' | 'pts23' | 'pts22' | 'pts21'
    | 'age' | 'exp' | 'team' | 'games'
    | 'pass_yds' | 'pass_td' | 'ints' | 'rush_yds' | 'rush_td' | 'carries'
    | 'targets' | 'rec' | 'rec_yds' | 'rec_td'
    | 'fgm' | 'fga' | 'fg_pct' | 'fg50' | 'xp'
    | 'dst_sacks' | 'dst_ints' | 'dst_td' | 'dst_pa'
    // advanced rates (2025)
    | 'snap_share' | 'touches' | 'y_per_touch' | 'epa_db' | 'cpoe' | 'ypa'
    | 'pass_td_rate' | 'int_rate' | 'pressure' | 'sack_rate'
    | 'att_g' | 'ypc' | 'yaco' | 'rush_mtf' | 'breakaway' | 'epa_rush'
    | 'tgt_share' | 'ay_share' | 'wopr' | 'tgt_g' | 'y_snap' | 'y_tgt'
    | 'adot' | 'yac_rec' | 'catch_rate' | 'epa_tgt'
    | 'fga_g' | 'fg_pct_adv' | 'fg40' | 'fg_dist' | 'fg50_att' | 'xp_pct'
    | 'dsack_g' | 'dto_g' | 'dpa_g'
    // Vegas (2026)
    | 'veg_implied' | 'veg_rank' | 'veg_total' | 'veg_spread' | 'veg_win';

/** The dataset "lenses" — same player rows, different columns. */
export type RedraftDataset =
    | 'snapshot' | 'sources' | 'production' | 'advanced' | 'vegas'
    | 'seasons' | 'projections';

export interface RedraftColDef {
    key: string;
    label: string;
    subLabel?: string;
    sortKey?: RedraftSortKey;
    tooltip?: string;
}

// ── Consensus / ranking atoms ────────────────────────────────────────────────
const AVG:   RedraftColDef = { key: 'avg_rank', label: 'Avg',  subLabel: 'Rank',  sortKey: 'avg_rank', tooltip: 'Average rank across every source that ranked this player' };
const BEST:  RedraftColDef = { key: 'best_rank', label: 'Best', subLabel: 'Rank', sortKey: 'best',     tooltip: 'Highest (most optimistic) rank any source gave this player' };
const WORST: RedraftColDef = { key: 'worst_rank', label: 'Worst', subLabel: 'Rank', sortKey: 'worst', tooltip: 'Lowest (most pessimistic) rank any source gave this player' };
const SD:    RedraftColDef = { key: 'std_deviation', label: 'SD', subLabel: 'Spread', sortKey: 'sd',  tooltip: 'Standard deviation of the source ranks — high = the experts disagree, which means draft-day value or risk' };
const NSRC:  RedraftColDef = { key: 'num_sources', label: 'Src', subLabel: 'Count', sortKey: 'sources', tooltip: 'How many sources ranked this player' };

const MINE:    RedraftColDef = { key: 'my_rank',      label: 'Me',    subLabel: 'Rank', sortKey: 'my_rank', tooltip: 'Your own board, imported from data/my_rankings/ — the one column here that is not an outside opinion' };
const FP:      RedraftColDef = { key: 'fp_rank',      label: 'FP',    subLabel: 'ECR',  sortKey: 'fp',      tooltip: 'FantasyPros — expert consensus ranking (100+ experts), PPR' };
const ESPN:    RedraftColDef = { key: 'espn_rank',    label: 'ESPN',  subLabel: 'PPR',  sortKey: 'espn',    tooltip: 'ESPN — staff PPR redraft ranking' };
const KTC:     RedraftColDef = { key: 'ktc_rank',     label: 'KTC',   subLabel: 'S/S',  sortKey: 'ktc',     tooltip: 'KeepTradeCut — community start/sit seasonal ranking' };
const CBS:     RedraftColDef = { key: 'cbs_rank',     label: 'CBS',   subLabel: 'PPR',  sortKey: 'cbs',     tooltip: 'CBS Sports — staff PPR redraft ranking' };
const YAHOO:   RedraftColDef = { key: 'yahoo_rank',   label: 'YHO',   subLabel: 'PPR',  sortKey: 'yahoo',   tooltip: 'Yahoo — PPR redraft ranking' };
const SLEEPER: RedraftColDef = { key: 'sleeper_rank', label: 'SLP',   subLabel: 'ADP',  sortKey: 'sleeper', tooltip: 'Sleeper — draft position ranking' };
const FC:      RedraftColDef = { key: 'fc_rank',      label: 'FC',    subLabel: 'Val',  sortKey: 'fc',      tooltip: 'FantasyCalc — market value ranking (redraft PPR)' };
const FLOCK:   RedraftColDef = { key: 'flock_rank',   label: 'FLK',   subLabel: 'Exp',  sortKey: 'flock',   tooltip: 'Flock Fantasy — their analysts own PPR board (an editorial ranking, not an ADP aggregate)' };
const UNDERDOG: RedraftColDef = { key: 'underdog_rank', label: 'UD',  subLabel: 'ADP',  sortKey: 'underdog', tooltip: 'Underdog — best-ball average draft position' };
const FFPC:    RedraftColDef = { key: 'ffpc_rank',    label: 'FFPC',  subLabel: 'ADP',  sortKey: 'ffpc',    tooltip: 'FFPC — high-stakes average draft position (leans TE-premium)' };

// ── Fantasy production atoms ─────────────────────────────────────────────────
const PTS25: RedraftColDef = { key: 'pts25', label: 'Pts',  subLabel: "'25",   sortKey: 'pts25', tooltip: 'Total PPR fantasy points scored in the 2025 season' };
const PPG25: RedraftColDef = { key: 'ppg25', label: 'PPG',  subLabel: "'25",   sortKey: 'ppg25', tooltip: 'PPR fantasy points per game in 2025 — the best single measure of weekly value' };
const FIN25: RedraftColDef = { key: 'fin25', label: 'Fin',  subLabel: "'25",   sortKey: 'fin25', tooltip: 'Where the player finished at their position in 2025 (e.g. WR7)' };
const OVR25: RedraftColDef = { key: 'fin25_ov', label: 'Ovr', subLabel: "'25", sortKey: 'fin25_ov', tooltip: 'Overall finish across all positions in 2025' };
const GAMES: RedraftColDef = { key: 'games25', label: 'G',   subLabel: "'25",   sortKey: 'games', tooltip: 'Games played in 2025 — context for the totals' };
const PROJ:  RedraftColDef = { key: 'proj_points', label: 'Proj', subLabel: "'26", sortKey: 'proj', tooltip: 'Projected 2026 PPR points, averaged across sources' };
const PROJ_PPG: RedraftColDef = { key: 'proj_ppg', label: 'P/G', subLabel: 'Proj', sortKey: 'proj_ppg', tooltip: 'Projected PPR points per game for 2026' };

// ── Profile atoms ────────────────────────────────────────────────────────────
const AGE:  RedraftColDef = { key: 'age',      label: 'Age',           sortKey: 'age',  tooltip: 'Current age' };
const EXP:  RedraftColDef = { key: 'years_exp', label: 'Exp', subLabel: 'Yrs', sortKey: 'exp', tooltip: 'NFL seasons of experience — 0 = rookie' };

// ── Season history atoms ─────────────────────────────────────────────────────
const S21: RedraftColDef = { key: 's21', label: '2021', sortKey: 'pts21', tooltip: '2021 PPR points and positional finish' };
const S22: RedraftColDef = { key: 's22', label: '2022', sortKey: 'pts22', tooltip: '2022 PPR points and positional finish' };
const S23: RedraftColDef = { key: 's23', label: '2023', sortKey: 'pts23', tooltip: '2023 PPR points and positional finish' };
const S24: RedraftColDef = { key: 's24', label: '2024', sortKey: 'pts24', tooltip: '2024 PPR points and positional finish' };
const S25: RedraftColDef = { key: 's25', label: '2025', sortKey: 'pts25', tooltip: '2025 PPR points and positional finish' };

// ── Per-position counting stats (2025) ───────────────────────────────────────
const PASS_YDS: RedraftColDef = { key: 'pass_yards', label: 'PaYd', subLabel: "'25", sortKey: 'pass_yds', tooltip: '2025 passing yards' };
const PASS_TD:  RedraftColDef = { key: 'pass_tds',   label: 'PaTD', subLabel: "'25", sortKey: 'pass_td',  tooltip: '2025 passing touchdowns' };
const INTS:     RedraftColDef = { key: 'interceptions', label: 'Int', subLabel: "'25", sortKey: 'ints',   tooltip: '2025 interceptions thrown' };
const CARRIES:  RedraftColDef = { key: 'carries',    label: 'Att',  subLabel: "'25", sortKey: 'carries',  tooltip: '2025 rushing attempts — volume is the foundation of RB scoring' };
const RUSH_YDS: RedraftColDef = { key: 'rush_yards', label: 'RuYd', subLabel: "'25", sortKey: 'rush_yds', tooltip: '2025 rushing yards' };
const RUSH_TD:  RedraftColDef = { key: 'rush_tds',   label: 'RuTD', subLabel: "'25", sortKey: 'rush_td',  tooltip: '2025 rushing touchdowns' };
const TARGETS:  RedraftColDef = { key: 'targets',    label: 'Tgt',  subLabel: "'25", sortKey: 'targets',  tooltip: '2025 targets — the single most predictive PPR input' };
const REC:      RedraftColDef = { key: 'receptions', label: 'Rec',  subLabel: "'25", sortKey: 'rec',      tooltip: '2025 receptions — worth a full point each in PPR' };
const REC_YDS:  RedraftColDef = { key: 'rec_yards',  label: 'ReYd', subLabel: "'25", sortKey: 'rec_yds',  tooltip: '2025 receiving yards' };
const REC_TD:   RedraftColDef = { key: 'rec_tds',    label: 'ReTD', subLabel: "'25", sortKey: 'rec_td',   tooltip: '2025 receiving touchdowns' };

const FGM:    RedraftColDef = { key: 'fg_made', label: 'FGM', subLabel: "'25", sortKey: 'fgm',    tooltip: '2025 field goals made' };
const FGA:    RedraftColDef = { key: 'fg_att',  label: 'FGA', subLabel: "'25", sortKey: 'fga',    tooltip: '2025 field goals attempted — volume matters as much as accuracy' };
const FGPCT:  RedraftColDef = { key: 'fg_pct',  label: 'FG%', subLabel: "'25", sortKey: 'fg_pct', tooltip: '2025 field goal percentage' };
const FG50:   RedraftColDef = { key: 'fg_made_50plus', label: '50+', subLabel: "'25", sortKey: 'fg50', tooltip: '2025 field goals made from 50+ yards — worth 5 points each' };
const XP:     RedraftColDef = { key: 'xp_made', label: 'XP',  subLabel: "'25", sortKey: 'xp',     tooltip: '2025 extra points made' };

const DSACK: RedraftColDef = { key: 'dst_sacks', label: 'Sck', subLabel: "'25", sortKey: 'dst_sacks', tooltip: '2025 team sacks' };
const DINT:  RedraftColDef = { key: 'dst_ints',  label: 'Int', subLabel: "'25", sortKey: 'dst_ints',  tooltip: '2025 team interceptions' };
const DTD:   RedraftColDef = { key: 'dst_tds',   label: 'TD',  subLabel: "'25", sortKey: 'dst_td',    tooltip: '2025 defensive and special-teams touchdowns' };
const DPA:   RedraftColDef = { key: 'dst_points_allowed', label: 'PA', subLabel: "'25", sortKey: 'dst_pa', tooltip: '2025 total points allowed — drives the scoring bracket each week' };

// ── Advanced rate atoms (2025, from nfl_advanced_season) ─────────────────────
const SNAP:   RedraftColDef = { key: 'adv_snap_share', label: 'Snp%', subLabel: "'25", sortKey: 'snap_share', tooltip: "Share of the offence's snaps in 2025 — the floor under every other rate" };
const TOUCH:  RedraftColDef = { key: 'adv_touches_per_game', label: 'Tch', subLabel: '/G', sortKey: 'touches', tooltip: 'Carries plus receptions per game in 2025' };
const YTOUCH: RedraftColDef = { key: 'adv_yards_per_touch', label: 'Y/Tch', subLabel: "'25", sortKey: 'y_per_touch', tooltip: 'Rushing plus receiving yards per touch' };

const EPA_DB: RedraftColDef = { key: 'adv_epa_per_dropback', label: 'EPA', subLabel: '/DB', sortKey: 'epa_db', tooltip: 'Expected points added per dropback — the single best measure of QB play' };
const CPOE:   RedraftColDef = { key: 'adv_cpoe', label: 'CPOE', subLabel: "'25", sortKey: 'cpoe', tooltip: 'Completion percentage above what the throw difficulty predicted' };
const YPA:    RedraftColDef = { key: 'adv_yards_per_attempt', label: 'Y/A', subLabel: "'25", sortKey: 'ypa', tooltip: 'Passing yards per attempt' };
const PTDR:   RedraftColDef = { key: 'adv_pass_td_rate', label: 'TD%', subLabel: 'Pass', sortKey: 'pass_td_rate', tooltip: 'Touchdown passes per attempt' };
const INTR:   RedraftColDef = { key: 'adv_int_rate', label: 'Int%', subLabel: "'25", sortKey: 'int_rate', tooltip: 'Interceptions per attempt — lower is better' };
const PRESS:  RedraftColDef = { key: 'adv_pressure_pct', label: 'Prs%', subLabel: "'25", sortKey: 'pressure', tooltip: 'Share of dropbacks under pressure — mostly an offensive-line signal' };
const SACKR:  RedraftColDef = { key: 'adv_sack_rate', label: 'Sck%', subLabel: "'25", sortKey: 'sack_rate', tooltip: 'Sacks per dropback' };

const ATTG:   RedraftColDef = { key: 'adv_carries_per_game', label: 'Att', subLabel: '/G', sortKey: 'att_g', tooltip: 'Rushing attempts per game in 2025' };
const YPC:    RedraftColDef = { key: 'adv_yards_per_carry', label: 'YPC', subLabel: "'25", sortKey: 'ypc', tooltip: 'Rushing yards per attempt' };
const YACO:   RedraftColDef = { key: 'adv_yards_after_contact_att', label: 'YAC', subLabel: '/Att', sortKey: 'yaco', tooltip: 'Yards after contact per carry — the part the back earns himself' };
const RMTF:   RedraftColDef = { key: 'adv_rush_mtf_rate', label: 'MTF%', subLabel: 'Rush', sortKey: 'rush_mtf', tooltip: 'Broken tackles per 100 carries' };
const BRK:    RedraftColDef = { key: 'adv_breakaway_rush_rate', label: 'Brk%', subLabel: "'25", sortKey: 'breakaway', tooltip: 'Carries of 20+ yards — the runs that win a week outright' };
const EPA_RU: RedraftColDef = { key: 'adv_epa_per_rush', label: 'EPA', subLabel: '/Ru', sortKey: 'epa_rush', tooltip: 'Expected points added per carry' };

const TGTSH:  RedraftColDef = { key: 'adv_target_share', label: 'Tgt%', subLabel: 'Share', sortKey: 'tgt_share', tooltip: "Share of the team's targets — the stat that travels best between seasons" };
const AYSH:   RedraftColDef = { key: 'adv_air_yards_share', label: 'AY%', subLabel: 'Share', sortKey: 'ay_share', tooltip: "Share of the team's air yards — who the offence throws to downfield" };
const WOPR:   RedraftColDef = { key: 'adv_wopr', label: 'WOPR', subLabel: "'25", sortKey: 'wopr', tooltip: 'Weighted opportunity rating — target share and air-yard share in one number' };
const TGTG:   RedraftColDef = { key: 'adv_targets_per_game', label: 'Tgt', subLabel: '/G', sortKey: 'tgt_g', tooltip: 'Targets per game in 2025' };
const YSNAP:  RedraftColDef = { key: 'adv_yards_per_snap', label: 'Y/Snp', subLabel: "'25", sortKey: 'y_snap', tooltip: 'Receiving yards per offensive snap — the closest stand-in for YPRR without route data' };
const YTGT:   RedraftColDef = { key: 'adv_yards_per_target', label: 'Y/Tgt', subLabel: "'25", sortKey: 'y_tgt', tooltip: 'Receiving yards per target' };
const ADOT:   RedraftColDef = { key: 'adv_adot', label: 'ADOT', subLabel: "'25", sortKey: 'adot', tooltip: 'Average depth of target — role, not quality' };
const YACR:   RedraftColDef = { key: 'adv_yards_after_catch_rec', label: 'YAC', subLabel: '/Rec', sortKey: 'yac_rec', tooltip: 'Yards after the catch per reception' };
const CATCH:  RedraftColDef = { key: 'adv_catch_rate', label: 'Ctc%', subLabel: "'25", sortKey: 'catch_rate', tooltip: 'Receptions per target' };
const EPA_TG: RedraftColDef = { key: 'adv_epa_per_target', label: 'EPA', subLabel: '/Tgt', sortKey: 'epa_tgt', tooltip: 'Expected points added per target' };

const FGAG:   RedraftColDef = { key: 'adv_fg_att_per_game', label: 'FGA', subLabel: '/G', sortKey: 'fga_g', tooltip: 'Field goal attempts per game — the closest thing a kicker has to target share' };
const FGPCTA: RedraftColDef = { key: 'adv_fg_pct', label: 'FG%', subLabel: "'25", sortKey: 'fg_pct_adv', tooltip: 'Field goals made per attempt' };
const FG40:   RedraftColDef = { key: 'adv_fg_pct_40plus', label: '40+%', subLabel: "'25", sortKey: 'fg40', tooltip: 'Accuracy from 40 yards and beyond, where the extra points live' };
const FGDIST: RedraftColDef = { key: 'adv_avg_fg_distance', label: 'Dist', subLabel: 'Avg', sortKey: 'fg_dist', tooltip: 'Average attempt distance — leverage, not skill' };
const FG50A:  RedraftColDef = { key: 'adv_fg_50plus_att', label: '50+', subLabel: 'Att', sortKey: 'fg50_att', tooltip: 'Attempts from 50 yards out — worth 5 points each' };
const XPPCT:  RedraftColDef = { key: 'adv_xp_pct', label: 'XP%', subLabel: "'25", sortKey: 'xp_pct', tooltip: 'Extra points made per attempt' };

const DSACKG: RedraftColDef = { key: 'adv_dst_sacks_per_game', label: 'Sck', subLabel: '/G', sortKey: 'dsack_g', tooltip: 'Team sacks per game' };
const DTOG:   RedraftColDef = { key: 'adv_dst_takeaways_per_game', label: 'TO', subLabel: '/G', sortKey: 'dto_g', tooltip: 'Interceptions plus fumble recoveries per game' };
const DPAG:   RedraftColDef = { key: 'adv_dst_points_allowed_per_game', label: 'PA', subLabel: '/G', sortKey: 'dpa_g', tooltip: 'Points allowed per game — drives the scoring bracket every week' };

// ── Vegas atoms (2026 market) ────────────────────────────────────────────────
const VEG_IMP:   RedraftColDef = { key: 'vegas_implied_total', label: 'Imp', subLabel: 'Total', sortKey: 'veg_implied', tooltip: "The team's average implied point total — half the game total shifted by half the spread, and the number every projection is built on" };
const VEG_RANK:  RedraftColDef = { key: 'vegas_implied_rank', label: 'Off', subLabel: 'Rk', sortKey: 'veg_rank', tooltip: 'Where that implied total ranks among all 32 offences' };
const VEG_TOTAL: RedraftColDef = { key: 'vegas_total', label: 'O/U', subLabel: 'Avg', sortKey: 'veg_total', tooltip: 'Average game total — how much scoring the market expects around this player' };
const VEG_SPRD:  RedraftColDef = { key: 'vegas_spread', label: 'Sprd', subLabel: 'Avg', sortKey: 'veg_spread', tooltip: 'Average point spread — negative means favoured. Game script follows this' };
const VEG_WIN:   RedraftColDef = { key: 'vegas_win_pct', label: 'Win%', subLabel: 'Exp', sortKey: 'veg_win', tooltip: 'De-vigged expected win rate over the games priced so far' };

// ── Column sets ──────────────────────────────────────────────────────────────

/** Snapshot: the everyday board — recent production plus where the market has them. */
function snapshotColDefs(pos: string): RedraftColDef[] {
    if (pos === 'QB')  return [PTS25, PPG25, FIN25, PASS_YDS, PASS_TD, INTS, RUSH_YDS, PROJ, FP, KTC, SD]; // 11
    if (pos === 'RB')  return [PTS25, PPG25, FIN25, CARRIES, RUSH_YDS, RUSH_TD, REC, PROJ, FP, KTC, SD];   // 11
    if (pos === 'WR' || pos === 'TE')
        return [PTS25, PPG25, FIN25, TARGETS, REC, REC_YDS, REC_TD, PROJ, FP, KTC, SD];                    // 11
    if (pos === 'K')   return [PTS25, PPG25, FIN25, FGM, FGA, FGPCT, FG50, XP, PROJ, FP, SD];              // 11
    if (pos === 'DST') return [PTS25, PPG25, FIN25, DSACK, DINT, DTD, DPA, PROJ, FP, SD];                  // 10
    // ALL — position-agnostic mix
    return [PTS25, PPG25, FIN25, OVR25, AGE, PROJ, FP, KTC, FC, AVG, SD];                                  // 11
}

/** Production: full 2025 counting-stat line for the position. */
function productionColDefs(pos: string): RedraftColDef[] {
    if (pos === 'QB')  return [GAMES, PASS_YDS, PASS_TD, INTS, CARRIES, RUSH_YDS, RUSH_TD, PTS25, PPG25];  // 9
    if (pos === 'RB')  return [GAMES, CARRIES, RUSH_YDS, RUSH_TD, TARGETS, REC, REC_YDS, REC_TD, PPG25];   // 9
    if (pos === 'WR' || pos === 'TE')
        return [GAMES, TARGETS, REC, REC_YDS, REC_TD, CARRIES, RUSH_YDS, RUSH_TD, PPG25];                  // 9
    if (pos === 'K')   return [GAMES, FGM, FGA, FGPCT, FG50, XP, PTS25, PPG25];                            // 8
    if (pos === 'DST') return [GAMES, DSACK, DINT, DTD, DPA, PTS25, PPG25];                                // 7
    return [GAMES, PASS_YDS, RUSH_YDS, REC, REC_YDS, REC_TD, PTS25, PPG25];                                // 8
}

/** Advanced: the efficiency and opportunity rates behind the 2025 box score. */
function advancedColDefs(pos: string): RedraftColDef[] {
    if (pos === 'QB')  return [SNAP, EPA_DB, CPOE, YPA, PTDR, INTR, PRESS, SACKR, ATTG];      // 9
    if (pos === 'RB')  return [SNAP, ATTG, TOUCH, TGTSH, YPC, YACO, RMTF, BRK, EPA_RU];       // 9
    if (pos === 'WR' || pos === 'TE')
        return [SNAP, TGTG, TGTSH, AYSH, WOPR, YSNAP, YTGT, ADOT, YACR, CATCH];               // 10
    if (pos === 'K')   return [FGAG, FGPCTA, FG40, FGDIST, FG50A, XPPCT];                      // 6
    if (pos === 'DST') return [DSACKG, DTOG, DPAG];                                            // 3
    // ALL — the metrics that mean something whatever the position
    return [SNAP, TOUCH, YTOUCH, TGTSH, WOPR, YSNAP, YPC, EPA_TG, PPG25];                      // 9
}

/** Vegas: the 2026 market a player's production has to come out of. */
function vegasColDefs(): RedraftColDef[] {
    return [VEG_IMP, VEG_RANK, VEG_TOTAL, VEG_SPRD, VEG_WIN, PROJ, PROJ_PPG, PPG25];           // 8
}

/** Column set for a given lens + position filter. */
export function getRedraftColDefs(dataset: RedraftDataset, pos: string): RedraftColDef[] {
    switch (dataset) {
        case 'sources':
            // Editorial boards first, then market ADP, then the spread summary.
            return [MINE, FP, ESPN, FLOCK, CBS, SLEEPER, YAHOO, UNDERDOG, FFPC, KTC, FC,
                    AVG, BEST, WORST, SD, NSRC]; // 16
        case 'production':
            return productionColDefs(pos);
        case 'advanced':
            return advancedColDefs(pos);
        case 'vegas':
            return vegasColDefs();
        case 'seasons':
            return [EXP, S21, S22, S23, S24, S25, PROJ];                                        // 7
        case 'projections':
            return [PROJ, PROJ_PPG, PTS25, PPG25, FIN25, FP, AVG, SD];                          // 8
        case 'snapshot':
        default:
            return snapshotColDefs(pos);
    }
}

/**
 * Minimum width (px) of the stat grid below the lg breakpoint. Phones cannot
 * fit a dozen fractional columns, and without a floor the numbers overprint
 * each other; this makes the table scroll sideways instead, with the identity
 * column pinned. Shared by the header row and the data rows so they cannot
 * disagree about where the columns sit.
 */
export function getRedraftStatMinWidth(dataset: RedraftDataset, pos: string): number {
    return getRedraftColDefs(dataset, pos).length * 52;
}

/** CSS grid-template-columns for the scrollable (non-identity) section. */
export function getRedraftGridTemplate(dataset: RedraftDataset, pos: string): string {
    if (dataset === 'sources') {
        // your board | 10 source ranks | avg best worst sd | src count
        return '0.5fr '
             + '0.5fr 0.55fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.55fr 0.5fr 0.5fr '
             + '0.6fr 0.55fr 0.6fr 0.55fr 0.5fr';
    }
    if (dataset === 'seasons') {
        return '0.5fr 1fr 1fr 1fr 1fr 1fr 0.7fr';
    }
    if (dataset === 'projections') {
        return '0.7fr 0.6fr 0.65fr 0.6fr 0.6fr 0.55fr 0.6fr 0.55fr';
    }
    if (dataset === 'advanced') {
        if (pos === 'DST') return '0.6fr 0.6fr 0.6fr';
        if (pos === 'K') return '0.6fr 0.6fr 0.6fr 0.6fr 0.55fr 0.6fr';
        if (pos === 'WR' || pos === 'TE')
            return '0.6fr 0.5fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.55fr 0.55fr 0.6fr';
        return '0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.65fr';
    }
    if (dataset === 'vegas') {
        return '0.6fr 0.5fr 0.6fr 0.6fr 0.6fr 0.65fr 0.6fr 0.6fr';
    }
    if (dataset === 'production') {
        if (pos === 'DST') return '0.45fr 0.55fr 0.5fr 0.5fr 0.6fr 0.65fr 0.6fr';
        if (pos === 'K') return '0.45fr 0.55fr 0.55fr 0.6fr 0.5fr 0.5fr 0.65fr 0.6fr';
        return '0.45fr 0.6fr 0.7fr 0.6fr 0.6fr 0.55fr 0.7fr 0.6fr 0.6fr';
    }
    // snapshot
    if (pos === 'DST') return '0.65fr 0.6fr 0.6fr 0.5fr 0.5fr 0.5fr 0.55fr 0.65fr 0.5fr 0.55fr';
    return '0.65fr 0.6fr 0.6fr 0.6fr 0.6fr 0.55fr 0.6fr 0.65fr 0.5fr 0.5fr 0.55fr';
}

/** Positions the redraft board can filter to. */
export const REDRAFT_POSITION_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;

// ── Shared tier bands ────────────────────────────────────────────────────────
// Bands are expressed in draft rounds rather than arbitrary rank cutoffs, so
// they stay meaningful on both the list and the draft board. Used by
// RedraftMiniCard, RedraftBoxView and RedraftDraftBoard so a player's tier
// colour is identical in every view.
export interface RedraftTier {
    label: string;
    short: string;
    /** Inclusive upper bound of the band, by overall rank. */
    max: number;
    accent: string;
    border: string;
    bg: string;
    text: string;
}

export const REDRAFT_TIERS: RedraftTier[] = [
    { label: 'Round 1',      short: 'R1',   max: 12,       accent: '#f97316', border: 'border-orange-500/70',  bg: 'bg-orange-500/[0.08]',  text: 'text-orange-400' },
    { label: 'Rounds 2-3',   short: 'R2-3', max: 36,       accent: '#22c55e', border: 'border-emerald-500/60', bg: 'bg-emerald-500/[0.06]', text: 'text-emerald-400' },
    { label: 'Rounds 4-6',   short: 'R4-6', max: 72,       accent: '#38bdf8', border: 'border-cyan-500/50',    bg: 'bg-cyan-500/[0.05]',    text: 'text-cyan-400' },
    { label: 'Rounds 7-10',  short: 'R7-10', max: 120,     accent: '#a78bfa', border: 'border-violet-500/50',  bg: 'bg-violet-500/[0.05]',  text: 'text-violet-400' },
    { label: 'Late',         short: 'Late', max: 200,      accent: '#f59e0b', border: 'border-amber-500/40',   bg: 'bg-amber-500/[0.05]',   text: 'text-amber-400' },
    { label: 'Deep',         short: 'Deep', max: Infinity, accent: '#475569', border: 'border-border/25',      bg: 'bg-card/50',            text: 'text-muted-foreground/50' },
];

export function getRedraftTier(rank: number): RedraftTier {
    return REDRAFT_TIERS.find(t => rank <= t.max) ?? REDRAFT_TIERS[REDRAFT_TIERS.length - 1];
}

// ── Sort menu ────────────────────────────────────────────────────────────────
// Every metric the board can order by, grouped for the sort dropdown. The board
// can sort on a metric whether or not the current lens shows its column, so
// this list is deliberately wider than any single column set — pick "Vegas
// implied total" from the Production lens and the order still changes.
//
// Labels are written out in full here rather than reusing the terse column
// abbreviations, because a dropdown has room and "Imp / Total" does not read
// as anything on its own.

export interface RedraftSortOption {
    key: RedraftSortKey;
    label: string;
}

export interface RedraftSortGroup {
    group: string;
    options: RedraftSortOption[];
}

export const REDRAFT_SORT_GROUPS: RedraftSortGroup[] = [
    {
        group: 'Consensus',
        options: [
            { key: 'rank', label: 'Consensus rank' },
            { key: 'pos_rank', label: 'Positional rank' },
            { key: 'avg_rank', label: 'Average rank' },
            { key: 'best', label: 'Best rank' },
            { key: 'worst', label: 'Worst rank' },
            { key: 'sd', label: 'Source disagreement' },
            { key: 'sources', label: 'Sources ranking him' },
        ],
    },
    {
        group: 'Individual sources',
        options: [
            { key: 'my_rank', label: 'My rankings' },
            { key: 'fp', label: 'FantasyPros ECR' },
            { key: 'espn', label: 'ESPN' },
            { key: 'flock', label: 'Flock Fantasy' },
            { key: 'cbs', label: 'CBS' },
            { key: 'sleeper', label: 'Sleeper ADP' },
            { key: 'yahoo', label: 'Yahoo' },
            { key: 'underdog', label: 'Underdog ADP' },
            { key: 'ffpc', label: 'FFPC ADP' },
            { key: 'ktc', label: 'KeepTradeCut' },
            { key: 'fc', label: 'FantasyCalc' },
        ],
    },
    {
        group: 'Vegas · 2026',
        options: [
            { key: 'veg_implied', label: 'Implied team total' },
            { key: 'veg_rank', label: 'Offence rank (1-32)' },
            { key: 'veg_total', label: 'Game total (O/U)' },
            { key: 'veg_spread', label: 'Point spread' },
            { key: 'veg_win', label: 'Expected win rate' },
        ],
    },
    {
        group: 'Projections · 2026',
        options: [
            { key: 'proj', label: 'Projected points' },
            { key: 'proj_ppg', label: 'Projected points / game' },
        ],
    },
    {
        group: 'Fantasy production',
        options: [
            { key: 'pts25', label: '2025 points' },
            { key: 'ppg25', label: '2025 points / game' },
            { key: 'fin25', label: '2025 positional finish' },
            { key: 'fin25_ov', label: '2025 overall finish' },
            { key: 'games', label: '2025 games played' },
            { key: 'pts24', label: '2024 points' },
            { key: 'pts23', label: '2023 points' },
            { key: 'pts22', label: '2022 points' },
            { key: 'pts21', label: '2021 points' },
        ],
    },
    {
        group: 'Usage & efficiency · 2025',
        options: [
            { key: 'snap_share', label: 'Snap share' },
            { key: 'touches', label: 'Touches / game' },
            { key: 'y_per_touch', label: 'Yards / touch' },
            { key: 'tgt_share', label: 'Target share' },
            { key: 'ay_share', label: 'Air-yards share' },
            { key: 'wopr', label: 'Weighted opportunity (WOPR)' },
            { key: 'tgt_g', label: 'Targets / game' },
            { key: 'y_snap', label: 'Receiving yards / snap' },
            { key: 'y_tgt', label: 'Yards / target' },
            { key: 'adot', label: 'Average depth of target' },
            { key: 'yac_rec', label: 'Yards after catch / reception' },
            { key: 'catch_rate', label: 'Catch rate' },
            { key: 'epa_tgt', label: 'EPA / target' },
        ],
    },
    {
        group: 'Rushing · 2025',
        options: [
            { key: 'att_g', label: 'Carries / game' },
            { key: 'ypc', label: 'Yards / carry' },
            { key: 'yaco', label: 'Yards after contact / carry' },
            { key: 'rush_mtf', label: 'Broken tackle rate' },
            { key: 'breakaway', label: 'Breakaway rate (20+)' },
            { key: 'epa_rush', label: 'EPA / rush' },
        ],
    },
    {
        group: 'Passing · 2025',
        options: [
            { key: 'epa_db', label: 'EPA / dropback' },
            { key: 'cpoe', label: 'Completion % over expected' },
            { key: 'ypa', label: 'Yards / attempt' },
            { key: 'pass_td_rate', label: 'Touchdown rate' },
            { key: 'int_rate', label: 'Interception rate' },
            { key: 'pressure', label: 'Pressure rate faced' },
            { key: 'sack_rate', label: 'Sack rate' },
        ],
    },
    {
        group: 'Kicking & defence · 2025',
        options: [
            { key: 'fga_g', label: 'FG attempts / game' },
            { key: 'fg_pct_adv', label: 'Field goal %' },
            { key: 'fg40', label: 'FG % from 40+' },
            { key: 'fg_dist', label: 'Average FG distance' },
            { key: 'fg50_att', label: '50+ yard attempts' },
            { key: 'xp_pct', label: 'Extra point %' },
            { key: 'dsack_g', label: 'Team sacks / game' },
            { key: 'dto_g', label: 'Takeaways / game' },
            { key: 'dpa_g', label: 'Points allowed / game' },
        ],
    },
    {
        group: '2025 counting stats',
        options: [
            { key: 'pass_yds', label: 'Passing yards' },
            { key: 'pass_td', label: 'Passing touchdowns' },
            { key: 'ints', label: 'Interceptions thrown' },
            { key: 'carries', label: 'Rushing attempts' },
            { key: 'rush_yds', label: 'Rushing yards' },
            { key: 'rush_td', label: 'Rushing touchdowns' },
            { key: 'targets', label: 'Targets' },
            { key: 'rec', label: 'Receptions' },
            { key: 'rec_yds', label: 'Receiving yards' },
            { key: 'rec_td', label: 'Receiving touchdowns' },
        ],
    },
    {
        group: 'Profile',
        options: [
            { key: 'age', label: 'Age' },
            { key: 'exp', label: 'Years of experience' },
        ],
    },
];

/** Flat lookup so the trigger can name whatever is selected. */
export const REDRAFT_SORT_LABELS: Record<string, string> = Object.fromEntries(
    REDRAFT_SORT_GROUPS.flatMap(g => g.options.map(o => [o.key, o.label])),
);
