"""
scrapers/class_seed_mddb.py

Seed a draft class from the NFL Mock Draft Database consensus big board.

This replaces player_seed_mddb.py, which no longer works. That one read the
board out of a `data-react-props` attribute on a
`div[data-react-class="big_boards/Consensus"]`; the site has since been
rebuilt and neither the attribute nor the element exists, so it finds zero
players and reports success. The board is now plain DOM.

Two things about the source, both worth knowing before trusting the output.

It refuses non-browser requests — a plain `requests.get` comes back 403 — so
this drives a real browser, as the original did. That also means it cannot
run on Vercel, and is a local/CI job rather than a cron route.

And the public board stops at 100 players. Positions can be filtered in the
page, but that filters the same hundred rather than fetching a deeper list
per position, so a class yields however many of its top 100 happen to play a
fantasy position — 34 for 2027 at the time of writing, against the 216 the
2026 class accumulated over a full cycle from many sources. That is a limit
of the free board, not a partial run, and the count is reported so a thin
result is visible rather than silent.

Everything is upsert-only: a player already in the table keeps his id, his
stats and every other table that references him.

Run: py scrapers/class_seed_mddb.py 2027
"""

import re
import sys
import unicodedata
from datetime import date

from playwright.sync_api import sync_playwright

from scrapers import config

BOARD = ("https://www.nflmockdraftdatabase.com/big-boards/"
         "{year}/consensus-big-board-{year}")

FANTASY_POSITIONS = {"QB", "RB", "WR", "TE"}


def slugify(name: str) -> str:
    """Match the slugs already in the table: ascii, lowercase, hyphenated."""
    n = unicodedata.normalize("NFKD", name)
    n = n.encode("ascii", "ignore").decode("ascii").lower()
    n = re.sub(r"[.'’]", "", n)
    n = re.sub(r"[^a-z0-9]+", "-", n).strip("-")
    return n


def scrape(year: int):
    """
    Every row on the board, read field by field out of the DOM.

    Not parsed out of the row's text, which is what the first version did and
    what made it wrong. A row that has moved since yesterday carries a little
    movement badge, and the badge's number is rendered ahead of the rank — so
    "LaNorris Sellers, 16th, down 6" comes out of innerText as "6 16 LaNorris
    Sellers QB South Carolina", a regex anchored on the first number reads the
    movement as the rank, and the real rank ends up glued to the front of the
    name. The database briefly held a receiver called "42 Omarion Miller".

    Every field has its own element, so every field is taken from its own
    element. The player anchor also carries the site's own slug, which is the
    same shape as the slugs already in the table.
    """
    url = BOARD.format(year=year)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=config.USER_AGENT)
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        # The rows render client-side; wait for the player links themselves
        # rather than for a fixed number of seconds.
        page.wait_for_selector(f'a[href^="/players/{year}/"]', timeout=30000)
        rows = page.eval_on_selector_all(
            f'a[href^="/players/{year}/"]',
            """(els, year) => els.map(a => {
                const row = a.closest('div.relative');
                if (!row) return null;
                const rank = row.querySelector('span.font-black');
                // The position sits in its own pill; the school is the text
                // link to the college, as opposed to the crest link, which
                // wraps an image and has no text of its own.
                const pill = [...row.querySelectorAll('span')]
                    .find(s => /^(QB|RB|WR|TE|OT|IOL|DL|EDGE|LB|CB|S|K|P|LS)$/
                        .test((s.textContent || '').trim()));
                const school = [...row.querySelectorAll(
                    `a[href^="/colleges/${year}/"]`)]
                    .map(x => (x.textContent || '').trim()).find(t => t.length > 0);
                return {
                    rank: rank ? parseInt(rank.textContent.trim(), 10) : null,
                    name: (a.textContent || '').trim(),
                    slug: a.getAttribute('href').split('/').pop(),
                    position: pill ? pill.textContent.trim() : null,
                    school: school || null,
                };
            }).filter(Boolean)""", year)
        browser.close()

    out, dropped = [], 0
    for r in rows:
        if not r["rank"] or not r["name"] or not r["position"]:
            dropped += 1
            continue
        out.append(r)
    if dropped:
        print(f"  ! {dropped} rows missing a rank, name or position")
    return out


def save(cur, players, year, today):
    """Upsert the class, and record the board as a ranking source."""
    source = f"MDDB Consensus {year}"
    seeded = updated = 0
    for p in players:
        slug = p.get("slug") or slugify(p["name"])
        first, _, last = p["name"].partition(" ")
        row = cur.execute("SELECT id, draft_year FROM players WHERE slug = ?",
                          (slug,)).fetchone()
        if row:
            pid = row[0]
            # Never move a player between classes on the strength of a board
            # — a name collision with an existing prospect would otherwise
            # rewrite his draft year and orphan everything keyed to it.
            if row[1] is None:
                cur.execute("UPDATE players SET draft_year=?, updated_at=? "
                            "WHERE id=?", (year, today, pid))
            updated += 1
        else:
            cur.execute(
                """INSERT INTO players
                     (slug, full_name, first_name, last_name, position,
                      draft_year, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (slug, p["name"], first, last, p["position"],
                 year, today, today))
            pid = cur.lastrowid
            seeded += 1

        # The school the board lists him at.
        #
        # Worth storing for more than display: the ESPN id seeder reads a
        # player's school to tell two athletes of the same name apart, and
        # with nothing to go on it flags the ambiguous ones and moves on.
        # That is why the first run left Jeremiah Smith and Dante Moore —
        # the second and third players in the class — without an id and so
        # without a single college stat.
        if p.get("school"):
            have = cur.execute(
                "SELECT id FROM college_career WHERE player_id = ?", (pid,)).fetchone()
            if have:
                cur.execute("UPDATE college_career SET school = ? WHERE id = ?",
                            (p["school"], have[0]))
            else:
                cur.execute(
                    "INSERT INTO college_career (player_id, school) VALUES (?,?)",
                    (pid, p["school"]))

        # The board's own order, kept like any other ranking source so it
        # lands in the same history the charts read.
        cur.execute(
            """INSERT INTO rankings
                 (player_id, source, rank_overall, source_url, scraped_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(player_id, source, scraped_at) DO UPDATE SET
                 rank_overall = excluded.rank_overall""",
            (pid, source, p["rank"], BOARD.format(year=year), today))
    return seeded, updated


def run(year: int):
    conn = config.get_db_connection()
    cur = conn.cursor()
    today = date.today().isoformat()

    print(f"Scraping the {year} consensus big board…")
    board = scrape(year)
    skill = [p for p in board if p["position"] in FANTASY_POSITIONS]
    print(f"  {len(board)} on the board, {len(skill)} at a fantasy position")
    if not board:
        raise SystemExit("no rows parsed — the page shape has changed again")

    seeded, updated = save(cur, skill, year, today)
    conn.commit()

    total = cur.execute("SELECT COUNT(*) FROM players WHERE draft_year=?",
                        (year,)).fetchone()[0]
    print(f"  {seeded} new, {updated} already known — {total} in the {year} class")
    conn.close()


if __name__ == "__main__":
    run(int(sys.argv[1]) if len(sys.argv) > 1 else 2027)
