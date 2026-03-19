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
