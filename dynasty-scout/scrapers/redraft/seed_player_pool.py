"""
Seed the redraft player pool + external ID crosswalk.

Sources
  1. Sleeper player dump      https://api.sleeper.app/v1/players/nfl
     -> identity for every rostered NFL player (name, team, position, age,
        sleeper_id, sometimes espn/yahoo/gsis ids) plus the 32 DEF entries.
  2. DynastyProcess ID map    dynastyprocess/data/files/db_playerids.csv
     -> fills in gsis_id / espn_id / yahoo_id / fantasypros_id, which Sleeper
        leaves blank for most players. gsis_id is the nflverse join key, so
        this file is what makes the stats pipeline possible.

Behaviour
  - Existing rows (the 216 rookies) are UPDATED in place: they get
    redraft_pool = 1 plus the ID columns. Their college data, slug,
    position, headshot and draft_year = 2026 are never touched, so the
    rookie board keeps working exactly as before.
  - New rows (veterans, kickers, D/ST) are INSERTED with draft_year = NULL.
    Their real NFL draft year goes in nfl_draft_year. No row this script
    writes can ever appear on the rookie board.

Usage:  py -m scrapers.redraft.seed_player_pool
"""
import csv
import io
import json
import sys
import urllib.request
from collections import defaultdict

from scrapers import config
from scrapers.redraft.names import normalize_name, slugify, norm_team

SLEEPER_URL = "https://api.sleeper.app/v1/players/nfl"
CROSSWALK_URL = "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv"
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K"}
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; DyCharts/1.0)"}

INSERT_PLAYER = """
    INSERT INTO players
        (slug, full_name, first_name, last_name, position, dob,
         height_inches, weight_lbs, draft_year, nfl_team, nfl_headshot_url,
         redraft_pool, sleeper_id, gsis_id, espn_nfl_id, yahoo_id,
         fantasypros_id, nfl_draft_year, years_exp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
"""

