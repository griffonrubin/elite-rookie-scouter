export interface Player {
    id: number;
    slug: string;
    full_name: string;
    first_name?: string;
    last_name?: string;
    position: 'QB' | 'RB' | 'WR' | 'TE';
    dob?: string;
    age_at_draft?: number;
    height_inches?: number;
    weight_lbs?: number;
    hometown?: string;
    high_school?: string;
    star_rating?: number;
    recruiting_rank_national?: number;
    recruiting_rank_position?: number;
    draft_year: number;
    nfl_team?: string;
    school?: string;  // College/university (from college_career table)
    draft_round?: number;
    draft_pick?: number;
    draft_overall?: number;
    headshot_url?: string;
    created_at?: string;
    updated_at?: string;
    consensus?: ConsensusRanking;
    forty_yard?: number;
    sleeper_adp?: number;
    fantasypros_rank?: number;
    recruiting_composite?: number;
    recruiting_stars?: number;
    recruiting_year?: number;
}

export interface CollegeCareer {
    id: number;
    player_id: number;
    school: string;
    conference?: string;
    seasons: string;
    is_transfer: boolean;
    transfer_year?: number;
    notable_context?: string;
}

export interface CollegeStats {
    id: number;
    player_id: number;
    season: number;
    school: string;
    games_played?: number;
    // Passing
    pass_attempts?: number;
    completions?: number;
    pass_yards?: number;
    pass_tds?: number;
    interceptions?: number;
    completion_pct?: number;
    yards_per_attempt?: number;
    adj_completion_pct?: number;
    qbr?: number;
    epa_per_play?: number;
    // Rushing
    rush_attempts?: number;
    rush_yards?: number;
    rush_tds?: number;
    yards_per_carry?: number;
    rush_yards_per_game?: number;
    yards_after_contact?: number;
    breakaway_run_rate?: number;
    explosive_run_rate?: number;
    missed_tackles_forced?: number;
    // Receiving
    targets?: number;
    receptions?: number;
    rec_yards?: number;
    rec_tds?: number;
    yards_per_reception?: number;
    target_share?: number;
    yprr?: number;
    yards_after_catch?: number;
    drop_rate?: number;
    contested_catch_rate?: number;
    first_downs?: number;
    air_yards?: number;
    adot?: number;
    ppa_avg?: number;
    ppa_total?: number;
    usage_pct?: number;
    // Advanced
    dominator_rating?: number;
    routes_run?: number;
    snap_count?: number;
    pff_overall_grade?: number;
    pff_pass_grade?: number;
    pff_rush_grade?: number;
    pff_recv_grade?: number;
    pff_block_grade?: number;
    fumbles?: number;
}

export interface Measurables {
    id: number;
    player_id: number;
    event_type: 'combine' | 'pro_day';
    forty_yard?: number;
    ten_yard_split?: number;
    bench_press?: number;
    vertical_jump?: number;
    broad_jump?: number;
    three_cone?: number;
    twenty_yard_shuttle?: number;
    speed_score?: number;
    height_adj_speed_score?: number;
    burst_score?: number;
    agility_score?: number;
    sparq_x?: number;
    ras?: number;
    bmi?: number;
    hand_size?: number;
    arm_length?: number;
    wingspan?: number;
}

export interface HighSchoolStats {
    id: number;
    player_id: number;
    high_school?: string;
    city?: string;
    state?: string;
    graduating_class?: number;
    games?: number;
    pass_yards?: number;
    pass_tds?: number;
    rush_yards?: number;
    rush_tds?: number;
    rec_yards?: number;
    rec_tds?: number;
    receptions?: number;
    interceptions?: number;
    fumbles?: number;
    total_yards?: number;
    total_tds?: number;
    data_source?: string;
}

export interface Ranking {
    id: number;
    player_id: number;
    source: string;
    source_author?: string;
    rank_overall?: number;
    rank_positional?: number;
    tier?: number;
    source_url?: string;
    scraped_at: string;
}

export interface ConsensusRanking {
    id: number;
    player_id: number;
    rank_overall: number;
    rank_positional?: number;
    avg_rank?: number | null;
    best_rank?: number | null;
    worst_rank?: number | null;
    std_deviation?: number;
    num_sources?: number;
    rank_change_1d?: number;
    rank_change_7d?: number;
    rank_change_30d?: number;
    calculated_at: string;
}

