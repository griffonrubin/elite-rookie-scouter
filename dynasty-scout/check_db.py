import sqlite3
conn = sqlite3.connect('dynasty_scout.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute('SELECT COUNT(*) as n FROM players')
print('Total players:', cur.fetchone()[0])

cur.execute("SELECT COUNT(*) as n FROM players WHERE full_name = '' OR full_name IS NULL")
print('Missing names:', cur.fetchone()[0])

cur.execute("SELECT COUNT(*) as n FROM players WHERE dob IS NOT NULL AND dob != ''")
print('With DOB:', cur.fetchone()[0])

cur.execute("SELECT COUNT(*) as n FROM players WHERE age_at_draft IS NOT NULL")
print('With age_at_draft:', cur.fetchone()[0])

cur.execute('SELECT COUNT(*) as n FROM consensus_rankings')
print('Consensus rankings rows:', cur.fetchone()[0])

cur.execute("SELECT COUNT(*) as n FROM consensus_rankings WHERE rank_overall >= 999")
print('With rank 999:', cur.fetchone()[0])

cur.execute('SELECT COUNT(DISTINCT player_id) as n FROM college_stats')
print('Players with stats:', cur.fetchone()[0])

cur.execute('SELECT COUNT(DISTINCT player_id) as n FROM news')
print('Players with news:', cur.fetchone()[0])

cur.execute('SELECT COUNT(*) as n FROM rankings')
print('Rankings rows:', cur.fetchone()[0])

cur.execute('SELECT DISTINCT source FROM rankings')
print('Ranking sources:', [r[0] for r in cur.fetchall()])

cur.execute('SELECT full_name, position, nfl_team as school, dob, age_at_draft FROM players WHERE draft_year=2026 LIMIT 15')
rows = cur.fetchall()
print('\nSample players:')
for r in rows:
    print(' ', dict(r))

conn.close()
