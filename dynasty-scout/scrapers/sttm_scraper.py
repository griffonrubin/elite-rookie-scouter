"""
Scrape sticktothemodel.com CSVs for:
  1. Rankings (TankAthlete, PFN, TDN, Brugler, Jeremiah)
  2. Combine measurables (wingspan, arm length, hand size, vertical, broad jump, etc.)

Run: py scrapers/sttm_scraper.py [--dry-run] [--rankings] [--combine]
     (default: both)
"""
import csv, io, os, re, sqlite3, sys, urllib.request
from datetime import datetime

DRY_RUN   = '--dry-run' in sys.argv
DO_RANK   = '--rankings' in sys.argv or '--combine' not in sys.argv
DO_COMB   = '--combine'  in sys.argv or '--rankings' not in sys.argv

DB_PATH   = os.path.join(os.path.dirname(__file__), '..', 'dynasty_scout.db')
HEADERS   = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
BASE_URL  = 'https://sticktothemodel.com/assets/data/processed/draft_sim/2026/'

RANK_CSV  = BASE_URL + 'available_players.csv'
COMB_CSV  = BASE_URL + 'player_descriptions2.csv'

SCRAPED_AT = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')


def fetch_csv(url: str) -> list[dict]:
    req  = urllib.request.Request(url, headers=HEADERS)
    raw  = urllib.request.urlopen(req, timeout=20).read().decode('utf-8-sig')
    return list(csv.DictReader(io.StringIO(raw)))


def slug_from_name(name: str) -> str:
    """Convert 'Ja'Kobi Lane' → 'jakobi-lane' style slug for fuzzy matching."""
    s = re.sub(r"[''`]", '', name.lower())
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s


def find_player(db: sqlite3.Connection, name: str) -> int | None:
    # exact full_name match first
    row = db.execute("SELECT id FROM players WHERE LOWER(full_name) = ? AND draft_year = 2026",
                     (name.lower().strip(),)).fetchone()
    if row: return row[0]

    # slug-style match
    slug = slug_from_name(name)
    row = db.execute("SELECT id FROM players WHERE slug LIKE ? AND draft_year = 2026",
                     (slug + '%',)).fetchone()
    if row: return row[0]

    # last-name + first-char match (handles Jr./III/II suffix differences)
    parts = name.lower().split()
    if len(parts) >= 2:
        first_char = parts[0][0]
        last       = parts[-1].rstrip('.')
        row = db.execute("""SELECT id FROM players
                             WHERE draft_year = 2026
                               AND LOWER(last_name) = ?
                               AND LOWER(first_name) LIKE ?
                          """, (last, first_char + '%')).fetchone()
        if row: return row[0]

    return None


# ── Rankings ────────────────────────────────────────────────────────────────

RANK_SOURCES = {
    'tankRank':     'TankAthlete',
    'pfn_rank':     'Pro Football Network',
    'tdn_rank':     'The Draft Network',
    'brugler_rank': 'Matt Brugler',
    'jeremiah_rank':'Daniel Jeremiah',
}

def sync_rankings(db: sqlite3.Connection, rows: list[dict]):
    # Buffer per source: list of (raw_rank, player_id, name).
    # Re-number 1..N among skill-position players only, so non-skill positions
    # (OL, DL, DB etc.) ranked higher on draft boards don't inflate our ranks.
    source_buffers: dict[str, list[tuple[int, int, str]]] = {src: [] for src in RANK_SOURCES.values()}

    miss = 0
    for row in rows:
        pid = find_player(db, row.get('Name', ''))
        if pid is None:
            miss += 1
            continue

        for col, source in RANK_SOURCES.items():
            val = row.get(col, '').strip()
            if not val or val.upper() in ('NA', 'N/A', ''):
                continue
            try:
                rank = int(float(val))
            except ValueError:
                continue
            source_buffers[source].append((rank, pid, row.get('Name', '')))

    hit = 0
    for source, items in source_buffers.items():
        if not items:
            continue
        # Sort by raw rank and re-number as relative 1..N (skill positions only)
        items.sort(key=lambda x: x[0])
        seen_pids: set[int] = set()
        relative_rank = 0
        for raw_rank, pid, name in items:
            if pid in seen_pids:
                continue
            seen_pids.add(pid)
            relative_rank += 1

            if DRY_RUN:
                print(f'  DRY  {source} #{relative_rank} (raw #{raw_rank}) -> {name}')
                hit += 1
                continue

            db.execute("""
                INSERT INTO rankings (player_id, source, rank_overall, scraped_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(player_id, source, scraped_at) DO UPDATE SET
                    rank_overall = EXCLUDED.rank_overall
            """, (pid, source, relative_rank, SCRAPED_AT[:10]))
            hit += 1

    if not DRY_RUN: db.commit()
    print(f'Rankings: {hit} inserted/updated, {miss} players not found')


