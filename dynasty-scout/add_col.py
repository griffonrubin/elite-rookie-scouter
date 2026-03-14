import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'dynasty_scout.db')
conn = sqlite3.connect(DB_PATH)
try:
    conn.execute('ALTER TABLE college_stats ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP')
    print("Added updated_at")
except sqlite3.OperationalError:
    print("Column already exists")
conn.commit()
conn.close()
