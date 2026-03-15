"""
scrapers/rankings/dynasty_nerds.py
Scrapes 2026 dynasty rookie rankings from dynastynerds.com using Playwright.

Run: py scrapers/rankings/dynasty_nerds.py
Requires: playwright (already a project dependency)
"""

import sqlite3
import re
import os
import json
from datetime import date

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'dynasty_scout.db')
SOURCE_NAME = "DynastyNerds"
SOURCE_URL = "https://www.dynastynerds.com/dynasty-rankings/rookies/"


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
    # Try first + last only (handles middle names)
    parts = key.split()
    if len(parts) >= 2:
        fl = f"{parts[0]} {parts[-1]}"
        if fl in player_map:
            return player_map[fl]
    return None


def run():
    from playwright.sync_api import sync_playwright

    conn = sqlite3.connect(DB_PATH, timeout=15)
    cur = conn.cursor()
    player_map = build_player_map(cur)
    today = date.today().isoformat()

    print(f"Loading {SOURCE_URL} with Playwright...")

    results = []  # list of (rank, name, position)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ))

        try:
            page.goto(SOURCE_URL, timeout=60000)
            page.wait_for_load_state("networkidle", timeout=20000)

            # Strategy 1: Try to extract embedded __NEXT_DATA__ JSON (Next.js pages)
            try:
                next_data = page.evaluate("() => JSON.parse(document.getElementById('__NEXT_DATA__').textContent)")
                print("  Found __NEXT_DATA__ JSON payload")
                # Walk the tree looking for ranking arrays
                raw = json.dumps(next_data)
                # Look for player objects with rank and name fields
                players_in_json = re.findall(
                    r'"name"\s*:\s*"([^"]+)"[^}]*"rank"\s*:\s*(\d+)|"rank"\s*:\s*(\d+)[^}]*"name"\s*:\s*"([^"]+)"',
                    raw
                )
                for m in players_in_json:
                    name = m[0] or m[3]
                    rank = int(m[1] or m[2])
                    if name and rank:
                        results.append((rank, name, None))
            except Exception:
                pass

            # Strategy 2: Parse table rows
            if not results:
                try:
                    # Wait for any table-like structure
                    page.wait_for_selector("table, [class*='ranking'], [class*='player-row']", timeout=10000)
                except Exception:
                    pass

                # Try standard table approach
                rows = page.query_selector_all("table tbody tr")
                if not rows:
                    rows = page.query_selector_all("[class*='ranking'] [class*='player'], [class*='player-row']")

                print(f"  Found {len(rows)} candidate rows via table selectors")
                rank = 0
                for row in rows:
                    try:
                        cells = row.query_selector_all("td")
                        if len(cells) < 2:
                            continue
                        rank_text = cells[0].inner_text().strip()
                        if not rank_text.isdigit():
                            # Might be in a different cell
                            continue
                        rank = int(rank_text)

                        # Name is usually a link in one of the first few cells
                        name_el = row.query_selector("a[href*='player'], a[class*='player']") or row.query_selector("td:nth-child(2) a, td:nth-child(3) a")
                        name = name_el.inner_text().strip() if name_el else cells[1].inner_text().strip().split("\n")[0]
                        if name:
                            results.append((rank, name, None))
                    except Exception:
                        continue

            # Strategy 3: Try to find JSON embedded in script tags
            if not results:
                print("  Trying script-tag JSON extraction...")
                scripts = page.query_selector_all("script:not([src])")
                for script in scripts:
                    content = script.inner_text()
                    # Look for arrays of objects with name+rank
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

        except Exception as e:
            print(f"  Playwright error: {e}")
        finally:
            browser.close()

    print(f"  Total extracted: {len(results)} rows")

    if not results:
        print("  No data extracted. Page structure may have changed — inspect SOURCE_URL manually.")
        conn.close()
        return

    # Sort by rank, deduplicate, and save
    results.sort(key=lambda x: x[0])
    seen = set()
    matched = 0
    unmatched = []

    for rank, name, pos in results:
        if name in seen:
            continue
        seen.add(name)

        p_id = match_player(name, player_map)
        if not p_id:
            unmatched.append(name)
            continue

        cur.execute("DELETE FROM rankings WHERE player_id=? AND source=?", (p_id, SOURCE_NAME))
        cur.execute("""
            INSERT INTO rankings (player_id, source, rank_overall, source_url, scraped_at)
            VALUES (?, ?, ?, ?, ?)
        """, (p_id, SOURCE_NAME, rank, SOURCE_URL, today))
        matched += 1

    conn.commit()
    conn.close()

    print(f"\nDynastyNerds scrape complete.")
    print(f"  Players matched: {matched}")
    if unmatched:
        print(f"  Unmatched ({len(unmatched)}): {unmatched[:20]}")


if __name__ == "__main__":
    run()
