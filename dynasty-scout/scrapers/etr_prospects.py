"""
ETR (Establish The Run) prospect database scraper.
Extracts: hand size, arm length, combine score, and any combine drills
that might supplement our NFL.com data.

URL: https://establishtherun.com/nfl-draft-prospect-database/
"""

import re
import sqlite3
from playwright.sync_api import sync_playwright

DB_PATH = "dynasty_scout.db"


def normalize(name: str) -> str:
    name = name.lower()
    name = re.sub(r"['''`\-,]", "", name)
    name = re.sub(r"\.", " ", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    # Collapse space-separated single-letter initials: "c j" -> "cj"
    name = re.sub(r"\b([a-z]) ([a-z])\b", r"\1\2", name)
    return name


def parse_float(val):
    if not val or val.strip() in ("", "-", "—", "N/A"):
        return None
    try:
        return float(val.strip())
    except ValueError:
        return None


def scrape_etr():
    print("Loading ETR prospect database...")
    rows_data = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(
            "https://establishtherun.com/nfl-draft-prospect-database/",
            wait_until="networkidle",
            timeout=30000,
        )

        # Expand to max rows
        try:
            page.select_option("select[name='prospects_length']", "200")
            page.wait_for_timeout(1000)
        except Exception:
            pass

        all_headers = [th.inner_text().strip() for th in page.query_selector_all("table thead th")]
        # The "Search" th has no corresponding <td> — skip it
        headers = [h for h in all_headers if h != "Search"]
        print(f"Columns: {headers}")

        rows = page.query_selector_all("table tbody tr")
        print(f"Rows found: {len(rows)}")

        for row in rows:
            cells = [c.inner_text().strip() for c in row.query_selector_all("td")]
            if len(cells) < len(headers):
                cells += [""] * (len(headers) - len(cells))
            rows_data.append(dict(zip(headers, cells)))

        browser.close()

    return rows_data


def seed_to_db(rows_data):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT id, full_name FROM players WHERE draft_year=2026")
    player_map = {normalize(r[1]): r[0] for r in cur.fetchall()}

    # Col index mapping
    col_map = {
        "Hand":    "hand_size",
        "Arm":     "arm_length",
        "Forty":   "forty_yard",
        "Vert":    "vertical_jump",
        "Broad":   "broad_jump",
        "Cone":    "three_cone",
        "Shuttle": "twenty_yard_shuttle",
    }

    updated = matched = 0
    unmatched = []

    for row in rows_data:
        name = row.get("Player", "").strip()
        if not name:
            continue

        pid = player_map.get(normalize(name))
        if not pid:
            unmatched.append(name)
            continue

        matched += 1
        existing = cur.execute(
            "SELECT id FROM measurables WHERE player_id=?", (pid,)
        ).fetchone()

        updates = {}
        for etr_col, db_col in col_map.items():
            val = parse_float(row.get(etr_col, ""))
            if val is not None:
                updates[db_col] = val

        if not updates:
            continue

        if existing:
            set_clause = ", ".join(
                f"{col} = COALESCE({col}, ?)" for col in updates
            )
            cur.execute(
                f"UPDATE measurables SET {set_clause} WHERE player_id=?",
                list(updates.values()) + [pid],
            )
        else:
            cols = ", ".join(["player_id"] + list(updates.keys()))
            placeholders = ", ".join(["?"] * (1 + len(updates)))
            cur.execute(
                f"INSERT INTO measurables ({cols}) VALUES ({placeholders})",
                [pid] + list(updates.values()),
            )
        updated += 1

    conn.commit()

    # Coverage summary
    hand_count = cur.execute(
        "SELECT COUNT(*) FROM measurables WHERE hand_size IS NOT NULL"
    ).fetchone()[0]
    arm_count = cur.execute(
        "SELECT COUNT(*) FROM measurables WHERE arm_length IS NOT NULL"
    ).fetchone()[0]

    print(f"\nMatched: {matched} / {len(rows_data)}")
    print(f"Measurables updated: {updated}")
    print(f"Hand size coverage: {hand_count}")
    print(f"Arm length coverage: {arm_count}")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}): {unmatched[:10]}")

    conn.close()


if __name__ == "__main__":
    rows = scrape_etr()
    seed_to_db(rows)
