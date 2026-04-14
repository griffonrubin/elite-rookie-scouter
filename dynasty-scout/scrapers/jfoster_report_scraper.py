"""
JFoster Report Scraper — jfosterdraft.com
Scrapes Strengths, Weaknesses, and POS FIT from each skill-position player's
Report tab modal on https://jfosterdraft.com/.

Adds/updates these fields in jfoster_grades:
  - strengths  (JSON array of bullet strings)
  - weaknesses (JSON array of bullet strings)
  - pos_fit    (e.g. "Z", "X", "F", "slot", "H")

Run:
    python scrapers/jfoster_report_scraper.py
    python scrapers/jfoster_report_scraper.py --force   # re-scrape already-filled players
    python scrapers/jfoster_report_scraper.py --dry-run
    python scrapers/jfoster_report_scraper.py --limit 10
"""

import json
import os
import re
import sqlite3
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ── Config ────────────────────────────────────────────────────────────────────

SITE_URL = "https://jfosterdraft.com/"
DB_PATH  = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dynasty_scout.db")

DRY_RUN = "--dry-run" in sys.argv
FORCE   = "--force"   in sys.argv

LIMIT = None
for i, arg in enumerate(sys.argv):
    if arg == "--limit" and i + 1 < len(sys.argv):
        try:
            LIMIT = int(sys.argv[i + 1])
        except ValueError:
            pass

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── DB ────────────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    cols = [r[1] for r in conn.execute("PRAGMA table_info(jfoster_grades)").fetchall()]
    if "pos_fit" not in cols:
        conn.execute("ALTER TABLE jfoster_grades ADD COLUMN pos_fit TEXT")
        conn.commit()
    return conn


def get_players(conn):
    rows = conn.execute("""
        SELECT jg.id as jg_id, jg.player_id, p.full_name, p.position, p.slug,
               jg.strengths, jg.weaknesses, jg.pos_fit
        FROM jfoster_grades jg
        JOIN players p ON p.id = jg.player_id
        WHERE p.position IN ('WR', 'RB', 'TE', 'QB')
          AND p.draft_year = 2026
        ORDER BY jg.player_id
    """).fetchall()
    return rows


