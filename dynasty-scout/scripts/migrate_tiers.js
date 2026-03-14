const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'dynasty_scout.db');
const db = new Database(dbPath);

console.log('Running migration for Tier System...');

try {
    // Create user_tiers table
    db.prepare(`
    CREATE TABLE IF NOT EXISTS user_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'user',
      tier_name TEXT NOT NULL,
      tier_color TEXT NOT NULL,
      tier_description TEXT,
      tier_order INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).run();
    console.log('Created user_tiers table.');

    // Create tier_players table
    db.prepare(`
    CREATE TABLE IF NOT EXISTS tier_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier_id INTEGER REFERENCES user_tiers(id) ON DELETE CASCADE,
      player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
      player_order INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tier_id, player_id)
    );
  `).run();
    console.log('Created tier_players table.');

    // Seed default tiers if empty
    const tierCount = db.prepare('SELECT count(*) as count FROM user_tiers').get().count;
    if (tierCount === 0) {
        console.log('Seeding default tiers...');
        const insertTier = db.prepare('INSERT INTO user_tiers (tier_name, tier_color, tier_order) VALUES (?, ?, ?)');
        insertTier.run('Tier 1: The Elite', 'bg-purple-500', 1);
        insertTier.run('Tier 2: Startups', 'bg-blue-500', 2);
        insertTier.run('Tier 3: Solid Value', 'bg-green-500', 3);
        insertTier.run('Tier 4: Upside Fliers', 'bg-yellow-500', 4);
        insertTier.run('Tier 5: Roster Cloggers', 'bg-red-500', 5);
    }

    console.log('Migration completed successfully.');
} catch (error) {
    console.error('Migration failed:', error);
}
