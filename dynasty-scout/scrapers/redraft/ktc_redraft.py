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

        ranked = 0
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
            self.save_ranking(
                pid,
                rank_overall=rank,
                rank_positional=vals.get("startSitPositionalRank"),
                tier=vals.get("startSitOverallTier"),
                value=vals.get("startSitValue"),
            )
            ranked += 1

        if ranked == 0:
            raise ValueError("no startSit ranks present — KTC changed their schema")


if __name__ == "__main__":
    sys.exit(KTCRedraft().run())
