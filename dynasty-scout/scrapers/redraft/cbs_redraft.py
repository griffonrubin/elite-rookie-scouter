"""
CBS Sports PPR redraft rankings (top 200).

CBS renders div-based rows rather than a table, and shows abbreviated
names ("J. Gibbs"), which are useless for matching. The player link
carries the full slug though —

    <a href="/nfl/players/3162723/jahmyr-gibbs/fantasy/">

— so this scraper matches on that slug and falls back to the position
label for D/ST. Far more reliable than parsing the display name.

Usage:  py -m scrapers.redraft.cbs_redraft
"""
import re
import sys
import urllib.request

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper
from scrapers.redraft.names import normalize_name

URL = "https://www.cbssports.com/fantasy/football/rankings/ppr/top200/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

ROW_RE = re.compile(r'<div class="player-row[^"]*">(.*?)</div>\s*</div>\s*<div class="player-stats"', re.S)
RANK_RE = re.compile(r'<div class="rank">(\d+)</div>')
LINK_RE = re.compile(r'href="/nfl/(?:players|teams)/[^/]+/([a-z0-9\-]+)/')
POS_RE = re.compile(r'<span class="team position">\s*([A-Z/]+)')


class CBSRedraft(BaseRedraftScraper):
    SOURCE = "CBS Redraft"
    SOURCE_URL = URL

    def fetch(self):
        req = urllib.request.Request(URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=120) as r:
            html = r.read().decode("utf-8", errors="replace")

        # Split on the row marker rather than regexing whole rows — CBS nests
        # divs inconsistently between player and D/ST entries.
        chunks = html.split('<div class="player-row')
        if len(chunks) < 20:
            raise ValueError("no player rows found — CBS changed their layout")

        seen = set()
        for chunk in chunks[1:]:
            rank_m = RANK_RE.search(chunk)
            link_m = LINK_RE.search(chunk)
            if not rank_m or not link_m:
                continue
            rank = int(rank_m.group(1))
            if rank in seen:
                continue
            seen.add(rank)

            slug = link_m.group(1)
            pos_m = POS_RE.search(chunk)
            pos = (pos_m.group(1) if pos_m else "").upper()

            pid = self._match(slug, pos)
            if not pid:
                self.note_unmatched(slug, pos, None, rank)
                continue
            self.save_ranking(pid, rank_overall=rank)

        if self.saved == 0:
            raise ValueError("parsed rows but matched nothing — check the slug pattern")

        self._assign_positional_ranks()

    def _match(self, cbs_slug, pos):
        """CBS slugs are the full hyphenated name, which maps onto our own."""
        name = cbs_slug.replace("-", " ")
        pid = self.find_player(name=name, position=pos)
        if pid:
            return pid
        # D/ST rows link to /nfl/teams/<abbr>/<nickname>/
        if pos in ("DST", "DEF", "D/ST"):
            return self.by_dst_name.get(normalize_name(name))
        return None

    def _assign_positional_ranks(self):
        self.cursor.execute(
            """SELECT r.player_id, p.position FROM rankings r
               JOIN players p ON p.id = r.player_id
               WHERE r.source = ? AND r.scraped_at = ? AND r.rank_overall IS NOT NULL
               ORDER BY r.rank_overall ASC""",
            (self.SOURCE, self.today),
        )
        counters = {}
        for row in self.cursor.fetchall():
            pos = (row["position"] or "").upper()
            counters[pos] = counters.get(pos, 0) + 1
            self.cursor.execute(
                "UPDATE rankings SET rank_positional = ? "
                "WHERE player_id = ? AND source = ? AND scraped_at = ?",
                (counters[pos], row["player_id"], self.SOURCE, self.today),
            )


if __name__ == "__main__":
    sys.exit(CBSRedraft().run())
