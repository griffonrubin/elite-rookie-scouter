"""
Yahoo redraft rankings — BLOCKED (login required).

Yahoo's public draft-analysis page
(football.fantasysports.yahoo.com/f1/draftanalysis) returns a full HTML
document but renders no ranking rows until a Yahoo account is signed in;
the unauthenticated response contains only the sign-in shell. Their
Fantasy API needs OAuth2 with a registered app.

This scraper is left in place, wired into the consensus weights, and
fails soft: the nightly run continues and run_redraft_consensus.py
redistributes Yahoo's weight across the sources that did report.

To enable it, either:
  * add OAuth2 credentials and swap fetch() for the Yahoo Fantasy API
    (/fantasy/v2/game/nfl/players;sort=AR with an access token), or
  * export your Yahoo draft-analysis page and load it from disk.

Usage:  py -m scrapers.redraft.yahoo_redraft
"""
import sys

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper


class YahooRedraft(BaseRedraftScraper):
    SOURCE = "Yahoo Redraft"
    SOURCE_URL = "https://football.fantasysports.yahoo.com/f1/draftanalysis"

    def fetch(self):
        raise NotImplementedError(
            "Yahoo requires an authenticated session — no public rankings "
            "endpoint. See this module's docstring to enable it."
        )


if __name__ == "__main__":
    sys.exit(YahooRedraft().run())