def upsert(conn, jg_id, strengths, weaknesses, pos_fit):
    conn.execute("""
        UPDATE jfoster_grades
        SET strengths  = COALESCE(?, strengths),
            weaknesses = COALESCE(?, weaknesses),
            pos_fit    = COALESCE(?, pos_fit),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (
        json.dumps(strengths)  if strengths  else None,
        json.dumps(weaknesses) if weaknesses else None,
        pos_fit,
        jg_id,
    ))
    conn.commit()


# ── Playwright helpers ────────────────────────────────────────────────────────

FIND_AND_CLICK_JS = """
(name) => {
    // Search every tbody row for a cell whose text includes the player name
    const rows = Array.from(document.querySelectorAll('table tbody tr, [role=rowgroup] [role=row]'));
    for (const row of rows) {
        if (row.textContent.includes(name)) {
            row.click();
            return true;
        }
    }
    return false;
}
"""

SCRAPE_MODAL_JS = """
() => {
    // Modal is a div[role=dialog], NOT a <dialog> element
    const dialog = document.querySelector('[role=dialog]');
    if (!dialog) return { strengths: [], weaknesses: [], pos_fit: null };

    // ── POS FIT ──────────────────────────────────────────────────────────────
    // The cell contains multiple .player-pos2-chip spans — extract each individually
    let pos_fit = null;
    const table0 = dialog.querySelector('table');
    if (table0) {
        const ths = Array.from(table0.querySelectorAll('th'));
        const posFitIdx = ths.findIndex(h => /POS.?FIT/i.test(h.textContent));
        if (posFitIdx >= 0) {
            const tds = Array.from(table0.querySelectorAll('td'));
            const cell = tds[posFitIdx];
            if (cell) {
                // Try chip spans first
                const chips = Array.from(cell.querySelectorAll('.player-pos2-chip'))
                    .map(s => s.textContent.trim())
                    .filter(t => t && !/^[—\\-]$/.test(t));
                if (chips.length > 0) {
                    pos_fit = chips.join('/');
                } else {
                    const val = cell.textContent.trim();
                    if (val && !/^[—\\-]$/.test(val) && val.length <= 10) {
                        pos_fit = val;
                    }
                }
            }
        }
    }

    // ── STRENGTHS / WEAKNESSES ───────────────────────────────────────────────
    // Each li starts with '+' (strength) or '−' (weakness, unicode minus U+2212)
    const allLi = Array.from(dialog.querySelectorAll('li'));
    const strengths = allLi
        .filter(li => li.textContent.trim().startsWith('+'))
        .map(li => li.textContent.trim().replace(/^\\+\\s*/, '').trim())
        .filter(Boolean);
    const weaknesses = allLi
        .filter(li => li.textContent.trim().startsWith('\\u2212') || li.textContent.trim().startsWith('-'))
        .map(li => li.textContent.trim().replace(/^[\\u2212\\-]\\s*/, '').trim())
        .filter(Boolean);

    return { strengths, weaknesses, pos_fit };
}
"""

CLOSE_MODAL_JS = """
() => {
    const dialog = document.querySelector('[role=dialog]');
    if (dialog) {
        const closeBtn = dialog.querySelector('button[aria-label*="close" i], button[aria-label*="dismiss" i]');
        if (closeBtn) { closeBtn.click(); return 'btn'; }
    }
    return 'esc';
}
"""


def wait_for_board(page):
    page.wait_for_function(
        "() => document.querySelectorAll('table tbody tr, [role=rowgroup] [role=row]').length > 5",
        timeout=30000,
    )


def try_set_page_size(page):
    """Try to set the board to show 100 rows per page."""
    try:
        selects = page.locator("select").all()
        for sel in selects:
            options = sel.evaluate("el => Array.from(el.options).map(o => o.value)")
            if "100" in options:
                sel.select_option("100")
                page.wait_for_timeout(2000)
                return True
    except Exception:
        pass
    return False


def find_and_click(page, name: str) -> bool:
    """Find player row by name and click it using JS."""
    try:
        result = page.evaluate(FIND_AND_CLICK_JS, name)
        return bool(result)
    except Exception:
        return False


def scrape_modal(page) -> dict:
    """Scrape open modal for strengths, weaknesses, pos_fit."""
    try:
        page.wait_for_selector("[role=dialog]", timeout=8000)
        page.wait_for_timeout(600)  # Let modal fully render

        # Make sure Report tab is active
        try:
            tabs = page.locator("[role=dialog] [role=tablist] [role=tab]").all()
            if tabs:
                first_tab = tabs[0]
                if "report" in first_tab.inner_text().lower():
                    first_tab.click()
                    page.wait_for_timeout(300)
        except Exception:
            pass

        return page.evaluate(SCRAPE_MODAL_JS)
    except Exception as e:
        return {"strengths": [], "weaknesses": [], "pos_fit": None}


def close_modal(page):
    try:
        page.evaluate(CLOSE_MODAL_JS)
        page.wait_for_timeout(300)
    except Exception:
        pass
    try:
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
    except Exception:
        pass


def paginate_to_next(page) -> bool:
    """Click Next page button. Returns False if no next page."""
    try:
        # Use JS to find and click — avoids Playwright locator timeout issues
        result = page.evaluate("""
            () => {
                const btns = Array.from(document.querySelectorAll('button'));
                const next = btns.find(b => b.textContent.trim() === 'Next');
                if (!next || next.disabled) return false;
                next.click();
                return true;
            }
        """)
        if not result:
            return False
        page.wait_for_timeout(2000)
        return True
    except Exception:
        return False


def reset_to_page_one(page):
    """Click Back until disabled to return to first page."""
    for _ in range(25):
        try:
            done = page.evaluate("""
                () => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const back = btns.find(b => b.textContent.trim() === 'Back');
                    if (!back || back.disabled) return true;  // already on page 1
                    back.click();
                    return false;
                }
            """)
            if done:
                break
            page.wait_for_timeout(800)
        except Exception:
            break


# ── Main ──────────────────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation — for fuzzy matching against board display names."""
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


