import sqlite3
c = sqlite3.connect('dynasty_scout.db')
rows = c.execute('SELECT r.rank_overall, p.full_name, p.id FROM consensus_rankings r JOIN players p ON p.id = r.player_id ORDER BY r.rank_overall ASC LIMIT 10').fetchall()
for r in rows:
    ktc = c.execute("SELECT rank_overall FROM rankings WHERE player_id=? AND source='KeepTradeCut'", (r[2],)).fetchone()
    fp = c.execute("SELECT rank_overall FROM rankings WHERE player_id=? AND source='FantasyPros'", (r[2],)).fetchone()
    print(f"{r[0]} {r[1]} (KTC: {ktc[0] if ktc else 'None'}, FP: {fp[0] if fp else 'None'})")
