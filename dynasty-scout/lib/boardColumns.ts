// Shared column definitions for the draft board table.
// Both DraftBoard.tsx (header row) and PlayerMiniCard.tsx (data rows) import this
// to guarantee the header and data columns are ALWAYS pixel-perfectly aligned.

export type SortKey =
    | 'rank' | 'ktc' | 'sleeper' | 'fp' | 'fc' | 'dn' | 'tfc'
    | 'pfn' | 'tank' | 'tdn' | 'brug' | 'dj'
    | 'forty' | 'spd' | 'ras' | 'height' | 'arm' | 'hand' | 'stars'
    | 'dom' | 'scrim_ypg' | 'pass_ypg' | 'comp_pct' | 'ypa' | 'ypr' | 'ypc'
    | 'vert' | 'broad' | 'cone' | 'shuttle' | 'bench'
    | 'gp' | 'pass_yds' | 'pass_td' | 'rush_yds' | 'rush_td' | 'rec' | 'rec_yds' | 'rec_td'
    | 'avg_rank' | 'mv7'
    | 'brkout' | 'wr_yprr' | 'adot' | 'wr_drop' | 'contested' | 'yac_rec' | 'slot'
    | 'wr_catch' | 'wr_mtf' | 'wr_tgt' | 'wr_open' | 'wr_zyprr' | 'wr_myprr'
    | 'rb_yac' | 'mtf' | 'rb_yprr' | 'brk' | 'exp' | 'rb_fd'
    | 'rb_ayprr' | 'rb_tgt' | 'rb_drop' | 'rb_fum' | 'rb_gap' | 'rb_zone'
    | 'jf_grade' | 'sim' | 'athl';

// The dataset "lenses" — same player rows, different columns.
export type BoardDataset =
    | 'snapshot' | 'rankings' | 'traits' | 'production'
    | 'seasons' | 'advanced' | 'scouting';

export interface ColDef {
    key: string;
    label: string;
    subLabel?: string;
    sortKey?: SortKey;
    tooltip?: string;
}

// ── Reusable column atoms ─────────────────────────────────────────────────────
const FORTY: ColDef = { key: 'forty', label: '40yd',  sortKey: 'forty', tooltip: '40-yard dash (seconds) — lower is faster' };
const SPD:   ColDef = { key: 'spd',   label: 'Spd',   sortKey: 'spd',   tooltip: 'Speed Score = (weight × 200) ÷ 40yd⁴ — adjusts raw speed for size' };
const RAS:   ColDef = { key: 'ras',   label: 'RAS',   sortKey: 'ras',   tooltip: 'Relative Athletic Score (0–10) — overall athleticism vs. historical players at same position' };
const ARM:   ColDef = { key: 'arm',   label: 'Arm',   sortKey: 'arm',   tooltip: 'Arm length in inches — important for contested catches and press coverage' };
const HAND:  ColDef = { key: 'hand',  label: 'Hand',  sortKey: 'hand',  tooltip: 'Hand size in inches — larger hands = better ball security and catching in weather' };
const STARS: ColDef = { key: 'stars', label: 'Rcrt',  sortKey: 'stars', tooltip: 'Recruiting Stars — High school recruiting stars (247Sports composite) — 5★ = top national recruit' };
const PICK:  ColDef = { key: 'pick',  label: 'Pick',                      tooltip: 'NFL draft pick — team logo + draft slot (e.g. 1.03) or UDFA' };
const FP:    ColDef = { key: 'fp',    label: 'FP',    subLabel: 'Devy',   sortKey: 'fp',  tooltip: 'FantasyPros — consensus dynasty devy/rookie ranking' };
const KTC:   ColDef = { key: 'ktc',   label: 'KTC',   subLabel: 'Dyn',    sortKey: 'ktc', tooltip: 'KeepTradeCut — dynasty trade value ranking (updated daily from trade data)' };
const FC:    ColDef = { key: 'fc',    label: 'FC',    subLabel: 'Rookie', sortKey: 'fc',  tooltip: 'FantasyCalc — startup/rookie draft ranking' };
const DN:    ColDef = { key: 'dn',    label: 'DN',    subLabel: 'Rookie', sortKey: 'dn',  tooltip: 'Dynasty Nerds — analyst consensus rookie ranking' };
const TFC:   ColDef = { key: 'tfc',   label: 'TFC',   subLabel: 'SF',     sortKey: 'tfc', tooltip: 'TylerFFCreator — SF dynasty rookie ranking' };
const TIER:  ColDef = { key: 'tier',  label: 'Tier',                                       tooltip: 'Dynasty value tier based on consensus rank. ⚠ Limited = ranked by 0 sources' };

