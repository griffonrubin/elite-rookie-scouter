"""
ESPN redraft rankings AND 2026 projections.

Both come from one `kona_player_info` payload, so this scraper writes to
`rankings` and `projections` in a single pass:

  * rankings   — player.draftRanksByRankType.PPR.rank  (~900 players)
  * projections— the stats entry with statSourceId 1 (projected),
                 statSplitTypeId 0 (full season), seasonId 2026;
                 `appliedTotal` is the PPR point total.

The endpoint is undocumented and picky about the X-Fantasy-Filter header,
which is what sets the result limit and the PPR sort. If ESPN changes it
this fails soft like every other redraft scraper.

Note FantasyPros is NOT a projection source: its free projection pages
only expose the top 10 per position.

Usage:  py -m scrapers.redraft.espn_redraft
"""
import json
import sys
import urllib.request

from scrapers.redraft.base_redraft_scraper import BaseRedraftScraper

SEASON = 2026
URL = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/"
    f"{SEASON}/segments/0/leaguedefaults/3?view=kona_player_info"
)
LIMIT = 900

# ESPN's internal position ids.
POSITION_BY_ID = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "X-Fantasy-Filter": json.dumps({
        "players": {
            "limit": LIMIT,
            "sortDraftRanks": {"sortPriority": 100, "sortAsc": True, "value": "PPR"},
        }
    }),
    "X-Fantasy-Source": "kona",
    "X-Fantasy-Platform": "kona-PROD",
}


def season_projection(player):
    """Projected full-season PPR total for 2026, or None."""
    for s in player.get("stats") or []:
        if (s.get("statSourceId") == 1
                and s.get("statSplitTypeId") == 0
                and s.get("seasonId") == SEASON):
            total = s.get("appliedTotal")
            return round(total, 2) if total else None
    return None


class ESPNRedraft(BaseRedraftScraper):
    SOURCE = "ESPN Redraft"
    SOURCE_URL = "https://www.espn.com/fantasy/football/"
    PROJECTION_SOURCE = "ESPN"

    def fetch(self):
        req = urllib.request.Request(URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.load(r)

        players = data.get("players") or []
        if not players:
            raise ValueError("kona_player_info returned no players")
        print(f"[{self.SOURCE}] {len(players)} players returned")

        ranked = 0
        projected = []

        for entry in players:
            p = entry.get("player") or {}
            pos = POSITION_BY_ID.get(p.get("defaultPositionId"))
            if not pos:
                continue
            name = p.get("fullName")
            pid = self.find_player(name=name, position=pos, espn_id=p.get("id"))
            if not pid:
                self.note_unmatched(name, pos, None, None)
                continue

            rank = ((p.get("draftRanksByRankType") or {}).get("PPR") or {}).get("rank")
            if rank:
                self.save_ranking(pid, rank_overall=rank)
                ranked += 1

            pts = season_projection(p)
            if pts is not None:
                projected.append((pid, pos, pts))

        if ranked == 0:
            raise ValueError("no PPR draft ranks found — ESPN changed their schema")

        # Positional rank comes from the rank order, and projection ranks from
        # the projected totals, so both are derived after the full pass.
        self._assign_positional_ranks()
        self._save_projections(projected)
        print(f"[{self.SOURCE}] {ranked} ranks, {len(projected)} projections")

    def _assign_positional_ranks(self):
        """ESPN publishes only an overall rank, so derive the positional one."""
        self.cursor.execute(
            """SELECT r.player_id, r.rank_overall, p.position
               FROM rankings r JOIN players p ON p.id = r.player_id
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

    def _save_projections(self, projected):
        """Rank projections overall and within position by projected points."""
        by_points = sorted(projected, key=lambda t: t[2], reverse=True)
        pos_counter = {}
        for overall, (pid, pos, pts) in enumerate(by_points, 1):
            pos_counter[pos] = pos_counter.get(pos, 0) + 1
            self.save_projection(
                pid, points=pts,
                ppg=round(pts / 17, 2),
                rank_overall=overall,
                rank_positional=pos_counter[pos],
                source=self.PROJECTION_SOURCE,
            )


if __name__ == "__main__":
    sys.exit(ESPNRedraft().run())
