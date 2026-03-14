import sqlite3

conn = sqlite3.connect('dynasty_scout.db')
cursor = conn.cursor()

# Count total 2026 players
cursor.execute('SELECT COUNT(*) FROM players WHERE draft_year = 2026')
total = cursor.fetchone()[0]
print(f'Total 2026 players: {total}')

# Count players with rankings
cursor.execute('SELECT COUNT(DISTINCT player_id) FROM rankings WHERE player_id IN (SELECT id FROM players WHERE draft_year = 2026)')
with_rankings = cursor.fetchone()[0]
print(f'2026 players with rankings: {with_rankings}')

# Count players with consensus
cursor.execute('SELECT COUNT(*) FROM players WHERE draft_year = 2026 AND consensus_rank IS NOT NULL')
with_consensus = cursor.fetchone()[0]
print(f'2026 players with consensus rank: {with_consensus}')

# Sample players
print('\nSample 2026 players:')
cursor.execute('SELECT full_name, position, nfl_team, consensus_rank FROM players WHERE draft_year = 2026 ORDER BY consensus_rank LIMIT 10')
for row in cursor.fetchall():
    print(f'  - {row[0]} ({row[1]}) - Team: {row[2]} - Rank: {row[3]}')

conn.close()