# ── Combine / Measurables ───────────────────────────────────────────────────

def parse_height(h: str) -> int | None:
    """'6-2' → 74 inches"""
    m = re.match(r'(\d+)-(\d+)', h.strip())
    if m: return int(m.group(1)) * 12 + int(m.group(2))
    return None

def safe_float(v: str) -> float | None:
    v = v.strip()
    if not v or v in ('-', 'NA', 'N/A', ''): return None
    try: return float(v)
    except ValueError: return None

def safe_int(v: str) -> int | None:
    f = safe_float(v)
    return int(f) if f is not None else None


def sync_combine(db: sqlite3.Connection, rows: list[dict]):
    # Ensure wingspan column exists
    try:
        db.execute("ALTER TABLE measurables ADD COLUMN wingspan REAL")
        db.commit()
        print('  Added wingspan column to measurables')
    except Exception:
        pass  # already exists

    hit = miss = 0
    for row in rows:
        pid = find_player(db, row.get('Name', ''))
        if pid is None:
            miss += 1
            continue

        forty      = safe_float(row.get('40_time', ''))
        ten_split  = safe_float(row.get('10_Yard_Split', ''))
        shuttle    = safe_float(row.get('20_Yard_Shuttle', ''))
        cone       = safe_float(row.get('3_Cone_Drill', ''))
        arm        = safe_float(row.get('Arm_Length', ''))
        bench      = safe_int(row.get('Bench_Press', ''))
        broad      = safe_int(row.get('Broad_Jump', ''))
        hand       = safe_float(row.get('Hand_Size', ''))
        vertical   = safe_float(row.get('Vertical_Jump', ''))
        wingspan   = safe_float(row.get('Wingspan', ''))
        ras        = safe_float(row.get('RAS', ''))
        weight     = safe_int(row.get('Weight', ''))
        height_raw = row.get('Height', '').strip()
        height_in  = parse_height(height_raw) if height_raw else None

        # Skip rows with no useful data
        fields = [forty, ten_split, shuttle, cone, arm, bench, broad, hand, vertical, wingspan, ras]
        if all(f is None for f in fields):
            continue

        if DRY_RUN:
            print(f'  DRY  {row["Name"]} | 40={forty} ras={ras} arm={arm} wing={wingspan}')
            hit += 1
            continue

        # Upsert measurables — only overwrite NULLs to avoid clobbering verified data
        existing = db.execute("SELECT id FROM measurables WHERE player_id = ?", (pid,)).fetchone()
        if existing:
            db.execute("""
                UPDATE measurables SET
                    forty_yard          = COALESCE(forty_yard,         ?),
                    ten_yard_split      = COALESCE(ten_yard_split,     ?),
                    twenty_yard_shuttle = COALESCE(twenty_yard_shuttle,?),
                    three_cone          = COALESCE(three_cone,         ?),
                    arm_length          = COALESCE(arm_length,         ?),
                    bench_press         = COALESCE(bench_press,        ?),
                    broad_jump          = COALESCE(broad_jump,         ?),
                    hand_size           = COALESCE(hand_size,          ?),
                    vertical_jump       = COALESCE(vertical_jump,      ?),
                    wingspan            = COALESCE(wingspan,           ?),
                    ras                 = COALESCE(ras,                ?)
                WHERE player_id = ?
            """, (forty, ten_split, shuttle, cone, arm, bench, broad, hand, vertical, wingspan, ras, pid))
        else:
            db.execute("""
                INSERT OR IGNORE INTO measurables
                    (player_id, forty_yard, ten_yard_split, twenty_yard_shuttle,
                     three_cone, arm_length, bench_press, broad_jump,
                     hand_size, vertical_jump, wingspan, ras)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (pid, forty, ten_split, shuttle, cone, arm, bench, broad, hand, vertical, wingspan, ras))

        # Also update height/weight on players table if missing
        if height_in or weight:
            db.execute("""
                UPDATE players SET
                    height_inches = COALESCE(height_inches, ?),
                    weight_lbs    = COALESCE(weight_lbs,    ?)
                WHERE id = ?
            """, (height_in, weight, pid))

        hit += 1

    if not DRY_RUN: db.commit()
    print(f'Combine: {hit} updated, {miss} players not found')


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    if DO_RANK:
        print('Fetching rankings CSV...')
        rows = fetch_csv(RANK_CSV)
        print(f'  {len(rows)} prospects found')
        sync_rankings(db, rows)

    if DO_COMB:
        print('\nFetching combine CSV...')
        rows = fetch_csv(COMB_CSV)
        print(f'  {len(rows)} prospects found')
        sync_combine(db, rows)

    db.close()
    print('\nDone.')


if __name__ == '__main__':
    main()
