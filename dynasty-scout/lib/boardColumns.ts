// Shared column definitions for the draft board table.
// Both DraftBoard.tsx (header row) and PlayerMiniCard.tsx (data rows) import this
// to guarantee the header and data columns are ALWAYS pixel-perfectly aligned.

export type SortKey =
    | 'rank' | 'ktc' | 'sleeper' | 'fp' | 'fc' | 'dn' | 'proj'
    | 'forty' | 'ras' | 'height' | 'arm' | 'hand' | 'stars';

export interface ColDef {
    key: string;
    label: string;
    subLabel?: string;
    sortKey?: SortKey;
}

// ── Reusable column atoms ─────────────────────────────────────────────────────
const HW:    ColDef = { key: 'hw',    label: 'Ht / Wt', subLabel: 'size',    sortKey: 'height' };
const FORTY: ColDef = { key: 'forty', label: '40 Yd',   subLabel: 'dash',    sortKey: 'forty'  };
const RAS:   ColDef = { key: 'ras',   label: 'RAS',     subLabel: 'score',   sortKey: 'ras'    };
const ARM:   ColDef = { key: 'arm',   label: 'Arm',     subLabel: 'length',  sortKey: 'arm'    };
const HAND:  ColDef = { key: 'hand',  label: 'Hand',    subLabel: 'size',    sortKey: 'hand'   };
const STARS: ColDef = { key: 'stars', label: 'Recruit', subLabel: '★',       sortKey: 'stars'  };
const FP:    ColDef = { key: 'fp',    label: 'FP',      subLabel: 'Devy',    sortKey: 'fp'     };
const KTC:   ColDef = { key: 'ktc',   label: 'KTC',     subLabel: 'Dyn',     sortKey: 'ktc'    };
const FC:    ColDef = { key: 'fc',    label: 'FC',      subLabel: 'Rookie',  sortKey: 'fc'     };
const DN:    ColDef = { key: 'dn',    label: 'DN',      subLabel: 'Rookie',  sortKey: 'dn'     };
const TIER:  ColDef = { key: 'tier',  label: 'Tier'                                            };

/** Column set per position filter. */
export function getColDefs(pos: string): ColDef[] {
    if (pos === 'QB') return [
        HW, FORTY, STARS,
        { key: 'career_pass_yards', label: 'Pass Yds', subLabel: 'Career' },
        { key: 'comp_pct',          label: 'Comp%',    subLabel: 'Career' },
        { key: 'ypa',               label: 'YPA',      subLabel: 'Career' },
        FP, TIER,
    ]; // 8 cols

    if (pos === 'RB') return [
        HW, FORTY, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',     subLabel: 'Best Ssn' },
        { key: 'scrim_ypg',      label: 'Scrim/G',  subLabel: 'Career'   },
        FP, TIER,
    ]; // 8 cols

    if (pos === 'WR' || pos === 'TE') return [
        HW, FORTY, RAS, STARS,
        { key: 'best_dominator', label: 'Dom%',     subLabel: 'Best Ssn' },
        { key: 'scrim_ypg',      label: 'Scrim/G',  subLabel: 'Career'   },
        FP, TIER,
    ]; // 8 cols

    // ALL — expose every sortable measurable as its own column
    return [HW, FORTY, RAS, ARM, HAND, STARS, FP, KTC, TIER]; // 9 cols
}

/** CSS grid-template-columns string for the right section. */
export function getGridTemplate(pos: string): string {
    if (pos === 'ALL') {
        // 9 cols: HW | 40 | RAS | Arm | Hand | Stars | FP | KTC | Tier
        return '1.4fr 0.85fr 0.75fr 0.75fr 0.75fr 0.85fr 0.75fr 0.75fr 1fr';
    }
    if (pos === 'QB') {
        // 8 cols: HW | 40 | Stars | PassYds | Comp% | YPA | FP | Tier
        return '1.4fr 0.85fr 0.85fr 0.9fr 0.8fr 0.7fr 0.75fr 1fr';
    }
    // RB / WR / TE — 8 cols: HW | 40 | RAS | Stars | Dom% | Scrim/G | FP | Tier
    return '1.4fr 0.85fr 0.75fr 0.85fr 0.85fr 0.9fr 0.75fr 1fr';
}
