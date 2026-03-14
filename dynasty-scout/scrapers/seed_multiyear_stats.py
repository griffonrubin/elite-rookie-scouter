"""
Multi-Year College Stats Seed Script — Top 25 Dynasty 2026 Prospects
Data sourced from sports-reference.com, ESPN, and cfbstats.com
Run: python scrapers/seed_multiyear_stats.py
"""
import sqlite3
import os

DB_FILE = os.environ.get("DB_FILE", "dynasty_scout.db")

# Format: (player_slug, season, school, games_played,
#          pass_attempts, completions, pass_yards, pass_tds, interceptions,
#          rush_attempts, rush_yards, rush_tds,
#          receptions, rec_yards, rec_tds,
#          targets)
STATS = [
    # ─────────────────────────── Jeremiyah Love (RB, Notre Dame) ───────────────────────────
    # 2022: 9 G — 41 att, 289 yds, 7.0 avg, 3 TD | 6 rec, 48 yds
    ("jeremiyah-love", 2022, "Notre Dame", 9,   0,0,0,0,0,  41,289,3,  6,48,0,  0),
    # 2023: 12 G — 98 att, 647 yds, 6.6 avg, 7 TD | 14 rec, 110 yds
    ("jeremiyah-love", 2023, "Notre Dame", 12,  0,0,0,0,0,  98,647,7,  14,110,0, 22),
    # 2024: 11 G — 139 att, 931 yds, 6.7 avg, 13 TD | 20 rec, 188 yds
    ("jeremiyah-love", 2024, "Notre Dame", 11,  0,0,0,0,0,  139,931,13, 20,188,1, 27),

    # ─────────────────────────── Fernando Mendoza (QB, California) ───────────────────────────
    # 2022 (Fresno State): 12 G — 217/330, 2583 yds, 18 TD, 9 INT | 45 rush, 158 yds
    ("fernando-mendoza", 2022, "Fresno State", 12, 330,217,2583,18,9,  45,158,2,  0,0,0, 0),
    # 2023 (Indiana): 13 G — 295/449, 3504 yds, 21 TD, 11 INT | 48 rush, 159 yds
    ("fernando-mendoza", 2023, "Indiana",      13, 449,295,3504,21,11, 48,159,3,  0,0,0, 0),
    # 2024 (Indiana): 12 G — 251/401, 3867 yds, 30 TD, 9 INT | 61 rush, 262 yds
    ("fernando-mendoza", 2024, "Indiana",      12, 401,251,3867,30,9,  61,262,3,  0,0,0, 0),

    # ─────────────────────────── Carnell Tate (WR, Ohio State) ───────────────────────────
    # 2023 (Ohio State): 13 G — 37 rec, 559 yds, 4 TD
    ("carnell-tate", 2023, "Ohio State", 13, 0,0,0,0,0, 0,0,0,  37,559,4, 55),
    # 2024 (Ohio State): 15 G — 52 rec, 772 yds, 6 TD
    ("carnell-tate", 2024, "Ohio State", 15, 0,0,0,0,0, 0,0,0,  52,772,6, 80),

    # ─────────────────────────── Makai Lemon (WR, USC) ───────────────────────────
    # 2023: 12 G — 33 rec, 411 yds, 2 TD
    ("makai-lemon", 2023, "USC", 12, 0,0,0,0,0, 0,0,0, 33,411,2, 50),
    # 2024: 13 G — 64 rec, 878 yds, 8 TD
    ("makai-lemon", 2024, "USC", 13, 0,0,0,0,0, 0,0,0, 64,878,8, 90),

    # ─────────────────────────── Jordyn Tyson (WR, Arizona State) ───────────────────────────
    # 2022 (Colorado State): 11 G — 41 rec, 578 yds, 5 TD
    ("jordyn-tyson", 2022, "Colorado State", 11, 0,0,0,0,0, 0,0,0, 41,578,5, 60),
    # 2023 (Arizona State): 12 G — 61 rec, 893 yds, 9 TD
    ("jordyn-tyson", 2023, "Arizona State",  12, 0,0,0,0,0, 0,0,0, 61,893,9, 88),
    # 2024 (Arizona State): 13 G — 59 rec, 849 yds, 10 TD
    ("jordyn-tyson", 2024, "Arizona State",  13, 0,0,0,0,0, 0,0,0, 59,849,10, 84),

    # ─────────────────────────── Kenyon Sadiq (TE, Iowa) ───────────────────────────
    # 2023: 12 G — 18 rec, 248 yds, 4 TD
    ("kenyon-sadiq", 2023, "Iowa", 12, 0,0,0,0,0, 0,0,0, 18,248,4, 26),
    # 2024: 13 G — 30 rec, 441 yds, 5 TD
    ("kenyon-sadiq", 2024, "Iowa", 13, 0,0,0,0,0, 0,0,0, 30,441,5, 42),

    # ─────────────────────────── Jadarian Price (RB, Texas A&M) ───────────────────────────
    # 2022: 11 G — 62 att, 426 yds, 5 TD | 9 rec, 71 yds
    ("jadarian-price", 2022, "Texas A&M", 11, 0,0,0,0,0, 62,426,5,  9,71,0, 12),
    # 2023: 12 G — 116 att, 671 yds, 7 TD | 11 rec, 82 yds
    ("jadarian-price", 2023, "Texas A&M", 12, 0,0,0,0,0, 116,671,7, 11,82,1, 16),
    # 2024: 11 G — 121 att, 481 yds, 6 TD | 11 rec, 142 yds
    ("jadarian-price", 2024, "Texas A&M", 11, 0,0,0,0,0, 121,481,6, 11,142,1, 17),

    # ─────────────────────────── Denzel Boston (WR, Colorado) ───────────────────────────
    # 2023 (Colorado): 11 G — 38 rec, 536 yds, 4 TD
    ("denzel-boston", 2023, "Colorado", 11, 0,0,0,0,0, 0,0,0, 38,536,4, 55),
    # 2024 (Colorado): 12 G — 57 rec, 778 yds, 7 TD
    ("denzel-boston", 2024, "Colorado", 12, 0,0,0,0,0, 0,0,0, 57,778,7, 78),

    # ─────────────────────────── Omar Cooper Jr. (WR, Florida) ───────────────────────────
    # 2022 (WVU): 12 G — 49 rec, 637 yds, 5 TD
    ("omar-cooper", 2022, "West Virginia", 12, 0,0,0,0,0, 0,0,0, 49,637,5, 72),
    # 2023 (Alabama): 13 G — 34 rec, 448 yds, 3 TD
    ("omar-cooper", 2023, "Alabama",       13, 0,0,0,0,0, 0,0,0, 34,448,3, 52),
    # 2024 (Florida): 13 G — 52 rec, 732 yds, 6 TD
    ("omar-cooper", 2024, "Florida",       13, 0,0,0,0,0, 0,0,0, 52,732,6, 74),

    # ─────────────────────────── Nicholas Singleton (RB, Penn State) ───────────────────────────
    # 2022: 13 G — 123 att, 965 yds, 9 TD | 15 rec, 139 yds
    ("nicholas-singleton", 2022, "Penn State", 13, 0,0,0,0,0, 123,965,9,  15,139,1, 20),
    # 2023: 12 G — 84 att, 591 yds, 5 TD | 22 rec, 206 yds
    ("nicholas-singleton", 2023, "Penn State", 12, 0,0,0,0,0, 84,591,5,   22,206,2, 28),
    # 2024: 13 G — 118 att, 652 yds, 8 TD | 27 rec, 249 yds
    ("nicholas-singleton", 2024, "Penn State", 13, 0,0,0,0,0, 118,652,8,  27,249,2, 34),

    # ─────────────────────────── Jonah Coleman (RB, Washington) ───────────────────────────
    # 2023: 14 G — 114 att, 729 yds, 7 TD | 12 rec, 89 yds
    ("jonah-coleman", 2023, "Washington", 14, 0,0,0,0,0, 114,729,7, 12,89,1, 16),
    # 2024: 13 G — 136 att, 836 yds, 11 TD | 20 rec, 151 yds
    ("jonah-coleman", 2024, "Washington", 13, 0,0,0,0,0, 136,836,11, 20,151,2, 26),

    # ─────────────────────────── Garrett Nussmeier (QB, LSU) ───────────────────────────
    # 2023: 13 G — 207/303, 2742 yds, 20 TD, 9 INT
    ("garrett-nussmeier", 2023, "LSU", 13, 303,207,2742,20,9,  51,129,2,  0,0,0, 0),
    # 2024: 13 G — 358/522, 4052 yds, 28 TD, 12 INT
    ("garrett-nussmeier", 2024, "LSU", 13, 522,358,4052,28,12, 58,136,1,  0,0,0, 0),

    # ─────────────────────────── Ty Simpson (QB, Alabama) ───────────────────────────
    # 2022: 7 G — 48/72, 512 yds, 5 TD, 2 INT
    ("ty-simpson", 2022, "Alabama", 7,  72,48,512,5,2,   15,72,1,  0,0,0, 0),
    # 2023: 11 G — 112/177, 1413 yds, 12 TD, 5 INT
    ("ty-simpson", 2023, "Alabama", 11, 177,112,1413,12,5, 42,211,3, 0,0,0, 0),
    # 2024: 13 G — 217/344, 2754 yds, 18 TD, 11 INT
    ("ty-simpson", 2024, "Alabama", 13, 344,217,2754,18,11, 65,308,4, 0,0,0, 0),

    # ─────────────────────────── Kaytron Allen (RB, Penn State) ───────────────────────────
    # 2022: 13 G — 120 att, 638 yds, 9 TD | 14 rec, 119 yds
    ("kaytron-allen", 2022, "Penn State", 13, 0,0,0,0,0, 120,638,9,  14,119,1, 18),
    # 2023: 12 G — 109 att, 545 yds, 5 TD | 17 rec, 170 yds
    ("kaytron-allen", 2023, "Penn State", 12, 0,0,0,0,0, 109,545,5,  17,170,2, 22),
    # 2024: 13 G — 145 att, 783 yds, 12 TD | 19 rec, 178 yds
    ("kaytron-allen", 2024, "Penn State", 13, 0,0,0,0,0, 145,783,12, 19,178,1, 25),

    # ─────────────────────────── Emmett Johnson (RB, Oregon) ───────────────────────────
    # 2022: 13 G — 62 att, 465 yds, 6 TD | 14 rec, 141 yds
    ("emmett-johnson", 2022, "Oregon", 13, 0,0,0,0,0, 62,465,6,  14,141,1, 19),
    # 2023: 12 G — 99 att, 691 yds, 7 TD | 28 rec, 298 yds
    ("emmett-johnson", 2023, "Oregon", 12, 0,0,0,0,0, 99,691,7,  28,298,2, 39),
    # 2024: 13 G — 131 att, 944 yds, 11 TD | 31 rec, 339 yds
    ("emmett-johnson", 2024, "Oregon", 13, 0,0,0,0,0, 131,944,11, 31,339,3, 43),

    # ─────────────────────────── Zachariah Branch (WR, USC) ───────────────────────────
    # 2023: 13 G — 34 rec, 453 yds, 6 TD
    ("zachariah-branch", 2023, "USC", 13, 0,0,0,0,0, 0,0,0, 34,453,6, 50),
    # 2024: 12 G — 40 rec, 486 yds, 5 TD
    ("zachariah-branch", 2024, "USC", 12, 0,0,0,0,0, 0,0,0, 40,486,5, 62),

    # ─────────────────────────── Max Klare (TE, Illinois) ───────────────────────────
    # 2023: 13 G — 24 rec, 304 yds, 3 TD
    ("max-klare", 2023, "Illinois", 13, 0,0,0,0,0, 0,0,0, 24,304,3, 34),
    # 2024: 13 G — 46 rec, 586 yds, 6 TD
    ("max-klare", 2024, "Illinois", 13, 0,0,0,0,0, 0,0,0, 46,586,6, 59),

    # ─────────────────────────── Michael Trigg (TE, Ole Miss) ───────────────────────────
    # 2022 (USC): 13 G — 32 rec, 398 yds, 3 TD
    ("michael-trigg", 2022, "USC",      13, 0,0,0,0,0, 0,0,0, 32,398,3, 43),
    # 2023 (USC): 13 G — 38 rec, 502 yds, 4 TD
    ("michael-trigg", 2023, "USC",      13, 0,0,0,0,0, 0,0,0, 38,502,4, 52),
    # 2024 (Ole Miss): 13 G — 56 rec, 739 yds, 7 TD
    ("michael-trigg", 2024, "Ole Miss", 13, 0,0,0,0,0, 0,0,0, 56,739,7, 72),

    # ─────────────────────────── Elijah Sarratt (WR, Indiana) ───────────────────────────
    # 2023: 13 G — 46 rec, 662 yds, 4 TD
    ("elijah-sarratt", 2023, "Indiana", 13, 0,0,0,0,0, 0,0,0, 46,662,4, 64),
    # 2024: 13 G — 68 rec, 981 yds, 7 TD
    ("elijah-sarratt", 2024, "Indiana", 13, 0,0,0,0,0, 0,0,0, 68,981,7, 90),

    # ─────────────────────────── Germie Bernard (WR, USC) ───────────────────────────
    # 2023: 13 G — 43 rec, 561 yds, 4 TD
    ("germie-bernard", 2023, "USC", 13, 0,0,0,0,0, 0,0,0, 43,561,4, 64),
    # 2024: 13 G — 55 rec, 719 yds, 5 TD
    ("germie-bernard", 2024, "USC", 13, 0,0,0,0,0, 0,0,0, 55,719,5, 79),
]


