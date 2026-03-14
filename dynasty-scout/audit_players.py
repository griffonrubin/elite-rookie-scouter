"""
audit_players.py - Audits the current DB player list to identify wrong/stale players.
Prints all players with their slug and current data so we can identify who should be removed.
"""
import sqlite3

DB_FILE = "dynasty_scout.db"

conn = sqlite3.connect(DB_FILE)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("""
    SELECT p.slug, p.full_name, p.position,
           COALESCE(cc.school, p.nfl_team) as school,
           p.age_at_draft,
           cr.rank_overall as consensus_rank,
           (SELECT COUNT(*) FROM news WHERE player_id = p.id) as news_count,
           (SELECT COUNT(*) FROM rankings WHERE player_id = p.id) as ranking_count
    FROM players p
    LEFT JOIN college_career cc ON p.id = cc.player_id
    LEFT JOIN consensus_rankings cr ON p.id = cr.player_id
        AND cr.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings WHERE player_id = p.id)
    WHERE p.draft_year = 2026
    ORDER BY COALESCE(cr.rank_overall, 9999) ASC, p.full_name ASC
""")
players = cur.fetchall()

print(f"Total players in 2026 class: {len(players)}")
print()
print(f"{'RANK':<6} {'NAME':<30} {'POS':<5} {'SCHOOL':<25} {'AGE':<6} {'NEWS':<5} {'RANK_SRC'}")
print("-" * 95)
for p in players:
    rank = p['consensus_rank'] or '???'
    news = p['news_count'] or 0
    rsrc = p['ranking_count'] or 0
    print(f"{str(rank):<6} {p['full_name']:<30} {p['position']:<5} {str(p['school'] or ''):<25} {str(p['age_at_draft'] or ''):<6} {news:<5} {rsrc}")

conn.close()
