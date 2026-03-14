import sqlite3
conn = sqlite3.connect('dynasty_scout.db')
c = conn.cursor()
c.execute("PRAGMA table_info(measurables)")
for r in c.fetchall():
    print(r)
conn.close()
