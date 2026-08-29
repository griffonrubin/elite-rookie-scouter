"""
Import your own redraft board from a CSV.

This is your list, not a scrape — nobody else publishes it, so it is kept in
the repo under data/my_rankings/ and re-imported whenever you change it.

Expected columns (header row required):

    Rank,Player,Team,Position

Position accepts the usual spellings: PK for kickers, DEF / D/ST / DST for
team defenses, and a slash for two-way players ('WR/CB' -> WR).

Deliberately NOT part of the consensus. run_redraft_consensus.py reads only
the sources in its SOURCE_WEIGHTS table, so this one is invisible to it —
which is the point. The consensus is there to tell you what the market
thinks; folding your own board into it would just move the number you are
measuring yourself against toward yourself.

Usage:
  py -m scrapers.redraft.my_rankings_import                  # newest file in data/my_rankings/
  py -m scrapers.redraft.my_rankings_import --file path.csv
"""
import argparse
import csv
import glob
import io
import os
import sys

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper
from scrapers.redraft.names import normalize_name, norm_team

DATA_DIR = os.path.join("data", "my_rankings")

REQUIRED_COLUMNS = ("Rank", "Player", "Position")

# Nicknames the rest of the pipeline has never had to know about, because
# every scraped source uses the legal name.
NICKNAMES = {
    "bam knight": "zonovan knight",
    "hollywood brown": "marquise brown",
}


def newest_export():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.csv")), key=os.path.getmtime)
    if not files:
        raise FileNotFoundError(
            f"No CSV found in {DATA_DIR}/. Drop your rankings there as "
            "Rank,Player,Team,Position, or pass --file."
        )
    return files[-1]


def clean_position(raw):
    """'WR/CB' -> 'WR'; 'D/ST' -> 'DST'. The base scraper aliases the rest."""
    pos = (raw or "").strip().upper()
    if pos in ("D/ST", "DST", "DEF", "D"):
        return "DST"
    return pos.split("/")[0]


class MyRankingsImport(BaseRedraftScraper):
    SOURCE = "My Rankings"
    SOURCE_URL = ""

    def __init__(self, path=None):
        super().__init__()
        self.path = path or newest_export()
        self._load_name_only_map()

    def _load_name_only_map(self):
        """
        A last-resort index for players whose name is unique in the pool.

        Hand-written boards disagree with the roster on position more often
        than scraped ones do — a fullback listed at RB, a two-way player, a
        tight end you think of as a back. The name is unambiguous in those
        cases even when the position is not, so fall back to it. Names shared
        by two players are excluded rather than guessed at.
        """
        self.cursor.execute(
            "SELECT id, full_name FROM players WHERE redraft_pool = 1 AND position != 'DST'"
        )
        counts = {}
        for r in self.cursor.fetchall():
            counts.setdefault(normalize_name(r["full_name"]), []).append(r["id"])
        self.by_name_only = {k: v[0] for k, v in counts.items() if len(v) == 1}

    def resolve(self, name, position, team):
        """Position-aware match first, then the name-only fallback."""
        pid = self.find_player(name=name, position=position, team=team)
        if pid or position == "DST":
            return pid, None
        key = normalize_name(name)
        key = NICKNAMES.get(key, key)
        pid = self.by_name_only.get(key)
        return pid, ("name-only" if pid else None)

    def fetch(self):
        with io.open(self.path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            raise ValueError(f"{self.path} contained no rows")

        missing = [c for c in REQUIRED_COLUMNS if c not in rows[0]]
        if missing:
            raise ValueError(
                f"{os.path.basename(self.path)} is missing column(s): "
                f"{', '.join(missing)} — expected Rank,Player,Team,Position"
            )

        print(f"[{self.SOURCE}] {os.path.basename(self.path)}: {len(rows)} rows")

        entries, unmatched, loose = [], [], []
        for row in rows:
            name = (row.get("Player") or "").strip()
            rank = (row.get("Rank") or "").strip()
            if not name or not rank:
                continue
            try:
                rank = float(rank)
            except ValueError:
                continue

            pos = clean_position(row.get("Position"))
            pid, how = self.resolve(name, pos, norm_team(row.get("Team")))
            if pid:
                entries.append((pid, rank, pos))
                if how:
                    loose.append(f"{name} ({pos})")
            else:
                unmatched.append(f"{name} ({pos})")

        # Your ranks are already 1..N, but a player the pool doesn't have leaves
        # a hole; save_dense_rankings closes it so the ordering stays contiguous
        # while `value` keeps the number you actually wrote down.
        self.save_dense_rankings(entries)
        print(f"[{self.SOURCE}] {len(entries)} of {len(rows)} matched")

        if loose:
            print(f"[{self.SOURCE}] matched on name alone (position disagreed): "
                  + ", ".join(loose))

        for n in unmatched[:12]:
            self.note_unmatched(n)
        if unmatched:
            print(f"[{self.SOURCE}] {len(unmatched)} not in the redraft pool:")
            for n in unmatched:
                print(f"    {n}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="path to your rankings CSV")
    args = ap.parse_args()
    sys.exit(MyRankingsImport(args.file).run())
