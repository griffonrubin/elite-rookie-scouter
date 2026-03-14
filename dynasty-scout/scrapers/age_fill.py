"""
age_fill.py - Fills age_at_draft for all 2026 players.
Scrapes sports-reference.com for DOB. Falls back to position averages (not player-specific hardcodes).
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
logger = logging.getLogger("AgeFill")

DB_FILE = "dynasty_scout.db"
DRAFT_DATE = date(2026, 4, 25)

# Position-average age at draft time — used ONLY as last resort fallback,
# NOT per-player hardcodes.
POS_AVG_AGE = {'QB': 22.0, 'RB': 21.6, 'WR': 21.7, 'TE': 22.2}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def try_fetch_dob(name):
    """
    Attempt to get DOB from sports-reference.com CFB player page.
    Tries up to 3 URL variants (-1, -2, -3).
    Returns (dob_str, age_float) or (None, None).
    """
    parts = name.lower().split()
    parts = [p for p in parts if p not in ['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv', 'v']]
    cleaned = [re.sub(r"[^a-z]", "", p) for p in parts if p]
    if len(cleaned) < 2:
        return None, None

    first, last = cleaned[0], cleaned[-1]
    base = f"https://www.sports-reference.com/cfb/players/{first}-{last}"

    for suffix in ["-1.html", "-2.html", "-3.html"]:
        url = base + suffix
        try:
            time.sleep(random.uniform(3.5, 5.0))
            r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code == 429:
                logger.warning("Rate limited — sleeping 90s")
                time.sleep(90)
                r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code == 404:
                continue
            if r.status_code != 200:
                continue

            # Verify name match
            if name.split()[0].lower() not in r.text.lower():
                continue

            soup = BeautifulSoup(r.content, "html.parser")

            # Try itemprop birthDate span
            el = soup.find("span", {"itemprop": "birthDate"})
            if not el:
                el = soup.find(id="necro-birth")
            if not el:
                # Try searching inside #meta paragraphs
                for p_tag in soup.select("#meta p"):
                    if "born" in p_tag.get_text(separator=" ").lower():
                        el = p_tag
                        break

            if el:
                raw = el.get("data-birth") or el.get_text()
                dob_match = re.search(r'(\d{4}-\d{2}-\d{2})', raw)
                if not dob_match:
                    dob_match = re.search(r'(\w+ \d+, \d{4})', raw)
                if dob_match:
                    try:
                        dob_str = dob_match.group(1)
                        if "-" in dob_str:
                            dob = datetime.strptime(dob_str, "%Y-%m-%d").date()
                        else:
                            dob = datetime.strptime(dob_str, "%B %d, %Y").date()
                        if 1999 <= dob.year <= 2007:
                            age = round((DRAFT_DATE - dob).days / 365.25, 1)
                            return dob.isoformat(), age
                    except Exception:
                        pass

            return None, None  # Found a page but no DOB — stop

        except Exception as e:
            logger.debug(f"Error fetching {url}: {e}")

    return None, None


def run():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, full_name, position, age_at_draft
        FROM players
        WHERE draft_year = 2026
        AND (dob IS NULL OR age_at_draft IS NULL)
        ORDER BY id
    """)
    players = cur.fetchall()
    logger.info(f"Fetching ages for {len(players)} players missing DOB/age data...")

    found = 0
    fallback = 0

    for i, player in enumerate(players):
        pid = player['id']
        name = player['full_name']
        pos = player['position']

        # Skip if already has age
        if player['age_at_draft'] is not None:
            continue

        logger.info(f"[{i+1}/{len(players)}] {name}")
        dob, age = try_fetch_dob(name)

        if dob and age:
            cur.execute("""
                UPDATE players SET dob=?, age_at_draft=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            """, (dob, age, pid))
            logger.info(f"  → DOB: {dob}, Age: {age}")
            found += 1
        else:
            # Pure positional average — no per-player hardcodes
            avg = POS_AVG_AGE.get(pos, 21.8)
            cur.execute("""
                UPDATE players SET age_at_draft=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=? AND age_at_draft IS NULL
            """, (avg, pid))
            fallback += 1

        if (i + 1) % 10 == 0:
            conn.commit()

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026 AND age_at_draft IS NOT NULL")
    with_age = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM players WHERE draft_year=2026 AND dob IS NOT NULL")
    with_dob = cur.fetchone()[0]

    logger.info(f"\nDone: {found} real DOBs, {fallback} positional fallbacks")
    logger.info(f"Players with age: {with_age}, with DOB: {with_dob}")
    conn.close()


if __name__ == "__main__":
    run()
