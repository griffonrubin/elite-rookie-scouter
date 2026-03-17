"""
scrapers/community_seed.py
Ingests advanced stats from community-shared Google Sheets or CSV files
posted by creators on X/Twitter and Reddit (r/DynastyFF, r/NFLDraft).

Usage:
  # From a Google Sheet (published as CSV):
  py scrapers/community_seed.py "https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv"

  # From a local CSV file:
  py scrapers/community_seed.py path/to/stats.csv

  # Preview without writing to DB:
  py scrapers/community_seed.py path/to/stats.csv --dry-run

  # Specify which column maps to which DB field (if auto-detection fails):
  py scrapers/community_seed.py sheet_url --map "YPRR=yprr" "Drop%=drop_rate" "DOM%=dominator_rating"

Column auto-detection:
  The script fuzzy-maps common column names used by community creators
  to our database fields. See COLUMN_ALIASES below.

Required columns (at least one must be present for player matching):
  - Player name (various spellings: "Player", "Name", "player_name", etc.)
  - Position (optional but helps disambiguate)
  - School / Team (optional)

Supported DB fields (any subset):
  yprr, routes_run, targets, drop_rate, contested_catch_rate,
  yards_after_catch, missed_tackles_forced, dominator_rating,
  air_yards, adot, target_share, pff_overall_grade, pff_recv_grade,
  pff_rush_grade, pff_block_grade, ppa_avg, usage_pct
"""

import os
import re
import sys
import csv
import io
import sqlite3
import requests
from collections import defaultdict

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dynasty_scout.db")

# Maps community column names → our DB field names
# Keys are lowercased, stripped of spaces/special chars for fuzzy matching
COLUMN_ALIASES: dict[str, str] = {
    # YPRR
    "yprr": "yprr",
    "yardsperroutrun": "yprr",
    "ydsperroutrun": "yprr",
    "yardsroutrun": "yprr",
    # Routes
    "routesrun": "routes_run",
    "routes": "routes_run",
    "routecount": "routes_run",
    # Targets
    "targets": "targets",
    "tgts": "targets",
    "tgt": "targets",
    # Drop rate
    "droprate": "drop_rate",
    "drop": "drop_rate",
    "droppct": "drop_rate",
    "drops": "drop_rate",  # will be treated as % if <1, else count
    # Contested catch
    "contestedcatch": "contested_catch_rate",
    "contestedcatchrate": "contested_catch_rate",
    "contestedpct": "contested_catch_rate",
    "cc": "contested_catch_rate",
    # YAC
    "yac": "yards_after_catch",
    "yardsaftercatch": "yards_after_catch",
    "yacpergame": None,  # skip — not a DB field
    # MTF
    "missedtacklesforced": "missed_tackles_forced",
    "mtf": "missed_tackles_forced",
    "brokentackles": "missed_tackles_forced",
    # Dominator
    "dominator": "dominator_rating",
    "dominatorrating": "dominator_rating",
    "dom": "dominator_rating",
    "dompct": "dominator_rating",
    # Air yards
    "airyards": "air_yards",
    "airyds": "air_yards",
    # ADOT
    "adot": "adot",
    "avgdepthoftarget": "adot",
    "averagedepthoftarget": "adot",
    # Target share
    "targetshare": "target_share",
    "tgtshare": "target_share",
    "tgtpct": "target_share",
    # PFF grades
    "pffgrade": "pff_overall_grade",
    "pffoverallgrade": "pff_overall_grade",
    "pffrecvgrade": "pff_recv_grade",
    "pffrushgrade": "pff_rush_grade",
    "pffblockgrade": "pff_block_grade",
    # PPA
    "ppa": "ppa_avg",
    "avgppa": "ppa_avg",
    # Usage
    "usage": "usage_pct",
    "usagepct": "usage_pct",
    # Season (for multi-season sheets)
    "season": "season",
    "year": "season",
    # School/team
    "school": "school",
    "team": "school",
    "college": "school",
}

NAME_COLS = ["player", "name", "playername", "fullname", "athlete"]
POS_COLS = ["pos", "position"]


def normalize(name: str) -> str:
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r"[''`\-\.\,\"\(\)]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def col_key(col: str) -> str:
    """Normalize a column header for alias lookup."""
    return re.sub(r"[^a-z0-9]", "", col.lower())


def load_csv(source: str) -> list[dict]:
    """Load CSV from URL or file path."""
    if source.startswith("http"):
        print(f"Downloading from URL: {source}")
        resp = requests.get(source, timeout=30)
        resp.raise_for_status()
        text = resp.text
    else:
        print(f"Reading local file: {source}")
        with open(source, "r", encoding="utf-8-sig") as f:
            text = f.read()

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    print(f"  Loaded {len(rows)} rows, columns: {list(rows[0].keys()) if rows else []}")
    return rows


def detect_column_mapping(headers: list[str], manual_map: dict[str, str] = None) -> dict[str, str]:
    """
    Returns {csv_header: db_field} for all columns we can map.
    manual_map entries (--map) override auto-detection.
    """
    mapping = {}

    for h in headers:
        key = col_key(h)
        if manual_map and h in manual_map:
            mapping[h] = manual_map[h]
        elif key in COLUMN_ALIASES and COLUMN_ALIASES[key]:
            mapping[h] = COLUMN_ALIASES[key]

    return mapping


def safe_float(val: str | None) -> float | None:
    if val is None:
        return None
    val = str(val).strip().replace("%", "").replace(",", "")
    if val in ("", "NA", "N/A", "-", "—", "null", "None"):
        return None
    try:
        return float(val)
    except ValueError:
        return None


