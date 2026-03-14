"""
multi_rankings.py — Scrape 5 ranking sources for the 2026 dynasty class.

Sources:
  1. KeepTradeCut (KTC)  — already in DB, run for refresh
  2. FantasyPros Devy    — HTTP scrape of JSON endpoint
  3. Sleeper ADP         — Public Sleeper API (no auth needed)
  4. Underdog ADP        — Public Underdog best-ball ADP
  5. 4for4 / DynastyDF  — Dynasty nerds scrape fallback

Run: py scrapers/multi_rankings.py
"""
import sqlite3
import requests
import time
import json
import re
import logging
from datetime import datetime
from bs4 import BeautifulSoup
from difflib import SequenceMatcher

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("MultiRankings")

DB_FILE = "dynasty_scout.db"
TODAY = datetime.now().strftime("%Y-%m-%d")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


# ──────────────────────────────────────────────────
# DB helpers
# ──────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def load_players(conn):
    """Returns {normalized_name: (player_id, full_name)} for 2026 class."""
    cur = conn.cursor()
    cur.execute("SELECT id, full_name, slug FROM players WHERE draft_year = 2026")
    mapping = {}
    for row in cur.fetchall():
        key = normalize(row["full_name"])
        mapping[key] = (row["id"], row["full_name"])
    return mapping


def normalize(name: str) -> str:
    name = name.lower()
    for suffix in [" jr", " jr.", " sr", " sr.", " ii", " iii", " iv"]:
        name = name.replace(suffix, "")
    return re.sub(r"[^a-z ]", "", name).strip()


def fuzzy_match(name: str, player_map: dict, threshold=0.88):
    key = normalize(name)
    if key in player_map:
        return player_map[key][0]
    best_score, best_id = 0, None
    for k, (pid, _) in player_map.items():
        score = SequenceMatcher(None, key, k).ratio()
        if score > best_score:
            best_score, best_id = score, pid
    return best_id if best_score >= threshold else None


