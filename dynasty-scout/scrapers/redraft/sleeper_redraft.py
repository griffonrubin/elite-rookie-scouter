"""
Sleeper redraft rankings (by PPR ADP) and 2026 projections.

One undocumented endpoint carries both:
  * stats.adp_ppr  -> average draft position, used as the ranking
  * stats.pts_ppr  -> projected season PPR points

Rows key on `player_id`, which is the sleeper_id already stored on every
pooled player, so matching is exact rather than fuzzy.

ADP is a market signal rather than an editorial ranking, which makes it a
useful counterweight to the expert-driven sources — it reflects where
players actually go in drafts.

Usage:  py -m scrapers.redraft.sleeper_redraft
"""
import json
import sys
import urllib.request

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper

SEASON = 2026
POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
URL = (
    f"https://api.sleeper.com/projections/nfl/{SEASON}?season_type=regular&"
    + "&".join(f"position[]={p}" for p in POSITIONS)
    + "&order_by=pts_ppr"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; DyCharts/1.0)",
    "Accept": "application/json",
}


class SleeperRedraft(BaseRedraftScraper):
    SOURCE = "Sleeper Redraft"
    SOURCE_URL = "https://sleeper.com"
    PROJECTION_SOURCE = "Sleeper"

    def fetch(self):
        req = urllib.request.Request(URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=180) as r:
            rows = json.load(r)
        if not rows:
            raise ValueError("Sleeper returned no projection rows")
        print(f"[{self.SOURCE}] {len(rows)} rows returned")

        by_adp, projected = [], []

        for row in rows:
            stats = row.get("stats") or {}
            sid = str(row.get("player_id") or "")
            pid = self.by_sleeper.get(sid)
            if not pid:
                continue  # IDP and other non-pool players

            adp = stats.get("adp_ppr")
            if adp:
                by_adp.append((pid, float(adp)))

            pts = stats.get("pts_ppr")
            if pts:
                projected.append((pid, round(float(pts), 2)))

        if not by_adp and not projected:
            raise ValueError("no adp_ppr or pts_ppr values — Sleeper changed their schema")

        self._save_ranks(by_adp)
        self._save_projections(projected)
        print(f"[{self.SOURCE}] {len(by_adp)} ADP ranks, {len(projected)} projections")

    def _positions(self, ids):
        self.cursor.execute(
            "SELECT id, position FROM players WHERE id IN (%s)"
            % ",".join("?" * len(ids)), tuple(ids)
        )
        return {r["id"]: (r["position"] or "").upper() for r in self.cursor.fetchall()}

    def _save_ranks(self, by_adp):
        """ADP is a float draft slot; the dense rank order is what the board uses."""
        if not by_adp:
            return
        positions = self._positions([pid for pid, _ in by_adp])
        self.save_dense_rankings(
            (pid, adp, positions.get(pid, "")) for pid, adp in by_adp
        )

    def _save_projections(self, projected):
        if not projected:
            return
        ordered = sorted(projected, key=lambda t: t[1], reverse=True)
        positions = self._positions([pid for pid, _ in ordered])
        pos_counter = {}
        for overall, (pid, pts) in enumerate(ordered, 1):
            pos = positions.get(pid, "")
            pos_counter[pos] = pos_counter.get(pos, 0) + 1
            self.save_projection(
                pid, points=pts, ppg=round(pts / 17, 2),
                rank_overall=overall, rank_positional=pos_counter[pos],
                source=self.PROJECTION_SOURCE,
            )


if __name__ == "__main__":
    sys.exit(SleeperRedraft().run())
