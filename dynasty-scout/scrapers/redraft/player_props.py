"""
Turn the player prop market into a fantasy projection.

Every other projection here is an opinion. A prop line is a price — the number
at which a book will take money on both sides — and it reprices on news hours
before any ranking does. Converting a week's lines into PPR points gives a
per-player projection that is, for that week, the sharpest one available.

The conversion is the whole idea and it is deliberately plain:

    PPR = receptions x 1
        + receiving yards x 0.1
        + rushing yards x 0.1
        + passing yards x 0.04
        + passing touchdowns x 4
        + P(scores a touchdown) x 6

A yardage line is a median rather than a mean, and for these distributions the
two are close enough that the difference is far smaller than the disagreement
between books. Touchdowns are the exception and are not taken from a line at
all: the anytime-touchdown price converts to a probability, which is what the
6 points multiply.

Vig comes off first. A book prices both sides to sum past 100%, so each side's
raw probability is scaled by that overround; on a two-sided market that is
exact, and on anytime-touchdown — usually priced yes-only — it falls back to
the raw implied probability, which is a slight overstatement and is recorded
as such rather than silently corrected.

Source: The Odds API (the-odds-api.com), which needs a key in ODDS_API_KEY.
Without one this loader does nothing and says so; nothing downstream treats a
missing market as a zero.

Usage:  py -m scrapers.redraft.player_props [--season 2026] [--week 2]
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime

from scrapers import config
from scrapers.redraft import nflverse_stats as base
from scrapers.redraft.names import normalize_name

API = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"

# The Odds API market keys we care about, mapped to our own names.
MARKETS = {
    "player_receptions": "receptions",
    "player_reception_yds": "rec_yds",
    "player_rush_yds": "rush_yds",
    "player_rush_attempts": "rush_attempts",
    "player_pass_yds": "pass_yds",
    "player_pass_tds": "pass_tds",
    "player_anytime_td": "anytime_td",
}

# PPR value of one unit of each market. anytime_td is handled separately
# because it is a probability, not a count.
PPR_PER_UNIT = {
    "receptions": 1.0,
    "rec_yds": 0.1,
    "rush_yds": 0.1,
    "pass_yds": 0.04,
    "pass_tds": 4.0,
    "rush_attempts": 0.0,   # priced for context, worth no points itself
}
TD_POINTS = 6.0


def american_to_prob(price):
    """American odds to their implied probability, vig included."""
    if price is None:
        return None
    p = float(price)
    if p == 0:
        return None
    return (-p) / ((-p) + 100.0) if p < 0 else 100.0 / (p + 100.0)


def devig(over_price, under_price):
    """
    The over's probability with the book's margin removed.

    Both sides priced means the overround is measurable and the split is
    exact. One side only means the best available answer is the raw implied
    probability, which runs a few points high; callers are told which they got
    by whether under_price was there at all.
    """
    po = american_to_prob(over_price)
    pu = american_to_prob(under_price)
    if po is None:
        return None
    if pu is None:
        return po
    total = po + pu
    return po / total if total > 0 else po


def ppr_from_markets(values):
    """
    PPR points from a player's priced markets.

    Returns (points, markets_used). Markets that were not priced contribute
    nothing and are not guessed at — a receiver with only a yardage line gets
    a thinner projection, and markets_used says so.
    """
    pts, used = 0.0, 0
    for market, per_unit in PPR_PER_UNIT.items():
        v = values.get(market)
        if v is None:
            continue
        used += 1
        pts += v * per_unit
    td = values.get("anytime_td_prob")
    if td is not None:
        used += 1
        pts += td * TD_POINTS
    return round(pts, 2), used


def fetch_events(api_key, season, week):
    url = f"{API}/sports/{SPORT}/events?apiKey={api_key}"
    req = urllib.request.Request(url, headers=base.HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def fetch_event_odds(api_key, event_id):
    markets = ",".join(MARKETS)
    url = (f"{API}/sports/{SPORT}/events/{event_id}/odds"
           f"?apiKey={api_key}&regions=us&oddsFormat=american&markets={markets}")
    req = urllib.request.Request(url, headers=base.HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def parse_event(event, by_name):
    """
    One event's odds payload into prop rows.

    Kept free of network and database so the shape this assumes can be pinned
    by a fixture: outcomes carry the player in `description`, the line in
    `point`, and Over/Under (or Yes/No) in `name`.
    """
    rows = []
    for bm in event.get("bookmakers") or []:
        book = bm.get("key") or "?"
        for mk in bm.get("markets") or []:
            market = MARKETS.get(mk.get("key"))
            if not market:
                continue
            sides = defaultdict(dict)
            for o in mk.get("outcomes") or []:
                who = (o.get("description") or "").strip()
                if not who:
                    continue
                side = (o.get("name") or "").strip().lower()
                key = 'over' if side in ('over', 'yes') else 'under' if side in ('under', 'no') else side
                sides[who][key] = o
            for who, s in sides.items():
                pid = by_name.get(normalize_name(who))
                if not pid:
                    continue
                over, under = s.get('over'), s.get('under')
                if not over:
                    continue
                rows.append({
                    "player_id": pid, "market": market, "book": book,
                    "line": over.get("point"),
                    "over_price": over.get("price"),
                    "under_price": (under or {}).get("price"),
                    "over_prob": devig(over.get("price"), (under or {}).get("price")),
                    "event_id": event.get("id"),
                    "commence_time": event.get("commence_time"),
                })
    return rows


def consensus(rows):
    """
    One projection per player from however many books priced them.

    The median across books rather than the mean: books that have not moved a
    stale line should not drag the number, and with a handful of prices the
    median is the robust choice.
    """
    by_player = defaultdict(lambda: defaultdict(list))
    books = defaultdict(set)
    for r in rows:
        books[r["player_id"]].add(r["book"])
        if r["market"] == "anytime_td":
            if r["over_prob"] is not None:
                by_player[r["player_id"]]["anytime_td_prob"].append(r["over_prob"])
        elif r["line"] is not None:
            by_player[r["player_id"]][r["market"]].append(float(r["line"]))

    out = {}
    for pid, markets in by_player.items():
        values = {}
        for m, vals in markets.items():
            vals = sorted(vals)
            mid = len(vals) // 2
            values[m] = vals[mid] if len(vals) % 2 else (vals[mid - 1] + vals[mid]) / 2
        pts, used = ppr_from_markets(values)
        out[pid] = {**values, "ppr_points": pts, "markets_priced": used,
                    "books_priced": len(books[pid])}
    return out


PROP_INSERT = """
INSERT OR REPLACE INTO nfl_player_prop (
    player_id, season, week, market, book, line, over_price, under_price,
    over_prob, event_id, commence_time, scraped_at, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

PROJ_INSERT = """
INSERT OR REPLACE INTO nfl_player_market_projection (
    player_id, season, week, receptions, rec_yards, rush_yards, pass_yards,
    pass_tds, rush_attempts, anytime_td_prob, ppr_points, markets_priced,
    books_priced, scraped_at, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


def load_name_index(cursor):
    """Normalised name -> player id, for the unambiguous names only."""
    cursor.execute(
        "SELECT id, full_name FROM players WHERE redraft_pool = 1 AND position != 'DST'")
    seen = defaultdict(list)
    for r in cursor.fetchall():
        seen[normalize_name(r["full_name"])].append(r["id"])
    return {k: v[0] for k, v in seen.items() if len(v) == 1}


def persist(cursor, season, week, rows, proj, scraped_at, now):
    cursor.executemany(PROP_INSERT, [(
        r["player_id"], season, week, r["market"], r["book"], r["line"],
        r["over_price"], r["under_price"], r["over_prob"], r["event_id"],
        r["commence_time"], scraped_at, now,
    ) for r in rows])
    cursor.executemany(PROJ_INSERT, [(
        pid, season, week, v.get("receptions"), v.get("rec_yds"),
        v.get("rush_yds"), v.get("pass_yds"), v.get("pass_tds"),
        v.get("rush_attempts"), v.get("anytime_td_prob"), v["ppr_points"],
        v["markets_priced"], v["books_priced"], scraped_at, now,
    ) for pid, v in proj.items()])


def run(season, week):
    api_key = os.environ.get("ODDS_API_KEY", "").strip()
    if not api_key:
        print("ODDS_API_KEY is not set — no props loaded.")
        print("The model treats missing props as missing, not as zero, so the")
        print("rest of the pipeline is unaffected. Set the key to turn this on.")
        return 1

    conn = config.get_db_connection()
    cur = conn.cursor()
    by_name = load_name_index(cur)
    scraped_at = datetime.now().strftime("%Y-%m-%d")
    now = datetime.now().isoformat(timespec="seconds")

    try:
        events = fetch_events(api_key, season, week)
    except urllib.error.HTTPError as e:
        print(f"events request failed: {e.code} {e.reason}")
        return 2

    rows = []
    for ev in events:
        try:
            odds = fetch_event_odds(api_key, ev["id"])
        except urllib.error.HTTPError as e:
            print(f"  {ev.get('id')}: {e.code} {e.reason}")
            continue
        rows.extend(parse_event(odds, by_name))

    proj = consensus(rows)
    persist(cur, season, week, rows, proj, scraped_at, now)
    conn.commit()
    print(f"events {len(events)}  prop rows {len(rows)}  players projected {len(proj)}")
    top = sorted(proj.items(), key=lambda kv: -kv[1]["ppr_points"])[:5]
    for pid, v in top:
        name = cur.execute("SELECT full_name FROM players WHERE id = ?", (pid,)).fetchone()
        print(f"  {name['full_name']:24s} {v['ppr_points']:5.1f} PPR "
              f"({v['markets_priced']} markets, {v['books_priced']} books)")
    conn.close()
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--season", type=int, default=2026)
    p.add_argument("--week", type=int, required=True)
    a = p.parse_args()
    sys.exit(run(a.season, a.week))
