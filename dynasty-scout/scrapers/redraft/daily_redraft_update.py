"""
Run the whole redraft pipeline end to end.

Order matters: identity before stats, rankings before consensus, and the
Supabase sync last so production only ever sees a finished state.

  1. schema         idempotent DDL
  2. player pool    Sleeper + ID crosswalk (skip with --no-pool)
  3. nflverse stats 2021-2025 box score + advanced (skip with --no-stats;
                    slowest step)
  4. Vegas lines    spreads/totals/moneylines -> implied team totals
  5. rankings       6 live sources, each failing soft
  6. consensus      weighted percentile over whatever reported
  7. sync           push to Supabase and print a row-count diff

Individual scrapers never abort the chain — a source that changes its
markup logs a warning and the consensus redistributes its weight.

Usage:
  py -m scrapers.redraft.daily_redraft_update              # everything
  py -m scrapers.redraft.daily_redraft_update --ranks-only # daily refresh
  py -m scrapers.redraft.daily_redraft_update --no-sync    # local only
  py -m scrapers.redraft.daily_redraft_update --no-vegas   # skip the odds pull
"""
import argparse
import sys
import time
import traceback
from datetime import datetime

from scrapers.redraft import (
    cbs_redraft, espn_redraft, fantasycalc_redraft, flock_csv_import,
    fp_redraft, ktc_redraft, sleeper_redraft,
)

# Ordered best-coverage-first so a partial run still produces a usable board.
# The Flock CSV import runs last and supplies four sources at once (Flock,
# Yahoo, Underdog, FFPC); it no-ops when no export file is present.
RANKING_SCRAPERS = [
    ("FantasyPros PPR", fp_redraft.FantasyProsRedraft),
    ("ESPN", espn_redraft.ESPNRedraft),
    ("Sleeper", sleeper_redraft.SleeperRedraft),
    ("KeepTradeCut", ktc_redraft.KTCRedraft),
    ("CBS", cbs_redraft.CBSRedraft),
    ("FantasyCalc", fantasycalc_redraft.FantasyCalcRedraft),
    ("Flock CSV (+Yahoo/Underdog/FFPC)", flock_csv_import.FlockCsvImport),
]


def banner(text):
    print(f"\n{'=' * 62}\n  {text}\n{'=' * 62}")


def step(label, fn):
    """Run one stage, timing it and swallowing failures."""
    start = time.time()
    try:
        fn()
        print(f"  -> {label} finished in {time.time() - start:.1f}s")
        return True
    except SystemExit as e:
        if e.code not in (0, None):
            print(f"  -> {label} exited with code {e.code}")
            return False
        return True
    except Exception as e:
        print(f"  -> {label} FAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
        return False


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-pool", action="store_true", help="skip the player-pool seed")
    ap.add_argument("--no-stats", action="store_true", help="skip the nflverse stat load")
    ap.add_argument("--no-vegas", action="store_true", help="skip the Vegas line load")
    ap.add_argument("--no-sync", action="store_true", help="skip the Supabase push")
    ap.add_argument("--ranks-only", action="store_true",
                    help="rankings + consensus + sync only (the usual daily run)")
    args = ap.parse_args(argv)

    skip_pool = args.no_pool or args.ranks_only
    skip_stats = args.no_stats or args.ranks_only
    # Lines move daily, so Vegas rides along with the cheap daily run.
    skip_vegas = args.no_vegas

    started = datetime.now()
    print(f"Redraft pipeline started {started:%Y-%m-%d %H:%M:%S}")
    results = {}

    banner("1. Schema")
    from scrapers.redraft import schema_advanced, schema_redraft
    results["schema"] = step("schema", schema_redraft.migrate)
    results["schema:advanced"] = step("advanced/Vegas schema", schema_advanced.migrate)

    if not skip_pool:
        banner("2. Player pool")
        from scrapers.redraft import seed_player_pool
        results["pool"] = step("player pool", seed_player_pool.seed)
    else:
        print("\n2. Player pool — skipped")

    if not skip_stats:
        banner("3. NFL stats (2021-2025)")
        from scrapers.redraft import nflverse_advanced, nflverse_stats
        results["stats"] = step(
            "nflverse stats",
            lambda: nflverse_stats.run(nflverse_stats.DEFAULT_SEASONS),
        )
        results["advanced"] = step(
            "nflverse advanced stats",
            lambda: nflverse_advanced.run(nflverse_advanced.DEFAULT_SEASONS),
        )
    else:
        print("\n3. NFL stats — skipped")

    if not skip_vegas:
        banner("4. Vegas lines")
        from scrapers.redraft import vegas_lines
        results["vegas"] = step("vegas lines", vegas_lines.run)
    else:
        print("\n4. Vegas lines — skipped")

    banner("5. Ranking sources")
    live = 0
    for label, cls in RANKING_SCRAPERS:
        print(f"\n-- {label} --")
        scraper = cls()
        step(label, scraper.run)
        wrote = scraper.saved > 0   # run() leaves `saved` as its row count
        if wrote:
            live += 1
        results[f"rank:{label}"] = wrote
    print(f"\n{live}/{len(RANKING_SCRAPERS)} ranking sources reported data")

    banner("6. Consensus")
    from scrapers.redraft import run_redraft_consensus
    results["consensus"] = step("consensus", run_redraft_consensus.run)

    if not args.no_sync:
        banner("7. Supabase sync")
        from scrapers.redraft import sync_redraft_to_supabase
        results["sync"] = step("sync", sync_redraft_to_supabase.run)
    else:
        print("\n7. Supabase sync — skipped")

    elapsed = (datetime.now() - started).total_seconds()
    banner("Summary")
    for k, ok in results.items():
        print(f"  {'OK  ' if ok else 'FAIL'} {k}")
    print(f"\nTotal {elapsed:.1f}s")
    # A failed optional source shouldn't fail the run; only the spine matters.
    spine_ok = results.get("consensus", False) and results.get("schema", False)
    return 0 if spine_ok else 1


if __name__ == "__main__":
    sys.exit(main())
