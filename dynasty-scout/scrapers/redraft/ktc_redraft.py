"""
KeepTradeCut redraft rankings.

KTC renders its board client-side, so this uses Playwright and reads the
page's global `playersArray` — the same trick the rookie KTC scraper uses.

Redraft lives under each player's `oneQBValues.startSit*` fields ("start
or sit" is KTC's seasonal mode, as opposed to their dynasty trade values).

Usage:  py -m scrapers.redraft.ktc_redraft
"""
import json
import sys

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper

URL = "https://keeptradecut.com/fantasy-rankings"


class KTCRedraft(BaseRedraftScraper):
    SOURCE = "KeepTradeCut Redraft"
    SOURCE_URL = URL

    def fetch(self):
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                page = browser.new_page(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                               "AppleWebKit/537.36 (KHTML, like Gecko) "
                               "Chrome/120.0 Safari/537.36"
                )
                page.goto(URL, timeout=120000)
                page.wait_for_timeout(5000)
                raw = page.evaluate(
                    "typeof playersArray !== 'undefined' "
                    "? JSON.stringify(playersArray) : null"
                )
            finally:
                browser.close()

        if not raw:
            raise ValueError("playersArray not found — KTC changed their page")
        players = json.loads(raw)
        print(f"[{self.SOURCE}] {len(players)} players in playersArray")

        entries = []
        for p in players:
            vals = p.get("oneQBValues") or {}
            rank = vals.get("startSitOverallRank")
            if not rank:
                continue
            name = p.get("playerName")
            pos = (p.get("position") or "").upper()
            pid = self.find_player(name=name, position=pos, team=p.get("team"))
            if not pid:
                self.note_unmatched(name, pos, p.get("team"), rank)
                continue
            # KTC numbers its 365 seasonal players against a much larger
            # universe (ranks reach 969), so store the dense position.
            entries.append((pid, rank, pos, vals.get("startSitOverallTier")))

        if not entries:
            raise ValueError("no startSit ranks present — KTC changed their schema")
        self.save_dense_rankings(entries)


if __name__ == "__main__":
    sys.exit(KTCRedraft().run())
