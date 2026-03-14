import sqlite3
import json
import os
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'dynasty_scout.db')
REPORT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_quality_report.json')

def validate():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("SELECT id, full_name, position, height_inches, weight_lbs FROM players")
    players = cur.fetchall()
    
    errors = []
    warnings = []
    
    def add_err(pid, name, msg):
        errors.append({"player": name, "player_id": pid, "type": "ERROR", "message": msg})
    def add_warn(pid, name, msg):
        warnings.append({"player": name, "player_id": pid, "type": "WARNING", "message": msg})

    for p in players:
        pid = p['id']
        name = p['full_name']
        pos = p['position']
        
        # Measurables basics
        if p['height_inches'] is None and p['weight_lbs'] is None:
            add_warn(pid, name, "missing basic measurables (height/weight NULL)")
            
        cur.execute("SELECT * FROM college_stats WHERE player_id = ? ORDER BY season ASC", (pid,))
        stats = cur.fetchall()
        
        cur.execute("SELECT * FROM missing_stats_log WHERE player_id = ?", (pid,))
        logs = cur.fetchall()
        
        has_2025_stat = any(s['season'] == 2025 for s in stats)
        has_2025_log = any('2025' in str(l['reason']) or 'No ESPN ID' in str(l['reason']) or 'API returned 404' in str(l['reason']) for l in logs)
        
        # 1. 2025 Season Checks
        if not has_2025_stat:
            if not has_2025_log:
                # If they have no 2025 stats and no log documenting it -> ERROR
                add_err(pid, name, "Missing 2025 season — unexplained (No DB row, no log)")
            else:
                add_warn(pid, name, f"Missing 2025 — reason: [logged failure]")
        
        seasons = [s['season'] for s in stats]
        
        # 2. Season Continuity
        if seasons:
            if max(seasons) < 2025:
                add_warn(pid, name, "Only pre-2025 data present")
                
            for i in range(len(seasons) - 1):
                if seasons[i+1] - seasons[i] > 1:
                    add_warn(pid, name, f"Season gap — possible missing redshirt year or scraper miss ({seasons[i]} to {seasons[i+1]})")
                    
        for s in stats:
            yr = s['season']
            if yr == 2025 and (s['games_played'] is None or s['games_played'] == 0):
                add_warn(pid, name, "2025 row exists but shows 0 games")
                
            # 3. Data Integrity
            if s['rush_yards'] and s['rush_yards'] > 0 and (s['rush_attempts'] is None or s['rush_attempts'] == 0):
                add_err(pid, name, f"rush_yards > 0 but rush_attempts = 0 in {yr}")
            if s['rec_yards'] and s['rec_yards'] > 0 and (s['receptions'] is None or s['receptions'] == 0):
                add_err(pid, name, f"rec_yards > 0 but receptions = 0 in {yr}")
                
            for col in ['games_played', 'pass_attempts', 'completions', 'pass_yards', 'pass_tds', 'interceptions', 'rush_attempts', 'rush_yards', 'rush_tds', 'receptions', 'rec_yards', 'rec_tds']:
                if s[col] is not None and s[col] < 0:
                    add_err(pid, name, f"Negative value in {col} for {yr}")
                    
            if pos == 'RB' and s['rush_attempts'] and s['rush_attempts'] >= 10:
                ypc = s['rush_yards'] / s['rush_attempts']
                if ypc < 1.5 or ypc > 14.0:
                    add_warn(pid, name, f"RB YPC outlier: {ypc:.1f} in {yr}")
            
            if pos in ['WR', 'TE'] and s['receptions'] and s['receptions'] >= 10:
                ypr = s['rec_yards'] / s['receptions']
                if ypr < 3.0 or ypr > 35.0:
                    add_warn(pid, name, f"WR/TE YPR outlier: {ypr:.1f} in {yr}")
                    
            if pos == 'QB' and s['pass_attempts'] and s['pass_attempts'] >= 20:
                cmp = (s['completions'] / s['pass_attempts']) * 100
                if cmp < 30.0 or cmp > 82.0:
                    add_warn(pid, name, f"QB CMP% outlier: {cmp:.1f}% in {yr}")

        # 4. Transfer validation
        cur.execute("SELECT season, school FROM player_transfers WHERE player_id = ?", (pid,))
        transfers = {row['season']: row['school'] for row in cur.fetchall()}
        
        distinct_schools = set()
        for s in stats:
            yr = s['season']
            sch = s['school']
            distinct_schools.add(sch)
            
            t_sch = transfers.get(yr)
            if t_sch and t_sch != sch:
                add_err(pid, name, f"school mismatch: stats={sch}, transfers={t_sch} in {yr}")
                
        if len(distinct_schools) >= 2 and len(transfers) == 0:
            add_err(pid, name, "2+ distinct schools in stats but no player_transfers rows")
            
        # 5. Combine validation
        cur.execute("SELECT combine_status, forty_yard, forty_disputed FROM measurables WHERE player_id = ?", (pid,))
        meas = cur.fetchone()
        
        if not meas or not meas['combine_status']:
            add_err(pid, name, "combine_status not set — scraper did not classify this player")
        else:
            status = meas['combine_status']
            forty = meas['forty_yard']
            disputed = meas['forty_disputed']
            
            if status == 'measured' and forty is None:
                add_warn(pid, name, "Player flagged as measured but 40 time is missing")
            if forty is not None and status not in ['measured', 'pro_day_only']: # Modified slightly to make sense logically as they have data
                add_err(pid, name, "Combine data exists but status not set to measured or pro_day_only")
                
            if forty is not None:
                is_warn = False
                msg = ""
                if forty < 4.20:
                    is_warn = True; msg = "40 time below physically plausible threshold — verify source"
                elif forty > 5.50:
                    is_warn = True; msg = "40 time above expected range for drafted athletes — verify source"
                elif pos == 'RB' and forty < 4.25:
                    is_warn = True; msg = "Unusually fast for RB — cross-check source"
                elif pos == 'WR' and forty > 4.70:
                    is_warn = True; msg = "Unusually slow for WR — cross-check source"
                
                if is_warn:
                    if not disputed:
                        add_err(pid, name, f"{msg} (Escalated to ERROR: forty_disputed is FALSE)")
                    else:
                        add_warn(pid, name, msg)
                        
    # --- Top 50 Strict Validation Checks ---
    cur.execute("SELECT p.id, p.full_name as name FROM players p JOIN consensus_rankings cr ON cr.player_id = p.id WHERE cr.rank_overall <= 50")
    top_50 = cur.fetchall()
    
    # Check 1: Top 50 players must have college stats
    for player in top_50:
        cur.execute("SELECT COUNT(*) FROM college_stats WHERE player_id = ?", (player['id'],))
        count = cur.fetchone()[0]
        if count == 0:
            add_err(player['id'], player['name'], "Top-50 player has zero college stats rows")

    # Check 2: Top 50 players must have at least height and weight
    for player in top_50:
        cur.execute("SELECT height_inches, weight_lbs FROM players WHERE id = ?", (player['id'],))
        m = cur.fetchone()
        if not m or (m['height_inches'] is None and m['weight_lbs'] is None):
            add_err(player['id'], player['name'], "Top-50 player missing all measurables")

    # Final output
    report = {
        "errors_count": len(errors),
        "warnings_count": len(warnings),
        "errors": errors,
        "warnings": warnings
    }
    
    with open(REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)
        
    print(f"\n--- Validation Complete ---")
    print(f"Errors found: {len(errors)}")
    print(f"Warnings found: {len(warnings)}")
    print(f"Full report written to data_quality_report.json")
    
    if len(errors) > 0:
        print("\n[!] Validation Failed: Crucial data errors must be resolved before deployment.")
        for err in errors[:10]:
            print(f"  ERROR -> {err['player']}: {err['message']}")
        if len(errors) > 10:
            print(f"  ...and {len(errors)-10} more. See JSON report.")
        sys.exit(1)
    else:
        print("\n[✓] Validation Passed: No blocking errors found.")
        sys.exit(0)

if __name__ == "__main__":
    validate()