// ── NFL Draft scout big boards (format-neutral — shown in both SF and 1QB) ────
const PFN:  ColDef = { key: 'pfn',  label: 'PFN',  subLabel: 'Board', sortKey: 'pfn',  tooltip: 'Pro Football Network — NFL draft prospect big board (format-neutral)' };
const TANK: ColDef = { key: 'tank', label: 'Tank', subLabel: 'Board', sortKey: 'tank', tooltip: 'TankAthlete — NFL draft prospect big board (format-neutral)' };
const TDN:  ColDef = { key: 'tdn',  label: 'TDN',  subLabel: 'Board', sortKey: 'tdn',  tooltip: 'The Draft Network — NFL draft prospect big board (format-neutral)' };
const BRUG: ColDef = { key: 'brug', label: 'Brug', subLabel: 'Board', sortKey: 'brug', tooltip: 'Matt Brugler — NFL draft analyst big board (format-neutral)' };
const DJ:   ColDef = { key: 'dj',   label: 'DJ',   subLabel: 'Board', sortKey: 'dj',   tooltip: 'Daniel Jeremiah — NFL Network draft analyst big board (format-neutral)' };

// ── Traits atoms ──────────────────────────────────────────────────────────────
const HW:      ColDef = { key: 'hw',      label: 'Ht/Wt',                 sortKey: 'height',  tooltip: 'Height and weight' };
const VERT:    ColDef = { key: 'vert',    label: 'Vert',    subLabel: 'in',  sortKey: 'vert',    tooltip: 'Vertical jump (inches) — lower-body explosiveness' };
const BROAD:   ColDef = { key: 'broad',   label: 'Broad',   subLabel: 'in',  sortKey: 'broad',   tooltip: 'Broad jump (inches) — lower-body explosiveness and power' };
const CONE:    ColDef = { key: 'cone',    label: '3Cone',   subLabel: 'sec', sortKey: 'cone',    tooltip: '3-cone drill (seconds) — change-of-direction agility; lower is better' };
const SHUTTLE: ColDef = { key: 'shuttle', label: 'Shuttle', subLabel: 'sec', sortKey: 'shuttle', tooltip: '20-yard shuttle (seconds) — short-area quickness; lower is better' };
const BENCH:   ColDef = { key: 'bench',   label: 'Bench',   subLabel: 'rep', sortKey: 'bench',   tooltip: 'Bench press reps at 225 lbs — upper-body strength' };

// ── Rankings atoms ────────────────────────────────────────────────────────────
const AVG: ColDef = { key: 'avg_rank', label: 'Avg', subLabel: 'Consensus', sortKey: 'avg_rank', tooltip: 'Average rank across all tracked sources' };
const MV7: ColDef = { key: 'mv7',      label: 'Δ7d', subLabel: 'Move',      sortKey: 'mv7',      tooltip: '7-day consensus rank movement — positive = rising' };

