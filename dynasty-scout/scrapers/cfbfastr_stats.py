"""
scrapers/cfbfastr_stats.py
Downloads cfbfastR play-by-play data from GitHub and aggregates
air_yards, yards_after_catch, targets, and ADOT per player per season.

Data source: https://github.com/sportsdataverse/cfbfastR-data
(ESPN play-by-play processed by the cfbfastR R package — free, public)

Run:
  py scrapers/cfbfastr_stats.py              # seasons 2020-2025
  py scrapers/cfbfastr_stats.py --years 2024 2025
  py scrapers/cfbfastr_stats.py --dry-run    # print matches, no DB writes
"""

import os
import re
import sys
import sqlite3
import time
import gzip
import io
import csv
import requests
from collections import defaultdict

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dynasty_scout.db")

# cfbfastR-data GitHub raw URLs — they publish compressed CSVs per season
# Primary pattern (releases); fallback to main branch raw
PBP_URL_TEMPLATES = [
    "https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/pbp/play_by_play_{year}.csv.gz",
    "https://github.com/sportsdataverse/cfbfastR-data/releases/download/cfbfastr_pbp/play_by_play_{year}.csv.gz",
]

DEFAULT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025]


# ── Name normalization ────────────────────────────────────────────────────────

def normalize(name: str) -> str:
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r"[''`\-\.\,\"]", "", name)
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


# ── Download helpers ──────────────────────────────────────────────────────────

def download_pbp_csv(year: int) -> list[dict] | None:
    """Try each URL template for a given year. Returns list of row dicts or None."""
    for template in PBP_URL_TEMPLATES:
        url = template.format(year=year)
        print(f"  Trying {url} ...")
        try:
            resp = requests.get(url, timeout=60, stream=True)
            if resp.status_code != 200:
                print(f"    HTTP {resp.status_code} — skipping")
                continue

            content = resp.content
            # Try gzip decode
            try:
                decompressed = gzip.decompress(content)
            except Exception:
                decompressed = content  # might already be plain text

            text = decompressed.decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
            print(f"    OK — {len(rows):,} rows")
            return rows

        except requests.RequestException as e:
            print(f"    Connection error: {e}")
            continue

    return None


# ── Main aggregation ──────────────────────────────────────────────────────────

def aggregate_receiver_stats(rows: list[dict], year: int) -> dict:
    """
    From play-by-play rows, aggregate per (receiver_name, team, year):
      targets, completions, air_yards_sum, yac_sum

    cfbfastR column names (may vary by release):
      receiver_player_name, pass_attempt, complete_pass,
      air_yards, yards_after_catch, pos_team (offense team)
    """
    # Map possible column name variants
    RECEIVER_COLS = ["receiver_player_name", "receiver_player", "receiver"]
    TEAM_COLS = ["pos_team", "offense", "offense_team", "off"]
    AIR_YARDS_COLS = ["air_yards", "air_yds"]
    YAC_COLS = ["yards_after_catch", "yac", "yards_after_catch_attempt"]
    COMPLETE_COLS = ["complete_pass", "completion", "pass_complete"]
    PASS_ATTEMPT_COLS = ["pass_attempt", "is_pass", "pass"]

    # Detect columns present in this dataset
    if not rows:
        return {}
    sample = rows[0]

    def find_col(candidates):
        for c in candidates:
            if c in sample:
                return c
        return None

    receiver_col = find_col(RECEIVER_COLS)
    team_col = find_col(TEAM_COLS)
    air_col = find_col(AIR_YARDS_COLS)
    yac_col = find_col(YAC_COLS)
    complete_col = find_col(COMPLETE_COLS)
    pass_col = find_col(PASS_ATTEMPT_COLS)

    if not receiver_col:
        print(f"    WARNING: No receiver column found. Columns: {list(sample.keys())[:15]}")
        return {}

    stats = defaultdict(lambda: {"targets": 0, "completions": 0, "air_yards": 0.0, "yac": 0.0})

    for row in rows:
        receiver = row.get(receiver_col, "").strip()
        if not receiver or receiver in ("", "NA", "None"):
            continue

        # Filter to pass plays that targeted someone
        is_pass = True
        if pass_col:
            try:
                is_pass = float(row.get(pass_col, 0)) == 1
            except (ValueError, TypeError):
                is_pass = str(row.get(pass_col, "")).lower() in ("1", "true", "yes")

        if not is_pass:
            continue

        team = row.get(team_col, "Unknown").strip() if team_col else "Unknown"
        key = (normalize(receiver), team, year)

        stats[key]["targets"] += 1

        if complete_col:
            try:
                comp = float(row.get(complete_col, 0))
                if comp == 1:
                    stats[key]["completions"] += 1
            except (ValueError, TypeError):
                pass

        if air_col:
            try:
                val = float(row.get(air_col, 0) or 0)
                stats[key]["air_yards"] += val
            except (ValueError, TypeError):
                pass

        if yac_col:
            try:
                val = float(row.get(yac_col, 0) or 0)
                stats[key]["yac"] += val
            except (ValueError, TypeError):
                pass

    return dict(stats)


