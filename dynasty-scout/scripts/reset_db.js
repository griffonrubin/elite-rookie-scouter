const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'dynasty_scout.db');
const db = new Database(dbPath);

console.log('Resetting database...');

try {
    // Disable foreign keys temporarily to allow deletion
    db.pragma('foreign_keys = OFF');

    // Delete in reverse dependency order
    console.log('Deleting tier_players...');
    db.prepare('DELETE FROM tier_players').run();

    console.log('Deleting consensus_rankings...');
    db.prepare('DELETE FROM consensus_rankings').run();

    console.log('Deleting rankings...');
    db.prepare('DELETE FROM rankings').run();

    console.log('Deleting players...');
    db.prepare('DELETE FROM players').run();

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    console.log('Database reset complete.');
} catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
}