// ── Production atoms ──────────────────────────────────────────────────────────
const GP:        ColDef = { key: 'gp',                 label: 'GP',       subLabel: 'Career', sortKey: 'gp',        tooltip: 'Career college games played' };
const PASS_YDS:  ColDef = { key: 'career_pass_yards',  label: 'Pass Yds', subLabel: 'Career', sortKey: 'pass_yds',  tooltip: 'Career college passing yards' };
const PASS_TD:   ColDef = { key: 'career_pass_tds',    label: 'Pass TD',  subLabel: 'Career', sortKey: 'pass_td',   tooltip: 'Career college passing touchdowns' };
const RUSH_YDS:  ColDef = { key: 'career_rush_yards',  label: 'Rush Yds', subLabel: 'Career', sortKey: 'rush_yds',  tooltip: 'Career college rushing yards' };
const RUSH_TD:   ColDef = { key: 'career_rush_tds',    label: 'Rush TD',  subLabel: 'Career', sortKey: 'rush_td',   tooltip: 'Career college rushing touchdowns' };
const REC:       ColDef = { key: 'career_receptions',  label: 'Rec',      subLabel: 'Career', sortKey: 'rec',       tooltip: 'Career college receptions' };
const REC_YDS:   ColDef = { key: 'career_rec_yards',   label: 'Rec Yds',  subLabel: 'Career', sortKey: 'rec_yds',   tooltip: 'Career college receiving yards' };
const REC_TD:    ColDef = { key: 'career_rec_tds',     label: 'Rec TD',   subLabel: 'Career', sortKey: 'rec_td',    tooltip: 'Career college receiving touchdowns' };
const COMP_PCT:  ColDef = { key: 'comp_pct',           label: 'Comp%',    subLabel: 'Career', sortKey: 'comp_pct',  tooltip: 'Career completion percentage' };
const YPA:       ColDef = { key: 'ypa',                label: 'YPA',      subLabel: 'Career', sortKey: 'ypa',       tooltip: 'Career yards per pass attempt' };
const PASS_YPG:  ColDef = { key: 'best_pass_ypg',      label: 'Pass/G',   subLabel: 'Best',   sortKey: 'pass_ypg',  tooltip: 'Best-season passing yards per game' };
const BEST_YPC:  ColDef = { key: 'best_ypc',           label: 'YPC',      subLabel: 'Best',   sortKey: 'ypc',       tooltip: 'Best-season yards per carry' };
const BEST_YPR:  ColDef = { key: 'best_ypr',           label: 'Yds/Rec',  subLabel: 'Best',   sortKey: 'ypr',       tooltip: 'Best-season yards per reception' };
const SCRIM_YPG: ColDef = { key: 'scrim_ypg',          label: 'Scrim/G',  subLabel: 'Career', sortKey: 'scrim_ypg', tooltip: 'Career scrimmage yards per game' };
const DOM:       ColDef = { key: 'best_dominator',     label: 'Dom%',     subLabel: 'Best',   sortKey: 'dom',       tooltip: 'Best-season dominator rating — share of team yards + TDs' };

// ── Seasons atoms ─────────────────────────────────────────────────────────────
const BRKOUT: ColDef = { key: 'breakout_age', label: 'Brkout', subLabel: 'Age', sortKey: 'brkout', tooltip: 'Breakout age — age during first dominant college season. Younger is better. QBs are not tracked.' };
const S1: ColDef = { key: 's1', label: 'Latest', subLabel: 'Season', tooltip: 'Most recent college season — scrimmage yards (passing yards for QB)' };
const S2: ColDef = { key: 's2', label: '−1 Yr',  subLabel: 'Season', tooltip: 'Season before the latest' };
const S3: ColDef = { key: 's3', label: '−2 Yr',  subLabel: 'Season', tooltip: 'Two seasons before the latest' };
const S4: ColDef = { key: 's4', label: '−3 Yr',  subLabel: 'Season', tooltip: 'Three seasons before the latest' };

