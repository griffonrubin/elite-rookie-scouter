import sqlite3
import os

DB_FILE = "dynasty_scout.db"

def migrate_rankings():
    if not os.path.exists(DB_FILE):
        print(f"Database {DB_FILE} not found. Suggest running init_db.py first.")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    print("Migrating database schema...")

    # Add value/sentiment to rankings table
    try:
        cursor.execute("ALTER TABLE rankings ADD COLUMN value INTEGER")
        print("Added 'value' column to rankings table.")
    except sqlite3.OperationalError as e:
        print(f"Skipping 'value' on rankings: {e}")

    try:
        cursor.execute("ALTER TABLE rankings ADD COLUMN sentiment_score REAL")
        print("Added 'sentiment_score' column to rankings table.")
    except sqlite3.OperationalError as e:
        print(f"Skipping 'sentiment_score' on rankings: {e}")

    # Add value/sentiment to consensus_rankings table
    try:
        cursor.execute("ALTER TABLE consensus_rankings ADD COLUMN value INTEGER")
        print("Added 'value' column to consensus_rankings table.")
    except sqlite3.OperationalError as e:
        print(f"Skipping 'value' on consensus_rankings: {e}")
        
    try:
        cursor.execute("ALTER TABLE consensus_rankings ADD COLUMN sentiment_score REAL")
        print("Added 'sentiment_score' column to consensus_rankings table.")
    except sqlite3.OperationalError as e:
        print(f"Skipping 'sentiment_score' on consensus_rankings: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate_rankings()
