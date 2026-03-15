// Shared column definitions for the draft board table.
// Both DraftBoard.tsx (header row) and PlayerMiniCard.tsx (data rows) import this
// to guarantee the header and data columns are ALWAYS pixel-perfectly aligned.

export type SortKey =
    | 'rank' | 'ktc' | 'sleeper' | 'fp' | 'fc' | 'dn' | 'proj'
    | 'forty' | 'spd' | 'ras' | 'height' | 'arm' | 'hand' | 'stars'
    | 'dom' | 'scrim_ypg' | 'pass_ypg' | 'comp_pct' | 'ypa' | 'ypr' | 'ypc';

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
const STARS: ColDef = { key: 'stars', label: '★',     sortKey: 'stars', tooltip: 'High school recruiting stars (247Sports composite) — 5★ = top national recruit' };
const FP:    ColDef = { key: 'fp',    label: 'FP',    subLabel: 'Devy',   sortKey: 'fp',  tooltip: 'FantasyPros — consensus dynasty devy/rookie ranking' };
const KTC:   ColDef = { key: 'ktc',   label: 'KTC',   subLabel: 'Dyn',    sortKey: 'ktc', tooltip: 'KeepTradeCut — dynasty trade value ranking (updated daily from trade data)' };
const FC:    ColDef = { key: 'fc',    label: 'FC',    subLabel: 'Rookie', sortKey: 'fc',  tooltip: 'FantasyCalc — startup/rookie draft ranking' };
const DN:    ColDef = { key: 'dn',    label: 'DN',    subLabel: 'Rookie', sortKey: 'dn',  tooltip: 'Dynasty Nerds — analyst consensus rookie ranking' };
const TIER:  ColDef = { key: 'tier',  label: 'Tier',                                       tooltip: 'Dynasty value tier based on consensus rank. ⚠ Limited = ranked by 0 sources' };

/** Column set per position filter. */
export function getColDefs(pos: string): ColDef[] {
    if (pos === 'QB') return [
        FORTY, SPD, RAS, STARS,
        { key: 'best_pass_ypg', label: 'Pass/G',  subLabel: 'Best',   sortKey: 'pass_ypg' },
        { key: 'comp_pct',      label: 'Comp%',   subLabel: 'Career', sortKey: 'comp_pct' },
        { key: 'ypa',           label: 'YPA',     subLabel: 'Career', sortKey: 'ypa'      },
        FP, KTC, TIER,
    ]; // 10 cols

    if (pos === 'RB') return [
        FORTY, SPD, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',    subLabel: 'Best',   sortKey: 'dom'      },
        { key: 'scrim_ypg',      label: 'Scrim/G', subLabel: 'Career', sortKey: 'scrim_ypg'},
        { key: 'best_ypc',       label: 'YPC',     subLabel: 'Best',   sortKey: 'ypc'      },
        FP, KTC, TIER,
    ]; // 10 cols

    if (pos === 'WR' || pos === 'TE') return [
        FORTY, SPD, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',    subLabel: 'Best',   sortKey: 'dom'      },
        { key: 'scrim_ypg',      label: 'Scrim/G', subLabel: 'Career', sortKey: 'scrim_ypg'},
        { key: 'best_ypr',       label: 'Yds/Rec', subLabel: 'Best',   sortKey: 'ypr'      },
        FP, KTC, TIER,
    ]; // 10 cols

    // ALL — full measurables + four ranking sources
    return [FORTY, SPD, RAS, ARM, HAND, STARS, FP, KTC, FC, DN, TIER]; // 11 cols
}

/** CSS grid-template-columns string for the right dynamic section. */
export function getGridTemplate(pos: string): string {
    if (pos === 'ALL') {
        // 11 cols — measurables tight on left, ranking cols right
        return '0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.55fr 0.85fr 0.85fr 0.85fr 0.85fr 1fr';
    }
    if (pos === 'QB') {
        // 10 cols
        return '0.65fr 0.65fr 0.65fr 0.65fr 0.9fr 0.8fr 0.7fr 0.8fr 0.8fr 1fr';
    }
    // RB / WR / TE — 10 cols
    return '0.65fr 0.65fr 0.65fr 0.65fr 0.75fr 0.85fr 0.65fr 0.8fr 0.8fr 1fr';
}
