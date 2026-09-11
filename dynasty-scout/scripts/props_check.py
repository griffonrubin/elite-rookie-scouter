"""
Pin the parts of the prop pipeline that do not need a network.

The fetch cannot be exercised from here, so what is checkable is checked: the
odds arithmetic, the devigging, the payload shape the parser assumes, and the
conversion from lines to PPR points. If The Odds API ever changes the shape,
FIXTURE is the thing to update and this is the test that will say so.

Usage:  py scripts/props_check.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scrapers.redraft.player_props import (
    american_to_prob, consensus, devig, parse_event, ppr_from_markets)

# The documented response shape for event odds, trimmed to two books.
FIXTURE = {
    "id": "evt1", "commence_time": "2026-09-14T17:00:00Z",
    "home_team": "Cincinnati Bengals", "away_team": "Baltimore Ravens",
    "bookmakers": [
        {"key": "draftkings", "title": "DraftKings", "markets": [
            {"key": "player_reception_yds", "outcomes": [
                {"name": "Over", "description": "Ja'Marr Chase", "price": -114, "point": 78.5},
                {"name": "Under", "description": "Ja'Marr Chase", "price": -108, "point": 78.5}]},
            {"key": "player_receptions", "outcomes": [
                {"name": "Over", "description": "Ja'Marr Chase", "price": -120, "point": 6.5},
                {"name": "Under", "description": "Ja'Marr Chase", "price": 100, "point": 6.5}]},
            {"key": "player_anytime_td", "outcomes": [
                {"name": "Yes", "description": "Ja'Marr Chase", "price": 115}]},
        ]},
        {"key": "fanduel", "title": "FanDuel", "markets": [
            {"key": "player_reception_yds", "outcomes": [
                {"name": "Over", "description": "Ja'Marr Chase", "price": -110, "point": 80.5},
                {"name": "Under", "description": "Ja'Marr Chase", "price": -110, "point": 80.5}]},
        ]},
    ],
}

FAIL = []


def check(label, got, want, tol=1e-6):
    ok = abs(got - want) <= tol if isinstance(want, float) else got == want
    print(f"  {'ok  ' if ok else 'FAIL'} {label}: {got!r}" + ('' if ok else f"  (want {want!r})"))
    if not ok:
        FAIL.append(label)


print("== american odds to probability ==")
check("-110 favourite", round(american_to_prob(-110), 4), 0.5238)
check("+150 underdog", round(american_to_prob(150), 4), 0.4)
check("no price", american_to_prob(None), None)

print("\n== devig ==")
# -110 both sides is a 4.76% overround; the fair split is exactly even.
check("-110 / -110 is a coin flip", round(devig(-110, -110), 4), 0.5)
# 114/214 = .5327 and 108/208 = .5192 sum to a 5.19% overround;
# the fair over is .5327/1.0519. A one-cent gap is a small lean.
check("-114 / -108 leans over", round(devig(-114, -108), 4), 0.5064)
# One-sided markets keep the vig, and say so by being above the fair number.
check("+115 yes-only keeps vig", round(devig(115, None), 4), 0.4651)

print("\n== the payload shape the parser assumes ==")
by_name = {"jamarr chase": 42}
rows = parse_event(FIXTURE, by_name)
check("rows parsed", len(rows), 4)
check("books seen", len({r["book"] for r in rows}), 2)
check("markets seen", len({r["market"] for r in rows}), 3)
dk_yds = next(r for r in rows if r["book"] == "draftkings" and r["market"] == "rec_yds")
check("line read", dk_yds["line"], 78.5)
check("both sides kept", dk_yds["under_price"], -108)
td = next(r for r in rows if r["market"] == "anytime_td")
check("yes-only has no under", td["under_price"], None)
check("unknown player dropped", len(parse_event(FIXTURE, {})), 0)

print("\n== lines to PPR points ==")
pts, used = ppr_from_markets({"receptions": 6.5, "rec_yds": 79.5, "anytime_td_prob": 0.45})
# 6.5 catches + 7.95 yards + 2.7 touchdown
check("full line set", pts, 17.15)
# The fixture's touchdown is priced +115, which is .4651 rather than .45, so
# the end-to-end number below is 17.24 and not this one.
check("markets counted", used, 3)
thin, thin_used = ppr_from_markets({"rec_yds": 79.5})
check("yards only is thinner", thin, 7.95)
check("and says so", thin_used, 1)
check("nothing priced is zero markets", ppr_from_markets({})[1], 0)

print("\n== consensus across books ==")
proj = consensus(rows)[42]
# 78.5 and 80.5 -> 79.5; receptions and the touchdown came from one book each.
check("median line across books", proj["rec_yds"], 79.5)
check("receptions carried", proj["receptions"], 6.5)
check("books counted", proj["books_priced"], 2)
check("ppr points", proj["ppr_points"], 17.24)

print()
if FAIL:
    print(f"{len(FAIL)} FAILED: {', '.join(FAIL)}")
    sys.exit(1)
print("all prop checks passed")
