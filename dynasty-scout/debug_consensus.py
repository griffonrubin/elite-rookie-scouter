import sqlite3
conn = sqlite3.connect('dynasty_scout.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT slug, id FROM players WHERE slug LIKE '%jeremiyah%' LIMIT 1")
p = cur.fetchone()
if p:
    print(f'Player: {p["slug"]} id={p["id"]}')
    cur.execute("SELECT * FROM consensus_rankings WHERE player_id=? ORDER BY calculated_at DESC LIMIT 3", (p['id'],))
    rows = cur.fetchall()
    if rows:
        for r in rows:
            print(dict(r))
    else:
        print("NO consensus_rankings rows found!")
else:
    print('Player not found')

cur.execute("SELECT COUNT(*), MIN(rank_overall), MAX(rank_overall) FROM consensus_rankings")
row = cur.fetchone()
print(f"Consensus totals: count={row[0]}, min={row[1]}, max={row[2]}")

# Also verify the player page query works
cur.execute("""
    SELECT p.full_name, cr.rank_overall, cr.calculated_at
    FROM players p
    LEFT JOIN consensus_rankings cr ON p.id = cr.player_id
        AND cr.calculated_at = (
            SELECT MAX(calculated_at) FROM consensus_rankings cr2
            WHERE cr2.player_id = p.id
        )
    WHERE p.slug LIKE '%jeremiyah%'
""")
print("\nPlayer page query result:", dict(cur.fetchone() or {}))

conn.close()
