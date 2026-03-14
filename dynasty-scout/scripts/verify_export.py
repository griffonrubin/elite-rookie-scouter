import json
from collections import Counter

with open('lib/data/players.json') as f:
    data = json.load(f)

print(f'Total players exported: {len(data)}')
print(f'\nFirst 5 players:')
for i, p in enumerate(data[:5]):
    rank = p['consensus']['rank_overall']
    print(f"  {i+1}. {p['full_name']} ({p['position']}) - {p['nfl_team'] or 'College'} - Rank: {rank}")

print(f'\nPosition breakdown:')
positions = Counter([p['position'] for p in data])
for pos, count in positions.most_common():
    print(f'  {pos}: {count}')

print(f'\nPlayers with consensus rankings: {sum(1 for p in data if p["consensus"]["rank_overall"] != 999)}')
print(f'Players without rankings: {sum(1 for p in data if p["consensus"]["rank_overall"] == 999)}')
