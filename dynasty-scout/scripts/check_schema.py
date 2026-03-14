import sqlite3, os
db = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')
conn = sqlite3.connect(db)
cur = conn.cursor()
cur.execute("PRAGMA table_info(college_stats)")
cols = cur.fetchall()
print("college_stats columns:")
for c in cols:
    print(f"  {c[1]} ({c[2]})")
conn.close()
