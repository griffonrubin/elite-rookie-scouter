import sqlite3
import os

def migrate():
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    try:
        cur.execute("ALTER TABLE players ADD COLUMN espn_college_id INTEGER")
        print("Added espn_college_id to players")
    except sqlite3.OperationalError:
        pass # Column might already exist

    try:
        cur.execute("ALTER TABLE players ADD COLUMN cfbref_id TEXT")
        print("Added cfbref_id to players")
    except sqlite3.OperationalError:
        pass 

    cur.execute('''
        CREATE TABLE IF NOT EXISTS player_transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL REFERENCES players(id),
            season INTEGER NOT NULL,
            school TEXT NOT NULL,
            conference TEXT,
            espn_school_id INTEGER,
            UNIQUE(player_id, season)
        )
    ''')
    print("Created player_transfers table")

    cur.execute('''
        CREATE TABLE IF NOT EXISTS scraper_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scraper_name TEXT NOT NULL,
            started_at DATETIME NOT NULL,
            completed_at DATETIME,
            total_players_processed INTEGER,
            total_records_upserted INTEGER,
            total_errors INTEGER,
            status TEXT CHECK(status IN ('running', 'completed', 'failed'))
        )
    ''')
    print("Created scraper_runs table")

    cur.execute('''
        CREATE TABLE IF NOT EXISTS missing_stats_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL REFERENCES players(id),
            season INTEGER,
            source_tried TEXT,
            reason TEXT,
            attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    print("Created missing_stats_log table")

    conn.commit()
    conn.close()
    print("Schema migrations completed successfully.")

if __name__ == "__main__":
    migrate()
