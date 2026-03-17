-- Players (the central entity)
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,        -- "jeremiah-love"
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  position TEXT NOT NULL,            -- QB, RB, WR, TE
  dob TEXT,
  age_at_draft REAL,
  height_inches INTEGER,
  weight_lbs INTEGER,
  hometown TEXT,
  high_school TEXT,
  star_rating REAL,                 -- 247 Composite star rating
  recruiting_rank_national INTEGER,
  recruiting_rank_position INTEGER,
  draft_year INTEGER DEFAULT 2026,
  -- Post-NFL-Draft fields (filled after April)
  nfl_team TEXT,
  draft_round INTEGER,
  draft_pick INTEGER,
  draft_overall INTEGER,
  headshot_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- College career history (handles transfers)
CREATE TABLE IF NOT EXISTS college_career (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),
  school TEXT NOT NULL,
  conference TEXT,
  seasons TEXT,                      -- "2022-2024" or "2024-2025"
  is_transfer INTEGER DEFAULT 0,     -- Boolean as 0/1
  transfer_year INTEGER,
  notable_context TEXT,
  UNIQUE(player_id, school)
);

-- Season-by-season college stats
CREATE TABLE IF NOT EXISTS college_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),
  season INTEGER NOT NULL,
  school TEXT NOT NULL,
  games_played INTEGER,
  -- Passing
  pass_attempts INTEGER, completions INTEGER, pass_yards INTEGER,
  pass_tds INTEGER, interceptions INTEGER, completion_pct REAL,
  yards_per_attempt REAL, adj_completion_pct REAL,
  qbr REAL, epa_per_play REAL,
  -- Rushing
  rush_attempts INTEGER, rush_yards INTEGER, rush_tds INTEGER,
  yards_per_carry REAL, rush_yards_per_game REAL,
  yards_after_contact REAL, breakaway_run_rate REAL,
  explosive_run_rate REAL, missed_tackles_forced INTEGER,
  -- Receiving
  targets INTEGER, receptions INTEGER, rec_yards INTEGER,
  rec_tds INTEGER, yards_per_reception REAL,
  target_share REAL, yprr REAL,
  yards_after_catch REAL, drop_rate REAL,
  contested_catch_rate REAL, first_downs INTEGER,
  air_yards REAL,            -- total receiving air yards for the season
  adot REAL,                 -- average depth of target = air_yards / targets
  -- Advanced metrics from CFBD / PFF
  ppa_avg REAL,              -- average predicted points added per play
  ppa_total REAL,            -- total predicted points added
  usage_pct REAL,            -- snap usage % (from CFBD)
  -- Advanced (position-dependent, many nullable)
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id) UNIQUE,
  event_type TEXT,                   -- "combine" or "pro_day"
  forty_yard REAL,
  ten_yard_split REAL,
  bench_press INTEGER,
  vertical_jump REAL,
  broad_jump INTEGER,
  three_cone REAL,
  twenty_yard_shuttle REAL,
  -- Computed scores
  speed_score REAL,
  height_adj_speed_score REAL,
  burst_score REAL,
  agility_score REAL,
  sparq_x REAL,
  ras REAL,                         -- Relative Athletic Score (0-10)
  bmi REAL
);

-- Rankings from individual sources
CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),
  source TEXT NOT NULL,             -- "fantasypros", "flock_fantasy", etc.
  source_author TEXT,               -- specific analyst name if available
  rank_overall INTEGER,
  rank_positional INTEGER,
  tier INTEGER,
  source_url TEXT,
  scraped_at TEXT NOT NULL,         -- ISO date string
  UNIQUE(player_id, source, scraped_at)
);

-- Consensus rankings
CREATE TABLE IF NOT EXISTS consensus_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),
  rank_overall INTEGER NOT NULL,
  rank_positional INTEGER,
  avg_rank REAL,
  best_rank INTEGER,
  worst_rank INTEGER,
  std_deviation REAL,
  num_sources INTEGER,
  -- Movement tracking
  rank_change_1d INTEGER DEFAULT 0,
  rank_change_7d INTEGER DEFAULT 0,
  rank_change_30d INTEGER DEFAULT 0,
  calculated_at TEXT NOT NULL,
  UNIQUE(player_id, calculated_at)
);

-- NFL Teams
CREATE TABLE IF NOT EXISTS nfl_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  abbreviation TEXT UNIQUE NOT NULL,  -- "KC", "SF", etc.
  full_name TEXT NOT NULL,
  conference TEXT,
  division TEXT,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT
);

-- News articles
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),  -- nullable if team-level
  team_id INTEGER REFERENCES nfl_teams(id),  -- nullable if player-level
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  source_url TEXT UNIQUE,
  published_at TEXT,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social media posts
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id),
  platform TEXT NOT NULL,            -- "twitter", "reddit", "youtube"
  post_id TEXT,                     -- platform-specific ID
  post_url TEXT,
  author TEXT,
  content TEXT,
  engagement_score INTEGER,
  posted_at TEXT,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, post_id)
);

-- Indexes (SQLite uses simpler syntax usually, but these work)
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_draft_year ON players(draft_year);
CREATE INDEX IF NOT EXISTS idx_players_slug ON players(slug);
CREATE INDEX IF NOT EXISTS idx_rankings_player_date ON rankings(player_id, scraped_at);

-- User defined tiers (for Drag & Drop interface)
CREATE TABLE IF NOT EXISTS user_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'user',      -- For single user MVP, default to 'user'
  tier_name TEXT NOT NULL,
  tier_color TEXT NOT NULL,         -- hex code or tailwind class
  tier_description TEXT,
  tier_order INTEGER NOT NULL,      -- 1 is top tier
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tier_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tier_id INTEGER REFERENCES user_tiers(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  player_order INTEGER NOT NULL,    -- Order within the tier
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tier_id, player_id)
);