# ── DB upsert ─────────────────────────────────────────────────────────────────

def upsert_stats(cur, player_id: int, season: int, school: str, agg: dict, dry_run: bool):
    targets = agg["targets"]
    air_yards = round(agg["air_yards"], 1) if agg["air_yards"] else None
    yac = round(agg["yac"], 1) if agg["yac"] else None
    adot = round(agg["air_yards"] / agg["targets"], 2) if agg["targets"] > 0 and agg["air_yards"] else None

    if dry_run:
        print(f"    DRY-RUN upsert: player={player_id} {season}@{school} tgt={targets} air={air_yards} yac={yac} adot={adot}")
        return

    cur.execute("""
        INSERT INTO college_stats (player_id, season, school, targets, air_yards, yards_after_catch, adot)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id, season, school) DO UPDATE SET
          targets           = CASE WHEN excluded.targets > COALESCE(college_stats.targets, 0)
                                   THEN excluded.targets ELSE college_stats.targets END,
          air_yards         = CASE WHEN excluded.air_yards IS NOT NULL
                                   THEN excluded.air_yards ELSE college_stats.air_yards END,
          yards_after_catch = CASE WHEN excluded.yards_after_catch IS NOT NULL AND college_stats.yards_after_catch IS NULL
                                   THEN excluded.yards_after_catch ELSE college_stats.yards_after_catch END,
          adot              = CASE WHEN excluded.adot IS NOT NULL
                                   THEN excluded.adot ELSE college_stats.adot END
    """, (player_id, season, school, targets, air_yards, yac, adot))


# ── Main ──────────────────────────────────────────────────────────────────────

def run(years: list[int] = None, dry_run: bool = False):
    if years is None:
        years = DEFAULT_YEARS

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Build lookup: normalized_name -> [(player_id, full_name, position)]
    players = cur.execute(
        "SELECT id, full_name, position FROM players WHERE draft_year=2026"
    ).fetchall()
    name_to_players = defaultdict(list)
    for pid, name, pos in players:
        name_to_players[normalize(name)].append((pid, name, pos))

    print(f"Loaded {len(players)} tracked players\n")

    total_matched = 0
    total_upserted = 0

    for year in years:
        print(f"\n{'─'*60}")
        print(f"Season {year}")
        print(f"{'─'*60}")

        rows = download_pbp_csv(year)
        if rows is None:
            print(f"  Could not download PBP data for {year} — skipping")
            continue

        agg = aggregate_receiver_stats(rows, year)
        print(f"  Aggregated {len(agg)} (receiver, team, year) combos")

        # Match to our players
        for (norm_name, team, yr), stats in agg.items():
            if stats["targets"] < 2:
                continue  # skip noise

            matches = name_to_players.get(norm_name, [])
            if not matches:
                continue

            # If multiple name matches, pick by position priority (WR > TE > RB)
            # and also check if a DB row already exists for that player/season/school
            for player_id, full_name, pos in matches:
                # Try exact school match first, then accept any
                existing = cur.execute(
                    "SELECT id FROM college_stats WHERE player_id=? AND season=? AND school=?",
                    (player_id, year, team)
                ).fetchone()
                if existing or len(matches) == 1:
                    upsert_stats(cur, player_id, year, team, stats, dry_run)
                    total_upserted += 1
                    total_matched += 1
                    if not dry_run:
                        print(f"    ✓ {full_name:30} {year}@{team:20} tgt={stats['targets']:3} air={stats['air_yards']:.0f} adot={stats['air_yards']/stats['targets']:.1f}" if stats["targets"] > 0 and stats["air_yards"] else f"    ✓ {full_name:30} {year}@{team:20} tgt={stats['targets']:3}")
                    break

        if not dry_run:
            conn.commit()
        time.sleep(1)  # be a good citizen

    conn.close()

    print(f"\n{'═'*60}")
    print(f"cfbfastR scrape complete")
    print(f"  Players matched / upserted: {total_matched} / {total_upserted}")
    if dry_run:
        print("  (DRY RUN — no DB writes)")


if __name__ == "__main__":
    years_arg = DEFAULT_YEARS
    dry = "--dry-run" in sys.argv

    if "--years" in sys.argv:
        idx = sys.argv.index("--years")
        years_arg = []
        for a in sys.argv[idx + 1:]:
            if a.startswith("--"):
                break
            try:
                years_arg.append(int(a))
            except ValueError:
                pass

    run(years=years_arg, dry_run=dry)
