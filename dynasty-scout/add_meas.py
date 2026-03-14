import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'dynasty_scout.db')
conn = sqlite3.connect(DB_PATH)
try:
    conn.execute('ALTER TABLE measurables ADD COLUMN combine_status TEXT DEFAULT "pending"')
    print("Added combine_status")
except sqlite3.OperationalError:
    print("Column already exists")
conn.commit()
conn.close()
