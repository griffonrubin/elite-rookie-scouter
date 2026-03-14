import sqlite3
import os

DB_FILE = "dynasty_scout.db"

def init_db():
    if os.path.exists(DB_FILE):
        print(f"Database {DB_FILE} already exists.")
        # Optional: prompt to delete/wipe? For now, we keep it.
    
    conn = sqlite3.connect(DB_FILE)
    with open("sqlite_schema.sql", "r") as f:
        schema = f.read()
    
    try:
        conn.executescript(schema)
        print("Schema applied successfully.")
    except Exception as e:
        print(f"Error applying schema: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
