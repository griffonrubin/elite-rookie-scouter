"""
J. Foster (NoFlagsFilm) scouting data scraper.
Source: https://jfosterfilm.shinyapps.io/26draft/

Strategy:
  Phase 1 — Big Board: paginate through all rows to get ROUND, NFL COMP, overall GRADE.
  Phase 2 — Ratings tabs: click QB / HB / WR / TE sub-tabs to get film grades + athletic
             composite scores (SPEED, ACC, SIZE, COD = agility).
  Phase 3 — Join on player name, match to DB, upsert to jfoster_grades.

Run:
    python scrapers/jfoster_scraper.py             # all skill-position players
    python scrapers/jfoster_scraper.py --dry-run   # no DB writes
    python scrapers/jfoster_scraper.py --debug     # verbose + save HTML snapshots
    python scrapers/jfoster_scraper.py --force     # re-scrape already-seeded players
"""

import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ── Config ────────────────────────────────────────────────────────────────────

APP_URL   = "https://jfosterfilm.shinyapps.io/26draft/"
DB_PATH   = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dynasty_scout.db")
DEBUG_DIR = os.path.join(os.path.dirname(__file__), "_jfoster_debug")

DRY_RUN = "--dry-run" in sys.argv
DEBUG   = "--debug" in sys.argv
FORCE   = "--force" in sys.argv

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)

