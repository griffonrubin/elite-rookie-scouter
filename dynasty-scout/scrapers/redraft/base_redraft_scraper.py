"""
Shared plumbing for the redraft ranking + projection scrapers.

Mirrors scrapers/base_scraper.py, with three differences that matter:

  1. The player map is loaded from the redraft pool (redraft_pool = 1)
     rather than the 2026 rookie class.
  2. Matching tries external IDs first (fantasypros/sleeper/espn/yahoo),
     then normalized name+position, then D/ST by team. Ranking sources
     spell names inconsistently, so the ID path is what keeps match
     rates high.
  3. save_ranking stores rank_positional alongside rank_overall, which
     the redraft board needs for K and D/ST ordering.

Every scraper is expected to fail soft: a source that changes its markup
should log a warning and exit 0, not break the nightly run. The consensus
step renormalises its weights over whichever sources succeeded.
"""
import logging
import traceback
from datetime import date

from scrapers import config
from scrapers.redraft.names import normalize_name, norm_team

logger = logging.getLogger("RedraftScraper")

# Sources disagree on position labels: KTC says PK for kickers, several say
# DEF or D/ST for team defenses.
POSITION_ALIASES = {
    "PK": "K", "FB": "RB",
    "DEF": "DST", "D/ST": "DST", "DST": "DST", "D": "DST",
}

SAVE_RANKING = """
INSERT INTO rankings
    (player_id, rank_overall, rank_positional, tier, source, source_url, value, scraped_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(player_id, source, scraped_at) DO UPDATE SET
    rank_overall    = excluded.rank_overall,
    rank_positional = excluded.rank_positional,
    tier            = excluded.tier,
    source_url      = excluded.source_url,
    value           = excluded.value
"""

SAVE_PROJECTION = """
INSERT INTO projections
    (player_id, source, season, proj_points, proj_ppg,
     proj_rank_overall, proj_rank_positional, scraped_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(player_id, source, season, scraped_at) DO UPDATE SET
    proj_points          = excluded.proj_points,
    proj_ppg             = excluded.proj_ppg,
    proj_rank_overall    = excluded.proj_rank_overall,
    proj_rank_positional = excluded.proj_rank_positional
"""


