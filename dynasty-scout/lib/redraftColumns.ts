// Shared column definitions for the REDRAFT board table.
// RedraftBoard.tsx (header row) and RedraftMiniCard.tsx (data rows) both import
// this so the header and the data cells stay pixel-perfectly aligned — same
// contract as lib/boardColumns.ts on the rookie side.

export type RedraftSortKey =
    | 'rank' | 'pos_rank' | 'avg_rank' | 'best' | 'worst' | 'sd' | 'sources'
    | 'fp' | 'ktc' | 'fc' | 'espn' | 'yahoo' | 'cbs' | 'sleeper' | 'flock'
    | 'proj' | 'proj_ppg'
    | 'pts25' | 'ppg25' | 'fin25' | 'fin25_ov'
    | 'pts24' | 'pts23' | 'pts22' | 'pts21'
    | 'age' | 'exp' | 'team' | 'games'
    | 'pass_yds' | 'pass_td' | 'ints' | 'rush_yds' | 'rush_td' | 'carries'
    | 'targets' | 'rec' | 'rec_yds' | 'rec_td'
    | 'fgm' | 'fga' | 'fg_pct' | 'fg50' | 'xp'
    | 'dst_sacks' | 'dst_ints' | 'dst_td' | 'dst_pa';

/** The dataset "lenses" — same player rows, different columns. */
export type RedraftDataset =
    | 'snapshot' | 'sources' | 'production' | 'seasons' | 'projections';

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

const FP:      RedraftColDef = { key: 'fp_rank',      label: 'FP',    subLabel: 'ECR',  sortKey: 'fp',      tooltip: 'FantasyPros — expert consensus ranking (100+ experts), PPR' };
const ESPN:    RedraftColDef = { key: 'espn_rank',    label: 'ESPN',  subLabel: 'PPR',  sortKey: 'espn',    tooltip: 'ESPN — staff PPR redraft ranking' };
const KTC:     RedraftColDef = { key: 'ktc_rank',     label: 'KTC',   subLabel: 'S/S',  sortKey: 'ktc',     tooltip: 'KeepTradeCut — community start/sit seasonal ranking' };
const CBS:     RedraftColDef = { key: 'cbs_rank',     label: 'CBS',   subLabel: 'PPR',  sortKey: 'cbs',     tooltip: 'CBS Sports — staff PPR redraft ranking' };
const YAHOO:   RedraftColDef = { key: 'yahoo_rank',   label: 'YHO',   subLabel: 'PPR',  sortKey: 'yahoo',   tooltip: 'Yahoo — PPR redraft ranking' };
const SLEEPER: RedraftColDef = { key: 'sleeper_rank', label: 'SLP',   subLabel: 'ADP',  sortKey: 'sleeper', tooltip: 'Sleeper — draft position ranking' };
const FC:      RedraftColDef = { key: 'fc_rank',      label: 'FC',    subLabel: 'Val',  sortKey: 'fc',      tooltip: 'FantasyCalc — market value ranking (redraft PPR)' };
const FLOCK:   RedraftColDef = { key: 'flock_rank',   label: 'FLK',   subLabel: 'PPR',  sortKey: 'flock',   tooltip: 'Flock Fantasy — expert PPR redraft ranking' };

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

/** Column set for a given lens + position filter. */
export function getRedraftColDefs(dataset: RedraftDataset, pos: string): RedraftColDef[] {
    switch (dataset) {
        case 'sources':
            return [FP, ESPN, KTC, CBS, YAHOO, SLEEPER, FC, FLOCK, AVG, BEST, WORST, SD, NSRC]; // 13
        case 'production':
            return productionColDefs(pos);
        case 'seasons':
            return [EXP, S21, S22, S23, S24, S25, PROJ];                                        // 7
        case 'projections':
            return [PROJ, PROJ_PPG, PTS25, PPG25, FIN25, FP, AVG, SD];                          // 8
        case 'snapshot':
        default:
            return snapshotColDefs(pos);
    }
}

/** CSS grid-template-columns for the scrollable (non-identity) section. */
export function getRedraftGridTemplate(dataset: RedraftDataset, pos: string): string {
    if (dataset === 'sources') {
        // 8 source ranks | avg best worst sd | src count
        return '0.5fr 0.55fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.6fr 0.55fr 0.6fr 0.55fr 0.5fr';
    }
    if (dataset === 'seasons') {
        return '0.5fr 1fr 1fr 1fr 1fr 1fr 0.7fr';
    }
    if (dataset === 'projections') {
        return '0.7fr 0.6fr 0.65fr 0.6fr 0.6fr 0.55fr 0.6fr 0.55fr';
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
