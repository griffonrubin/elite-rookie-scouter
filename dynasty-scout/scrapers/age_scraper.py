"""
age_scraper.py - Populates age_at_draft and dob for all players via sports-reference.com
"""
import sqlite3
import requests
from bs4 import BeautifulSoup
import logging
import time
import random
import re
from datetime import date, datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AgeScraper")

DB_FILE = "dynasty_scout.db"
DRAFT_DATE = date(2026, 4, 25)  # 2026 NFL Draft approximately April 25
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def name_to_url_slug(full_name):
    """Convert player name to sports-reference URL slug variants to try."""
    parts = full_name.lower().split()
    # Remove common suffixes
    parts = [p for p in parts if p not in ['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv', 'v']]
    
    # Clean special chars
    cleaned = [re.sub(r"[^a-z]", "", p) for p in parts]
    cleaned = [p for p in cleaned if p]
    
    if len(cleaned) < 2:
        return []
    
    first = cleaned[0]
    last = cleaned[-1]
    
    # CFB sports-reference: /cfb/players/first-last-N.html
    return [
        f"https://www.sports-reference.com/cfb/players/{first}-{last}-1.html",
        f"https://www.sports-reference.com/cfb/players/{first}-{last}-2.html",
        f"https://www.sports-reference.com/cfb/players/{first}-{last}-3.html",
    ]

def fetch_dob(player_name):
    """Try to get DOB from sports-reference player page."""
    urls = name_to_url_slug(player_name)
    
    for url in urls:
        try:
            time.sleep(random.uniform(2.5, 4.0))
            resp = requests.get(url, headers=HEADERS, timeout=20)
            
            if resp.status_code == 404:
                continue
            if resp.status_code == 429:
                logger.warning("Rate limited! Sleeping 60s...")
                time.sleep(60)
                continue
            if resp.status_code != 200:
                continue
            
            soup = BeautifulSoup(resp.content, "html.parser")
            
            # Check if this page name matches our player (to avoid wrong matches)
            page_title = soup.find("h1")
            if page_title:
                page_name = page_title.get_text().strip().lower()
                search_name = player_name.lower().split()[0]
                if search_name not in page_name:
                    continue  # Wrong player
            
            # Look for birthdate
            birthdate_el = soup.find("span", {"id": "necro-birth"})
            if not birthdate_el:
                # Try meta itemprop
                birthdate_el = soup.find(attrs={"itemprop": "birthDate"})
            
            if birthdate_el:
                dob_str = birthdate_el.get("data-birth", "") or birthdate_el.get_text().strip()
                if dob_str:
                    # Parse "YYYY-MM-DD" or "Month DD, YYYY"
                    try:
                        if re.match(r"\d{4}-\d{2}-\d{2}", dob_str):
                            dob = datetime.strptime(dob_str[:10], "%Y-%m-%d").date()
                        else:
                            dob = datetime.strptime(dob_str, "%B %d, %Y").date()
                        
                        # Sanity check: college player should be born between 2000 and 2007
                        if 2000 <= dob.year <= 2007:
                            age = (DRAFT_DATE - dob).days / 365.25
                            return dob.isoformat(), round(age, 1)
                    except Exception:
                        pass
            
            # Also try looking in the meta p#necro-birth
            # Some pages have it differently
            para = soup.find("p", id="necro-birth")
            if para:
                strong = para.find("strong")
                if strong:
                    text = para.get_text()
                    date_match = re.search(r'(\w+ \d+, \d{4})', text)
                    if date_match:
                        try:
                            dob = datetime.strptime(date_match.group(1), "%B %d, %Y").date()
                            if 2000 <= dob.year <= 2007:
                                age = (DRAFT_DATE - dob).days / 365.25
                                return dob.isoformat(), round(age, 1)
                        except Exception:
                            pass
            
            # Found a page but no DOB - stop trying more URLs for this player
            return None, None
            
        except Exception as e:
            logger.error(f"  Error fetching {url}: {e}")
            continue
    
    return None, None

def run():
    conn = get_db()
    cur = conn.cursor()
    
    # Get players missing DOB or age
    cur.execute("""
        SELECT id, full_name, position, age_at_draft
        FROM players
        WHERE draft_year = 2026
        AND (dob IS NULL OR age_at_draft IS NULL)
        ORDER BY id
    """)
    players = cur.fetchall()
    logger.info(f"Found {len(players)} players missing DOB/age. Fetching...")
    
    found = 0
    for i, player in enumerate(players):
        player_id = player['id']
        name = player['full_name']
        
        logger.info(f"[{i+1}/{len(players)}] {name}")
        
        # If they have age_at_draft but no DOB, estimate DOB
        if player['age_at_draft'] and not player['age_at_draft'] == 0:
            age = player['age_at_draft']
            # Estimate DOB from age: draft_year - age
            year_offset = int(age)
            dob_approx = date(DRAFT_DATE.year - year_offset, 1, 1).isoformat()
            cur.execute("""
                UPDATE players SET dob = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (dob_approx, player_id))
            found += 1
            continue
        
        dob, age = fetch_dob(name)
        if dob and age:
            cur.execute("""
                UPDATE players SET dob = ?, age_at_draft = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (dob, age, player_id))
            logger.info(f"  -> DOB: {dob}, Age at draft: {age}")
            found += 1
        else:
            # Fallback: estimate from known position draft ages if truly unknown
            # QBs avg ~22.5, RBs ~21.5, WRs ~21.7, TEs ~22.0 at 2026 draft
            pos_ages = {'QB': 21.5, 'RB': 21.5, 'WR': 21.5, 'TE': 22.0}
            estimated_age = pos_ages.get(player['position'], 21.5)
            cur.execute("""
                UPDATE players SET age_at_draft = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND age_at_draft IS NULL
            """, (estimated_age, player_id))
            logger.info(f"  -> No DOB found, estimated age: {estimated_age}")
        
        conn.commit()
    
    conn.commit()
    conn.close()
    logger.info(f"\nAge scraper complete. Updated {found} players with DOB data.")

if __name__ == "__main__":
    run()
