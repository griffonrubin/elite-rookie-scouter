"""
FantasyCalc redraft (PPR, 1QB) rankings.

Public JSON API — no scraping, no key. Same endpoint family the rookie
FantasyCalc scraper uses, with isDynasty=false for seasonal values.

Covers roughly the top 200 skill players and carries no K or D/ST, so it
contributes depth at the top of the board rather than full coverage. The
consensus step renormalises around that.

Usage:  py -m scrapers.redraft.fantasycalc_redraft
"""
import json
import sys
import urllib.request

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper

URL = "https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&ppr=1"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; DyCharts/1.0)"}


class FantasyCalcRedraft(BaseRedraftScraper):
    SOURCE = "FantasyCalc Redraft"
    SOURCE_URL = "https://fantasycalc.com"

    def fetch(self):
        req = urllib.request.Request(URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.load(r)
        if not data:
            raise ValueError("FantasyCalc returned an empty list")

        print(f"[{self.SOURCE}] {len(data)} players returned")

        entries = []
        for row in data:
            p = row.get("player") or {}
            name = p.get("name")
            pos = (p.get("position") or "").upper()
            pid = self.find_player(
                name=name, position=pos, team=p.get("maybeTeam"),
                sleeper_id=p.get("sleeperId"), espn_id=p.get("espnId"),
            )
            if not pid:
                self.note_unmatched(name, pos, p.get("maybeTeam"), row.get("overallRank"))
                continue

            entries.append((pid, row.get("overallRank"), pos, row.get("maybeTier")))

        self.save_dense_rankings(entries)


if __name__ == "__main__":
    sys.exit(FantasyCalcRedraft().run())