export interface WrAdvancedCareer {
    id: number;
    player_id: number;
    qbr_when_targeted?: number;
    adot?: number;
    yprr?: number;
    zone_yprr?: number;
    man_yprr?: number;
    first_down_rate?: number;
    td_per_route?: number;
    first_down_per_target?: number;
    td_per_target?: number;
    yac_per_rec?: number;
    air_yards_per_rec?: number;
    catch_rate?: number;
    target_rate?: number;
    open_target_rate?: number;
    drop_rate?: number;
    contested_catch_rate?: number;
    forced_mtf_pct?: number;
    yac_rate?: number;
    air_yards_rate?: number;
    wide_rate?: number;
    slot_rate?: number;
}

export interface NflScoutProfile {
    id: number;
    player_id: number;
    overview?: string;
    strengths?: string;
    weaknesses?: string;
    profile_author?: string;
    athleticism_score?: number;
    production_score?: number;
    size_score?: number;
    draft_grade?: number;
    nfl_comparison?: string;
    source?: string;
    updated_at?: string;
}

export interface JFosterGrades {
    id: number;
    player_id: number;
    overall_grade?: number;
    round_grade?: string;
    nfl_comp?: string;
    summary?: string;
    strengths?: string;   // JSON array
    weaknesses?: string;  // JSON array
    film_grades?: string; // JSON object: { "Speed": 87, "Vision": 82, ... }
    size_score?: number;
    speed_score_jf?: number;
    acceleration_score?: number;
    agility_score_jf?: number;
    athletic_score?: number;
    pos_fit?: string;       // positional alignment (Z, X, F, slot, etc.)
    source?: string;
    updated_at?: string;
}

export interface NFLTeam {
    id: number;
    abbreviation: string;
    full_name: string;
    conference?: string;
    division?: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
}

export interface TeamContext {
    id: number;
    team_id: number;
    season?: number;
    head_coach?: string;
    offensive_coord?: string;
    defensive_coord?: string;
    play_caller?: string;
    scheme_type?: string;
    coaching_changes?: string;
    cap_space_total?: number;
    dead_money?: number;
    draft_picks?: Record<string, any>[];
    positional_needs?: Record<string, any>[];
    depth_chart?: Record<string, any>;
    pass_rate?: number;
    rush_rate?: number;
    plays_per_game?: number;
    vacated_targets?: number;
    vacated_carries?: number;
    vacated_snaps?: number;
    qb_opportunity_tier?: string;
    rb_opportunity_tier?: string;
    wr_opportunity_tier?: string;
    te_opportunity_tier?: string;
    updated_at?: string;
}

export interface MockDraft {
    id: number;
    player_id: number;
    team_id: number;
    source: string;
    source_author?: string;
    pick_number?: number;
    round?: number;
    source_url?: string;
    published_at?: string;
    scraped_at?: string;
}

export interface News {
    id: number;
    player_id?: number;
    team_id?: number;
    title: string;
    summary?: string;
    source?: string;
    source_url?: string;
    published_at?: string;
    scraped_at?: string;
}

export interface SocialPost {
    id: number;
    player_id?: number;
    platform: 'twitter' | 'reddit' | 'youtube';
    post_id?: string;
    post_url?: string;
    author?: string;
    content?: string;
    engagement_score?: number;
    posted_at?: string;
    scraped_at?: string;
}

export interface FilmLink {
    id: number;
    player_id: number;
    title?: string;
    youtube_url: string;
    channel_name?: string;
    video_type?: 'highlight' | 'breakdown' | 'interview';
    published_at?: string;
}

export interface Tier {
    id: number;
    user_id: string;
    tier_name: string;
    tier_color: string;
    tier_description?: string;
    tier_order: number;
    created_at?: string;
    updated_at?: string;
    players?: Player[]; // For UI convenience
}

export interface TierPlayer {
    id: number;
    tier_id: number;
    player_id: number;
    player_order: number;
    created_at?: string;
}

// ── Redraft mode ─────────────────────────────────────────────────────────────

