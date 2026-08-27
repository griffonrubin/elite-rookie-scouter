"""
FantasyPros PPR redraft rankings (ECR).

The rankings page embeds the whole board as a `var ecrData = {...}` JSON
blob, so plain requests works — no Playwright needed, unlike the rookie
FantasyPros scraper.

ECR is itself a consensus of 100+ experts, and the payload carries the
expert spread (rank_min / rank_max / rank_std) plus tiers. It is the
anchor source for the redraft board: every player FP ranks is, by
definition, draftable.

Also stores each player's expert-spread numbers as the source's `value`
so the board can show how contested a ranking is.

Usage:  py -m scrapers.redraft.fp_redraft
"""
import json
import re
import sys
import urllib.request

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper

URL = "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


class FantasyProsRedraft(BaseRedraftScraper):
    SOURCE = "FantasyPros PPR"
    SOURCE_URL = URL

    def fetch(self):
        req = urllib.request.Request(URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=120) as r:
            html = r.read().decode("utf-8", errors="replace")

        m = re.search(r"var\s+ecrData\s*=\s*(\{.*?\});", html, re.S)
        if not m:
            raise ValueError(
                "ecrData blob not found — FantasyPros changed their page layout"
            )
        data = json.loads(m.group(1))
        players = data.get("players") or []
        if not players:
            raise ValueError("ecrData contained no players")

        print(f"[{self.SOURCE}] {len(players)} ranked by "
              f"{data.get('total_experts', '?')} experts "
              f"(updated {data.get('last_updated', '?')})")

        entries = []
        for p in players:
            pos = (p.get("player_position_id") or "").upper()
            name = p.get("player_name")
            team = p.get("player_team_id")
            pid = self.find_player(
                name=name, position=pos, team=team,
                fantasypros_id=p.get("player_id"),
            )
            if not pid:
                self.note_unmatched(name, pos, team, p.get("rank_ecr"))
                continue

            entries.append((pid, p.get("rank_ecr"), pos, p.get("tier")))

        self.save_dense_rankings(entries)


if __name__ == "__main__":
    sys.exit(FantasyProsRedraft().run())