// ── Advanced atoms — WR receiving (wr_advanced_career) ────────────────────────
const WR_YPRR:  ColDef = { key: 'wr_yprr',         label: 'YPRR',   subLabel: 'Career',  sortKey: 'wr_yprr',   tooltip: 'Yards per route run — efficiency per route' };
const WR_ADOT:  ColDef = { key: 'wr_adot',         label: 'aDOT',   subLabel: 'Career',  sortKey: 'adot',      tooltip: 'Average depth of target (yards downfield)' };
const WR_CATCH: ColDef = { key: 'wr_catch',        label: 'Catch%', subLabel: 'Career',  sortKey: 'wr_catch',  tooltip: 'Catch rate — receptions per catchable target' };
const WR_DROP:  ColDef = { key: 'wr_drop',         label: 'Drop%',  subLabel: 'Career',  sortKey: 'wr_drop',   tooltip: 'Drop rate — lower is better' };
const WR_CONT:  ColDef = { key: 'wr_contested',    label: 'Cont%',  subLabel: 'Career',  sortKey: 'contested', tooltip: 'Contested-catch conversion rate' };
const WR_FMTF:  ColDef = { key: 'wr_mtf',          label: 'MTF%',   subLabel: 'Career',  sortKey: 'wr_mtf',    tooltip: 'Forced missed-tackle rate after the catch' };
const WR_YACR:  ColDef = { key: 'wr_yac_per_rec',  label: 'YAC/R',  subLabel: 'Career',  sortKey: 'yac_rec',   tooltip: 'Yards after catch per reception' };
const WR_TGT:   ColDef = { key: 'wr_tgt',          label: 'Tgt%',   subLabel: 'Career',  sortKey: 'wr_tgt',    tooltip: 'Target share — share of team targets while on the field' };
const WR_OPEN:  ColDef = { key: 'wr_open',         label: 'Open%',  subLabel: 'Career',  sortKey: 'wr_open',   tooltip: 'Open-target rate — share of targets with separation' };
const WR_ZYPRR: ColDef = { key: 'wr_zyprr',        label: 'YPRR',   subLabel: 'vs Zone', sortKey: 'wr_zyprr',  tooltip: 'Yards per route run against zone coverage' };
const WR_MYPRR: ColDef = { key: 'wr_myprr',        label: 'YPRR',   subLabel: 'vs Man',  sortKey: 'wr_myprr',  tooltip: 'Yards per route run against man coverage' };
const WR_SLOT:  ColDef = { key: 'wr_slot',         label: 'Slot%',  subLabel: 'Career',  sortKey: 'slot',      tooltip: 'Share of routes run from the slot' };

// ── Advanced atoms — RB rushing (rb_advanced_career) ──────────────────────────
const RB_YAC:   ColDef = { key: 'rb_yac',   label: 'YdsAC',  subLabel: 'Career', sortKey: 'rb_yac',    tooltip: 'Career yards after contact' };
const RB_MTF:   ColDef = { key: 'rb_mtf',   label: 'MTF%',   subLabel: 'Career', sortKey: 'mtf',       tooltip: 'Missed tackles forced (avoided-tackle) rate' };
const RB_EXP:   ColDef = { key: 'rb_exp',   label: 'Exp%',   subLabel: 'Career', sortKey: 'exp',       tooltip: 'Explosive run rate' };
const RB_BRK:   ColDef = { key: 'rb_brk',   label: 'Brk%',   subLabel: 'Career', sortKey: 'brk',       tooltip: 'Breakaway run rate — share of yards on 15+ yard runs' };
const RB_FD:    ColDef = { key: 'rb_fd',    label: '1D%',    subLabel: 'Career', sortKey: 'rb_fd',     tooltip: 'First-down rate per carry' };
const RB_YPRR:  ColDef = { key: 'rb_yprr',  label: 'YPRR',   subLabel: 'Career', sortKey: 'rb_yprr',   tooltip: 'Receiving yards per route run' };
const RB_AYPRR: ColDef = { key: 'rb_ayprr', label: 'aYPRR',  subLabel: 'Career', sortKey: 'rb_ayprr',  tooltip: 'Adjusted yards per route run — receiving efficiency' };
const RB_TGT:   ColDef = { key: 'rb_tgt',   label: 'Tgt%',   subLabel: 'Career', sortKey: 'rb_tgt',    tooltip: 'Target share while running a route' };
const RB_DROP:  ColDef = { key: 'rb_drop',  label: 'Drop%',  subLabel: 'Career', sortKey: 'rb_drop',   tooltip: 'Drop rate on receiving targets — lower is better' };
const RB_FUM:   ColDef = { key: 'rb_fum',   label: 'Fum%',   subLabel: 'Career', sortKey: 'rb_fum',    tooltip: 'Fumble rate per touch — lower is better' };
const RB_GAP:   ColDef = { key: 'rb_gap',   label: 'Gap%',   subLabel: 'Career', sortKey: 'rb_gap',    tooltip: 'Share of carries on gap-scheme runs' };
const RB_ZONE:  ColDef = { key: 'rb_zone',  label: 'Zone%',  subLabel: 'Career', sortKey: 'rb_zone',   tooltip: 'Share of carries on zone-scheme runs' };

