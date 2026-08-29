"""
Import a Flock Fantasy PPR rankings export (CSV).

Flock's site is subscription-gated, so this reads the export the user
downloads from their account instead of scraping. One file supplies four
sources the live scrapers cannot reach:

    Expert    -> Flock Redraft     (Flock's own analyst board)
    Yahoo     -> Yahoo Redraft     (login-walled on Yahoo's own site)
    Underdog  -> Underdog Redraft  (best-ball ADP)
    FFPC      -> FFPC Redraft      (high-stakes ADP, TE-premium leaning)

Deliberately IGNORED by default: the Sleeper, ESPN and CBS columns. Those
three are already scraped live and deeper, and the live scrape is the better
record of them.

Pass --include-platform-adp to bring them in anyway. That is for the case
where the live scrapers cannot run — a machine with no route to those sites,
say — and a same-day export is the freshest record of those boards available.
It cannot double-count: the columns are stored under the same source names
the live scrapers use, and the consensus reads only the newest scrape per
source, so whichever ran last wins.

Also ignored: the `Rank` and `AVG` columns. `AVG` is exactly the mean of
the platform ADP columns and `Rank` is simply that average ordered — it
is an aggregate of the other columns, not an independent opinion. Only
`Expert` reflects Flock's own view (it diverges from `Rank` by 68 places
on average).

Usage:
  py -m scrapers.redraft.flock_csv_import                 # newest file in data/flock/
  py -m scrapers.redraft.flock_csv_import --file path.csv
"""
import argparse
import csv
import glob
import io
import os
import re
import sys

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper
from scrapers.redraft.names import norm_team

DATA_DIR = os.path.join("data", "flock")

# CSV column -> the source name stored in `rankings`.
COLUMN_SOURCES = {
    "Expert": "Flock Redraft",
    "Yahoo": "Yahoo Redraft",
    "Underdog": "Underdog Redraft",
    "FFPC": "FFPC Redraft",
}

# Only imported with --include-platform-adp; see the module docstring.
PLATFORM_ADP_SOURCES = {
    "Sleeper": "Sleeper Redraft",
    "ESPN": "ESPN Redraft",
    "CBS": "CBS Redraft",
}

SOURCE_URLS = {
    "Flock Redraft": "https://flockfantasy.com",
    "Yahoo Redraft": "https://football.fantasysports.yahoo.com/f1/draftanalysis",
    "Underdog Redraft": "https://underdogfantasy.com",
    "FFPC Redraft": "https://myffpc.com",
    "Sleeper Redraft": "https://sleeper.com",
    "ESPN Redraft": "https://www.espn.com/fantasy/football/",
    "CBS Redraft": "https://www.cbssports.com/fantasy/football/rankings/ppr/top200/",
}


def newest_export():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.csv")), key=os.path.getmtime)
    if not files:
        raise FileNotFoundError(
            f"No CSV found in {DATA_DIR}/. Download a Flock PPR rankings "
            "export and drop it there, or pass --file."
        )
    return files[-1]


def to_rank(value):
    """Blank, '-' and 'N/A' all mean the source didn't rank this player."""
    v = (value or "").strip()
    if not v or v in ("-", "--", "N/A", "NA"):
        return None
    try:
        f = float(v)
    except ValueError:
        return None
    return f if f > 0 else None


def split_pos(raw):
    """'RB12' -> ('RB', 12); 'DEF1' -> ('DST', 1)."""
    raw = (raw or "").strip().upper()
    m = re.match(r"([A-Z/]+)(\d*)", raw)
    if not m:
        return "", None
    pos, num = m.group(1), m.group(2)
    if pos in ("DEF", "D/ST", "DST"):
        pos = "DST"
    if pos == "PK":
        pos = "K"
    return pos, int(num) if num else None


class FlockCsvImport(BaseRedraftScraper):
    SOURCE = "Flock CSV"          # only used for log lines
    SOURCE_URL = "https://flockfantasy.com"

    def __init__(self, path=None, include_platform_adp=False):
        super().__init__()
        self.path = path or newest_export()
        self.columns = dict(COLUMN_SOURCES)
        if include_platform_adp:
            self.columns.update(PLATFORM_ADP_SOURCES)

    def fetch(self):
        with io.open(self.path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            raise ValueError(f"{self.path} contained no rows")

        missing = [c for c in self.columns if c not in rows[0]]
        if missing:
            raise ValueError(
                f"{os.path.basename(self.path)} is missing expected column(s): "
                f"{', '.join(missing)} — is this a Flock PPR overall export?"
            )

        print(f"[{self.SOURCE}] {os.path.basename(self.path)}: {len(rows)} rows")

        # column -> [(player_id, rank_float, position)]
        collected = {col: [] for col in self.columns}
        unmatched_names = set()

        for row in rows:
            name = (row.get("Player") or "").strip()
            if not name:
                continue
            pos, _ = split_pos(row.get("POS"))
            team = norm_team(row.get("Team"))

            pid = self.find_player(name=name, position=pos, team=team)
            if not pid:
                # Only worth reporting if some source actually ranked them.
                if any(to_rank(row.get(c)) for c in self.columns):
                    unmatched_names.add(f"{name} ({pos})")
                continue

            for col in self.columns:
                rank = to_rank(row.get(col))
                if rank is not None:
                    collected[col].append((pid, rank, pos))

        for col, source in self.columns.items():
            self._save_source(source, collected[col])

        for n in list(unmatched_names)[:8]:
            self.note_unmatched(n)
        if unmatched_names:
            print(f"[{self.SOURCE}] {len(unmatched_names)} ranked players not in the pool")

    def _save_source(self, source, entries):
        """
        Re-rank 1..N per source.

        The raw values are ADP floats (or Flock's own sparse expert ranks),
        so they are not dense 1..N sequences. The consensus converts ranks
        to percentiles within each source, which needs a dense ordering.
        """
        if not entries:
            print(f"  {source:<20} no data in this export")
            return

        before = self.saved
        prev_source, prev_url = self.SOURCE, self.SOURCE_URL
        self.SOURCE, self.SOURCE_URL = source, SOURCE_URLS.get(source, "")
        try:
            # The shared helper handles the 1..N ordering, positional ranks,
            # duplicate players, and preserving the raw ADP in `value`.
            self.save_dense_rankings(entries)
        finally:
            self.SOURCE, self.SOURCE_URL = prev_source, prev_url

        print(f"  {source:<20} {self.saved - before:5} players")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="path to a Flock CSV export")
    ap.add_argument("--include-platform-adp", action="store_true",
                    help="also import the Sleeper/ESPN/CBS columns, for when "
                         "the live scrapers for those sites cannot run")
    args = ap.parse_args()
    sys.exit(FlockCsvImport(args.file, args.include_platform_adp).run())
