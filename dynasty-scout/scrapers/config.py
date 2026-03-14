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
