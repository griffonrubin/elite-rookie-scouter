import sqlite3

conn = sqlite3.connect('dynasty_scout.db')
cur = conn.cursor()

def get_pid(slug):
    cur.execute('SELECT id FROM players WHERE slug = ?', (slug,))
    res = cur.fetchone()
    return res[0] if res else None

# KC Concepcion Update
pid = get_pid('kc-concepcion')
if pid:
    cur.execute('DELETE FROM college_stats WHERE player_id = ?', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, receptions, rec_yards, rec_tds, rush_attempts, rush_yards, rush_tds) VALUES (?, 2023, "NC State", 12, 71, 839, 10, 0, 320, 0)', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, receptions, rec_yards, rec_tds, rush_attempts, rush_yards, rush_tds) VALUES (?, 2024, "NC State", 12, 53, 460, 6, 0, 0, 0)', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, receptions, rec_yards, rec_tds, rush_attempts, rush_yards, rush_tds) VALUES (?, 2025, "Texas A&M", 13, 61, 919, 9, 0, 0, 0)', (pid,))
    cur.execute('UPDATE college_career SET school = "Texas A&M" WHERE player_id = ?', (pid,))
    print('KC Concepcion updated.')

# Carnell Tate Update
pid = get_pid('carnell-tate')
if pid:
    cur.execute('DELETE FROM college_stats WHERE player_id = ?', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, receptions, rec_yards, rec_tds) VALUES (?, 2023, "Ohio State", 13, 18, 264, 1)', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, receptions, rec_yards, rec_tds) VALUES (?, 2024, "Ohio State", 15, 52, 733, 4)', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, receptions, rec_yards, rec_tds) VALUES (?, 2025, "Ohio State", 13, 51, 875, 9)', (pid,))
    print('Carnell Tate updated.')

# Emmett Johnson Update
pid = get_pid('emmett-johnson')
if pid:
    cur.execute('DELETE FROM college_stats WHERE player_id = ?', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, rush_attempts, rush_yards, rush_tds, receptions, rec_yards, rec_tds) VALUES (?, 2022, "Nebraska", 13, 62, 465, 6, 14, 141, 1)', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, rush_attempts, rush_yards, rush_tds, receptions, rec_yards, rec_tds) VALUES (?, 2023, "Nebraska", 12, 90, 411, 2, 7, 46, 0)', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, rush_attempts, rush_yards, rush_tds, receptions, rec_yards, rec_tds) VALUES (?, 2024, "Nebraska", 13, 117, 598, 0, 39, 286, 2)', (pid,))
    cur.execute('INSERT INTO college_stats (player_id, season, school, games_played, rush_attempts, rush_yards, rush_tds, receptions, rec_yards, rec_tds) VALUES (?, 2025, "Nebraska", 12, 251, 1451, 12, 46, 370, 3)', (pid,))
    cur.execute('UPDATE college_career SET school = "Nebraska" WHERE player_id = ?', (pid,))
    # Update measurables for Emmett Johnson (5'11" -> 71 inches, 200 lb)
    cur.execute('UPDATE players SET height_inches = 71, weight_lbs = 200 WHERE id = ?', (pid,))
    print('Emmett Johnson updated.')

# Duplicate Merge
def merge_players(slug_keep, slug_remove):
    pid_keep = get_pid(slug_keep)
    pid_remove = get_pid(slug_remove)
    
    if not pid_keep or not pid_remove:
        print(f"Merge failed: Could not find one or both slugs ({slug_keep}, {slug_remove})")
        return
        
    print(f"Merging {slug_remove} ({pid_remove}) into {slug_keep} ({pid_keep})")
    
    # 1. Update foreign keys with OR IGNORE to handle duplicates
    cur.execute("UPDATE OR IGNORE rankings SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
    cur.execute("UPDATE OR IGNORE consensus_rankings SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
    cur.execute("UPDATE OR IGNORE college_stats SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
    cur.execute("UPDATE OR IGNORE college_career SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
    cur.execute("UPDATE OR IGNORE measurables SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
    cur.execute("UPDATE OR IGNORE news SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
    
    # 2. Delete leftover straggler rows that hit the ignore constraint
    cur.execute("DELETE FROM rankings WHERE player_id = ?", (pid_remove,))
    cur.execute("DELETE FROM consensus_rankings WHERE player_id = ?", (pid_remove,))
    cur.execute("DELETE FROM college_stats WHERE player_id = ?", (pid_remove,))
    cur.execute("DELETE FROM college_career WHERE player_id = ?", (pid_remove,))
    cur.execute("DELETE FROM measurables WHERE player_id = ?", (pid_remove,))
    cur.execute("DELETE FROM news WHERE player_id = ?", (pid_remove,))
    
    # 3. Delete the old record
    cur.execute("DELETE FROM players WHERE id = ?", (pid_remove,))
    print(f"Successfully merged {slug_remove} into {slug_keep}")

merge_players('kevin-coleman-jr', 'kevin-coleman')

# For Mike Washington Jr., we need to find the ID with the measurables.
cur.execute("SELECT id FROM players WHERE full_name = 'Mike Washington Jr.'")
mw_ids = [r[0] for r in cur.fetchall()]
if len(mw_ids) == 2:
    # Check which one has measurables
    cur.execute("SELECT player_id FROM measurables WHERE player_id IN (?, ?)", (mw_ids[0], mw_ids[1]))
    has_meas_id = cur.fetchone()
    if has_meas_id:
        pid_keep = has_meas_id[0]
        pid_remove = mw_ids[0] if mw_ids[1] == pid_keep else mw_ids[1]
        
        print(f"Merging Mike Washington Jr. ({pid_remove}) into ({pid_keep})")
        
        # 1. Update foreign keys with OR IGNORE
        cur.execute("UPDATE OR IGNORE rankings SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
        cur.execute("UPDATE OR IGNORE consensus_rankings SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
        cur.execute("UPDATE OR IGNORE college_stats SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
        cur.execute("UPDATE OR IGNORE college_career SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
        cur.execute("UPDATE OR IGNORE measurables SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
        cur.execute("UPDATE OR IGNORE news SET player_id = ? WHERE player_id = ?", (pid_keep, pid_remove))
        
        # 2. Delete leftovers
        cur.execute("DELETE FROM rankings WHERE player_id = ?", (pid_remove,))
        cur.execute("DELETE FROM consensus_rankings WHERE player_id = ?", (pid_remove,))
        cur.execute("DELETE FROM college_stats WHERE player_id = ?", (pid_remove,))
        cur.execute("DELETE FROM college_career WHERE player_id = ?", (pid_remove,))
        cur.execute("DELETE FROM measurables WHERE player_id = ?", (pid_remove,))
        cur.execute("DELETE FROM news WHERE player_id = ?", (pid_remove,))
        
        # 3. Delete the old record
        cur.execute("DELETE FROM players WHERE id = ?", (pid_remove,))
        print(f"Successfully merged Mike Washington Jr.")

conn.commit()
conn.close()