// ── Scouting atoms (jfoster_grades + historical_comps) ────────────────────────
const JF_GRADE: ColDef = { key: 'jf_grade',     label: 'Grade',     subLabel: 'JF',   sortKey: 'jf_grade', tooltip: 'J. Foster overall film grade (0–10 scale)' };
const JF_RND:   ColDef = { key: 'jf_round',     label: 'Round',     subLabel: 'JF',   tooltip: 'J. Foster projected draft round' };
const JF_FIT:   ColDef = { key: 'jf_fit',       label: 'Fit',       subLabel: 'Role', tooltip: 'J. Foster projected positional / role fit' };
const JF_ATHL:  ColDef = { key: 'jf_athletic', label: 'Athl',      subLabel: 'Score', sortKey: 'athl',    tooltip: 'J. Foster athletic composite score' };
const JF_COMP:  ColDef = { key: 'jf_nfl_comp', label: 'JF Comp',                      tooltip: 'J. Foster NFL player comparison' };
const HIST_COMP: ColDef = { key: 'hist_comp',  label: 'Hist Comp',                    tooltip: 'Closest statistical historical NFL comp' };
const HIST_SIM:  ColDef = { key: 'hist_sim',   label: 'Sim%',      subLabel: 'Match', sortKey: 'sim',     tooltip: 'Similarity score of the historical comp' };

/** Snapshot column set per position filter (the original board behavior). */
function snapshotColDefs(pos: string): ColDef[] {
    if (pos === 'QB') return [
        PICK, FORTY, SPD, RAS, STARS,
        { key: 'best_pass_ypg', label: 'Pass/G',  subLabel: 'Best',   sortKey: 'pass_ypg' },
        { key: 'comp_pct',      label: 'Comp%',   subLabel: 'Career', sortKey: 'comp_pct' },
        { key: 'ypa',           label: 'YPA',     subLabel: 'Career', sortKey: 'ypa'      },
        FP, KTC, TIER,
    ]; // 11 cols

    if (pos === 'RB') return [
        PICK, FORTY, SPD, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',    subLabel: 'Best',   sortKey: 'dom'      },
        { key: 'scrim_ypg',      label: 'Scrim/G', subLabel: 'Career', sortKey: 'scrim_ypg'},
        { key: 'best_ypc',       label: 'YPC',     subLabel: 'Best',   sortKey: 'ypc'      },
        FP, KTC, TIER,
    ]; // 11 cols

    if (pos === 'WR' || pos === 'TE') return [
        PICK, FORTY, SPD, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',    subLabel: 'Best',   sortKey: 'dom'      },
        { key: 'scrim_ypg',      label: 'Scrim/G', subLabel: 'Career', sortKey: 'scrim_ypg'},
        { key: 'best_ypr',       label: 'Yds/Rec', subLabel: 'Best',   sortKey: 'ypr'      },
        FP, KTC, TIER,
    ]; // 11 cols

    // ALL — pick + full measurables + five ranking sources (incl. TylerFFCreator SF)
    return [PICK, FORTY, SPD, RAS, ARM, HAND, STARS, FP, KTC, FC, DN, TFC, TIER]; // 13 cols
}

/** Production column set per position filter. No PICK (pinned into identity), no TIER. */
function productionColDefs(pos: string): ColDef[] {
    if (pos === 'QB') return [GP, PASS_YDS, PASS_TD, COMP_PCT, YPA, PASS_YPG];          // 6
    if (pos === 'RB') return [GP, RUSH_YDS, RUSH_TD, BEST_YPC, SCRIM_YPG, REC, DOM];    // 7
    if (pos === 'WR' || pos === 'TE') return [GP, REC, REC_YDS, REC_TD, BEST_YPR, SCRIM_YPG, DOM]; // 7
    // ALL — generic production mix
    return [GP, PASS_YDS, RUSH_YDS, REC, REC_YDS, SCRIM_YPG, DOM];                      // 7
}

