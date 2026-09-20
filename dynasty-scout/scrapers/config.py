import os
import sqlite3
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")

DB_FILE = "dynasty_scout.db"

def get_db_connection():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row  # Access columns by name
        return conn
    except Exception as e:
        print(f"DB Connection Failed: {e}")
        return None

def get_db_cursor(conn):
    return conn.cursor()

# Scraper Config
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
REQUEST_DELAY = 2

# API Key Placeholder
CFBD_API_KEY = os.getenv("CFBD_API_KEY", "")


def checkpoint_and_close(conn):
    """
    Fold the write-ahead log back into the database file, then close.

    The app opens SQLite in WAL mode, so a scraper's committed writes can sit
    in dynasty_scout.db-wal rather than in dynasty_scout.db. That file is
    gitignored and the .db is tracked, so a run could commit its work, report
    success, and ship a database file that does not contain it — which is
    exactly what happened to the 2027 recruiting data: 32 players written,
    0 in the committed .db.
    """
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception as e:
        print(f"  ! could not checkpoint the WAL: {e}")
    conn.close()
