import sqlite3
import json
import os
import sys
import time
import re
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dynasty_scout.db")
PLAYERS_CACHE = os.path.join(os.path.dirname(__file__), "_sleeper_players.json")
CURRENT_SEASON = "2025"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "DyCharts/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print("  [429] Rate limited on " + url + ", sleeping 10s...")
            time.sleep(10)
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as retry_err:
                print("  [error] Retry failed: " + str(retry_err))
                return None
        if e.code == 404:
            return None
        print("  [HTTP " + str(e.code) + "] " + url)
        return None
    except Exception as err:
        print("  [error] " + url + ": " + str(err))
        return None


def ensure_schema(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sleeper_leagues (
            league_id     TEXT PRIMARY KEY,
            name          TEXT,
            season        TEXT,
            total_rosters INTEGER,
            status        TEXT,
            source        TEXT DEFAULT 'user',
            added_at      TEXT DEFAULT (datetime('now'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id                     TEXT PRIMARY KEY,
            league_id              TEXT,
            transaction_id         TEXT,
            player_a_id            INTEGER,
            side                   TEXT,
            counterpart_player_ids TEXT,
            picks_sent             TEXT,
            picks_received         TEXT,
            status_updated_at      INTEGER,
            raw_adds               TEXT,
            raw_drops              TEXT,
            scraped_at             TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (player_a_id) REFERENCES players(id)
        )
    """)
    try:
        cur.execute("ALTER TABLE players ADD COLUMN sleeper_id TEXT")
        conn.commit()
        print("  [schema] Added sleeper_id column to players table.")
    except Exception:
        pass
    conn.commit()


def load_sleeper_player_map():
    cache_valid = False
    if os.path.exists(PLAYERS_CACHE):
        mtime = os.path.getmtime(PLAYERS_CACHE)
        age_hours = (time.time() - mtime) / 3600
        if age_hours < 24:
            cache_valid = True
    if cache_valid:
        print("  [cache] Loading Sleeper player map from cache...")
        with open(PLAYERS_CACHE, "r", encoding="utf-8") as f:
            return json.load(f)
    print("  [fetch] Downloading Sleeper player map (this may take a moment)...")
    data = fetch_json("https://api.sleeper.app/v1/players/nfl")
    if data is None:
        print("  [error] Could not fetch Sleeper player map.")
        return {}
    with open(PLAYERS_CACHE, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print("  [cache] Saved " + str(len(data)) + " players to " + PLAYERS_CACHE)
    return data


def build_our_player_map(cur):
    cur.execute("SELECT id, full_name, position, sleeper_id FROM players WHERE draft_year=2026")
    rows = cur.fetchall()
    name_pos_map = {}
    by_sleeper_id = {}
    for row in rows:
        db_id, full_name, position, sleeper_id = row
        if sleeper_id:
            by_sleeper_id[str(sleeper_id)] = db_id
        if full_name and position:
            key = (_norm(full_name), position.upper())
            name_pos_map[key] = db_id
    return name_pos_map, by_sleeper_id


def _norm(name):
    if not name:
        return ""
    n = name.lower()
    n = n.replace("'", "").replace("-", "").replace(".", "").replace(",", "")
    n = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def match_player(sleeper_id, sleeper_info, name_pos_map, by_sleeper, cur):
    sid = str(sleeper_id)
    if sid in by_sleeper:
        return by_sleeper[sid]
    if not sleeper_info:
        return None
    full_name = sleeper_info.get("full_name") or (
        (sleeper_info.get("first_name") or "") + " " + (sleeper_info.get("last_name") or "")
    ).strip()
    position = (sleeper_info.get("fantasy_positions") or [None])[0]
    if not position:
        position = sleeper_info.get("position")
    if not full_name or not position:
        return None
    key = (_norm(full_name), position.upper())
    db_id = name_pos_map.get(key)
    if db_id is not None:
        cur.execute("UPDATE players SET sleeper_id=? WHERE id=?", (sid, db_id))
        by_sleeper[sid] = db_id
        return db_id
    return None


def format_pick(pick_dict):
    season = pick_dict.get("season", "?")
    round_num = pick_dict.get("round", "?")
    suffixes = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th"}
    round_str = suffixes.get(int(round_num), str(round_num) + "th") if str(round_num).isdigit() else str(round_num)
    return str(season) + " " + round_str


def scrape_league(conn, league_id, sleeper_players):
    cur = conn.cursor()
    name_pos_map, by_sleeper = build_our_player_map(cur)
    new_records = 0
    for week in range(1, 19):
        url = "https://api.sleeper.app/v1/league/" + str(league_id) + "/transactions/" + str(week)
        transactions = fetch_json(url)
        time.sleep(0.3)
        if not transactions:
            continue
        for txn in transactions:
            if txn.get("type") != "trade":
                continue
            transaction_id = str(txn.get("transaction_id", ""))
            adds = txn.get("adds") or {}
            drops = txn.get("drops") or {}
            draft_picks = txn.get("draft_picks") or []
            status_updated_at = txn.get("status_updated_at")
            our_players_in_txn = {}
            for sleeper_id_str, roster_id in adds.items():
                db_id = match_player(
                    sleeper_id_str,
                    sleeper_players.get(sleeper_id_str),
                    name_pos_map,
                    by_sleeper,
                    cur,
                )
                if db_id is not None:
                    our_players_in_txn[db_id] = ("received", roster_id)
            for sleeper_id_str, roster_id in drops.items():
                db_id = match_player(
                    sleeper_id_str,
                    sleeper_players.get(sleeper_id_str),
                    name_pos_map,
                    by_sleeper,
                    cur,
                )
                if db_id is not None:
                    if db_id not in our_players_in_txn:
                        our_players_in_txn[db_id] = ("sent", roster_id)
            if not our_players_in_txn:
                continue
            for db_player_id, (side, owner_roster_id) in our_players_in_txn.items():
                counterpart_ids = [oid for oid in our_players_in_txn if oid != db_player_id]
                if side == "received":
                    picks_with_player = []
                    picks_other_side = []
                    for pick in draft_picks:
                        owner_id = pick.get("owner_id")
                        prev_owner_id = pick.get("previous_owner_id")
                        if owner_id == owner_roster_id:
                            picks_with_player.append(format_pick(pick))
                        elif prev_owner_id == owner_roster_id:
                            picks_other_side.append(format_pick(pick))
                    picks_sent = picks_other_side
                    picks_received = picks_with_player
                else:
                    picks_with_player = []
                    picks_other_side = []
                    for pick in draft_picks:
                        owner_id = pick.get("owner_id")
                        prev_owner_id = pick.get("previous_owner_id")
                        if prev_owner_id == owner_roster_id:
                            picks_with_player.append(format_pick(pick))
                        elif owner_id == owner_roster_id:
                            picks_other_side.append(format_pick(pick))
                    picks_sent = picks_with_player
                    picks_received = picks_other_side
                record_id = str(transaction_id) + "_" + str(db_player_id)
                cur.execute(
                    """
                    INSERT OR IGNORE INTO trades (
                        id, league_id, transaction_id, player_a_id, side,
                        counterpart_player_ids, picks_sent, picks_received,
                        status_updated_at, raw_adds, raw_drops
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record_id,
                        league_id,
                        transaction_id,
                        db_player_id,
                        side,
                        json.dumps(counterpart_ids),
                        json.dumps(picks_sent),
                        json.dumps(picks_received),
                        status_updated_at,
                        json.dumps(adds),
                        json.dumps(drops),
                    ),
                )
                if cur.rowcount > 0:
                    new_records += 1
    conn.commit()
    return new_records


def add_league(conn, league_id, source="user"):
    data = fetch_json("https://api.sleeper.app/v1/league/" + str(league_id))
    if not data:
        print("  [error] Could not fetch league " + str(league_id))
        return False
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO sleeper_leagues (league_id, name, season, total_rosters, status, source)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            str(data.get("league_id", league_id)),
            data.get("name", ""),
            data.get("season", ""),
            data.get("total_rosters"),
            data.get("status", ""),
            source,
        ),
    )
    conn.commit()
    print("  [league] Added: " + str(data.get("name", league_id)) + " (id=" + str(league_id) + ")")
    return True


