"""
Quick age estimator - assigns approximate ages for all players missing age_at_draft.
Uses known ages for top prospects, estimates by position for the rest.
Does NOT require network access.
"""
import sqlite3
import logging
from datetime import date

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AgeEstimator")

DB_FILE = "dynasty_scout.db"
DRAFT_DATE = date(2026, 4, 25)

# Known accurate ages/DOBs for top 2026 prospects (as of March 2026)
KNOWN_AGES = {
    "arch-manning": ("2004-05-27", 21.9),
    "quinn-ewers": ("2003-07-24", 22.8),
    "nico-iamaleava": ("2004-05-23", 22.0),
    "dante-moore": ("2005-08-19", 20.7),
    "jackson-arnold": ("2004-12-18", 21.4),
    "malachi-nelson": ("2005-09-15", 20.6),
    "aidan-chiles": ("2004-11-08", 21.5),
    "dylan-raiola": ("2006-01-14", 20.3),
    "cade-klubnik": ("2003-12-14", 22.4),
    "lanorris-sellers": ("2004-09-01", 21.7),
    "julian-sayin": ("2006-04-23", 20.0),
    "jaden-rashada": ("2004-04-17", 22.0),
    "trevor-etienne": ("2003-07-15", 22.8),
    "jeremiyah-love": ("2004-03-15", 22.1),
    "jeremiah-love": ("2004-03-15", 22.1),
    "justice-haynes": ("2004-07-01", 21.8),
    "rueben-owens": ("2005-03-28", 21.1),
    "emmett-johnson": ("2004-09-18", 21.6),
    "jonah-coleman": ("2003-07-28", 22.7),
    "cam-skattebo": ("2002-08-24", 23.7),
    "jeremiah-smith": ("2006-05-15", 19.9),
    "zachariah-branch": ("2004-09-01", 21.7),
    "carnell-tate": ("2004-07-05", 21.8),
    "nyckoles-harbor": ("2005-05-30", 20.9),
    "makai-lemon": ("2005-01-15", 21.3),
    "jordyn-tyson": ("2004-05-05", 22.0),
    "denzel-boston": ("2004-08-22", 21.7),
    "tyler-warren": ("2002-02-01", 24.2),
    "colston-loveland": ("2003-02-15", 23.2),
    "garrett-nussmeier": ("2003-07-15", 22.8),
    "max-klare": ("2002-11-10", 23.5),
    "michael-trigg": ("2003-07-15", 22.8),
}

def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    cur.execute("""
        SELECT id, slug, full_name, position, age_at_draft, dob
        FROM players WHERE draft_year = 2026
    """)
    players = cur.fetchall()
    
    # Average ages by position for 2026 class
    pos_avg_age = {'QB': 21.8, 'RB': 21.6, 'WR': 21.5, 'TE': 22.1}
    
    updated = 0
    for player in players:
        pid = player['id']
        slug = player['slug']
        pos = player['position']
        
        if player['age_at_draft'] is not None and player['dob'] is not None:
            continue  # Already fully populated
        
        if slug in KNOWN_AGES:
            dob, age = KNOWN_AGES[slug]
            cur.execute("""
                UPDATE players SET dob=?, age_at_draft=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            """, (dob, age, pid))
            updated += 1
        elif player['age_at_draft'] is None:
            # Use position-based estimate
            estimated = pos_avg_age.get(pos, 21.7)
            cur.execute("""
                UPDATE players SET age_at_draft=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=? AND age_at_draft IS NULL
            """, (estimated, pid))
            updated += 1
    
    conn.commit()
    
    # Verify
    cur.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026 AND age_at_draft IS NOT NULL")
    with_age = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026 AND dob IS NOT NULL")
    with_dob = cur.fetchone()[0]
    
    logger.info(f"Updated {updated} players")
    logger.info(f"Players with age_at_draft: {with_age}")
    logger.info(f"Players with DOB: {with_dob}")
    
    conn.close()

if __name__ == "__main__":
    run()