def save_ranking(conn, player_id, rank, source_name, source_url=""):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO rankings (player_id, source, rank_overall, source_url, scraped_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(player_id, source, scraped_at) DO UPDATE SET
            rank_overall = excluded.rank_overall,
            source_url   = excluded.source_url
    """, (player_id, source_name, rank, source_url, TODAY))
    conn.commit()


# ──────────────────────────────────────────────────
# SCRAPER 1: FantasyPros  (JSON endpoint)
# ──────────────────────────────────────────────────

def scrape_fantasypros(conn, player_map):
    logger.info("── FantasyPros Devy Rankings ──")
    url = "https://www.fantasypros.com/nfl/rankings/devy.php"
    source = "FantasyPros"
    found = 0
    matched_buffer = []
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Find the ecrData JS object embedded in the page
        script_text = ""
        for s in soup.find_all("script"):
            if "ecrData" in (s.string or ""):
                script_text = s.string
                break

        if not script_text:
            logger.warning("  FantasyPros: ecrData not found, trying table parse...")
            # fallback to table
            rows = soup.select("table#ranking-table tbody tr")
            for row in rows:
                cells = row.select("td")
                if len(cells) < 2:
                    continue
                rank_txt = cells[0].get_text(strip=True)
                if not rank_txt.isdigit():
                    continue
                rank = int(rank_txt)
                name_el = row.select_one("a.player-name") or row.select_one(".player-name")
                if not name_el:
                    continue
                name = name_el.get_text(strip=True)
                pid = fuzzy_match(name, player_map)
                if pid:
                    if not any(x['pid'] == pid for x in matched_buffer):
                        matched_buffer.append({'pid': pid, 'raw': int(rank), 'name': name, 'url': url})
        else:
            # Parse JSON from ecrData.players
            m = re.search(r'"players"\s*:\s*(\[.+?\])\s*[,}]', script_text, re.DOTALL)
            if m:
                players_json = json.loads(m.group(1))
                for item in players_json:
                    rank = item.get("rank_ecr") or item.get("r")
                    name = item.get("player_name") or item.get("n") or ""
                    if not rank or not name:
                        continue
                    pid = fuzzy_match(name, player_map)
                    if pid:
                        # Buffer to sort the 2026 relative ranks
                        if not any(x['pid'] == pid for x in matched_buffer):
                            matched_buffer.append({'pid': pid, 'raw': int(rank), 'name': name, 'url': url})
        
        # Sort by raw rank and save as relative 1..N
        matched_buffer.sort(key=lambda x: x['raw'])
        for idx, item in enumerate(matched_buffer, 1):
            save_ranking(conn, item['pid'], idx, source, item['url'])
            found += 1
            logger.info(f"  [{source}] 2026 Relative #{idx} -> {item['name']} (Raw #{item['raw']})")

        logger.info(f"  FantasyPros done: {found} matched")
    except Exception as e:
        logger.error(f"  FantasyPros error: {e}")
    return found


# ──────────────────────────────────────────────────
# SCRAPER 2: Sleeper ADP  (public API)
# ──────────────────────────────────────────────────

def scrape_sleeper(conn, player_map):
    # Sleeper's search_rank metric is completely uncorrelated with actual dynasty rookie ADP.
    # Disabling it so it doesn't pollute the 2026 consensus.
    logger.info("── Sleeper ADP (DISABLED - Poor Quality) ──")
    return 0



# ──────────────────────────────────────────────────
# SCRAPER 3: Walter Football Draft Projections
# ──────────────────────────────────────────────────

def scrape_walterfootball(conn, player_map):
    logger.info("── Walter Football ──")
    source = "Walter Football"
    found = 0
    try:
        url = "https://walterfootball.com/draft2026ranks.php"
        resp = requests.get(url, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(resp.text, "html.parser")

        rank = 0
        for el in soup.find_all(["li", "td", "div"]):
            text = el.get_text(strip=True)
            # Lines like: "1. John Smith, WR, Alabama"
            m = re.match(r"^(\d+)\.\s+(.+?),\s+(QB|RB|WR|TE)", text)
            if m:
                rank = int(m.group(1))
                name = m.group(2).strip()
                pid = fuzzy_match(name, player_map)
                if pid:
                    save_ranking(conn, pid, rank, source, url)
                    found += 1
                    logger.info(f"  [{source}] #{rank} {name}")
            if rank > 200:
                break

        logger.info(f"  WalterFootball done: {found} matched")
    except Exception as e:
        logger.error(f"  WalterFootball error: {e}")
    return found


# ──────────────────────────────────────────────────
# SCRAPER 4: DynastyNerds / DFF rookie rankings
# ──────────────────────────────────────────────────

def scrape_dynastynerds(conn, player_map):
    logger.info("── Dynasty Nerds ──")
    source = "Dynasty Nerds"
    found = 0
    matched_buffer = []
    try:
        # Dynasty Nerds has a public API for rankings
        url = "https://api.dynastynerds.com/rankings/1qb?type=rookie&format=json"
        resp = requests.get(url, headers={**HEADERS, "Origin": "https://www.dynastynerds.com"}, timeout=20)
        data = resp.json()

        # Try different response shapes
        players_list = data if isinstance(data, list) else data.get("players") or data.get("rankings") or []
        for i, item in enumerate(players_list[:150], 1):
            if isinstance(item, dict):
                name = item.get("player_name") or item.get("name") or item.get("playerName") or ""
                rank = item.get("rank") or item.get("ranking") or i
            else:
                continue
            if not name:
                continue
            pid = fuzzy_match(name, player_map)
            if pid:
                if not any(x['pid'] == pid for x in matched_buffer):
                    matched_buffer.append({'pid': pid, 'raw': int(rank), 'name': name, 'url': "https://www.dynastynerds.com"})

        matched_buffer.sort(key=lambda x: x['raw'])
        for idx, item in enumerate(matched_buffer, 1):
            save_ranking(conn, item['pid'], idx, source, item['url'])
            found += 1
            logger.info(f"  [{source}] 2026 Relative #{idx} -> {item['name']} (Raw #{item['raw']})")

        logger.info(f"  DynastyNerds done: {found} matched")
    except Exception as e:
        logger.error(f"  DynastyNerds error: {e}")
    return found


# ──────────────────────────────────────────────────
# SCRAPER 5: The Athletic / Rotoballer / 4for4 (HTML scrape)
# ──────────────────────────────────────────────────

def scrape_rotoballer(conn, player_map):
    logger.info("── Rotoballer 2026 Rookie Rankings ──")
    source = "RotoBALLER"
    found = 0
    matched_buffer = []
    try:
        url = "https://www.rotoballer.com/2026-dynasty-rookie-rankings/1000070"
        resp = requests.get(url, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(resp.text, "html.parser")

        rank = 0
        for row in soup.select("table tbody tr"):
            cells = row.select("td")
            if len(cells) < 2:
                continue
            rank_txt = cells[0].get_text(strip=True)
            if not rank_txt.isdigit():
                continue
            rank = int(rank_txt)
            # name is usually in the 2nd cell
            name = cells[1].get_text(strip=True).split("\n")[0].strip()
            pid = fuzzy_match(name, player_map)
            if pid:
                if not any(x['pid'] == pid for x in matched_buffer):
                    matched_buffer.append({'pid': pid, 'raw': rank, 'name': name, 'url': url})

        if not matched_buffer:
            # Try OL-list or article format
            for item in soup.select("ol li, .ranking-item"):
                name_el = item.select_one("a, .player-name, strong")
                if not name_el:
                    continue
                rank += 1
                name = name_el.get_text(strip=True)
                pid = fuzzy_match(name, player_map)
                if pid:
                    if not any(x['pid'] == pid for x in matched_buffer):
                        matched_buffer.append({'pid': pid, 'raw': rank, 'name': name, 'url': url})

        matched_buffer.sort(key=lambda x: x['raw'])
        for idx, item in enumerate(matched_buffer, 1):
            save_ranking(conn, item['pid'], idx, source, item['url'])
            found += 1
            logger.info(f"  [{source}] 2026 Relative #{idx} -> {item['name']} (Raw #{item['raw']})")

        logger.info(f"  Rotoballer done: {found} matched")
    except Exception as e:
        logger.error(f"  Rotoballer error: {e}")
    return found


# ──────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────

def run_consensus(conn):
    """Re-run consensus calculator to aggregate all new sources."""
    logger.info("── Re-calculating consensus ──")
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT player_id FROM rankings WHERE scraped_at = ?", (TODAY,))
    touched = [r[0] for r in cur.fetchall()]
    
    for pid in touched:
        cur.execute("SELECT rank_overall FROM rankings WHERE player_id = ?", (pid,))
        ranks = [r[0] for r in cur.fetchall() if r[0] is not None]
        if not ranks:
            continue
        avg = sum(ranks) / len(ranks)
        best = min(ranks)
        worst = max(ranks)
        import statistics
        std_dev = statistics.stdev(ranks) if len(ranks) > 1 else 0
        # Compute consensus rank as round(avg) for now
        consensus = round(avg)
        cur.execute("""
            INSERT INTO consensus_rankings (player_id, rank_overall, avg_rank, best_rank, worst_rank, std_deviation, num_sources, calculated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, calculated_at) DO UPDATE SET
                rank_overall=excluded.rank_overall,
                avg_rank=excluded.avg_rank,
                best_rank=excluded.best_rank,
                worst_rank=excluded.worst_rank,
                std_deviation=excluded.std_deviation,
                num_sources=excluded.num_sources
        """, (pid, consensus, round(avg, 1), best, worst, round(std_dev, 2), len(ranks), TODAY))
    conn.commit()
    logger.info(f"  Consensus updated for {len(touched)} players")


if __name__ == "__main__":
    conn = get_db()
    player_map = load_players(conn)
    logger.info(f"Loaded {len(player_map)} 2026 prospects from DB")

    totals = {}
    totals["FantasyPros"] = scrape_fantasypros(conn, player_map)
    time.sleep(2)
    totals["Sleeper"] = scrape_sleeper(conn, player_map)
    time.sleep(2)
    totals["WalterFootball"] = scrape_walterfootball(conn, player_map)
    time.sleep(2)
    totals["DynastyNerds"] = scrape_dynastynerds(conn, player_map)
    time.sleep(2)
    totals["RotoBALLER"] = scrape_rotoballer(conn, player_map)

    # run_consensus(conn) # Replaced by standalone run_consensus.py
    conn.close()

    print("\n═══ RANKINGS SCRAPE COMPLETE ═══")
    for src, cnt in totals.items():
        print(f"  {src}: {cnt} players matched")
