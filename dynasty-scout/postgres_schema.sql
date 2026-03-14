-- Dynasty Scout — PostgreSQL schema for Supabase
-- Run this in the Supabase SQL editor to initialize the database.

-- Players (central entity)
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  position TEXT NOT NULL,
  dob TEXT,
  age_at_draft REAL,
  height_inches INTEGER,
  weight_lbs INTEGER,
  hometown TEXT,
  high_school TEXT,
  star_rating REAL,
  recruiting_rank_national INTEGER,
  recruiting_rank_position INTEGER,
  draft_year INTEGER DEFAULT 2026,
  nfl_team TEXT,
  draft_round INTEGER,
  draft_pick INTEGER,
  draft_overall INTEGER,
  headshot_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- College career history (handles transfers)
CREATE TABLE IF NOT EXISTS college_career (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  conference TEXT,
  seasons TEXT,
  is_transfer INTEGER DEFAULT 0,
  transfer_year INTEGER,
  notable_context TEXT,
  UNIQUE(player_id, school)
);

-- Season-by-season college stats
CREATE TABLE IF NOT EXISTS college_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  school TEXT NOT NULL,
  games_played INTEGER,
  pass_attempts INTEGER, completions INTEGER, pass_yards INTEGER,
  pass_tds INTEGER, interceptions INTEGER, completion_pct REAL,
  yards_per_attempt REAL, adj_completion_pct REAL,
  qbr REAL, epa_per_play REAL,
  rush_attempts INTEGER, rush_yards INTEGER, rush_tds INTEGER,
  yards_per_carry REAL, rush_yards_per_game REAL,
  yards_after_contact REAL, breakaway_run_rate REAL,
  explosive_run_rate REAL, missed_tackles_forced INTEGER,
  targets INTEGER, receptions INTEGER, rec_yards INTEGER,
  rec_tds INTEGER, yards_per_reception REAL,
  target_share REAL, yprr REAL,
  yards_after_catch REAL, drop_rate REAL,
  contested_catch_rate REAL, first_downs INTEGER,
  dominator_rating REAL,
  routes_run INTEGER,
  snap_count INTEGER,
  pff_overall_grade REAL,
  pff_pass_grade REAL,
  pff_rush_grade REAL,
  pff_recv_grade REAL,
  pff_block_grade REAL,
  UNIQUE(player_id, season, school)
);

-- Combine / Pro Day measurables
CREATE TABLE IF NOT EXISTS measurables (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE UNIQUE,
  event_type TEXT,
  forty_yard REAL,
  ten_yard_split REAL,
  bench_press INTEGER,
  vertical_jump REAL,
  broad_jump INTEGER,
  three_cone REAL,
  twenty_yard_shuttle REAL,
  speed_score REAL,
  height_adj_speed_score REAL,
  burst_score REAL,
  agility_score REAL,
  sparq_x REAL,
  ras REAL,
  bmi REAL
);

-- Individual source rankings
CREATE TABLE IF NOT EXISTS rankings (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_author TEXT,
  rank_overall INTEGER,
  rank_positional INTEGER,
  tier INTEGER,
  source_url TEXT,
  scraped_at TEXT NOT NULL,
  UNIQUE(player_id, source, scraped_at)
);

-- Consensus rankings
CREATE TABLE IF NOT EXISTS consensus_rankings (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  rank_overall INTEGER NOT NULL,
  rank_positional INTEGER,
  avg_rank REAL,
  best_rank INTEGER,
  worst_rank INTEGER,
  std_deviation REAL,
  num_sources INTEGER,
  rank_change_1d INTEGER DEFAULT 0,
  rank_change_7d INTEGER DEFAULT 0,
  rank_change_30d INTEGER DEFAULT 0,
  calculated_at TEXT NOT NULL,
  UNIQUE(player_id, calculated_at)
);

-- NFL Teams
CREATE TABLE IF NOT EXISTS nfl_teams (
  id SERIAL PRIMARY KEY,
  abbreviation TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  conference TEXT,
  division TEXT,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT
);

-- News articles
CREATE TABLE IF NOT EXISTS news (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  team_id INTEGER REFERENCES nfl_teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  source_url TEXT UNIQUE,
  published_at TEXT,
  scraped_at TIMESTAMP DEFAULT NOW()
);

-- Social media posts
CREATE TABLE IF NOT EXISTS social_posts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  post_id TEXT,
  post_url TEXT,
  author TEXT,
  content TEXT,
  engagement_score INTEGER,
  posted_at TEXT,
  scraped_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform, post_id)
);

-- User-defined tiers (drag & drop)
CREATE TABLE IF NOT EXISTS user_tiers (
  id SERIAL PRIMARY KEY,
  user_id TEXT DEFAULT 'user',
  tier_name TEXT NOT NULL,
  tier_color TEXT NOT NULL,
  tier_description TEXT,
  tier_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tier_players (
  id SERIAL PRIMARY KEY,
  tier_id INTEGER REFERENCES user_tiers(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  player_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tier_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_draft_year ON players(draft_year);
CREATE INDEX IF NOT EXISTS idx_players_slug ON players(slug);
CREATE INDEX IF NOT EXISTS idx_rankings_player_date ON rankings(player_id, scraped_at);
CREATE INDEX IF NOT EXISTS idx_consensus_player ON consensus_rankings(player_id, calculated_at);
CREATE INDEX IF NOT EXISTS idx_college_stats_player ON college_stats(player_id);
