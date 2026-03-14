import sqlite3
conn = sqlite3.connect('dynasty_scout.db')
cur = conn.cursor()
cur.execute('PRAGMA table_info(rankings)')
print('Rankings columns:', [(r[1], r[2]) for r in cur.fetchall()])
cur.execute("SELECT sql FROM sqlite_master WHERE name='rankings'")
print('Rankings DDL:', cur.fetchone()[0])
conn.close()
