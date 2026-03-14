const Database = require('better-sqlite3');
const fs = require('fs');

try {
    const db = new Database('dynasty_scout.db');
    const schema = fs.readFileSync('sqlite_schema.sql', 'utf8');
    db.exec(schema);
    console.log("Schema applied successfully. Any missing tables (like measurables) have been created.");
} catch (e) {
    console.error("Failed to apply schema:", e.message);
}