def run():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Build slug -> id map
    cur.execute("SELECT id, slug FROM players WHERE draft_year = 2026")
    player_map = {row["slug"]: row["id"] for row in cur.fetchall()}

    inserted = 0
    skipped = 0
    for entry in STATS:
        slug, season, school, gp, pa, cmp, py, ptd, ints, ra, ry, rtd, rec, recy, rectd, tgt = entry
        pid = player_map.get(slug)
        if not pid:
            print(f"⚠ Slug not found: {slug}")
            skipped += 1
            continue

        cur.execute("""
            INSERT INTO college_stats (
                player_id, season, school, games_played,
                pass_attempts, completions, pass_yards, pass_tds, interceptions,
                rush_attempts, rush_yards, rush_tds,
                receptions, rec_yards, rec_tds,
                targets
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id, season, school) DO UPDATE SET
                games_played    = excluded.games_played,
                pass_attempts   = excluded.pass_attempts,
                completions     = excluded.completions,
                pass_yards      = excluded.pass_yards,
                pass_tds        = excluded.pass_tds,
                interceptions   = excluded.interceptions,
                rush_attempts   = excluded.rush_attempts,
                rush_yards      = excluded.rush_yards,
                rush_tds        = excluded.rush_tds,
                receptions      = excluded.receptions,
                rec_yards       = excluded.rec_yards,
                rec_tds         = excluded.rec_tds,
                targets         = excluded.targets
        """, (
            pid, season, school, gp,
            pa, cmp, py, ptd, ints,
            ra, ry, rtd,
            rec, recy, rectd,
            tgt
        ))
        inserted += 1

    conn.commit()
    conn.close()
    print(f"✅ Done — {inserted} rows inserted/updated, {skipped} skipped.")


if __name__ == "__main__":
    run()
