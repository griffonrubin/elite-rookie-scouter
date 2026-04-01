# Dynasty Trades Feature

This feature shows recent dynasty trades from your Sleeper leagues directly on each player's profile.

## Setup

### 1. Add Your Sleeper Leagues
Visit `/settings/leagues` in the app and add your Sleeper league IDs. You can find your league ID in the Sleeper app URL:
- `sleeper.app/leagues/{league-id}`

Alternatively, use the CLI to add leagues:
```bash
python scrapers/trades_sleeper.py --add-league 123456789 987654321
python scrapers/trades_sleeper.py --add-user your_sleeper_username
```

### 2. Populate Trade Data
Once leagues are added to the database, run the scraper to fetch trade data:
```bash
cd dynasty-scout
python scrapers/trades_sleeper.py
```

The scraper will:
- Fetch all transactions from your leagues
- Identify trades involving 2026 draft prospects
- Store them in the `trades` table
- Match Sleeper player IDs to app player IDs

### 3. View Trades on Player Profiles
Navigate to any player's profile. If they have recent trades, you'll see a "Dynasty Trades" section showing:
- **SOLD** badges (red) for trades where the player was sent away
- **BOUGHT** badges (green) for trades where the player was acquired
- Counterpart player names and draft pick details
- League name and roster count
- Relative date (e.g., "3 days ago")

## Data Model

### sleeper_leagues table
- `league_id` (TEXT, PK) - Unique Sleeper league ID
- `league_name` (TEXT) - League name from Sleeper
- `season` (INTEGER) - League season
- `roster_count` (INTEGER) - Number of teams in league
- `source` (TEXT) - How league was added ('user_add', 'cli', etc.)
- `last_scraped_at` (TIMESTAMP) - Last time scraper ran

### trades table
- `id` (TEXT, PK) - Unique trade transaction ID
- `league_id` (FK) - Link to sleeper_leagues
- `transaction_date` (DATETIME) - When trade occurred
- `player_a_id` (INTEGER, FK) - One player in the trade (our DB player ID)
- `player_b_id` (INTEGER, FK) - Other player in the trade (optional)
- `side` ('sent' | 'received') - Whether we sent or received player_a
- `counterpart_player_ids` (JSON) - IDs of players we got in return
- `picks_sent` (JSON) - Draft picks we sent (format: [{season, round}, ...])
- `picks_received` (JSON) - Draft picks we received
- `raw_adds` (JSON) - Raw transaction data
- `raw_drops` (JSON) - Raw transaction data
- `scraped_at` (TIMESTAMP) - When record was scraped

## API Endpoints

### GET /api/leagues
Fetch all configured Sleeper leagues.
```json
{
  "leagues": [
    {"league_id": "123456789", "league_name": "Elite Rookies"}
  ]
}
```

### POST /api/leagues
Add a new league by ID. Fetches league details from Sleeper API.
```json
{
  "league_id": "123456789"
}
```

### DELETE /api/leagues
Remove a league from the database.
```json
{
  "league_id": "123456789"
}
```

### GET /api/trades/[slug]
Fetch recent trades for a player.
```json
{
  "player": {"id": 123, "full_name": "Example Player", "position": "WR"},
  "trades": [
    {
      "id": "trade_123",
      "date": "2026-03-15T10:00:00Z",
      "side": "sent",
      "picks_sent": [{"season": 2026, "round": 2}],
      "picks_received": [{"season": 2027, "round": 1}],
      "counterpart_players": [{"name": "Player B", "position": "RB"}],
      "league_name": "Elite Rookies",
      "roster_count": 12
    }
  ]
}
```

## Scraper CLI

Run the scraper from the dynasty-scout directory:

```bash
# Scrape all configured leagues
python scrapers/trades_sleeper.py

# Add specific league(s) and scrape
python scrapers/trades_sleeper.py --add-league 123456789

# Add multiple leagues
python scrapers/trades_sleeper.py --add-league 123456789 987654321

# Add all leagues for a Sleeper user
python scrapers/trades_sleeper.py --add-user your_username
```

## Troubleshooting

**"No leagues in DB"** - Run the scraper with `--add-league` or add leagues via the UI.

**"No trades showing"** - Trades are only stored for 2026 draft prospects. Make sure your league has active trades.

**Rate limiting (429 errors)** - The scraper will retry automatically. If it persists, wait a few minutes and try again.

**Sleeper API errors (401/403)** - The Sleeper API is public. Add your league ID via the UI or CLI to fetch it.
