"""
scrapers/rankings/dynasty_nerds.py
Scrapes 2026 dynasty rookie rankings from dynastynerds.com using Playwright.
Scrapes both 1QB and SF/superflex formats.

Run: py scrapers/rankings/dynasty_nerds.py
Requires: playwright (already a project dependency)
"""

import sqlite3
import re
import os
import json
from datetime import date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'dynasty_scout.db')

SOURCES = [
    ("DynastyNerds",    "https://www.dynastynerds.com/dynasty-rankings/rookies/"),
    ("DynastyNerds SF", "https://www.dynastynerds.com/dynasty-rankings/rookies/?scoring=superflex"),
]


def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[''`\-\.\,]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def build_player_map(cur):
    cur.execute("SELECT id, full_name FROM players WHERE draft_year = 2026")
    mapping = {}
    for p_id, name in cur.fetchall():
        mapping[normalize(name)] = p_id
    return mapping


def match_player(name: str, player_map: dict):
    key = normalize(name)
    if key in player_map:
        return player_map[key]
    parts = key.split()
    if len(parts) >= 2:
        fl = f"{parts[0]} {parts[-1]}"
        if fl in player_map:
            return player_map[fl]
    return None


def scrape_one(page, url: str) -> list:
    """Scrape one DynastyNerds URL, return list of (rank, name, pos)."""
    results = []
    print(f"  Loading {url} ...")
    page.goto(url, timeout=60000)
    page.wait_for_load_state("networkidle", timeout=20000)

    # Strategy 1: __NEXT_DATA__ JSON
    try:
        next_data = page.evaluate("() => JSON.parse(document.getElementById('__NEXT_DATA__').textContent)")
        raw = json.dumps(next_data)
        players_in_json = re.findall(
            r'"name"\s*:\s*"([^"]+)"[^}]*"rank"\s*:\s*(\d+)|"rank"\s*:\s*(\d+)[^}]*"name"\s*:\s*"([^"]+)"',
            raw
        )
        for m in players_in_json:
            name = m[0] or m[3]
            rank = int(m[1] or m[2])
            if name and rank:
                results.append((rank, name, None))
        if results:
            print(f"  Found {len(results)} players via __NEXT_DATA__")
    except Exception:
        pass

    # Strategy 2: table rows
    if not results:
        try:
            page.wait_for_selector("table, [class*='ranking'], [class*='player-row']", timeout=10000)
        except Exception:
            pass
        rows = page.query_selector_all("table tbody tr")
        if not rows:
            rows = page.query_selector_all("[class*='ranking'] [class*='player'], [class*='player-row']")
        print(f"  Found {len(rows)} candidate rows via table selectors")
        for row in rows:
            try:
                cells = row.query_selector_all("td")
                if len(cells) < 2:
                    continue
                rank_text = cells[0].inner_text().strip()
                if not rank_text.isdigit():
                    continue
                rank = int(rank_text)
                name_el = (row.query_selector("a[href*='player'], a[class*='player']")
                           or row.query_selector("td:nth-child(2) a, td:nth-child(3) a"))
                name = name_el.inner_text().strip() if name_el else cells[1].inner_text().strip().split("\n")[0]
                if name:
                    results.append((rank, name, None))
            except Exception:
                continue

    # Strategy 3: script tag JSON
    if not results:
        scripts = page.query_selector_all("script:not([src])")
        for script in scripts:
            content = script.inner_text()
            match = re.search(r'(rankings|players)\s*=\s*(\[.{20,}?\])', content, re.DOTALL)
            if match:
                try:
                    arr = json.loads(match.group(2))
                    for item in arr:
                        if isinstance(item, dict):
                            name = item.get("name") or item.get("playerName") or item.get("full_name")
                            rank = item.get("rank") or item.get("overallRank")
                            pos = item.get("position") or item.get("pos")
                            if name and rank:
                                results.append((int(rank), name, pos))
                    if results:
                        print(f"  Extracted {len(results)} players from script tag")
                        break
                except Exception:
                    continue

    return results


def save_results(cur, results: list, source_name: str, source_url: str,
                 player_map: dict, today: str):
    if not results:
        print(f"  No data extracted for {source_name}.")
        return 0

    results.sort(key=lambda x: x[0])
    seen = set()
    matched = 0
    unmatched = []
    rookie_rank = 0

    for _raw_rank, name, pos in results:
        if name in seen:
            continue
        seen.add(name)
        p_id = match_player(name, player_map)
        if not p_id:
            unmatched.append(name)
            continue
        rookie_rank += 1
        cur.execute("DELETE FROM rankings WHERE player_id=? AND source=?", (p_id, source_name))
        cur.execute(
            "INSERT INTO rankings (player_id, source, rank_overall, source_url, scraped_at) VALUES (?, ?, ?, ?, ?)",
            (p_id, source_name, rookie_rank, source_url, today)
        )
        matched += 1

    print(f"  {source_name}: {matched} matched, {len(unmatched)} unmatched")
    if unmatched:
        print(f"  Unmatched: {unmatched[:15]}")
    return matched


def run():
    from playwright.sync_api import sync_playwright

    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()
    player_map = build_player_map(cur)
    today = date.today().isoformat()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ))
        try:
            for source_name, source_url in SOURCES:
                try:
                    results = scrape_one(page, source_url)
                    save_results(cur, results, source_name, source_url, player_map, today)
                except Exception as e:
                    print(f"  Error scraping {source_name}: {e}")
        finally:
            browser.close()

    conn.commit()
    conn.close()
    print("\nDynastyNerds scrape complete.")


if __name__ == "__main__":
    run()