def add_user_leagues(conn, username):
    user_data = fetch_json("https://api.sleeper.app/v1/user/" + str(username))
    if not user_data:
        print("  [error] Could not find Sleeper user: " + str(username))
        return 0
    user_id = user_data.get("user_id")
    if not user_id:
        print("  [error] No user_id for username: " + str(username))
        return 0
    print("  [user] Found user " + str(username) + " (id=" + str(user_id) + ")")
    leagues = fetch_json(
        "https://api.sleeper.app/v1/user/" + str(user_id) + "/leagues/nfl/" + CURRENT_SEASON
    )
    if not leagues:
        print("  [error] No leagues found for user " + str(username) + " in " + CURRENT_SEASON)
        return 0
    cur = conn.cursor()
    count = 0
    for league in leagues:
        league_id = str(league.get("league_id", ""))
        if not league_id:
            continue
        cur.execute(
            """
            INSERT OR REPLACE INTO sleeper_leagues (league_id, name, season, total_rosters, status, source)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                league_id,
                league.get("name", ""),
                league.get("season", ""),
                league.get("total_rosters"),
                league.get("status", ""),
                "user:" + str(username),
            ),
        )
        print("  [league] Added: " + str(league.get("name", league_id)) + " (id=" + str(league_id) + ")")
        count += 1
    conn.commit()
    print("  [user] Added " + str(count) + " leagues for " + str(username))
    return count


def run(args):
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    if args.add_league:
        for lid in args.add_league:
            add_league(conn, lid, source="cli")
    if args.add_user:
        add_user_leagues(conn, args.add_user)
    cur = conn.cursor()
    cur.execute("SELECT league_id, name FROM sleeper_leagues")
    leagues = cur.fetchall()
    if not leagues:
        print("[info] No leagues in DB. Use --add-league or --add-user to add leagues first.")
        conn.close()
        return
    print("")
    print("[scrape] Loading Sleeper player map...")
    sleeper_players = load_sleeper_player_map()
    if not sleeper_players:
        print("[error] Could not load Sleeper player map. Aborting.")
        conn.close()
        return
    total_new = 0
    for league_id, name in leagues:
        print("")
        print("[scrape] League: " + str(name or league_id) + " (id=" + str(league_id) + ")")
        new_count = scrape_league(conn, league_id, sleeper_players)
        print("  -> " + str(new_count) + " new trade record(s) inserted")
        total_new += new_count
    cur.execute("SELECT COUNT(*) FROM trades")
    total_trades = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT player_a_id) FROM trades")
    players_with_trades = cur.fetchone()[0]
    print("")
    print("=== Summary ===")
    print("  Leagues scraped:         " + str(len(leagues)))
    print("  New records inserted:    " + str(total_new))
    print("  Total trade records:     " + str(total_trades))
    print("  Players with trade data: " + str(players_with_trades))
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Sleeper dynasty trades scraper for Dynasty Scout"
    )
    parser.add_argument(
        "--add-league",
        metavar="LEAGUE_ID",
        nargs="+",
        help="Add one or more Sleeper league IDs to the DB, then scrape",
    )
    parser.add_argument(
        "--add-user",
        metavar="USERNAME",
        help="Add all Sleeper leagues for a username, then scrape",
    )
    args = parser.parse_args()
    run(args)