def run(source: str, dry_run: bool = False, manual_map: dict[str, str] = None, default_season: int = 2025):
    rows = load_csv(source)
    if not rows:
        print("No rows found.")
        return

    headers = list(rows[0].keys())
    col_map = detect_column_mapping(headers, manual_map)

    # Find name and position columns
    name_col = next((h for h in headers if col_key(h) in NAME_COLS), None)
    pos_col = next((h for h in headers if col_key(h) in POS_COLS), None)
    school_col = next((v_header for v_header, db_field in col_map.items() if db_field == "school"), None)
    season_col = next((v_header for v_header, db_field in col_map.items() if db_field == "season"), None)

    if not name_col:
        print(f"ERROR: Could not find a player name column. Headers: {headers}")
        sys.exit(1)

    print(f"\nColumn mapping:")
    print(f"  Player name: '{name_col}'")
    if pos_col:
        print(f"  Position:    '{pos_col}'")
    if school_col:
        print(f"  School:      '{school_col}'")
    for csv_col, db_field in col_map.items():
        if db_field not in ("school", "season"):
            print(f"  '{csv_col}' → {db_field}")

    # DB lookup
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    players = cur.execute(
        "SELECT id, full_name, position FROM players WHERE draft_year=2026"
    ).fetchall()
    name_lookup = defaultdict(list)
    for pid, name, pos in players:
        name_lookup[normalize(name)].append((pid, name, pos))

    matched = 0
    skipped = 0

    for row in rows:
        player_name = row.get(name_col, "").strip()
        if not player_name:
            continue

        norm = normalize(player_name)
        db_matches = name_lookup.get(norm, [])
        if not db_matches:
            # Try partial last name match
            last = norm.split()[-1] if norm.split() else ""
            db_matches = [(pid, n, p) for key, entries in name_lookup.items()
                          for pid, n, p in entries if key.endswith(last) and len(last) > 3]
            if len(db_matches) > 1:
                db_matches = []  # too ambiguous

        if not db_matches:
            skipped += 1
            continue

        # Filter by position if available
        if pos_col:
            csv_pos = row.get(pos_col, "").strip().upper()
            if csv_pos in ("QB", "RB", "WR", "TE"):
                db_matches = [m for m in db_matches if m[2] == csv_pos] or db_matches

        player_id, full_name, pos = db_matches[0]

        # Determine season and school
        season = default_season
        if season_col:
            s = safe_float(row.get(season_col))
            if s and 2015 <= s <= 2026:
                season = int(s)

        school = "Unknown"
        if school_col:
            school = row.get(school_col, "Unknown").strip() or "Unknown"
        else:
            # Try to find existing row for this player/season
            existing = cur.execute(
                "SELECT school FROM college_stats WHERE player_id=? AND season=? ORDER BY rec_yards DESC NULLS LAST LIMIT 1",
                (player_id, season)
            ).fetchone()
            if existing:
                school = existing[0]

        # Build update dict for mapped stat columns
        updates = {}
        for csv_col, db_field in col_map.items():
            if db_field in ("school", "season"):
                continue
            val = safe_float(row.get(csv_col))
            if val is None:
                continue
            # Normalize percentages: if field is a rate (drop_rate, target_share, etc.)
            # and value looks like it's in 0-100 range, divide by 100
            rate_fields = {"drop_rate", "contested_catch_rate", "target_share", "usage_pct",
                           "dominator_rating", "breakaway_run_rate", "explosive_run_rate"}
            if db_field in rate_fields and val > 1.0:
                val = val / 100.0
            updates[db_field] = val

        if not updates:
            skipped += 1
            continue

        if dry_run:
            print(f"  DRY-RUN: {full_name} ({pos}) {season}@{school}: {updates}")
            matched += 1
            continue

        # Build upsert
        set_clause = ", ".join([
            f"{field} = CASE WHEN excluded.{field} IS NOT NULL THEN excluded.{field} ELSE college_stats.{field} END"
            for field in updates
        ])
        placeholders = ", ".join(["?"] * (3 + len(updates)))
        insert_cols = "player_id, season, school, " + ", ".join(updates.keys())
        values = [player_id, season, school] + list(updates.values())

        cur.execute(f"""
            INSERT INTO college_stats ({insert_cols})
            VALUES ({placeholders})
            ON CONFLICT(player_id, season, school) DO UPDATE SET {set_clause}
        """, values)
        matched += 1

    if not dry_run:
        conn.commit()
    conn.close()

    print(f"\n{'═'*50}")
    print(f"Community seed complete")
    print(f"  Matched / upserted: {matched}")
    print(f"  Skipped (no match): {skipped}")
    if dry_run:
        print("  (DRY RUN — no DB writes)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    source_arg = sys.argv[1]
    dry = "--dry-run" in sys.argv

    # Parse --map KEY=VALUE pairs
    manual = {}
    if "--map" in sys.argv:
        idx = sys.argv.index("--map")
        for a in sys.argv[idx + 1:]:
            if a.startswith("--"):
                break
            if "=" in a:
                k, v = a.split("=", 1)
                manual[k.strip()] = v.strip()

    # Parse --season YEAR
    default_yr = 2025
    if "--season" in sys.argv:
        idx = sys.argv.index("--season")
        try:
            default_yr = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            pass

    run(source_arg, dry_run=dry, manual_map=manual or None, default_season=default_yr)