/** One row of the redraft board — a player plus their market and production. */
export interface RedraftPlayer {
    id: number;
    slug: string;
    full_name: string;
    position: string;
    nfl_team: string | null;
    nfl_headshot_url: string | null;
    headshot_url: string | null;
    dob: string | null;
    years_exp: number | null;
    nfl_draft_year: number | null;
    /** 2026 means this player is also on the rookie board (college profile exists). */
    draft_year: number | null;
    height_inches: number | null;
    weight_lbs: number | null;
    /** Sleeper's player id — what a live Sleeper draft identifies picks by. */
    sleeper_id: string | null;
    /** ESPN's player id — the same job for a live ESPN draft. */
    espn_nfl_id: string | null;
    team_logo: string | null;
    team_color: string | null;

    /** Live board position — array index from the ordered query. */
    board_rank?: number;

    // consensus
    rank_overall: number | null;
    rank_positional: number | null;
    avg_rank: number | null;
    best_rank: number | null;
    worst_rank: number | null;
    std_deviation: number | null;
    num_sources: number | null;

    // per-source ranks
    my_rank: number | null;
    fp_rank: number | null;
    espn_rank: number | null;
    ktc_rank: number | null;
    cbs_rank: number | null;
    yahoo_rank: number | null;
    sleeper_rank: number | null;
    fc_rank: number | null;
    flock_rank: number | null;
    underdog_rank: number | null;
    ffpc_rank: number | null;
    fp_tier: number | null;

    // 2025 season
    pts25: number | null;
    ppg25: number | null;
    fin25: number | null;
    fin25_ov: number | null;
    games25: number | null;
    team25: string | null;
    pass_yards: number | null;
    pass_tds: number | null;
    interceptions: number | null;
    completions: number | null;
    pass_attempts: number | null;
    carries: number | null;
    rush_yards: number | null;
    rush_tds: number | null;
    targets: number | null;
    receptions: number | null;
    rec_yards: number | null;
    rec_tds: number | null;
    fg_made: number | null;
    fg_att: number | null;
    fg_pct: number | null;
    fg_made_50plus: number | null;
    fg_long: number | null;
    xp_made: number | null;
    dst_sacks: number | null;
    dst_ints: number | null;
    dst_tds: number | null;
    dst_fum_rec: number | null;
    dst_points_allowed: number | null;

    // prior seasons
    pts21: number | null; pts22: number | null; pts23: number | null; pts24: number | null;
    fin21: number | null; fin22: number | null; fin23: number | null; fin24: number | null;
    seasons_played: number | null;

    // projections
    proj_points: number | null;
    proj_ppg: number | null;
    proj_sources: number | null;

    // 2025 advanced rates (adv_ prefixed because several names also exist on
    // nfl_season_stats). The full set lives on the player profile.
    adv_snap_share: number | null;
    adv_touches_per_game: number | null;
    adv_yards_per_touch: number | null;
    adv_epa_per_dropback: number | null;
    adv_cpoe: number | null;
    adv_yards_per_attempt: number | null;
    adv_pass_td_rate: number | null;
    adv_int_rate: number | null;
    adv_pressure_pct: number | null;
    adv_sack_rate: number | null;
    adv_carries_per_game: number | null;
    adv_yards_per_carry: number | null;
    adv_yards_after_contact_att: number | null;
    adv_rush_mtf_rate: number | null;
    adv_breakaway_rush_rate: number | null;
    adv_epa_per_rush: number | null;
    adv_target_share: number | null;
    adv_air_yards_share: number | null;
    adv_wopr: number | null;
    adv_targets_per_game: number | null;
    adv_yards_per_snap: number | null;
    adv_yards_per_target: number | null;
    adv_adot: number | null;
    adv_yards_after_catch_rec: number | null;
    adv_catch_rate: number | null;
    adv_epa_per_target: number | null;
    adv_fg_att_per_game: number | null;
    adv_fg_pct: number | null;
    adv_fg_pct_40plus: number | null;
    adv_avg_fg_distance: number | null;
    adv_fg_50plus_att: number | null;
    adv_xp_pct: number | null;
    adv_dst_sacks_per_game: number | null;
    adv_dst_takeaways_per_game: number | null;
    adv_dst_points_allowed_per_game: number | null;

    // 2026 Vegas market, via the player's team
    vegas_implied_total: number | null;
    vegas_implied_rank: number | null;
    vegas_total: number | null;
    vegas_spread: number | null;
    vegas_win_pct: number | null;
    vegas_games_lined: number | null;
}

