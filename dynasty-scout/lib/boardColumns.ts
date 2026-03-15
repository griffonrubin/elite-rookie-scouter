// Shared column definitions for the draft board table.
// Both DraftBoard.tsx (header row) and PlayerMiniCard.tsx (data rows) import this
// to guarantee the header and data columns are ALWAYS pixel-perfectly aligned.

export type SortKey = 'rank' | 'ktc' | 'sleeper' | 'fp' | 'fc' | 'dn' | 'proj';

export interface ColDef {
    key: string;
    label: string;
    subLabel?: string;
    sortKey?: SortKey;
}

const FP:   ColDef = { key: 'fp',  label: 'FP',  subLabel: 'Devy',   sortKey: 'fp'   };
const KTC:  ColDef = { key: 'ktc', label: 'KTC', subLabel: 'Dyn',    sortKey: 'ktc'  };
const FC:   ColDef = { key: 'fc',  label: 'FC',  subLabel: 'Rookie', sortKey: 'fc'   };
const DN:   ColDef = { key: 'dn',  label: 'DN',  subLabel: 'Rookie', sortKey: 'dn'   };
const ADP:  ColDef = { key: 'adp', label: 'ADP', subLabel: 'Pick',   sortKey: 'proj' };
const TIER: ColDef = { key: 'tier', label: 'Tier' };

/** 7 columns total for every position filter. */
export function getColDefs(pos: string): ColDef[] {
    if (pos === 'QB') return [
        { key: 'measurables',       label: 'Measurables'                       },
        { key: 'career_pass_yards', label: 'Pass Yds', subLabel: 'Career'      },
        { key: 'comp_pct',          label: 'Comp%',    subLabel: 'Career'      },
        { key: 'ypa',               label: 'YPA',      subLabel: 'Career'      },
        FP, KTC, TIER,
    ];
    if (pos === 'RB') return [
        { key: 'measurables',    label: 'Measurables'                          },
        { key: 'breakout_age',   label: 'Breakout',  subLabel: 'Age'           },
        { key: 'best_dominator', label: 'Dom%',      subLabel: 'Best Ssn'      },
        { key: 'scrim_ypg',      label: 'Scrim/G',   subLabel: 'Career'        },
        FP, KTC, TIER,
    ];
    if (pos === 'WR' || pos === 'TE') return [
        { key: 'measurables',      label: 'Measurables'                        },
        { key: 'breakout_age',     label: 'Breakout',  subLabel: 'Age'         },
        { key: 'best_dominator',   label: 'Dom%',      subLabel: 'Best Ssn'    },
        { key: 'recruiting_stars', label: 'Recruit',   subLabel: 'Stars'       },
        FP, KTC, TIER,
    ];
    // ALL — show all 4 ranking sources
    return [
        { key: 'measurables', label: 'Measurables' },
        FP, KTC, FC, DN, ADP, TIER,
    ];
}

/**
 * CSS grid-template-columns for the right section.
 * Always 7 columns. Measurables is wider when position-filtered
 * (3 rank sources replaced by 3 position-specific stat cols).
 */
export function getGridTemplate(pos: string): string {
    if (pos !== 'ALL') return '2.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr';
    return '3fr 1fr 1fr 1fr 1fr 1fr 1.2fr';
}
