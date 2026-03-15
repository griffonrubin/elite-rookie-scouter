// Shared column definitions for the draft board table.
// Both DraftBoard.tsx (header row) and PlayerMiniCard.tsx (data rows) import this
// to guarantee the header and data columns are ALWAYS pixel-perfectly aligned.

export type SortKey =
    | 'rank' | 'ktc' | 'sleeper' | 'fp' | 'fc' | 'dn' | 'proj'
    | 'forty' | 'spd' | 'ras' | 'height' | 'arm' | 'hand' | 'stars';

export interface ColDef {
    key: string;
    label: string;
    subLabel?: string;
    sortKey?: SortKey;
}

// ── Reusable column atoms ─────────────────────────────────────────────────────
const FORTY: ColDef = { key: 'forty', label: '40yd',    sortKey: 'forty' };
const SPD:   ColDef = { key: 'spd',   label: 'Spd',     sortKey: 'spd'   };
const RAS:   ColDef = { key: 'ras',   label: 'RAS',     sortKey: 'ras'   };
const ARM:   ColDef = { key: 'arm',   label: 'Arm',     sortKey: 'arm'   };
const HAND:  ColDef = { key: 'hand',  label: 'Hand',    sortKey: 'hand'  };
const STARS: ColDef = { key: 'stars', label: '★',       sortKey: 'stars' };
const FP:    ColDef = { key: 'fp',    label: 'FP',      subLabel: 'Devy',   sortKey: 'fp'  };
const KTC:   ColDef = { key: 'ktc',   label: 'KTC',     subLabel: 'Dyn',    sortKey: 'ktc' };
const FC:    ColDef = { key: 'fc',    label: 'FC',      subLabel: 'Rookie', sortKey: 'fc'  };
const DN:    ColDef = { key: 'dn',    label: 'DN',      subLabel: 'Rookie', sortKey: 'dn'  };
const TIER:  ColDef = { key: 'tier',  label: 'Tier'                                        };

/** Column set per position filter. */
export function getColDefs(pos: string): ColDef[] {
    if (pos === 'QB') return [
        FORTY, SPD, RAS, STARS,
        { key: 'career_pass_yards', label: 'Pass Yds', subLabel: 'Career' },
        { key: 'comp_pct',          label: 'Comp%',    subLabel: 'Career' },
        { key: 'ypa',               label: 'YPA',      subLabel: 'Career' },
        FP, KTC, TIER,
    ]; // 10 cols

    if (pos === 'RB') return [
        FORTY, SPD, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',    subLabel: 'Best' },
        { key: 'scrim_ypg',      label: 'Scrim/G', subLabel: 'Career' },
        FP, KTC, TIER,
    ]; // 9 cols

    if (pos === 'WR' || pos === 'TE') return [
        FORTY, SPD, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',    subLabel: 'Best' },
        { key: 'scrim_ypg',      label: 'Scrim/G', subLabel: 'Career' },
        FP, KTC, TIER,
    ]; // 9 cols

    // ALL — full measurables + four ranking sources
    return [FORTY, SPD, RAS, ARM, HAND, STARS, FP, KTC, FC, DN, TIER]; // 11 cols
}

/** CSS grid-template-columns string for the right dynamic section. */
export function getGridTemplate(pos: string): string {
    if (pos === 'ALL') {
        // 11 cols — measurables tight on left, ranking cols right
        return '0.65fr 0.65fr 0.65fr 0.65fr 0.65fr 0.65fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr';
    }
    if (pos === 'QB') {
        // 10 cols
        return '0.65fr 0.65fr 0.65fr 0.65fr 1fr 0.85fr 0.7fr 0.8fr 0.8fr 1fr';
    }
    // RB / WR / TE — 9 cols
    return '0.65fr 0.65fr 0.65fr 0.65fr 0.9fr 1fr 0.8fr 0.8fr 1fr';
}
