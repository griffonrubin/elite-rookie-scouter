"""
Flock Fantasy redraft rankings — BLOCKED (subscription required).

flockfantasy.com is a client-rendered SPA whose marketing page exposes
only in-page anchors (#rankings); every real rankings route redirects to
/login or /subscribe. There is no public JSON endpoint — the network
trace on a cold load shows analytics calls and nothing else.

Note this is a different product from the Flock SF dynasty rookie
rankings already in `lib/constants.ts` SOURCES, which were seeded
manually rather than scraped.

Like the Yahoo scraper this fails soft so the nightly chain continues
and the consensus redistributes Flock's weight.

To enable it, add an authenticated Playwright session (storage_state
from a signed-in browser profile) and read the rankings table.

Usage:  py -m scrapers.redraft.flock_redraft
"""
import sys

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper


class FlockRedraft(BaseRedraftScraper):
    SOURCE = "Flock Redraft"
    SOURCE_URL = "https://flockfantasy.com"

    def fetch(self):
        raise NotImplementedError(
            "Flock Fantasy rankings are behind a subscription — no public "
            "endpoint. See this module's docstring to enable it."
        )


if __name__ == "__main__":
    sys.exit(FlockRedraft().run())