GET_PAGE_NAMES_JS = """
() => Array.from(
    document.querySelectorAll('table tbody tr td:nth-child(3) div[style*="font-weight: 600"]')
).map(d => d.textContent.trim())
"""


def run():
    conn = get_db()
    all_players = get_players(conn)

    if not FORCE:
        targets = [p for p in all_players if not p["strengths"] and not p["weaknesses"]]
    else:
        targets = list(all_players)

    if LIMIT:
        targets = targets[:LIMIT]

    print(f"JFoster Report Scraper — {len(targets)} players to process")
    if DRY_RUN:
        print("  DRY RUN — no DB writes")

    if not targets:
        print("  Nothing to do.")
        conn.close()
        return

    # Build lookup: normalized_name → player row
    target_map = {}
    for p in targets:
        target_map[normalize_name(p["full_name"])] = p

    done = skipped = 0
    found_set: set = set()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1440, "height": 900},
        )
        page = ctx.new_page()

        print(f"  Loading {SITE_URL} ...")
        page.goto(SITE_URL, wait_until="domcontentloaded", timeout=30000)
        wait_for_board(page)
        try_set_page_size(page)
        print("  Board ready. Sweeping all board pages...\n")

        board_page = 1
        while True:
            # Get names on current board page
            board_names = page.evaluate(GET_PAGE_NAMES_JS)
            hits = []
            for board_name in board_names:
                norm = normalize_name(board_name)
                if norm in target_map:
                    hits.append((board_name, target_map[norm]))

            print(f"  [Board p{board_page}] {len(board_names)} rows, {len(hits)} target hits")

            for board_name, player in hits:
                name  = player["full_name"]
                pos   = player["position"]
                jg_id = player["jg_id"]
                print(f"    -> {name} ({pos}) ...", end=" ", flush=True)

                # Click the row
                clicked = page.evaluate("""
                    (bname) => {
                        const rows = Array.from(document.querySelectorAll('table tbody tr'));
                        for (const row of rows) {
                            const nameDiv = row.querySelector('td:nth-child(3) div[style*="font-weight: 600"]');
                            if (nameDiv && nameDiv.textContent.trim() === bname) {
                                row.click();
                                return true;
                            }
                        }
                        return false;
                    }
                """, board_name)

                if not clicked:
                    print("click failed")
                    skipped += 1
                    continue

                data = scrape_modal(page)
                close_modal(page)
                # Small wait for board to settle after modal close
                page.wait_for_timeout(500)

                s_count = len(data.get("strengths") or [])
                w_count = len(data.get("weaknesses") or [])
                pf      = data.get("pos_fit")
                print(f"str={s_count} wk={w_count} fit={pf!r}")

                if not DRY_RUN and (s_count or w_count or pf):
                    upsert(conn, jg_id, data.get("strengths"), data.get("weaknesses"), pf)
                    done += 1
                else:
                    skipped += 1

                found_set.add(normalize_name(name))
                time.sleep(0.3)

            # Paginate forward
            if not paginate_to_next(page):
                break
            wait_for_board(page)
            board_page += 1

        browser.close()

    not_found = [p["full_name"] for p in targets if normalize_name(p["full_name"]) not in found_set]
    prefix = "[DRY RUN] " if DRY_RUN else ""
    print(f"\n{prefix}Done.  Updated={done}  Empty/skipped={skipped}  Not found on board={len(not_found)}")
    if not_found:
        print("  Not found:", ", ".join(not_found))
    conn.close()


if __name__ == "__main__":
    run()