/** One season row from nfl_season_stats. */
export interface NflSeasonStat {
    player_id: number;
    season: number;
    team: string | null;
    position: string | null;
    games: number | null;
    fantasy_points_ppr: number | null;
    ppg_ppr: number | null;
    finish_overall: number | null;
    finish_positional: number | null;
    [key: string]: number | string | null;
}

/** One source's 2026 projection for a player. */
export interface Projection {
    player_id: number;
    source: string;
    season: number;
    proj_points: number | null;
    proj_ppg: number | null;
    proj_rank_overall: number | null;
    proj_rank_positional: number | null;
    scraped_at: string;
}

/**
 * One season of advanced / efficiency stats. Wide and sparse on purpose:
 * every position writes into the same row shape and only the metrics that
 * mean something for that position are ever read back — see
 * lib/redraftAdvanced.ts for the per-position registry.
 */
export interface NflAdvancedSeason {
    player_id: number;
    season: number;
    team: string | null;
    position: string | null;
    games: number | null;

    // usage
    offense_snaps: number | null;
    snap_share: number | null;
    touches_per_game: number | null;
    yards_per_touch: number | null;
    total_epa: number | null;

    // passing
    pass_epa: number | null;
    epa_per_dropback: number | null;
    cpoe: number | null;
    pacr: number | null;
    yards_per_attempt: number | null;
    air_yards_per_attempt: number | null;
    completed_air_yards_per_cmp: number | null;
    pass_yac_per_cmp: number | null;
    bad_throw_pct: number | null;
    on_target_pct: number | null;
    pressure_pct: number | null;
    blitz_pct: number | null;
    pocket_time: number | null;
    sack_rate: number | null;
    scramble_rate: number | null;
    pass_td_rate: number | null;
    int_rate: number | null;
    deep_pass_rate: number | null;

    // rushing
    rush_epa: number | null;
    epa_per_rush: number | null;
    yards_per_carry: number | null;
    yards_before_contact_att: number | null;
    yards_after_contact_att: number | null;
    broken_tackles: number | null;
    att_per_broken_tackle: number | null;
    explosive_rush_rate: number | null;
    breakaway_rush_rate: number | null;
    rush_first_down_rate: number | null;
    carries_per_game: number | null;
    rush_mtf_rate: number | null;

    // receiving
    rec_epa: number | null;
    epa_per_target: number | null;
    target_share: number | null;
    air_yards_share: number | null;
    wopr: number | null;
    racr: number | null;
    targets_per_game: number | null;
    adot: number | null;
    yards_per_target: number | null;
    yards_per_reception: number | null;
    yards_per_snap: number | null;
    catch_rate: number | null;
    drop_rate: number | null;
    rec_broken_tackles: number | null;
    rec_mtf_rate: number | null;
    yards_before_catch_rec: number | null;
    yards_after_catch_rec: number | null;
    passer_rating_targeted: number | null;
    rec_first_down_rate: number | null;
    explosive_rec_rate: number | null;
    rec_td_per_target: number | null;

    // kicking
    fg_att_per_game: number | null;
    fg_pct: number | null;
    fg_pct_40plus: number | null;
    avg_fg_distance: number | null;
    fg_50plus_att: number | null;
    xp_pct: number | null;

    // team defense
    dst_sacks_per_game: number | null;
    dst_takeaways_per_game: number | null;
    dst_points_allowed_per_game: number | null;
    dst_td_count: number | null;

    [key: string]: number | string | null;
}

/** One team's side of one scheduled game, as the betting market prices it. */
export interface VegasGameLine {
    season: number;
    week: number;
    game_id: string;
    team: string;
    opponent: string;
    is_home: number;
    gameday: string | null;
    /** Betting convention — negative means this team is favoured. */
    spread: number | null;
    total_line: number | null;
    implied_team_total: number | null;
    implied_opp_total: number | null;
    moneyline: number | null;
    /** De-vigged, so the two sides of a game sum to 1. */
    win_prob: number | null;
}

/** A team's market profile over whatever part of the slate is priced. */
export interface VegasTeamSeason {
    season: number;
    team: string;
    games_lined: number | null;
    games_scheduled: number | null;
    exp_wins_lined: number | null;
    win_pct: number | null;
    avg_total: number | null;
    avg_spread: number | null;
    avg_implied_total: number | null;
    avg_implied_opp_total: number | null;
    implied_total_rank: number | null;
    total_rank: number | null;
}
