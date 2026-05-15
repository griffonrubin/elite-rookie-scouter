// Shared column definitions for the draft board table.
// Both DraftBoard.tsx (header row) and PlayerMiniCard.tsx (data rows) import this
// to guarantee the header and data columns are ALWAYS pixel-perfectly aligned.

export type SortKey =
    | 'rank' | 'ktc' | 'sleeper' | 'fp' | 'fc' | 'dn' | 'tfc'
    | 'forty' | 'spd' | 'ras' | 'height' | 'arm' | 'hand' | 'stars'
    | 'dom' | 'scrim_ypg' | 'pass_ypg' | 'comp_pct' | 'ypa' | 'ypr' | 'ypc'
    | 'vert' | 'broad' | 'cone' | 'shuttle' | 'bench'
    | 'gp' | 'pass_yds' | 'pass_td' | 'rush_yds' | 'rush_td' | 'rec' | 'rec_yds' | 'rec_td'
    | 'avg_rank' | 'mv7';

// The four dataset "lenses" — same player rows, different columns.
export type BoardDataset = 'snapshot' | 'rankings' | 'traits' | 'production';

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
            return [PICK, FP, KTC, FC, DN, TFC, AVG, MV7, TIER]; // 9 — position-agnostic
        case 'traits':
            return [HW, FORTY, SPD, RAS, ARM, HAND, VERT, BROAD, CONE, SHUTTLE, BENCH, STARS]; // 12 — Pick pinned into identity
        case 'production':
            return productionColDefs(pos);
        case 'snapshot':
        default:
            return snapshotColDefs(pos);
    }
}

/** Whether Pick is pinned into the frozen identity group (true) or a scrollable column (false). */
export function pickInIdentity(dataset: BoardDataset): boolean {
    return dataset === 'traits' || dataset === 'production';
}

/** CSS grid-template-columns string for the right dynamic section. */
export function getGridTemplate(dataset: BoardDataset, pos: string): string {
    if (dataset === 'rankings') {
        // 9 cols: pick | fp ktc fc dn tfc | avg mv7 | tier
        return '0.65fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.7fr 0.55fr 0.9fr';
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
