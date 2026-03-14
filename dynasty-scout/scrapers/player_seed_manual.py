from scrapers import config
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ManualSeeder")

# Top 60 Consensus 2026 Prospects (Estimated)
PROSPECTS = [
    # QBs
    {"slug": "quinn-ewers", "full_name": "Quinn Ewers", "first_name": "Quinn", "last_name": "Ewers", "position": "QB", "team": "Texas", "headshot_url": ""},
    {"slug": "nico-iamaleava", "full_name": "Nico Iamaleava", "first_name": "Nico", "last_name": "Iamaleava", "position": "QB", "team": "Tennessee", "headshot_url": ""},
    {"slug": "dante-moore", "full_name": "Dante Moore", "first_name": "Dante", "last_name": "Moore", "position": "QB", "team": "Oregon", "headshot_url": ""},
    {"slug": "jackson-arnold", "full_name": "Jackson Arnold", "first_name": "Jackson", "last_name": "Arnold", "position": "QB", "team": "Oklahoma", "headshot_url": ""},
    {"slug": "malachi-nelson", "full_name": "Malachi Nelson", "first_name": "Malachi", "last_name": "Nelson", "position": "QB", "team": "Boise St", "headshot_url": ""},
    {"slug": "aidan-chiles", "full_name": "Aidan Chiles", "first_name": "Aidan", "last_name": "Chiles", "position": "QB", "team": "Michigan State", "headshot_url": ""},
    {"slug": "jaden-rashada", "full_name": "Jaden Rashada", "first_name": "Jaden", "last_name": "Rashada", "position": "QB", "team": "Georgia", "headshot_url": ""},
    {"slug": "lanorris-sellers", "full_name": "LaNorris Sellers", "first_name": "LaNorris", "last_name": "Sellers", "position": "QB", "team": "South Carolina", "headshot_url": ""},
    {"slug": "dylan-raiola", "full_name": "Dylan Raiola", "first_name": "Dylan", "last_name": "Raiola", "position": "QB", "team": "Nebraska", "headshot_url": ""},
    {"slug": "julian-sayin", "full_name": "Julian Sayin", "first_name": "Julian", "last_name": "Sayin", "position": "QB", "team": "Ohio State", "headshot_url": ""},
    
    # RBs
    {"slug": "jeremiyah-love", "full_name": "Jeremiyah Love", "first_name": "Jeremiyah", "last_name": "Love", "position": "RB", "team": "Notre Dame", "headshot_url": ""},
    {"slug": "emmett-johnson", "full_name": "Emmett Johnson", "first_name": "Emmett", "last_name": "Johnson", "position": "RB", "team": "Nebraska", "headshot_url": ""},
    {"slug": "jonah-coleman", "full_name": "Jonah Coleman", "first_name": "Jonah", "last_name": "Coleman", "position": "RB", "team": "Washington", "headshot_url": ""},
    {"slug": "seth-mcgowan", "full_name": "Seth McGowan", "first_name": "Seth", "last_name": "McGowan", "position": "RB", "team": "Kentucky", "headshot_url": ""},
    
    # WRs
    {"slug": "jordyn-tyson", "full_name": "Jordyn Tyson", "first_name": "Jordyn", "last_name": "Tyson", "position": "WR", "team": "Arizona State", "headshot_url": ""},
    {"slug": "carnell-tate", "full_name": "Carnell Tate", "first_name": "Carnell", "last_name": "Tate", "position": "WR", "team": "Ohio State", "headshot_url": ""},
    {"slug": "makai-lemon", "full_name": "Makai Lemon", "first_name": "Makai", "last_name": "Lemon", "position": "WR", "team": "Ohio State", "headshot_url": ""},
    
    # TEs
    {"slug": "tyler-warren", "full_name": "Tyler Warren", "first_name": "Tyler", "last_name": "Warren", "position": "TE", "team": "Penn State", "headshot_url": ""},
    {"slug": "colston-loveland", "full_name": "Colston Loveland", "first_name": "Colston", "last_name": "Loveland", "position": "TE", "team": "Michigan", "headshot_url": ""},
    
    # OL
    {"slug": "francis-mauigoa", "full_name": "Francis Mauigoa", "first_name": "Francis", "last_name": "Mauigoa", "position": "OT", "team": "Miami", "headshot_url": ""},
    {"slug": "chase-bisontis", "full_name": "Chase Bisontis", "first_name": "Chase", "last_name": "Bisontis", "position": "OG", "team": "Texas A&M", "headshot_url": ""},
    {"slug": "armaj-reed-adams", "full_name": "Ar'maj Reed-Adams", "first_name": "Ar'maj", "last_name": "Reed-Adams", "position": "OG", "team": "Texas A&M", "headshot_url": ""},
    {"slug": "connor-lew", "full_name": "Connor Lew", "first_name": "Connor", "last_name": "Lew", "position": "C", "team": "USC", "headshot_url": ""},
    
    # EDGE/DL
    {"slug": "rueben-bain-jr", "full_name": "Rueben Bain Jr.", "first_name": "Rueben", "last_name": "Bain", "position": "EDGE", "team": "Miami", "headshot_url": ""},
    {"slug": "david-bailey", "full_name": "David Bailey", "first_name": "David", "last_name": "Bailey", "position": "EDGE", "team": "Texas Tech", "headshot_url": ""},
    {"slug": "mykel-williams", "full_name": "Mykel Williams", "first_name": "Mykel", "last_name": "Williams", "position": "EDGE", "team": "Georgia", "headshot_url": ""},
    
    # LBs
    {"slug": "arvell-reese", "full_name": "Arvell Reese", "first_name": "Arvell", "last_name": "Reese", "position": "LB", "team": "Ohio State", "headshot_url": ""},
    {"slug": "sonny-styles", "full_name": "Sonny Styles", "first_name": "Sonny", "last_name": "Styles", "position": "LB", "team": "Ohio State", "headshot_url": ""},
    {"slug": "cj-allen", "full_name": "CJ Allen", "first_name": "CJ", "last_name": "Allen", "position": "LB", "team": "Georgia", "headshot_url": ""},
    
    # DBs
    {"slug": "caleb-downs", "full_name": "Caleb Downs", "first_name": "Caleb", "last_name": "Downs", "position": "S", "team": "Ohio State", "headshot_url": ""},
    {"slug": "mansoor-delane", "full_name": "Mansoor Delane", "first_name": "Mansoor", "last_name": "Delane", "position": "CB", "team": "Virginia Tech", "headshot_url": ""},
    {"slug": "jahdae-barron", "full_name": "Jahdae Barron", "first_name": "Jahdae", "last_name": "Barron", "position": "S", "team": "Texas", "headshot_url": ""},
]

class ManualSeeder:
    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)

    def run(self):
        logger.info(f"Seeding {len(PROSPECTS)} players manually...")
        count = 0
        for p in PROSPECTS:
            # The new PROSPECTS list already contains pre-computed slug, full_name, first_name, last_name, position, and headshot_url
            # So, we can directly use these values.
            slug = p['slug']
            full_name = p['full_name']
            first = p['first_name']
            last = p['last_name']
            position = p['position']
            team = p['team'] # This will be used as nfl_team placeholder
            headshot_url = p['headshot_url']
            
            try:
                # Use team as 'nfl_team' placeholder for now
                query = """
                    INSERT INTO players (
                        slug, full_name, first_name, last_name, position, 
                        nfl_team, draft_year, headshot_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(slug) DO UPDATE SET
                        full_name=excluded.full_name,
                        nfl_team=excluded.nfl_team
                """
                
                self.cursor.execute(query, (
                    slug, full_name, first, last, position, 
                    team, 2026, headshot_url
                ))
                count += 1
            except Exception as e:
                logger.error(f"Error seeding {slug}: {e}")
        
        self.conn.commit()
        logger.info(f"Successfully seeded {count} players.")

if __name__ == "__main__":
    seeder = ManualSeeder()
    seeder.run()
