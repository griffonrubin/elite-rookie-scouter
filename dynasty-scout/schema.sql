-- Players (the central entity)
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,        -- "jeremiah-love"
  full_name VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  position VARCHAR(10) NOT NULL,            -- QB, RB, WR, TE
  dob DATE,
  age_at_draft DECIMAL(4,1),
  height_inches INTEGER,
  weight_lbs INTEGER,
  hometown VARCHAR(255),
  high_school VARCHAR(255),
  star_rating DECIMAL(3,1),                 -- 247 Composite star rating
  recruiting_rank_national INTEGER,
  recruiting_rank_position INTEGER,
  draft_year INTEGER DEFAULT 2026,
  -- Post-NFL-Draft fields (filled after April)
  nfl_team VARCHAR(50),
  draft_round INTEGER,
  draft_pick INTEGER,
  draft_overall INTEGER,
  headshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- College career history (handles transfers)
CREATE TABLE college_career (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  school VARCHAR(255) NOT NULL,
  conference VARCHAR(50),
  seasons VARCHAR(50),                      -- "2022-2024" or "2024-2025"
  is_transfer BOOLEAN DEFAULT FALSE,
  transfer_year INTEGER,
  notable_context TEXT,                      -- "Played behind Jeremiah Love"
  UNIQUE(player_id, school)
);

-- Season-by-season college stats
CREATE TABLE college_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  season INTEGER NOT NULL,
  school VARCHAR(255) NOT NULL,
  games_played INTEGER,
  -- Passing
  pass_attempts INTEGER, completions INTEGER, pass_yards INTEGER,
  pass_tds INTEGER, interceptions INTEGER, completion_pct DECIMAL(5,2),
  yards_per_attempt DECIMAL(5,2), adj_completion_pct DECIMAL(5,2),
  qbr DECIMAL(5,1), epa_per_play DECIMAL(5,3),
  -- Rushing
  rush_attempts INTEGER, rush_yards INTEGER, rush_tds INTEGER,
  yards_per_carry DECIMAL(5,2), rush_yards_per_game DECIMAL(6,2),
  yards_after_contact DECIMAL(5,2), breakaway_run_rate DECIMAL(5,3),
  explosive_run_rate DECIMAL(5,3), missed_tackles_forced INTEGER,
  -- Receiving
  targets INTEGER, receptions INTEGER, rec_yards INTEGER,
  rec_tds INTEGER, yards_per_reception DECIMAL(5,2),
  target_share DECIMAL(5,3), yprr DECIMAL(5,3),
  yards_after_catch DECIMAL(5,2), drop_rate DECIMAL(5,3),
  contested_catch_rate DECIMAL(5,3), first_downs INTEGER,
  -- Advanced (position-dependent, many nullable)
  dominator_rating DECIMAL(5,3),
  routes_run INTEGER,
  snap_count INTEGER,
  pff_overall_grade DECIMAL(5,1),
  pff_pass_grade DECIMAL(5,1),
  pff_rush_grade DECIMAL(5,1),
  pff_recv_grade DECIMAL(5,1),
  pff_block_grade DECIMAL(5,1),
  UNIQUE(player_id, season, school)
);

-- Combine / Pro Day measurables
CREATE TABLE measurables (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) UNIQUE,
  event_type VARCHAR(20),                   -- "combine" or "pro_day"
  forty_yard DECIMAL(4,2),
  ten_yard_split DECIMAL(4,2),
  bench_press INTEGER,
  vertical_jump DECIMAL(4,1),
  broad_jump INTEGER,
  three_cone DECIMAL(4,2),
  twenty_yard_shuttle DECIMAL(4,2),
  -- Computed scores
  speed_score DECIMAL(6,2),
  height_adj_speed_score DECIMAL(6,2),
  burst_score DECIMAL(6,2),
  agility_score DECIMAL(6,2),
  sparq_x DECIMAL(6,2),
  ras DECIMAL(4,2),                         -- Relative Athletic Score (0-10)
  bmi DECIMAL(4,1)
);

-- Rankings from individual sources (one row per source per player per scrape date)
CREATE TABLE rankings (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  source VARCHAR(100) NOT NULL,             -- "fantasypros", "flock_fantasy", etc.
  source_author VARCHAR(255),               -- specific analyst name if available
  rank_overall INTEGER,
  rank_positional INTEGER,
  tier INTEGER,
  source_url TEXT,
  scraped_at DATE NOT NULL,
  UNIQUE(player_id, source, scraped_at)
);

-- Consensus rankings (computed daily from individual rankings)
CREATE TABLE consensus_rankings (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  rank_overall INTEGER NOT NULL,
  rank_positional INTEGER,
  avg_rank DECIMAL(6,2),
  best_rank INTEGER,
  worst_rank INTEGER,
  std_deviation DECIMAL(5,2),
  num_sources INTEGER,
  -- Movement tracking
  rank_change_1d INTEGER DEFAULT 0,
  rank_change_7d INTEGER DEFAULT 0,
  rank_change_30d INTEGER DEFAULT 0,
  calculated_at DATE NOT NULL,
  UNIQUE(player_id, calculated_at)
);

-- Historical consensus (for charting movement over time)
CREATE TABLE consensus_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  rank_overall INTEGER,
  avg_rank DECIMAL(6,2),
  recorded_at DATE NOT NULL,
  UNIQUE(player_id, recorded_at)
);

