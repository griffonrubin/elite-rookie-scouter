"""
scripts/daily_refresh.py

Everything that should run once a day, in one command.

There was a `scrape:all` npm script for this and it had stopped working: it
is an `&&` chain, one link of it points at scrapers/rankings_scraper.py,
and that file does not exist. The chain therefore dies at that step and the
four after it — news, the validation fixes, the validator — have not run
since whenever the file was removed. A chain also means the first flaky
network call takes the whole run down with it.

So each step runs on its own and a failure is reported rather than fatal.
The point of a daily refresh is that most of it succeeds most days.

This is the local half of keeping data fresh. The other half is the cron
routes in vercel.json, which run against Supabase in production — and which
have never fired, because the project has never been deployed. Until it is,
this script is the only thing keeping anything current, so it ends by
printing how old every source actually is rather than claiming success.

Run:  py scripts/daily_refresh.py
      py scripts/daily_refresh.py --class 2027    (just that class)
      py scripts/daily_refresh.py --skip news
"""

import argparse
import os
import sqlite3
import subprocess
import sys
from datetime import date, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'dynasty_scout.db')

# Classes worth re-seeding daily. A drafted class does not get a new board,
# so only the upcoming one is re-scraped; its stats still refresh because
# those players are playing right now.
UPCOMING = 2027
DRAFTED = [2026]


def cfbd_key():
    """The key, from wherever dotenv can find it. Absent is not fatal."""
    try:
        from dotenv import dotenv_values
        for name in ('.env', '.env.local'):
            v = dotenv_values(os.path.join(ROOT, name)).get('CFBD_API_KEY')
            if v:
                return v
    except Exception:
        pass
    return os.environ.get('CFBD_API_KEY') or None


def steps(only_class, key):
    """(label, argv, needs_key) in the order they should run."""
    out = [
        # Before anything writes.
        ('backup', [sys.executable, 'scripts/backup_db.py'], False),
        # Dynasty values and picks — the trade calculator's whole input, and
        # the only dynasty numbers that move day to day.
        ('dynasty values', [sys.executable, 'scrapers/rankings/dynasty_values.py'], False),
    ]

    classes = [only_class] if only_class else [UPCOMING] + DRAFTED
    for year in classes:
        if year == UPCOMING:
            # The board moves daily and new prospects appear on it.
            out.append((f'{year} board',
                        [sys.executable, '-m', 'scrapers.class_seed_mddb', str(year)], False))
        out += [
            (f'{year} espn ids',
             [sys.executable, 'scrapers/seed_espn_ids.py', '--draft-year', str(year)], False),
            (f'{year} college stats',
             [sys.executable, 'scrapers/college_stats.py', f'--draft-year={year}'], False),
            (f'{year} bio',
             [sys.executable, 'scrapers/class_bio_espn.py', str(year)], False),
            (f'{year} recruiting + epa',
             [sys.executable, 'scrapers/cfbd_data.py', str(year)], True),
        ]

    out += [
        ('news', [sys.executable, 'scrapers/news_agent.py'], False),
        ('validate', [sys.executable, 'scrapers/validate_stats.py'], False),
    ]
    return [s for s in out if not (s[2] and not key)]


def run_step(label, argv, env):
    print(f"\n-- {label} " + "-" * max(0, 60 - len(label)))
    try:
        r = subprocess.run(argv, cwd=ROOT, env=env, capture_output=True,
                           text=True, timeout=1800)
    except subprocess.TimeoutExpired:
        print("   TIMED OUT after 30 minutes")
        return False
    except Exception as e:
        print(f"   could not start: {e}")
        return False
    tail = [l for l in (r.stdout or '').strip().split('\n') if l.strip()][-6:]
    for l in tail:
        print("   " + l)
    if r.returncode != 0:
        err = (r.stderr or '').strip().split('\n')[-3:]
        for l in err:
            print("   ! " + l)
    return r.returncode == 0


def checkpoint():
    """
    Fold the write-ahead log into the .db.

    Without this a run can commit everything and leave the tracked database
    file without it, because *.db-wal is gitignored.
    """
    try:
        c = sqlite3.connect(DB, timeout=30)
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        c.close()
        print("   write-ahead log folded in")
    except Exception as e:
        print(f"   ! could not checkpoint: {e}")


def freshness():
    """How old everything actually is, which is the only real report."""
    print("\n-- how fresh the data is now " + "-" * 33)
    c = sqlite3.connect(DB, timeout=30)
    today = date.today()

    def age(v):
        try:
            return (today - datetime.fromisoformat(str(v)[:10]).date()).days
        except Exception:
            return None

    rows = c.execute(
        "SELECT source, MAX(scraped_at) FROM rankings GROUP BY source "
        "ORDER BY MAX(scraped_at) DESC").fetchall()
    for source, newest in rows:
        d = age(newest)
        flag = '' if d is None or d <= 2 else f'   <-- {d} days old'
        print(f"   {source:<26} {str(newest)[:10]}{flag}")
    c.close()

    print("\n   The cron routes in vercel.json cover the redraft sources and")
    print("   the projections, and only run on a deployed project. Nothing")
    print("   above came from them.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--class', dest='only_class', type=int, default=None,
                    help='refresh only this draft class')
    ap.add_argument('--skip', nargs='*', default=[],
                    help='step labels to skip, e.g. --skip news backup')
    args = ap.parse_args()

    key = cfbd_key()
    if not key:
        print("! no CFBD_API_KEY found - recruiting and EPA steps are skipped")
    env = dict(os.environ)
    if key:
        env['CFBD_API_KEY'] = key

    plan = [s for s in steps(args.only_class, key)
            if not any(sk in s[0] for sk in args.skip)]
    print(f"daily refresh: {len(plan)} steps")

    ok, failed = [], []
    for label, argv, _ in plan:
        (ok if run_step(label, argv, env) else failed).append(label)

    print("\n-- folding the log in " + "-" * 40)
    checkpoint()
    freshness()

    print(f"\n{len(ok)} of {len(plan)} steps succeeded")
    if failed:
        print("failed: " + ", ".join(failed))
    # A partial run is still a useful run; only a total failure is an error.
    return 1 if not ok else 0


if __name__ == "__main__":
    sys.exit(main())
