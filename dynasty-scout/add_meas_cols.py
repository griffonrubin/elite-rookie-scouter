import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'dynasty_scout.db')
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

queries = [
    "ALTER TABLE measurables ADD COLUMN ten_yard_split REAL",
    "ALTER TABLE measurables ADD COLUMN is_pro_day BOOLEAN DEFAULT FALSE",
    "ALTER TABLE measurables ADD COLUMN data_source TEXT",
    "ALTER TABLE measurables ADD COLUMN forty_disputed BOOLEAN DEFAULT FALSE",
    # We already have bench_press and twenty_yard_shuttle and combine_status from previous steps, but let's try just in case:
]

for q in queries:
    try:
        cur.execute(q)
        print("Success:", q)
    except Exception as e:
        print("Skipped:", e)

conn.commit()
conn.close()
