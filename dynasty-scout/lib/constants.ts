export const POSITION_HEADLINE_STATS: Record<string, { key: string, label: string }[]> = {
    QB: [
        { key: 'completion_pct', label: 'CMP%' },
        { key: 'yards_per_attempt', label: 'YPA' },
        { key: 'rush_yards_per_game', label: 'Rush YPG' },
    ],
    RB: [
        { key: 'yards_per_carry', label: 'YPC' },
        { key: 'att_per_game', label: 'ATT/G' },
        { key: 'tgt_per_game', label: 'TGT/G' },
    ],
    WR: [
        { key: 'yds_per_game', label: 'YDS/G' },
        { key: 'tgt_per_game', label: 'TGT/G' },
        { key: 'rec_per_game', label: 'REC/G' },
    ],
    TE: [
        { key: 'yds_per_game', label: 'YDS/G' },
        { key: 'tgt_per_game', label: 'TGT/G' },
        { key: 'rec_per_game', label: 'REC/G' },
    ],
};

// Canonical position color system — single source of truth.
// K and DST are redraft-only positions (no rookie-board players carry them).
export const POSITION_RAW: Record<string, string> = {
    QB: '#ef4444', RB: '#38bdf8', WR: '#34d399', TE: '#a78bfa',
    K: '#fbbf24', DST: '#94a3b8',
};

export const POSITION_COLORS: Record<string, string> = {
    QB: 'bg-red-500/15 text-red-400 border border-red-500/35',
    RB: 'bg-sky-400/15 text-sky-400 border border-sky-400/35',
    WR: 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/35',
    TE: 'bg-violet-400/15 text-violet-400 border border-violet-400/35',
    K: 'bg-amber-400/15 text-amber-400 border border-amber-400/35',
    DST: 'bg-slate-400/15 text-slate-300 border border-slate-400/35',
};

export const POSITION_PILL_ACTIVE: Record<string, { active: string; inactive: string }> = {
    ALL: {
        active: 'bg-primary text-white border-primary shadow-[0_0_12px_rgba(249,115,22,0.3)]',
        inactive: 'text-muted-foreground border-white/10 hover:border-primary/40 hover:text-primary',
    },
    QB: {
        active: 'bg-red-500/25 text-red-300 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]',
        inactive: 'text-muted-foreground border-white/10 hover:border-red-500/40 hover:text-red-400',
    },
    RB: {
        active: 'bg-sky-400/25 text-sky-200 border-sky-400/60 shadow-[0_0_12px_rgba(56,189,248,0.2)]',
        inactive: 'text-muted-foreground border-white/10 hover:border-sky-400/40 hover:text-sky-400',
    },
    WR: {
        active: 'bg-emerald-400/25 text-emerald-200 border-emerald-400/60 shadow-[0_0_12px_rgba(52,211,153,0.2)]',
        inactive: 'text-muted-foreground border-white/10 hover:border-emerald-400/40 hover:text-emerald-400',
    },
    TE: {
        active: 'bg-violet-400/25 text-violet-200 border-violet-400/60 shadow-[0_0_12px_rgba(167,139,250,0.2)]',
        inactive: 'text-muted-foreground border-white/10 hover:border-violet-400/40 hover:text-violet-400',
    },
    K: {
        active: 'bg-amber-400/25 text-amber-200 border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.2)]',
        inactive: 'text-muted-foreground border-white/10 hover:border-amber-400/40 hover:text-amber-400',
    },
    DST: {
        active: 'bg-slate-400/25 text-slate-200 border-slate-400/60 shadow-[0_0_12px_rgba(148,163,184,0.2)]',
        inactive: 'text-muted-foreground border-white/10 hover:border-slate-400/40 hover:text-slate-300',
    },
};

export const SOURCES = [
    { name: 'FantasyPros', url: 'https://www.fantasypros.com/nfl/rankings/rookies.php' },
    { name: 'KTC', url: 'https://keeptradecut.com/dynasty-rankings' },
    { name: 'Dynasty Nerds', url: 'https://www.dynastynerds.com/rankings/' },
    { name: 'Flock Fantasy', url: 'https://flockfantasy.com' },
    { name: 'Walter Football', url: 'https://walterfootball.com/dynastyrookierankings.php' },
];

/** Redraft (seasonal PPR) ranking sources — displayed on the redraft board. */
export const REDRAFT_SOURCES = [
    { name: 'FantasyPros PPR', short: 'FP', url: 'https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php' },
    { name: 'ESPN Redraft', short: 'ESPN', url: 'https://www.espn.com/fantasy/football/' },
    { name: 'Yahoo Redraft', short: 'YHO', url: 'https://football.fantasysports.yahoo.com/f1/draftanalysis' },
    { name: 'CBS Redraft', short: 'CBS', url: 'https://www.cbssports.com/fantasy/football/rankings/ppr/top200/' },
    { name: 'Sleeper Redraft', short: 'SLP', url: 'https://sleeper.com' },
    { name: 'KeepTradeCut Redraft', short: 'KTC', url: 'https://keeptradecut.com/fantasy-rankings' },
    { name: 'FantasyCalc Redraft', short: 'FC', url: 'https://fantasycalc.com' },
    { name: 'Flock Redraft', short: 'FLK', url: 'https://flockfantasy.com' },
];

/** Sources that publish 2026 seasonal point projections. */
export const PROJECTION_SOURCES = [
    { name: 'FantasyPros', short: 'FP' },
    { name: 'ESPN', short: 'ESPN' },
    { name: 'Sleeper', short: 'SLP' },
    { name: 'CBS', short: 'CBS' },
];

export const REDRAFT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;
