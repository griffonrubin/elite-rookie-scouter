import requests
from bs4 import BeautifulSoup
import pandas as pd
import logging
import time
import re
from scrapers import config

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PlayerSeeder")

class PlayerSeeder:
    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)

    def scrape_fantasy_pros(self):
        """
        Scrapes rookie rankings from FantasyPros to get the initial list of 2026 rookies.
        Fallback to manual list if scraping fails (security/layout changes).
        """
        logger.info("Scraping FantasyPros Rookie Rankings...")
        url = "https://www.fantasypros.com/nfl/rankings/rookies.php"
        
        try:
            resp = requests.get(url, headers={"User-Agent": config.USER_AGENT})
            if resp.status_code != 200:
                logger.error(f"Failed to fetch {url}: {resp.status_code}")
                return []
            
            soup = BeautifulSoup(resp.content, "html.parser")
            
            # This selector is fragile and often changes.
            # We'll try a few common patterns or just use a robust regex over the HTML if needed.
            # For MVP/Demo reliability, if this fails, we return a hardcoded seed list.
            
            rows = soup.select("table#ranking-table tbody tr")
            if not rows:
                 rows = soup.select("tr[class*='player-row']")
                 
            players = []
            
            if not rows:
                logger.warning("No rows found. Using fallback mock data for demo.")
                return self.get_fallback_data()

            for row in rows:
                try:
                    name_cell = row.select_one("a.player-name")
                    if not name_cell: continue
                    
                    full_name = name_cell.text.strip()
                    team = "FA" # Default
                    position = "UNK"
                    
                    # Try to extract pos/team
                    # often text is "Jeremiah Love (ND - RB)"
                    
                    match = re.search(r'\((.*?)\)', row.text)
                    if match:
                        parts = match.group(1).split('-')
                        if len(parts) >= 2:
                            team = parts[0].strip()
                            position = parts[1].strip()
                    
                    slug = full_name.lower().replace(" ", "-").replace(".", "").replace("'", "")
                    
                    players.append({
                        "slug": slug,
                        "full_name": full_name,
                        "first_name": full_name.split(" ")[0],
                        "last_name": " ".join(full_name.split(" ")[1:]),
                        "position": position,
                        "team": team,
                        "headshot_url": "" 
                    })
                except Exception as e:
                    logger.error(f"Error parsing row: {e}")
                    continue
            
            if not players:
                 return self.get_fallback_data()
                 
            return players
            
        except Exception as e:
            logger.error(f"Scrape failed: {e}")
            return self.get_fallback_data()

    def get_fallback_data(self):
        """
        Hardcoded list of top 2026 prospects to ensure the app works out of the box.
        """
        return [
            {"slug": "jeremiah-love", "full_name": "Jeremiah Love", "first_name": "Jeremiah", "last_name": "Love", "position": "RB", "team": "Notre Dame", "headshot_url": ""},
            {"slug": "nico-iamaleava", "full_name": "Nico Iamaleava", "first_name": "Nico", "last_name": "Iamaleava", "position": "QB", "team": "Tennessee", "headshot_url": ""},
            {"slug": "zachariah-branch", "full_name": "Zachariah Branch", "first_name": "Zachariah", "last_name": "Branch", "position": "WR", "team": "USC", "headshot_url": ""},
            {"slug": "carnell-tate", "full_name": "Carnell Tate", "first_name": "Carnell", "last_name": "Tate", "position": "WR", "team": "Ohio State", "headshot_url": ""},
            {"slug": "quinn-ewers", "full_name": "Quinn Ewers", "first_name": "Quinn", "last_name": "Ewers", "position": "QB", "team": "Texas", "headshot_url": ""}
        ]

    def seed_players(self):
        """
        Main runner.
        """
        logger.info("Starting Player Seeder...")
        
        data = self.scrape_fantasy_pros()
        logger.info(f"Found {len(data)} players (including fallbacks).")
        
        df = pd.DataFrame(data)
        
        if df.empty:
            logger.warning("No players found/generated.")
            return

        # Prepare Upsert for SQLite
        for _, row in df.iterrows():
            try:
                # updated_at is handled by trigger or defaults usually, but we can set it explicitly if needed
                # SQLite INSERT OR REPLACE or ON CONFLICT
                query = """
                    INSERT INTO players (
                        slug, full_name, first_name, last_name, position, 
                        nfl_team, draft_year, headshot_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(slug) DO UPDATE SET
                        full_name=excluded.full_name,
                        nfl_team=excluded.nfl_team,
                        updated_at=CURRENT_TIMESTAMP
                """
                
                self.cursor.execute(query, (
                    row['slug'], row['full_name'], row['first_name'], row['last_name'],
                    row['position'], row['team'], 2026, row['headshot_url']
                ))
            except Exception as e:
                logger.error(f"Error upserting player {row['slug']}: {e}")
        
        self.conn.commit()
        logger.info("Seeding Complete.")

if __name__ == "__main__":
    seeder = PlayerSeeder()
    seeder.seed_players()