UPDATE_PLAYER = """
    UPDATE players SET
        redraft_pool     = 1,
        sleeper_id       = ?,
        gsis_id          = COALESCE(?, gsis_id),
        espn_nfl_id      = COALESCE(?, espn_nfl_id),
        yahoo_id         = COALESCE(?, yahoo_id),
        fantasypros_id   = COALESCE(?, fantasypros_id),
        nfl_headshot_url = ?,
        nfl_draft_year   = COALESCE(?, nfl_draft_year),
        years_exp        = COALESCE(?, years_exp),
        nfl_team         = COALESCE(?, nfl_team)
    WHERE id = ?
"""


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def fetch_csv(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=180) as r:
        text = r.read().decode("utf-8", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def blank_to_none(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None


def clean_id(v):
    """CSV numeric ids arrive as '1234' or '1234.0'."""
    v = blank_to_none(v)
    return v.split(".")[0] if v else None


def to_int(v):
    v = blank_to_none(v)
    if v is None:
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def build_crosswalk(rows):
    """Index the DynastyProcess map by sleeper_id and by (normalized name, pos)."""
    by_sleeper, by_name = {}, {}
    for r in rows:
        sid = clean_id(r.get("sleeper_id"))
        if sid:
            by_sleeper[sid] = r
        nm = normalize_name(r.get("name") or r.get("merge_name") or "")
        pos = (r.get("position") or "").strip().upper()
        if nm and pos:
            by_name.setdefault((nm, pos), r)
    return by_sleeper, by_name


def load_existing(cursor):
    """Existing players indexed by slug and by (normalized name, position)."""
    cursor.execute("SELECT id, slug, full_name, position, draft_year FROM players")
    rows = cursor.fetchall()
    by_slug = {r["slug"]: dict(r) for r in rows}
    by_name = defaultdict(list)
    for r in rows:
        by_name[(normalize_name(r["full_name"]), (r["position"] or "").upper())].append(dict(r))
    return by_slug, by_name, set(by_slug)


def unique_slug(base, team, used):
    """Slug collisions (two active 'Michael Carter's) get a team suffix."""
    if base not in used:
        return base
    if team:
        candidate = f"{base}-{team.lower()}"
        if candidate not in used:
            return candidate
    i = 2
    while f"{base}-{i}" in used:
        i += 1
    return f"{base}-{i}"


def seed():
    conn = config.get_db_connection()
    if conn is None:
        print("ERROR: could not open the database")
        return 1
    cursor = conn.cursor()

    print("Fetching Sleeper player dump ...")
    sleeper = fetch_json(SLEEPER_URL)
    print(f"  {len(sleeper)} entries")

    print("Fetching DynastyProcess ID crosswalk ...")
    xwalk_rows = fetch_csv(CROSSWALK_URL)
    xw_by_sleeper, xw_by_name = build_crosswalk(xwalk_rows)
    print(f"  {len(xwalk_rows)} rows ({len(xw_by_sleeper)} with a sleeper_id)")

    by_slug, by_name, used_slugs = load_existing(cursor)
    print(f"Existing players in DB: {len(by_slug)}")

    pool = [
        v for v in sleeper.values()
        if v.get("team")
        and v.get("status") == "Active"
        and v.get("position") in FANTASY_POSITIONS
        and (v.get("full_name") or v.get("last_name"))
    ]
    print(f"Active fantasy-position players on a roster: {len(pool)}")

    matched = inserted = 0
    id_fill = defaultdict(int)

    for p in pool:
        name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
        pos = p["position"]
        team = norm_team(p.get("team"))
        sid = str(p.get("player_id"))
        nname = normalize_name(name)

        xw = xw_by_sleeper.get(sid) or xw_by_name.get((nname, pos)) or {}

        gsis = blank_to_none(p.get("gsis_id")) or blank_to_none(xw.get("gsis_id"))
        espn = clean_id(p.get("espn_id")) or clean_id(xw.get("espn_id"))
        yahoo = clean_id(p.get("yahoo_id")) or clean_id(xw.get("yahoo_id"))
        fpros = clean_id(xw.get("fantasypros_id"))
        for key, val in (("gsis", gsis), ("espn", espn), ("yahoo", yahoo), ("fpros", fpros)):
            if val:
                id_fill[key] += 1

        headshot = f"https://sleepercdn.com/content/nfl/players/{sid}.jpg"
        nfl_draft_year = to_int(xw.get("draft_year"))
        years_exp = to_int(p.get("years_exp"))

        # --- match against existing rows (the rookies already in the DB) ---
        existing = by_slug.get(slugify(name))
        if existing is None:
            candidates = by_name.get((nname, pos))
            existing = candidates[0] if candidates else None

        if existing is not None:
            cursor.execute(UPDATE_PLAYER, (
                sid, gsis, espn, yahoo, fpros, headshot,
                nfl_draft_year, years_exp, team, existing["id"],
            ))
            matched += 1
            continue

        # --- brand new NFL player: draft_year stays NULL, never 2026 ---
        slug = unique_slug(slugify(name), team, used_slugs)
        used_slugs.add(slug)
        cursor.execute(INSERT_PLAYER, (
            slug, name, p.get("first_name"), p.get("last_name"), pos,
            blank_to_none(p.get("birth_date")), to_int(p.get("height")),
            to_int(p.get("weight")), team, headshot, sid, gsis, espn,
            yahoo, fpros, nfl_draft_year, years_exp,
        ))
        by_slug[slug] = {"id": cursor.lastrowid}
        inserted += 1

    # ---- 32 D/ST pseudo-players, built from the nfl_teams table ----
    cursor.execute("SELECT abbreviation, full_name, logo_url FROM nfl_teams ORDER BY abbreviation")
    dst_added = dst_updated = 0
    for t in cursor.fetchall():
        abbr = t["abbreviation"]
        nickname = (t["full_name"] or abbr).split()[-1].lower()
        slug = f"{nickname}-dst"
        display = f"{t['full_name']} D/ST"
        row = cursor.execute("SELECT id FROM players WHERE slug = ?", (slug,)).fetchone()
        if row:
            cursor.execute(
                """UPDATE players SET redraft_pool = 1, position = 'DST',
                       nfl_team = ?, nfl_headshot_url = ?, full_name = ?
                   WHERE id = ?""",
                (abbr, t["logo_url"], display, row["id"]),
            )
            dst_updated += 1
        else:
            cursor.execute(
                """INSERT INTO players
                       (slug, full_name, position, draft_year, nfl_team,
                        nfl_headshot_url, redraft_pool, sleeper_id)
                   VALUES (?, ?, 'DST', NULL, ?, ?, 1, ?)""",
                (slug, display, abbr, t["logo_url"], abbr),
            )
            dst_added += 1

    conn.commit()

    # ---- report ----
    total = cursor.execute("SELECT COUNT(*) FROM players WHERE redraft_pool = 1").fetchone()[0]
    rookie_ok = cursor.execute("SELECT COUNT(*) FROM players WHERE draft_year = 2026").fetchone()[0]
    # Nothing this script inserts may carry draft_year = 2026, so the rookie
    # board's population must be byte-for-byte the same as before the run.
    expected_rookies = 216
    print()
    print(f"Matched to existing rows : {matched}")
    print(f"Newly inserted           : {inserted}")
    print(f"D/ST added / updated     : {dst_added} / {dst_updated}")
    print("ID coverage              : " + ", ".join(f"{k}={v}" for k, v in sorted(id_fill.items())))
    print(f"Redraft pool total       : {total}")
    verdict = "OK" if rookie_ok == expected_rookies else "!! CHANGED — investigate"
    print(f"Rookie board (draft_year=2026): {rookie_ok} (expected {expected_rookies}) {verdict}")
    by_pos = cursor.execute(
        "SELECT position, COUNT(*) c FROM players WHERE redraft_pool = 1 "
        "GROUP BY position ORDER BY c DESC"
    ).fetchall()
    print("By position              : " + ", ".join(f"{r['position']}={r['c']}" for r in by_pos))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(seed())