class BaseRedraftScraper:
    """Subclasses set SOURCE / SOURCE_URL and implement fetch()."""

    SOURCE = "unnamed"
    SOURCE_URL = ""
    SEASON = 2026

    def __init__(self):
        self.conn = config.get_db_connection()
        self.cursor = self.conn.cursor()
        self.today = date.today().isoformat()
        self._load_player_map()
        self.saved = 0
        self.unmatched = []

    # ------------------------------------------------------------------ #
    # player lookup
    # ------------------------------------------------------------------ #
    def _load_player_map(self):
        self.cursor.execute(
            """SELECT id, full_name, position, nfl_team, sleeper_id, gsis_id,
                      espn_nfl_id, yahoo_id, fantasypros_id
               FROM players WHERE redraft_pool = 1"""
        )
        rows = self.cursor.fetchall()
        self.by_fpros, self.by_sleeper, self.by_espn, self.by_yahoo = {}, {}, {}, {}
        self.by_dst_team = {}
        name_pos = {}
        for r in rows:
            if r["fantasypros_id"]:
                self.by_fpros[str(r["fantasypros_id"])] = r["id"]
            if r["sleeper_id"]:
                self.by_sleeper[str(r["sleeper_id"])] = r["id"]
            if r["espn_nfl_id"]:
                self.by_espn[str(r["espn_nfl_id"])] = r["id"]
            if r["yahoo_id"]:
                self.by_yahoo[str(r["yahoo_id"])] = r["id"]
            if r["position"] == "DST":
                if r["nfl_team"]:
                    self.by_dst_team[norm_team(r["nfl_team"])] = r["id"]
                continue
            key = (normalize_name(r["full_name"]), (r["position"] or "").upper())
            name_pos.setdefault(key, []).append(r["id"])
        # Ambiguous names are dropped rather than guessed at.
        self.by_name_pos = {k: v[0] for k, v in name_pos.items() if len(v) == 1}
        self.pool_size = len(rows)

        # D/ST arrive as "Green Bay Packers", "Packers", "GB" or "Packers D/ST"
        # depending on the source, so index every spelling.
        self.by_dst_name = {}
        self.cursor.execute("SELECT abbreviation, full_name FROM nfl_teams")
        for t in self.cursor.fetchall():
            pid = self.by_dst_team.get(norm_team(t["abbreviation"]))
            if not pid or not t["full_name"]:
                continue
            full = t["full_name"]
            for variant in (full, full.split()[-1], t["abbreviation"]):
                self.by_dst_name[normalize_name(variant)] = pid

    def find_player(self, name=None, position=None, team=None, **ids):
        """Resolve one source row to a player id. Returns None if unmatched."""
        position = (position or "").upper()
        position = POSITION_ALIASES.get(position, position)

        if position == "DST":
            pid = self.by_dst_team.get(norm_team(team))
            if pid:
                return pid
            if name:
                # "Green Bay Packers D/ST" -> try the full name, then the nickname
                cleaned = normalize_name(name)
                for suffix in (" dst", " d st", " defense"):
                    cleaned = cleaned.replace(suffix, "")
                cleaned = cleaned.strip()
                pid = self.by_dst_name.get(cleaned)
                if pid:
                    return pid
                parts = cleaned.split()
                if parts:
                    return self.by_dst_name.get(parts[-1])
            return None

        for key, table in (
            ("fantasypros_id", self.by_fpros), ("sleeper_id", self.by_sleeper),
            ("espn_id", self.by_espn), ("yahoo_id", self.by_yahoo),
        ):
            val = ids.get(key)
            if val and str(val) in table:
                return table[str(val)]

        if name and position:
            return self.by_name_pos.get((normalize_name(name), position))
        return None

    # ------------------------------------------------------------------ #
    # writes
    # ------------------------------------------------------------------ #
    def save_ranking(self, player_id, rank_overall, rank_positional=None,
                     tier=None, value=None):
        self.cursor.execute(SAVE_RANKING, (
            player_id, rank_overall, rank_positional, tier,
            self.SOURCE, self.SOURCE_URL, value, self.today,
        ))
        self.saved += 1

    def save_projection(self, player_id, points, ppg=None,
                        rank_overall=None, rank_positional=None, source=None):
        self.cursor.execute(SAVE_PROJECTION, (
            player_id, source or self.SOURCE, self.SEASON, points, ppg,
            rank_overall, rank_positional, self.today,
        ))
        self.saved += 1

    def save_dense_rankings(self, entries):
        """
        Write a source's ranks as a dense 1..N ordering.

        Sources publish ranks on their own scale: KTC numbers 365 players up
        to 969, ESPN 830 up to 1972, and ADP sources use fractional pick
        positions. Storing those raw makes the cross-source spread stats
        (best/worst/avg/std_deviation) meaningless, because a "969" from one
        source sits next to a "200" from another that means the same thing.

        So rank_overall is always the dense position within this source, and
        the source's native number is preserved in `value`.

        entries: iterable of (player_id, sort_value, position) or
                 (player_id, sort_value, position, tier)
        """
        rows = list(entries)
        if not rows:
            return
        rows.sort(key=lambda t: t[1])

        # Two source rows can resolve to the same player (a duplicate listing,
        # or two spellings normalising to one name). Keep the best rank —
        # without this the second write overwrites the first and leaves a hole
        # in the 1..N sequence.
        deduped, seen = [], set()
        for row in rows:
            if row[0] in seen:
                continue
            seen.add(row[0])
            deduped.append(row)
        rows = deduped

        pos_counter = {}
        for overall, row in enumerate(rows, 1):
            pid, raw, pos = row[0], row[1], (row[2] or "").upper()
            tier = row[3] if len(row) > 3 else None
            pos_counter[pos] = pos_counter.get(pos, 0) + 1
            self.save_ranking(
                pid,
                rank_overall=overall,
                rank_positional=pos_counter[pos],
                tier=tier,
                value=raw,
            )

    def note_unmatched(self, name, position=None, team=None, rank=None):
        self.unmatched.append(
            {"name": name, "position": position, "team": team, "rank": rank}
        )

    # ------------------------------------------------------------------ #
    # driver
    # ------------------------------------------------------------------ #
    def fetch(self):
        """Subclass hook: pull the source and call save_ranking/save_projection."""
        raise NotImplementedError

    def run(self):
        """Fail-soft wrapper. Always returns 0 so a nightly chain continues."""
        print(f"[{self.SOURCE}] pool={self.pool_size}")
        try:
            self.fetch()
            self.conn.commit()
        except Exception as e:
            print(f"[{self.SOURCE}] FAILED: {type(e).__name__}: {e}")
            logger.warning("scraper %s failed\n%s", self.SOURCE, traceback.format_exc())
            self.conn.rollback()
            self.close()
            return 0

        print(f"[{self.SOURCE}] saved {self.saved} rows, {len(self.unmatched)} unmatched")
        if self.unmatched:
            preview = ", ".join(
                f"{u['name']}({u['position']})" for u in self.unmatched[:6]
            )
            print(f"[{self.SOURCE}] unmatched sample: {preview}")
        self.close()
        return 0

    def close(self):
        try:
            self.conn.close()
        except Exception:
            pass
