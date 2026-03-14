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

export const POSITION_COLORS: Record<string, string> = {
    QB: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
    RB: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    WR: 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40',
    TE: 'bg-violet-500/20 text-violet-300 border border-violet-500/40',
};

export const SOURCES = [
    { name: 'FantasyPros', url: 'https://www.fantasypros.com/nfl/rankings/rookies.php' },
    { name: 'KTC', url: 'https://keeptradecut.com/dynasty-rankings' },
    { name: 'Dynasty Nerds', url: 'https://www.dynastynerds.com/rankings/' },
    { name: 'Flock Fantasy', url: 'https://flockfantasy.com' },
    { name: 'Walter Football', url: 'https://walterfootball.com/dynastyrookierankings.php' },
];