/** Column set for a given dataset lens + position filter. */
export function getColDefs(dataset: BoardDataset, pos: string): ColDef[] {
    switch (dataset) {
        case 'rankings':
            // 14 — position-agnostic. Fantasy sources (FP/KTC/FC/DN) are format-aware;
            // TFC is SF-only; PFN/Tank/TDN/Brug/DJ are format-neutral NFL draft boards.
            return [PICK, FP, KTC, FC, DN, TFC, PFN, TANK, TDN, BRUG, DJ, AVG, MV7, TIER];
        case 'traits':
            return [HW, FORTY, SPD, RAS, ARM, HAND, VERT, BROAD, CONE, SHUTTLE, BENCH, STARS]; // 12 — Pick pinned into identity
        case 'production':
            return productionColDefs(pos);
        case 'seasons':
            return [BRKOUT, GP, S1, S2, S3, S4]; // 6 — Pick pinned into identity
        case 'advanced':
            return pos === 'RB'
                ? [RB_YAC, RB_MTF, RB_EXP, RB_BRK, RB_FD, RB_YPRR, RB_AYPRR, RB_TGT, RB_DROP, RB_FUM, RB_GAP, RB_ZONE]   // 12 — Pick pinned
                : [WR_YPRR, WR_ADOT, WR_CATCH, WR_DROP, WR_CONT, WR_FMTF, WR_YACR, WR_TGT, WR_OPEN, WR_ZYPRR, WR_MYPRR, WR_SLOT]; // 12 — Pick pinned
        case 'scouting':
            return [JF_GRADE, JF_RND, JF_FIT, JF_ATHL, JF_COMP, HIST_COMP, HIST_SIM]; // 7 — Pick pinned
        case 'snapshot':
        default:
            return snapshotColDefs(pos);
    }
}

/** Whether Pick is pinned into the frozen identity group (true) or a scrollable column (false). */
export function pickInIdentity(dataset: BoardDataset): boolean {
    return dataset !== 'snapshot' && dataset !== 'rankings';
}

/** CSS grid-template-columns string for the right dynamic section. */
export function getGridTemplate(dataset: BoardDataset, pos: string): string {
    if (dataset === 'rankings') {
        // 14 cols: pick | fp ktc fc dn tfc | pfn tank tdn brug dj | avg mv7 | tier
        return '0.6fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.6fr 0.5fr 0.95fr';
    }
    if (dataset === 'traits') {
        // 12 cols: ht/wt | 40 spd ras arm hand vert broad cone shuttle bench | stars
        return '0.7fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.55fr 0.55fr 0.6fr 0.55fr 0.55fr';
    }
    if (dataset === 'production') {
        if (pos === 'QB') return '0.62fr 0.85fr 0.72fr 0.7fr 0.6fr 0.72fr';            // 6
        // RB / WR / TE / ALL — 7 cols
        return '0.55fr 0.8fr 0.72fr 0.62fr 0.78fr 0.6fr 0.66fr';                       // 7
    }
    if (dataset === 'seasons') {
        // 6 cols: brkout | gp | s1 s2 s3 s4
        return '0.7fr 0.45fr 1fr 1fr 1fr 1fr';
    }
    if (dataset === 'advanced') {
        // 12 cols: position-aware advanced metrics
        return 'repeat(12, 1fr)';
    }
    if (dataset === 'scouting') {
        // 7 cols: grade | round | fit | athl | jf_comp | hist_comp | sim
        return '0.55fr 0.6fr 0.75fr 0.6fr 1.1fr 1.1fr 0.55fr';
    }

    // snapshot
    if (pos === 'ALL') {
        // 13 cols: pick | 5 measurables | stars | 5 rankings | tier
        return '0.65fr 0.42fr 0.42fr 0.42fr 0.42fr 0.42fr 0.46fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.9fr';
    }
    if (pos === 'QB') {
        // 11 cols: pick | 40 spd ras stars | pass/g comp% ypa | fp ktc | tier
        return '0.65fr 0.58fr 0.58fr 0.58fr 0.58fr 0.88fr 0.75fr 0.65fr 0.6fr 0.6fr 1fr';
    }
    // RB / WR / TE — 11 cols: pick | 40 spd ras stars | dom scrim/g ypc/ypr | fp ktc | tier
    return '0.65fr 0.58fr 0.58fr 0.58fr 0.58fr 0.72fr 0.82fr 0.62fr 0.6fr 0.6fr 1fr';
}