-- NFL Teams (for landing spot analysis)
CREATE TABLE nfl_teams (
  id SERIAL PRIMARY KEY,
  abbreviation VARCHAR(5) UNIQUE NOT NULL,  -- "KC", "SF", etc.
  full_name VARCHAR(100) NOT NULL,
  conference VARCHAR(5),
  division VARCHAR(20),
  logo_url TEXT,
  primary_color VARCHAR(7),
  secondary_color VARCHAR(7)
);

-- Team context data (refreshed periodically)
CREATE TABLE team_context (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES nfl_teams(id),
  season INTEGER DEFAULT 2026,
  -- Coaching
  head_coach VARCHAR(100),
  offensive_coord VARCHAR(100),
  defensive_coord VARCHAR(100),
  play_caller VARCHAR(100),
  scheme_type VARCHAR(100),                 -- "Shanahan Outside Zone", "Spread", etc.
  coaching_changes TEXT,                    -- JSON array of changes
  -- Cap & Draft
  cap_space_total BIGINT,
  dead_money BIGINT,
  draft_picks JSONB,                        -- [{round: 1, pick: 5, from: "trade"}, ...]
  -- Needs
  positional_needs JSONB,                   -- [{position: "WR", priority: 1, notes: "..."}, ...]
  -- Depth Charts (JSON for flexibility)
  depth_chart JSONB,                        -- {QB: ["Patrick Mahomes", ...], RB: [...], ...}
  -- Fantasy environment
  pass_rate DECIMAL(5,3),
  rush_rate DECIMAL(5,3),
  plays_per_game DECIMAL(5,1),
  vacated_targets INTEGER,
  vacated_carries INTEGER,
  vacated_snaps INTEGER,
  -- Opportunity ratings per position
  qb_opportunity_tier VARCHAR(20),          -- "Great", "Good", "Mid", "Avoid"
  rb_opportunity_tier VARCHAR(20),
  wr_opportunity_tier VARCHAR(20),
  te_opportunity_tier VARCHAR(20),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team transactions/news
CREATE TABLE team_transactions (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES nfl_teams(id),
  transaction_type VARCHAR(50),             -- "trade", "signing", "release", "draft", "coach_hire"
  description TEXT,
  source_url TEXT,
  transaction_date DATE,
  fantasy_impact TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mock draft aggregation
CREATE TABLE mock_drafts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  team_id INTEGER REFERENCES nfl_teams(id),
  source VARCHAR(100),
  source_author VARCHAR(255),
  pick_number INTEGER,
  round INTEGER,
  source_url TEXT,
  published_at DATE,
  scraped_at DATE,
  UNIQUE(player_id, source, source_author, published_at)
);

-- News articles
CREATE TABLE news (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),  -- nullable if team-level
  team_id INTEGER REFERENCES nfl_teams(id),  -- nullable if player-level
  title TEXT NOT NULL,
  summary TEXT,
  source VARCHAR(100),
  source_url TEXT UNIQUE,
  published_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social media posts (tweets, reddit)
CREATE TABLE social_posts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  platform VARCHAR(20) NOT NULL,            -- "twitter", "reddit", "youtube"
  post_id VARCHAR(255),                     -- platform-specific ID
  post_url TEXT,
  author VARCHAR(255),
  content TEXT,
  engagement_score INTEGER,                 -- likes + retweets, or upvotes
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, post_id)
);

-- YouTube film links
CREATE TABLE film_links (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  title TEXT,
  youtube_url TEXT NOT NULL,
  channel_name VARCHAR(255),
  video_type VARCHAR(50),                   -- "highlight", "breakdown", "interview"
  published_at DATE,
  UNIQUE(player_id, youtube_url)
);

-- AI-generated prospect scores (Phase 6)
CREATE TABLE ai_scores (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  overall_score DECIMAL(5,2),               -- 0-100
  nfl_readiness DECIMAL(5,2),               -- 0-100
  ceiling DECIMAL(5,2),
  floor DECIMAL(5,2),
  bust_probability DECIMAL(5,3),
  risk_score DECIMAL(5,2),                  -- 0-100 (higher = riskier)
  player_comps JSONB,                       -- [{name: "Ja'Marr Chase", similarity: 0.89}, ...]
  projection_yr1 JSONB,                     -- {games: 17, targets: 120, yards: 900, ...}
  projection_yr3 JSONB,
  model_version VARCHAR(20),
  confidence DECIMAL(5,3),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, model_version)
);

-- YouTube transcript rankings (scraped from dynasty YouTubers)
CREATE TABLE youtube_rankings (
  id SERIAL PRIMARY KEY,
  channel_name VARCHAR(255),
  video_title TEXT,
  video_url TEXT,
  rankings_extracted JSONB,                 -- [{rank: 1, player: "Jeremiah Love"}, ...]
  published_at DATE,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_draft_year ON players(draft_year);
CREATE INDEX idx_players_slug ON players(slug);
CREATE INDEX idx_rankings_player_date ON rankings(player_id, scraped_at);
CREATE INDEX idx_rankings_source_date ON rankings(source, scraped_at);
CREATE INDEX idx_consensus_date ON consensus_rankings(calculated_at);
CREATE INDEX idx_consensus_player ON consensus_rankings(player_id);
CREATE INDEX idx_news_player ON news(player_id);
CREATE INDEX idx_news_team ON news(team_id);
CREATE INDEX idx_social_player ON social_posts(player_id);
CREATE INDEX idx_mock_drafts_player ON mock_drafts(player_id);
CREATE INDEX idx_mock_drafts_team ON mock_drafts(team_id);
