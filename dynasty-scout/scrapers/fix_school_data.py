"""
fix_school_data.py - Migrates school data from nfl_team column to college_career table.
Also patches players missing school data using a curated lookup dict.
"""
import sqlite3
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SchoolFix")

DB_FILE = "dynasty_scout.db"

# Curated school lookup for players that the MDDB scraper may have missed.
# These are verified 2026 draft class members with known schools as of early 2026.
KNOWN_SCHOOLS = {
    "arch-manning": "Texas",
    "quinn-ewers": "Texas",
    "nico-iamaleava": "Tennessee",
    "dante-moore": "Oregon",
    "jackson-arnold": "Oklahoma",
    "malachi-nelson": "UNLV",
    "aidan-chiles": "Michigan State",
    "dylan-raiola": "Nebraska",
    "cade-klubnik": "Clemson",
    "lanorris-sellers": "South Carolina",
    "julian-sayin": "Ohio State",
    "jaden-rashada": "Arizona State",
    "trevor-etienne": "Georgia",
    "jeremiyah-love": "Notre Dame", 
    "jeremiah-love": "Notre Dame",
    "justice-haynes": "Alabama",
    "rueben-owens": "Texas A&M",
    "emmett-johnson": "Nebraska",
    "jonah-coleman": "Washington",
    "cam-skattebo": "Arizona State",
    "jeremiah-smith": "Ohio State",
    "zachariah-branch": "USC",
    "carnell-tate": "Ohio State",
    "nyckoles-harbor": "South Carolina",
    "makai-lemon": "Ohio State",
    "tyler-warren": "Penn State",
    "colston-loveland": "Michigan",
    "mitchum-gilmore": "Notre Dame",
    "hunter-thedford": "Oklahoma",
    "max-wright": "Indiana",
}

def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Step 1: Get all 2026 players
    cur.execute("""
        SELECT p.id, p.slug, p.full_name, p.nfl_team,
               cc.id as cc_id, cc.school as cc_school
        FROM players p
        LEFT JOIN college_career cc ON p.id = cc.player_id
        WHERE p.draft_year = 2026
    """)
    players = cur.fetchall()
    logger.info(f"Processing {len(players)} players for school data migration...")
    
    migrated = 0
    patched = 0
    
    for player in players:
        player_id = player['id']
        slug = player['slug']
        school = None
        
        # Priority 1: Already has college_career record
        if player['cc_school']:
            continue  # Already good
        
        # Priority 2: Use nfl_team field (was being used as school placeholder)
        if player['nfl_team'] and player['nfl_team'] not in ['FA', 'UNK', None]:
            school = player['nfl_team']
            migrated += 1
        
        # Priority 3: Curated lookup
        if not school and slug in KNOWN_SCHOOLS:
            school = KNOWN_SCHOOLS[slug]
            patched += 1
        
        if school:
            try:
                cur.execute("""
                    INSERT INTO college_career (player_id, school, seasons, is_transfer)
                    VALUES (?, ?, '2024-2025', 0)
                    ON CONFLICT(player_id, school) DO NOTHING
                """, (player_id, school))
            except Exception as e:
                logger.error(f"Error inserting college_career for {slug}: {e}")
    
    conn.commit()
    
    # Step 2: Verify results
    cur.execute("SELECT COUNT(*) FROM college_career")
    total_cc = cur.fetchone()[0]
    
    logger.info(f"School migration complete!")
    logger.info(f"  Migrated from nfl_team: {migrated}")
    logger.info(f"  Patched via curated lookup: {patched}")
    logger.info(f"  Total college_career rows: {total_cc}")
    
    conn.close()

if __name__ == "__main__":
    run()
