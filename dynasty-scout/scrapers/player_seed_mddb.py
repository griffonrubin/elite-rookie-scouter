from playwright.sync_api import sync_playwright
import logging
import re
from scrapers import config
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MDDBSeeder")

class MDDBSeeder:
    """
    Scrapes the Consensus Big Board from NFL Mock Draft Database using Playwright.
    Target URL: https://www.nflmockdraftdatabase.com/big-boards/2026/consensus-big-board-2026
    """
    
    BASE_URL = "https://www.nflmockdraftdatabase.com/big-boards/2026/consensus-big-board-2026"

    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = config.get_db_cursor(self.conn)

    def scrape(self):
        logger.info(f"Scraping MDDB: {self.BASE_URL}")
        
        players = []
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(self.BASE_URL, wait_until="domcontentloaded", timeout=60000)
                
                # Wait for React to render
                time.sleep(5)
                
                # Get the page content after JavaScript execution
                content = page.content()
                
                # Extract player data from React props
                # The data is embedded in the data-react-props attribute
                import json
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(content, "html.parser")
                
                # Find the React component with player data
                react_div = soup.find("div", {"data-react-class": "big_boards/Consensus"})
                if react_div and react_div.get("data-react-props"):
                    props_json = react_div["data-react-props"]
                    data = json.loads(props_json)
                    
                    # Extract selections (players)
                    selections = data.get("mock", {}).get("selections", [])
                    logger.info(f"Found {len(selections)} players in React data")
                    
                    # Process each player
                    for selection in selections:
                        try:
                            player_data = selection.get("player", {})
                            if not player_data:
                                continue
                            
                            full_name = player_data.get("name", "").strip()
                            position = player_data.get("position", "UNK").strip()
                            school_data = player_data.get("college", {})
                            school = school_data.get("name", "Unknown") if school_data else "Unknown"
                            
                            if not full_name:
                                continue
                            
                            # FILTER: Only offensive fantasy-relevant positions
                            if position not in ['QB', 'RB', 'WR', 'TE']:
                                continue
                            
                            # Slug generation
                            slug = full_name.lower().replace(" ", "-").replace(".", "").replace("'", "")
                            
                            # Headshot URL (if available)
                            headshot = ""
                            
                            players.append({
                                "slug": slug,
                                "full_name": full_name,
                                "position": position,
                                "school": school,
                                "headshot_url": headshot
                            })
                            
                        except Exception as e:
                            logger.error(f"Error parsing player: {e}")
                            continue
                
                browser.close()
            
            return players

        except Exception as e:
            logger.error(f"MDDB Scrape Failed: {e}")
            return []

    def save_players(self, players):
        if not players: return

        count = 0
        for p in players:
            try:
                # Parse names
                parts = p['full_name'].split(" ")
                first = parts[0]
                last = " ".join(parts[1:])
                
                # Check duplicate by slug
                query = """
                    INSERT INTO players (
                        slug, full_name, first_name, last_name, position, 
                        nfl_team, draft_year, headshot_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(slug) DO UPDATE SET
                        full_name=excluded.full_name,
                        nfl_team=excluded.nfl_team,
                        headshot_url=excluded.headshot_url
                """
                # Using 'nfl_team' field for 'School' for scraping purposes 
                # (since they ARE college players until drafted)
                
                self.cursor.execute(query, (
                    p['slug'], p['full_name'], first, last, p['position'], 
                    p['school'], 2026, p['headshot_url']
                ))
                count += 1
            except Exception as e:
                logger.error(f"Save error {p['slug']}: {e}")
        
        self.conn.commit()
        logger.info(f"Saved/Updated {count} players.")

    def run(self):
        players = self.scrape()
        if players:
            self.save_players(players)
        else:
            logger.warning("No players scraped from MDDB.")

if __name__ == "__main__":
    seeder = MDDBSeeder()
    seeder.run()