# Positions to scrape from the Ratings tab
RATING_POSITIONS = ["QB", "HB", "WR", "TE"]

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jfoster_grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER REFERENCES players(id) UNIQUE,
            overall_grade REAL,
            round_grade TEXT,
            nfl_comp TEXT,
            summary TEXT,
            strengths TEXT,
            weaknesses TEXT,
            film_grades TEXT,
            size_score REAL,
            speed_score_jf REAL,
            acceleration_score REAL,
            agility_score_jf REAL,
            athletic_score REAL,
            source TEXT DEFAULT 'jfoster_2026',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation and suffixes for fuzzy matching."""
    name = name.lower().strip()
    name = re.sub(r"[''`'\-,\.]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    return re.sub(r"\s+", " ", name).strip()


def slug_from_name(name: str) -> str:
    s = re.sub(r"[''`']", "", name.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def find_player(conn: sqlite3.Connection, name: str) -> int | None:
    """Find player_id by name — several fallback strategies."""
    clean = name.strip()

    # 1. Exact full_name
    row = conn.execute(
        "SELECT id FROM players WHERE LOWER(full_name) = ? AND draft_year = 2026",
        (clean.lower(),),
    ).fetchone()
    if row:
        return row["id"]

    # 2. Slug-style match
    slug = slug_from_name(clean)
    row = conn.execute(
        "SELECT id FROM players WHERE slug LIKE ? AND draft_year = 2026",
        (slug + "%",),
    ).fetchone()
    if row:
        return row["id"]

    # 3. Normalized comparison
    norm = normalize_name(clean)
    for db_row in conn.execute(
        "SELECT id, full_name FROM players WHERE draft_year = 2026"
    ).fetchall():
        if normalize_name(db_row["full_name"]) == norm:
            return db_row["id"]

    # 4. Last name + first initial
    parts = clean.lower().split()
    if len(parts) >= 2:
        last = parts[-1].rstrip(".")
        if last in ("jr", "sr", "ii", "iii", "iv"):
            last = parts[-2] if len(parts) >= 3 else parts[0]
        first_char = parts[0][0]
        row = conn.execute(
            """SELECT id FROM players WHERE draft_year = 2026
               AND LOWER(last_name) = ? AND LOWER(first_name) LIKE ?""",
            (last, first_char + "%"),
        ).fetchone()
        if row:
            return row["id"]

    return None


def parse_float(val) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("\u200b", "")
    if not s or s in ("-", "—", "NA", "N/A"):
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def clean_cell(val: str) -> str:
    """Strip zero-width spaces and whitespace."""
    return re.sub(r"[\u200b\u200c\u200d\ufeff]", "", val).strip()


# ── Phase 1: Big Board extraction ─────────────────────────────────────────────

def extract_big_board(page) -> dict[str, dict]:
    """
    Paginate through the Big Board and return a dict keyed by normalised
    player name with: grade, round_grade, nfl_comp, ath_score, prod_score.

    Columns (0-based index after filtering out header rows):
      0:POS  1:(img)  2:PLAYER+school  3:(icon)  4:(prev)  5:GRADE  6:ROUND
      7:OVR  8:POS    9:CON           10:AGE    11:TRA    12:NFL COMP
      13:BOWL 14:HT  15:WT           16:ARM    17:PROD   18:ATH   19:STAR  20:CLASS
    """
    print("  Phase 1: Extracting Big Board...")
    board_data = {}

    # Set rows per page to 100 and paginate
    try:
        page.select_option("#NFLDraftBoard .rt-page-size-select", "100")
        time.sleep(3)
    except Exception:
        pass  # Might not work; proceed with default

    page_num = 1
    while True:
        # Extract rows on current page
        rows = page.evaluate("""() => {
            const rows = document.querySelectorAll('#NFLDraftBoard [role=row]');
            // Skip first 2 header rows
            return Array.from(rows).slice(2).map(row => {
                const cells = row.querySelectorAll('[role=cell]');
                return Array.from(cells).map(c => c.innerText);
            }).filter(r => r.length > 5);
        }""")

        if DEBUG:
            print(f"    Page {page_num}: {len(rows)} rows")

        for row in rows:
            # Clean all cells
            row = [clean_cell(c) for c in row]
            if len(row) < 13:
                continue

            player_raw = row[2]  # "Name\nSchool"
            if not player_raw:
                continue

            player_name = player_raw.split("\n")[0].strip()
            nfl_comp_raw = row[12] if len(row) > 12 else ""
            # NFL comp may have multiple comps separated by newline
            nfl_comp = " / ".join(
                [c.strip() for c in nfl_comp_raw.split("\n") if c.strip()]
            ) or None

            norm = normalize_name(player_name)
            board_data[norm] = {
                "name": player_name,
                "pos": row[0],
                "grade": parse_float(row[5]) if len(row) > 5 else None,
                "round_grade": row[6].strip() or None if len(row) > 6 else None,
                "nfl_comp": nfl_comp,
                "ath_score": parse_float(row[18]) if len(row) > 18 else None,
                "prod_score": parse_float(row[17]) if len(row) > 17 else None,
            }

        # Check for "Next page" button
        has_next = page.evaluate("""() => {
            const btn = document.querySelector('#NFLDraftBoard .rt-next-button');
            return btn && !btn.disabled && !btn.getAttribute('disabled');
        }""")

        if not has_next:
            break

        # Go to next page
        page.click("#NFLDraftBoard .rt-next-button")
        time.sleep(2)
        page_num += 1
        if page_num > 10:  # Safety cap
            break

    print(f"    Extracted {len(board_data)} players from Big Board ({page_num} pages)")
    return board_data


# ── Phase 2: Ratings tab extraction ───────────────────────────────────────────

# HB column → (db_field, film_grade_key)
HB_COLUMNS = {
    # idx: (field_or_None, film_grade_label)
    # 0:POS  1:img  2:PLAYER  3:GRADE  4:RK  5:ATHLETICISM  6:TACKLE  7:REC  8:MISC
    # 9:SPEED  10:ACC  11:DEC  12:COD  13:SIZE  14:BACKFIELD  15:OPEN FIELD
    # 16:CONT BAL  17:POWER  18:CUT  19:ROUTE  20:CATCH  21:PBLK  22:FUMBLE
    # 23:VISION  24:PATIENCE  25:CREATIVITY  26:GAP  27:ZONE
    3:  ("overall_grade",     None),
    5:  ("ath_composite",     "Athleticism"),
    6:  (None,                "Tackle Avoidance"),
    7:  (None,                "Receiving"),
    8:  (None,                "Miscellaneous"),
    9:  ("speed_score_jf",    "Speed"),
    10: ("acceleration_score","Acceleration"),
    11: (None,                "Deceleration"),
    12: ("agility_score_jf",  "Agility (COD)"),
    13: ("size_score",        "Size"),
    14: (None,                "Backfield Runs"),
    15: (None,                "Open Field"),
    16: (None,                "Contact Balance"),
    17: (None,                "Power"),
    18: (None,                "Cut"),
    19: (None,                "Route Running"),
    20: (None,                "Catching"),
    21: (None,                "Pass Blocking"),
    22: (None,                "Fumble Security"),
    23: (None,                "Vision"),
    24: (None,                "Patience"),
    25: (None,                "Creativity"),
    26: (None,                "Gap Scheme"),
    27: (None,                "Zone Scheme"),
}

WR_COLUMNS = {
    # 0:POS  1:img  2:PLAYER  3:GRADE  4:RK  5:ATH  6:PRESS  7:ROUTE  8:CATCH  9:YAC
    # 10:MISC  11:STRENGTH  12:SPEED  13:ACC  14:DEC  15:COD  16:QUICKNESS  17:STRENGTH
    # 18:FOOTWORK  19:STRENGTH  20:QUICKNESS  21:BURST  22:SAVVY  23:EFFICIENCY  24:STOP
    # 25:DOUBLE  26:ZONE  27:CATCH  28:RADIUS  29:TRACKING  30:CONTROL  31:JUMP BALL
    # 32:CONTACT  33:ELUSIVENESS  34:POWER  35:SPEED  36:FUMBLE  37:RBLK
    3:  ("overall_grade",     None),
    5:  ("ath_composite",     "Athleticism"),
    6:  (None,                "Press Coverage"),
    7:  (None,                "Route Running"),
    8:  (None,                "Catching"),
    9:  (None,                "YAC"),
    10: (None,                "Miscellaneous"),
    12: ("speed_score_jf",    "Speed"),
    13: ("acceleration_score","Acceleration"),
    15: ("agility_score_jf",  "Agility (COD)"),
    11: ("size_score",        "Size/Strength"),
    16: (None,                "Quickness"),
    17: (None,                "Route Strength"),
    18: (None,                "Footwork"),
    21: (None,                "Burst"),
    22: (None,                "Route Savvy"),
    23: (None,                "Route Efficiency"),
    24: (None,                "Stop Route"),
    25: (None,                "Double Move"),
    26: (None,                "Zone Recognition"),
    27: (None,                "Catch Hands"),
    28: (None,                "Catch Radius"),
    29: (None,                "Ball Tracking"),
    30: (None,                "Body Control"),
    31: (None,                "Jump Ball"),
    32: (None,                "Contact/RAC"),
    33: (None,                "Elusiveness"),
    34: (None,                "Power After Catch"),
    36: (None,                "Fumble Security"),
    37: (None,                "Run Blocking"),
}

QB_COLUMNS = {
    # 0:POS  1:img  2:PLAYER  3:GRADE  4:RK
    # 5:ACCURACY  6:ARM  7:MENTAL  8:RUSHING  9:POCKET
    # 10:SHORT  11:MED  12:DEEP  13:MIDDLE  14:SIDELINE  15:OFF PLAT  16:FOOTWORK
    # 17:STRENGTH  18:VELOCITY  19:RELEASE  20:FLEXIBILITY  21:TOUCH
    # 22:DECISION  23:PROCESSING  24:ANTICIPAT  25:PRESSURE  26:MOF  27:EYES  28:PRE  29:POST
    # 30:SPEED  31:ELUSIVE  32:POWER  33:POCKET  34:PRS MIT  35:BREAK SK  36:EVADE SK  37:EXTEND  38:FUMBLES
    3:  ("overall_grade",     None),
    5:  (None,                "Accuracy Composite"),
    6:  (None,                "Arm Composite"),
    7:  (None,                "Mental Composite"),
    8:  (None,                "Rushing Composite"),
    9:  (None,                "Pocket Composite"),
    10: (None,                "Short Accuracy"),
    11: (None,                "Medium Accuracy"),
    12: (None,                "Deep Accuracy"),
    13: (None,                "Middle Accuracy"),
    14: (None,                "Sideline Accuracy"),
    15: (None,                "Off-Platform"),
    16: (None,                "Footwork"),
    17: ("size_score",        "Arm Strength"),
    18: (None,                "Velocity"),
    19: (None,                "Release"),
    20: (None,                "Flexibility"),
    21: (None,                "Touch"),
    22: (None,                "Decision Making"),
    23: (None,                "Processing"),
    24: (None,                "Anticipation"),
    25: (None,                "Pressure Performance"),
    26: (None,                "Middle of Field"),
    27: (None,                "Eyes"),
    28: (None,                "Pre-Snap"),
    29: (None,                "Post-Snap"),
    30: ("speed_score_jf",    "Speed"),
    31: (None,                "Elusiveness"),
    32: (None,                "Power"),
    33: (None,                "Pocket Mobility"),
    34: (None,                "Pressure Mitigation"),
    35: (None,                "Broken Sacks"),
    36: (None,                "Evade Skill"),
    37: (None,                "Extend Plays"),
    38: (None,                "Fumble Security"),
}

TE_COLUMNS = {
    # 0:POS  1:img  2:PLAYER  3:GRADE  4:RK
    # 5:ATHLETICISM  6:ROUTE  7:CATCH  8:YAC  9:BLOCK
    # 10:STRENGTH  11:SPEED  12:ACC  13:COD  14:PRESS  15:STRENGTH  16:QUICKNESS
    # 17:SAVVY  18:EFFICIENCY  19:ZONE  20:CATCH  21:RADIUS  22:TRACKING
    # 23:CONTROL  24:JUMP BALL  25:CONTACT  26:ELUSIVENESS  27:POWER  28:SPEED
    # 29:PBLK  30:MOVE  31:LOS  32:EFFORT  33:POWER  34:TECHNIQUE
    3:  ("overall_grade",     None),
    5:  ("ath_composite",     "Athleticism"),
    6:  (None,                "Route Running"),
    7:  (None,                "Catching"),
    8:  (None,                "YAC"),
    9:  (None,                "Blocking Composite"),
    10: ("size_score",        "Size/Strength"),
    11: ("speed_score_jf",    "Speed"),
    12: ("acceleration_score","Acceleration"),
    13: ("agility_score_jf",  "Agility (COD)"),
    14: (None,                "Press Handling"),
    16: (None,                "Quickness"),
    17: (None,                "Route Savvy"),
    18: (None,                "Route Efficiency"),
    19: (None,                "Zone Recognition"),
    20: (None,                "Catch Hands"),
    21: (None,                "Catch Radius"),
    22: (None,                "Ball Tracking"),
    23: (None,                "Body Control"),
    24: (None,                "Jump Ball"),
    25: (None,                "Contact/RAC"),
    26: (None,                "Elusiveness"),
    27: (None,                "Power After Catch"),
    29: (None,                "Pass Blocking"),
    30: (None,                "Move Blocking"),
    31: (None,                "LOS Blocking"),
    32: (None,                "Effort"),
    34: (None,                "Technique"),
}

POSITION_COLUMN_MAPS = {
    "QB": QB_COLUMNS,
    "HB": HB_COLUMNS,
    "WR": WR_COLUMNS,
    "TE": TE_COLUMNS,
}

REACTABLE_IDS = {
    "QB": "qbrating",
    "HB": "hbrating",
    "WR": "wrrating",
    "TE": "terating",
}


def extract_rating_table(page, position: str) -> dict[str, dict]:
    """
    Navigate to the position sub-tab under Ratings and extract all rows.
    Returns dict keyed by normalised player name.
    """
    tab_id = REACTABLE_IDS[position]
    col_map = POSITION_COLUMN_MAPS[position]

    # Click position sub-tab
    try:
        page.click(f'[data-value="{position}"]')
        time.sleep(1)
    except Exception as e:
        print(f"    ERROR clicking {position} tab: {e}")
        return {}

    # Wait for reactable to load
    print(f"    Waiting for {tab_id} to load...")
    try:
        page.wait_for_function(
            f"() => {{ const el = document.getElementById('{tab_id}'); "
            f"return el && el.style.visibility !== 'hidden' && el.innerHTML.length > 100; }}",
            timeout=45000,
        )
    except PlaywrightTimeoutError:
        print(f"    TIMEOUT: {tab_id} did not load")
        return {}

    # Extract all rows (set page size to 100 first)
    try:
        page.select_option(f"#{tab_id} .rt-page-size-select", "100")
        time.sleep(2)
    except Exception:
        pass

    # Get headers (second row = detailed column names)
    headers = page.evaluate(f"""() => {{
        const rows = document.querySelectorAll('#{tab_id} [role=row]');
        if (rows.length < 2) return [];
        const cells = rows[1].querySelectorAll('[role=cell],[role=columnheader]');
        return Array.from(cells).map(c => c.innerText.trim());
    }}""")
    if DEBUG:
        print(f"    {position} headers: {headers}")

    # Paginate through all rows
    all_rows = []
    page_num = 1
    while True:
        rows = page.evaluate(f"""() => {{
            const rows = document.querySelectorAll('#{tab_id} [role=row]');
            return Array.from(rows).slice(2).map(row => {{
                const cells = row.querySelectorAll('[role=cell]');
                return Array.from(cells).map(c => c.innerText);
            }}).filter(r => r.length > 3);
        }}""")
        all_rows.extend(rows)

        has_next = page.evaluate(f"""() => {{
            const btn = document.querySelector('#{tab_id} .rt-next-button');
            return btn && !btn.disabled && !btn.getAttribute('disabled');
        }}""")
        if not has_next:
            break
        page.click(f"#{tab_id} .rt-next-button")
        time.sleep(2)
        page_num += 1
        if page_num > 10:
            break

    print(f"    Extracted {len(all_rows)} {position} rows from ratings table")

    # Parse rows
    rating_data = {}
    for row in all_rows:
        row = [clean_cell(c) for c in row]
        if len(row) < 4:
            continue
        player_raw = row[2] if len(row) > 2 else ""
        if not player_raw:
            continue
        player_name = player_raw.split("\n")[0].strip()
        if not player_name:
            continue

        result = {
            "name": player_name,
            "pos": position,
            "overall_grade": None,
            "ath_composite": None,
            "speed_score_jf": None,
            "acceleration_score": None,
            "agility_score_jf": None,
            "size_score": None,
            "film_grades": {},
        }

        for idx, (db_field, grade_label) in col_map.items():
            if idx >= len(row):
                continue
            val = parse_float(row[idx])
            if val is None:
                continue
            if db_field:
                result[db_field] = val
            if grade_label:
                result["film_grades"][grade_label] = val

        norm = normalize_name(player_name)
        rating_data[norm] = result

    return rating_data


# ── Phase 3: Join and upsert ───────────────────────────────────────────────────

def upsert_player(conn: sqlite3.Connection, player_id: int, data: dict):
    existing = conn.execute(
        "SELECT id FROM jfoster_grades WHERE player_id = ?", (player_id,)
    ).fetchone()

    film_json = json.dumps(data.get("film_grades")) if data.get("film_grades") else None
    ath_score = data.get("ath_composite")  # Overall athletic composite from ratings tab

    params = (
        data.get("overall_grade"),
        data.get("round_grade"),
        data.get("nfl_comp"),
        film_json,
        data.get("size_score"),
        data.get("speed_score_jf"),
        data.get("acceleration_score"),
        data.get("agility_score_jf"),
        ath_score,
    )

    if existing:
        conn.execute("""
            UPDATE jfoster_grades SET
                overall_grade=?, round_grade=?, nfl_comp=?, film_grades=?,
                size_score=?, speed_score_jf=?, acceleration_score=?,
                agility_score_jf=?, athletic_score=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE player_id=?
        """, (*params, player_id))
        return "updated"
    else:
        conn.execute("""
            INSERT INTO jfoster_grades (
                player_id, overall_grade, round_grade, nfl_comp, film_grades,
                size_score, speed_score_jf, acceleration_score, agility_score_jf, athletic_score
            ) VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (player_id, *params))
        return "inserted"


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    conn = get_db()

    inserted = updated = skipped = not_found = 0
    missed_names = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not DEBUG)
        page = browser.new_page(user_agent=USER_AGENT)

        print(f"Loading J. Foster app: {APP_URL}")
        page.goto(APP_URL, wait_until="load", timeout=60000)
        print("Waiting for Big Board to load (up to 90s)...")

        try:
            page.wait_for_function(
                "() => { const el = document.getElementById('NFLDraftBoard'); "
                "return el && el.style.visibility !== 'hidden' && el.innerHTML.length > 100; }",
                timeout=90000,
            )
            print("  Big Board loaded.")
        except PlaywrightTimeoutError:
            print("  ERROR: Big Board did not load in time.")
            browser.close()
            conn.close()
            return

        # ── Phase 1: Big Board ────────────────────────────────────────────────
        board_data = extract_big_board(page)

        if DEBUG:
            os.makedirs(DEBUG_DIR, exist_ok=True)
            with open(f"{DEBUG_DIR}/_board_data.json", "w", encoding="utf-8") as f:
                json.dump(board_data, f, ensure_ascii=False, indent=2)

        # ── Phase 2: Ratings tabs ─────────────────────────────────────────────
        print("\n  Phase 2: Navigating to Ratings tab...")
        try:
            page.click('[data-value="Ratings"]')
            time.sleep(3)
        except Exception as e:
            print(f"  ERROR clicking Ratings tab: {e}")
            browser.close()
            conn.close()
            return

        all_rating_data = {}  # normalised_name -> data dict

        for pos in RATING_POSITIONS:
            print(f"\n  Extracting {pos} ratings...")
            rating_data = extract_rating_table(page, pos)
            all_rating_data.update(rating_data)
            time.sleep(1)  # Polite delay

        browser.close()

    print(f"\n  Total Big Board entries: {len(board_data)}")
    print(f"  Total Rating entries: {len(all_rating_data)}")

    # ── Phase 3: Join and match to DB ─────────────────────────────────────────
    print("\n  Phase 3: Matching to DB and upserting...")

    # Merge: rating data is primary source for grade/film, board fills round/comp
    all_norms = set(all_rating_data.keys()) | set(board_data.keys())

    for norm in all_norms:
        rating = all_rating_data.get(norm, {})
        board  = board_data.get(norm, {})

        # Derive player name
        player_name = rating.get("name") or board.get("name", norm)

        # Merge data: rating has priority for grade, board fills round/comp
        merged = {
            "overall_grade":     rating.get("overall_grade") or board.get("grade"),
            "round_grade":       board.get("round_grade"),
            "nfl_comp":          board.get("nfl_comp"),
            "film_grades":       rating.get("film_grades"),
            "size_score":        rating.get("size_score"),
            "speed_score_jf":    rating.get("speed_score_jf"),
            "acceleration_score":rating.get("acceleration_score"),
            "agility_score_jf":  rating.get("agility_score_jf"),
            "ath_composite":     rating.get("ath_composite"),
        }

        # Skip rows with no useful data
        if not any([merged["overall_grade"], merged["round_grade"],
                    merged["nfl_comp"], merged["film_grades"]]):
            continue

        # Match to DB
        pid = find_player(conn, player_name)
        if pid is None:
            not_found += 1
            missed_names.append(player_name)
            if DEBUG:
                print(f"  NOT FOUND: {player_name}")
            continue

        # Check if already seeded
        if not FORCE and conn.execute(
            "SELECT id FROM jfoster_grades WHERE player_id = ?", (pid,)
        ).fetchone():
            skipped += 1
            continue

        print(f"  {player_name}: grade={merged['overall_grade']}, round={merged['round_grade']}, "
              f"comp={merged['nfl_comp']}, grades={len(merged.get('film_grades') or {})}")

        if not DRY_RUN:
            action = upsert_player(conn, pid, merged)
            if action == "inserted":
                inserted += 1
            else:
                updated += 1
            conn.commit()

    # ── Summary ───────────────────────────────────────────────────────────────
    prefix = "[DRY RUN] " if DRY_RUN else ""
    print(f"\n{prefix}J. Foster scraper complete.")
    print(f"  Inserted:  {inserted}")
    print(f"  Updated:   {updated}")
    print(f"  Skipped (already seeded): {skipped}")
    print(f"  Not in DB: {not_found}")

    if missed_names:
        print(f"\n  Not matched ({len(missed_names)}):")
        for n in missed_names[:30]:
            print(f"    {n}")

    conn.close()


if __name__ == "__main__":
    run()
