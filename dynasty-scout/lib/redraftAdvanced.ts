// Position-specific advanced-stat registry for the REDRAFT board, the
// counterpart to WRAdvancedRatesTable / RBAdvancedRatesTable on the rookie
// side. Those tables hard-code one position's metrics; a redraft profile has
// to cover six, so the metrics live here as data and one component renders
// whichever group applies.
//
// Everything reads from nfl_advanced_season, whose columns are already stored
// in display units (percentages 0-100, rates per game or per opportunity).

import { NflAdvancedSeason } from '@/lib/types';

export interface AdvancedMetric {
    /** Column on nfl_advanced_season. */
    key: string;
    /** Grid label — kept to ~5 characters so the tiles stay square. */
    abbr: string;
    label: string;
    tooltip: string;
    fmt: (v: number) => string;
    /** Default true; false flips the percentile so green always means good. */
    higherBetter?: boolean;
    /**
     * Descriptive rather than good/bad (ADOT, snap alignment). Rendered in a
     * flat tone so the colour scale never implies a verdict it can't support.
     */
    neutral?: boolean;
}

export interface AdvancedGroup {
    title: string;
    /** Shown under the group title when the metrics need framing. */
    note?: string;
    metrics: AdvancedMetric[];
}

// ── Formatters ───────────────────────────────────────────────────────────────
const pct = (d = 1) => (v: number) => `${v.toFixed(d)}%`;
const dec = (d = 2) => (v: number) => v.toFixed(d);
const signed = (d = 2) => (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
const whole = (v: number) => Math.round(v).toLocaleString();

// ── Shared metric atoms ──────────────────────────────────────────────────────
const SNAP_SHARE: AdvancedMetric = {
    key: 'snap_share', abbr: 'SNP%', label: 'Snap Share', fmt: pct(0),
    tooltip: 'Share of the offence’s snaps in the games they played — the floor under every other rate',
};
const TOUCHES: AdvancedMetric = {
    key: 'touches_per_game', abbr: 'TCH/G', label: 'Touches / Game', fmt: dec(1),
    tooltip: 'Carries plus receptions per game',
};
const YARDS_PER_TOUCH: AdvancedMetric = {
    key: 'yards_per_touch', abbr: 'Y/TCH', label: 'Yards / Touch', fmt: dec(2),
    tooltip: 'Rushing plus receiving yards per touch',
};

// ── QB ───────────────────────────────────────────────────────────────────────
const QB_GROUPS: AdvancedGroup[] = [
    {
        title: 'Passing Efficiency',
        metrics: [
            { key: 'epa_per_dropback', abbr: 'EPA/DB', label: 'EPA / Dropback', fmt: signed(3),
              tooltip: 'Expected points added per dropback — the single best measure of QB play' },
            { key: 'cpoe', abbr: 'CPOE', label: 'Completion % Over Expected', fmt: signed(1),
              tooltip: 'Completion percentage above what the throw’s difficulty predicted' },
            { key: 'yards_per_attempt', abbr: 'Y/A', label: 'Yards / Attempt', fmt: dec(2),
              tooltip: 'Passing yards per attempt' },
            { key: 'air_yards_per_attempt', abbr: 'AY/A', label: 'Air Yards / Attempt', fmt: dec(1),
              tooltip: 'Intended air yards per attempt — how far downfield they are throwing' },
            { key: 'pacr', abbr: 'PACR', label: 'Pass Air Conversion', fmt: dec(2),
              tooltip: 'Passing yards per air yard thrown — turning intent into production' },
            { key: 'pass_td_rate', abbr: 'TD%', label: 'TD Rate', fmt: pct(1),
              tooltip: 'Touchdown passes per attempt' },
            { key: 'int_rate', abbr: 'INT%', label: 'Interception Rate', fmt: pct(1),
              higherBetter: false, tooltip: 'Interceptions per attempt — lower is better' },
            { key: 'deep_pass_rate', abbr: 'BIG%', label: 'Big-Play Rate', fmt: pct(1),
              tooltip: 'Completions of 20+ yards per attempt' },
        ],
    },
    {
        title: 'Pocket & Pressure',
        note: 'Pro-Football-Reference charting',
        metrics: [
            { key: 'pressure_pct', abbr: 'PRS%', label: 'Pressure Rate', fmt: pct(1),
              higherBetter: false, tooltip: 'Share of dropbacks under pressure — mostly an offensive-line signal' },
            { key: 'sack_rate', abbr: 'SCK%', label: 'Sack Rate', fmt: pct(1),
              higherBetter: false, tooltip: 'Sacks per dropback' },
            { key: 'bad_throw_pct', abbr: 'BAD%', label: 'Bad Throw Rate', fmt: pct(1),
              higherBetter: false, tooltip: 'Share of throws charted as off-target and uncatchable' },
            { key: 'on_target_pct', abbr: 'ON%', label: 'On-Target Rate', fmt: pct(1),
              tooltip: 'Share of throws charted as on target, drops included' },
            { key: 'pocket_time', abbr: 'TIME', label: 'Time in Pocket', fmt: dec(2),
              neutral: true, tooltip: 'Average seconds before the throw — style, not quality' },
            { key: 'blitz_pct', abbr: 'BLZ%', label: 'Blitz Rate Faced', fmt: pct(1),
              neutral: true, tooltip: 'Share of dropbacks the defence blitzed' },
            { key: 'scramble_rate', abbr: 'SCR%', label: 'Scramble Rate', fmt: pct(1),
              tooltip: 'Scrambles per dropback — free fantasy points from broken plays' },
        ],
    },
    {
        title: 'Rushing',
        note: 'The half of QB scoring that rankings underrate',
        metrics: [
            { key: 'carries_per_game', abbr: 'RU/G', label: 'Carries / Game', fmt: dec(1),
              tooltip: 'Rushing attempts per game' },
            { key: 'yards_per_carry', abbr: 'YPC', label: 'Yards / Carry', fmt: dec(2),
              tooltip: 'Rushing yards per attempt' },
            { key: 'epa_per_rush', abbr: 'EPA/RU', label: 'EPA / Rush', fmt: signed(3),
              tooltip: 'Expected points added per carry' },
            { key: 'rush_first_down_rate', abbr: '1D%', label: 'Rush First-Down Rate', fmt: pct(1),
              tooltip: 'Carries that moved the chains' },
            { key: 'explosive_rush_rate', abbr: 'EXP%', label: 'Explosive Rush Rate', fmt: pct(1),
              tooltip: 'Carries of 10+ yards' },
        ],
    },
];

// ── RB ───────────────────────────────────────────────────────────────────────
const RB_GROUPS: AdvancedGroup[] = [
    {
        title: 'Opportunity',
        note: 'Volume is the foundation — efficiency only decides what it is worth',
        metrics: [
            SNAP_SHARE,
            { key: 'carries_per_game', abbr: 'ATT/G', label: 'Carries / Game', fmt: dec(1),
              tooltip: 'Rushing attempts per game' },
            TOUCHES,
            { key: 'targets_per_game', abbr: 'TGT/G', label: 'Targets / Game', fmt: dec(1),
              tooltip: 'Targets per game — the PPR multiplier on a back’s floor' },
            { key: 'target_share', abbr: 'TGT%', label: 'Target Share', fmt: pct(1),
              tooltip: 'Share of the team’s targets' },
            YARDS_PER_TOUCH,
        ],
    },
    {
        title: 'Rushing Efficiency',
        note: 'Contact and explosiveness — Pro-Football-Reference charting',
        metrics: [
            { key: 'yards_per_carry', abbr: 'YPC', label: 'Yards / Carry', fmt: dec(2),
              tooltip: 'Rushing yards per attempt' },
            { key: 'yards_before_contact_att', abbr: 'YBC/A', label: 'Yards Before Contact', fmt: dec(2),
              tooltip: 'Yards before contact per carry — mostly a blocking signal' },
            { key: 'yards_after_contact_att', abbr: 'YAC/A', label: 'Yards After Contact', fmt: dec(2),
              tooltip: 'Yards after contact per carry — the part the back earns himself' },
            { key: 'rush_mtf_rate', abbr: 'MTF%', label: 'Broken Tackle Rate', fmt: pct(1),
              tooltip: 'Broken tackles per 100 carries' },
            { key: 'explosive_rush_rate', abbr: 'EXP%', label: 'Explosive Rate', fmt: pct(1),
              tooltip: 'Carries of 10+ yards' },
            { key: 'breakaway_rush_rate', abbr: 'BRK%', label: 'Breakaway Rate', fmt: pct(1),
              tooltip: 'Carries of 20+ yards — the runs that win a week outright' },
            { key: 'rush_first_down_rate', abbr: '1D%', label: 'First-Down Rate', fmt: pct(1),
              tooltip: 'Carries that moved the chains' },
            { key: 'epa_per_rush', abbr: 'EPA/RU', label: 'EPA / Rush', fmt: signed(3),
              tooltip: 'Expected points added per carry' },
        ],
    },
    {
        title: 'Receiving',
        metrics: [
            { key: 'yards_per_target', abbr: 'Y/TGT', label: 'Yards / Target', fmt: dec(2),
              tooltip: 'Receiving yards per target' },
            { key: 'catch_rate', abbr: 'CTC%', label: 'Catch Rate', fmt: pct(1),
              tooltip: 'Receptions per target' },
            { key: 'yards_per_snap', abbr: 'Y/SNP', label: 'Receiving Yards / Snap', fmt: dec(2),
              tooltip: 'Receiving yards per offensive snap — the closest stand-in for YPRR without route data' },
            { key: 'drop_rate', abbr: 'DRP%', label: 'Drop Rate', fmt: pct(1),
              higherBetter: false, tooltip: 'Drops per target — lower is better' },
            { key: 'rec_mtf_rate', abbr: 'MTF/R', label: 'Broken Tackles / Rec', fmt: pct(1),
              tooltip: 'Broken tackles per 100 receptions' },
            { key: 'epa_per_target', abbr: 'EPA/T', label: 'EPA / Target', fmt: signed(3),
              tooltip: 'Expected points added per target' },
            { key: 'wopr', abbr: 'WOPR', label: 'Weighted Opportunity', fmt: dec(2),
              tooltip: 'Weighted opportunity rating — target share and air-yard share in one number' },
        ],
    },
];

// ── WR / TE ──────────────────────────────────────────────────────────────────
const RECEIVER_GROUPS: AdvancedGroup[] = [
    {
        title: 'Opportunity',
        note: 'Target share travels between seasons better than any efficiency stat',
        metrics: [
            SNAP_SHARE,
            { key: 'target_share', abbr: 'TGT%', label: 'Target Share', fmt: pct(1),
              tooltip: 'Share of the team’s targets' },
            { key: 'air_yards_share', abbr: 'AY%', label: 'Air Yards Share', fmt: pct(1),
              tooltip: 'Share of the team’s air yards — who the offence actually throws to downfield' },
            { key: 'wopr', abbr: 'WOPR', label: 'Weighted Opportunity', fmt: dec(2),
              tooltip: 'Weighted opportunity rating — target share and air-yard share in one number' },
            { key: 'targets_per_game', abbr: 'TGT/G', label: 'Targets / Game', fmt: dec(1),
              tooltip: 'Targets per game' },
        ],
    },
    {
        title: 'Production Rates',
        metrics: [
            { key: 'yards_per_snap', abbr: 'Y/SNP', label: 'Yards / Snap', fmt: dec(2),
              tooltip: 'Receiving yards per offensive snap — the closest stand-in for YPRR without route data' },
            { key: 'yards_per_target', abbr: 'Y/TGT', label: 'Yards / Target', fmt: dec(2),
              tooltip: 'Receiving yards per target' },
            { key: 'yards_per_reception', abbr: 'Y/REC', label: 'Yards / Reception', fmt: dec(1),
              tooltip: 'Receiving yards per catch' },
            { key: 'racr', abbr: 'RACR', label: 'Air Conversion', fmt: dec(2),
              tooltip: 'Receiving yards per air yard — turning targets into yards' },
            { key: 'epa_per_target', abbr: 'EPA/T', label: 'EPA / Target', fmt: signed(3),
              tooltip: 'Expected points added per target' },
            { key: 'rec_first_down_rate', abbr: '1D%', label: 'First-Down Rate', fmt: pct(1),
              tooltip: 'Targets that moved the chains' },
            { key: 'explosive_rec_rate', abbr: 'EXP%', label: 'Explosive Rate', fmt: pct(1),
              tooltip: 'Catches of 20+ yards' },
            { key: 'rec_td_per_target', abbr: 'TD/T', label: 'TD / Target', fmt: pct(1),
              tooltip: 'Touchdowns per target — the noisiest of these, and the first to regress' },
        ],
    },
    {
        title: 'Charting',
        note: 'Pro-Football-Reference charting',
        metrics: [
            { key: 'adot', abbr: 'ADOT', label: 'Average Depth of Target', fmt: dec(1),
              neutral: true, tooltip: 'Average depth of target — role, not quality' },
            { key: 'yards_before_catch_rec', abbr: 'YBC/R', label: 'Yards Before Catch', fmt: dec(1),
              neutral: true, tooltip: 'Air yards per reception' },
            { key: 'yards_after_catch_rec', abbr: 'YAC/R', label: 'Yards After Catch', fmt: dec(1),
              tooltip: 'Yards after the catch per reception' },
            { key: 'catch_rate', abbr: 'CTC%', label: 'Catch Rate', fmt: pct(1),
              tooltip: 'Receptions per target' },
            { key: 'drop_rate', abbr: 'DRP%', label: 'Drop Rate', fmt: pct(1),
              higherBetter: false, tooltip: 'Drops per target — lower is better' },
            { key: 'rec_mtf_rate', abbr: 'MTF%', label: 'Broken Tackle Rate', fmt: pct(1),
              tooltip: 'Broken tackles per 100 receptions' },
            { key: 'passer_rating_targeted', abbr: 'RTG', label: 'Passer Rating When Targeted', fmt: dec(1),
              tooltip: 'Passer rating on throws to this player' },
        ],
    },
];

// ── K ────────────────────────────────────────────────────────────────────────
const K_GROUPS: AdvancedGroup[] = [
    {
        title: 'Kicking',
        note: 'Volume beats accuracy in fantasy — a kicker only scores what he is sent out to attempt',
        metrics: [
            { key: 'fg_att_per_game', abbr: 'FGA/G', label: 'Attempts / Game', fmt: dec(2),
              tooltip: 'Field goal attempts per game — the closest thing a kicker has to target share' },
            { key: 'fg_pct', abbr: 'FG%', label: 'Field Goal %', fmt: pct(1),
              tooltip: 'Field goals made per attempt' },
            { key: 'fg_pct_40plus', abbr: '40+%', label: 'Long-Range %', fmt: pct(1),
              tooltip: 'Accuracy from 40 yards and beyond, where the extra points live' },
            { key: 'avg_fg_distance', abbr: 'DIST', label: 'Average Distance', fmt: dec(1),
              neutral: true, tooltip: 'Average attempt distance — leverage, not skill' },
            { key: 'fg_50plus_att', abbr: '50+', label: '50+ Attempts', fmt: whole,
              tooltip: 'Attempts from 50 yards out — worth 5 points each' },
            { key: 'xp_pct', abbr: 'XP%', label: 'Extra Point %', fmt: pct(1),
              tooltip: 'Extra points made per attempt' },
        ],
    },
];

// ── DST ──────────────────────────────────────────────────────────────────────
const DST_GROUPS: AdvancedGroup[] = [
    {
        title: 'Defensive Rates',
        metrics: [
            { key: 'dst_sacks_per_game', abbr: 'SCK/G', label: 'Sacks / Game', fmt: dec(2),
              tooltip: 'Team sacks per game' },
            { key: 'dst_takeaways_per_game', abbr: 'TO/G', label: 'Takeaways / Game', fmt: dec(2),
              tooltip: 'Interceptions plus fumble recoveries per game' },
            { key: 'dst_points_allowed_per_game', abbr: 'PA/G', label: 'Points Allowed / Game', fmt: dec(1),
              higherBetter: false, tooltip: 'Points allowed per game — drives the scoring bracket every week' },
            { key: 'dst_td_count', abbr: 'TD', label: 'Return Touchdowns', fmt: whole,
              tooltip: 'Defensive and special-teams touchdowns — the least repeatable thing a D/ST does' },
        ],
    },
];

const GROUPS_BY_POSITION: Record<string, AdvancedGroup[]> = {
    QB: QB_GROUPS,
    RB: RB_GROUPS,
    WR: RECEIVER_GROUPS,
    TE: RECEIVER_GROUPS,
    K: K_GROUPS,
    DST: DST_GROUPS,
};

export function getAdvancedGroups(position: string): AdvancedGroup[] {
    return GROUPS_BY_POSITION[(position || '').toUpperCase()] ?? RECEIVER_GROUPS;
}

/** Every metric key a position can show — used to test whether a row is empty. */
export function advancedKeys(position: string): string[] {
    return getAdvancedGroups(position).flatMap(g => g.metrics.map(m => m.key));
}

export function hasAdvancedData(row: NflAdvancedSeason | null | undefined, position: string): boolean {
    if (!row) return false;
    return advancedKeys(position).some(k => row[k] != null);
}

// ── Percentile scoring ───────────────────────────────────────────────────────

/**
 * Where `value` sits inside `peers`, 0-100. Peers are the same position in the
 * same season, so a 2021 target share is never graded against a 2025 one.
 */
export function percentileOf(value: number, peers: number[], higherBetter = true): number | null {
    const clean = peers.filter(v => v != null && isFinite(v));
    if (clean.length < 8) return null;   // too thin a field to grade against
    const beaten = higherBetter
        ? clean.filter(v => v < value).length
        : clean.filter(v => v > value).length;
    return Math.round((beaten / clean.length) * 100);
}

/** Tile colours, matching the rookie board's percentile scale. */
export function percentileColors(pct: number): { bg: string; text: string; bar: string } {
    if (pct >= 85) return { bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300', bar: 'bg-emerald-400' };
    if (pct >= 65) return { bg: 'bg-green-500/15 border-green-500/30', text: 'text-green-300', bar: 'bg-green-400' };
    if (pct >= 45) return { bg: 'bg-yellow-500/15 border-yellow-500/25', text: 'text-yellow-300', bar: 'bg-yellow-400' };
    if (pct >= 25) return { bg: 'bg-orange-500/15 border-orange-500/25', text: 'text-orange-300', bar: 'bg-orange-400' };
    return { bg: 'bg-red-500/15 border-red-500/25', text: 'text-red-300', bar: 'bg-red-400' };
}

export const NEUTRAL_TILE = {
    bg: 'bg-white/[0.04] border-white/[0.08]',
    text: 'text-foreground/75',
    bar: 'bg-white/20',
};
