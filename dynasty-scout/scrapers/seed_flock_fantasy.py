"""
Seed Flock Fantasy SF dynasty rankings for the 2026 rookie class.
Source: Flock Fantasy (SF format, expert average)
Run: python scrapers/seed_flock_fantasy.py

Inserts into both local SQLite and Supabase (if DATABASE_URL is set).
"""

import sqlite3
import os
import sys
from datetime import datetime

# --- Flock Fantasy SF Rankings ---
# Rank 71 in the source list is a duplicate of Deion Burks (#53) — skipped.
FLOCK_RANKINGS = [
    (1,  471, "Jeremiyah Love"),
    (2,  473, "Carnell Tate"),
    (3,  475, "Jordyn Tyson"),
    (4,  474, "Makai Lemon"),
    (5,  472, "Fernando Mendoza"),
    (6,  479, "Jadarian Price"),
    (7,  477, "KC Concepcion"),
    (8,  476, "Kenyon Sadiq"),
    (9,  482, "Ty Simpson"),
    (10, 480, "Omar Cooper Jr."),
    (11, 489, "Eli Stowers"),
    (12, 481, "Jonah Coleman"),
    (13, 478, "Denzel Boston"),
    (14, 495, "Germie Bernard"),
    (15, 491, "Chris Bell"),
    (16, 497, "Antonio Williams"),
    (17, 483, "Nicholas Singleton"),
    (18, 524, "Carson Beck"),
    (19, 519, "Drew Allar"),
    (20, 499, "Max Klare"),
    (21, 484, "Elijah Sarratt"),
    (22, 486, "Zachariah Branch"),
    (23, 538, "De'Zhaun Stribling"),
    (24, 532, "Eli Raridon"),
    (25, 496, "Ja'Kobi Lane"),
    (26, 502, "Ted Hurst"),
    (27, 493, "Kaytron Allen"),
    (28, 490, "Chris Brazzell II"),
    (29, 533, "Kaelon Black"),
    (30, 527, "Oscar Delp"),
    (31, 485, "Emmett Johnson"),
    (32, 487, "Malachi Fields"),
    (33, 546, "Adam Randall"),
    (34, 514, "Cade Klubnik"),
    (35, 501, "Demond Claiborne"),
    (36, 522, "Justin Joly"),
    (37, 492, "Mike Washington Jr."),
    (38, 584, "Caleb Douglas"),
    (39, 498, "Skyler Bell"),
    (40, 542, "Eli Heidenreich"),
    (41, 516, "Bryce Lance"),
    (42, 529, "Cole Payton"),
    (43, 526, "Taylen Green"),
    (44, 523, "Brenen Thompson"),
    (45, 569, "Zavion Thomas"),
    (46, 506, "Seth McGowan"),
    (47, 528, "Kevin Coleman Jr."),
    (48, 504, "Jack Endries"),
    (49, 525, "Sam Roush"),
    (50, 595, "Seydou Traore"),
    (51, 507, "C.J. Daniels"),
    (52, 545, "Marlin Klein"),
    (53, 505, "Deion Burks"),
    (54, 510, "Jam Miller"),
    (55, 539, "Tanner Koziol"),
    (56, 552, "Cyrus Allen"),
    (57, 511, "J'Mari Taylor"),
    (58, 494, "Garrett Nussmeier"),
    (59, 513, "Reggie Virgil"),
    (60, 535, "Eric McAlister"),
    (61, 508, "Le'Veon Moss"),
    (62, 541, "Dae'Quan Wright"),
    (63, 588, "Jaydn Ott"),
    (64, 564, "Jeff Caldwell"),
    (65, 550, "Roman Hemby"),
    (66, 547, "Kaden Wetjen"),
    (67, 544, "Josh Cuevas"),
    (68, 548, "John Michael Gyllenborg"),
    (69, 578, "Malik Benson"),
    (70, 536, "Dallen Bentley"),
    # 71 = Deion Burks duplicate — skipped
    (72, 515, "Terion Stewart"),
    (73, 559, "Desmond Reid"),
    (74, 500, "Michael Trigg"),
    (75, 509, "Barion Brown"),
    (76, 597, "Diego Pavia"),
    (77, 565, "Kendrick Law"),
    (78, 557, "Lewis Bond"),
    (79, 543, "Eric Rivers"),
    (80, 575, "Chase Roberts"),
    (81, 530, "Joe Royer"),
    (82, 549, "Jalon Daniels"),
    (83, 551, "Robert Henry Jr."),
    (84, 558, "Colbie Young"),
    (85, 531, "Josh Cameron"),
    (86, 586, "Emmanuel Henderson"),
    (87, 579, "Bauer Sharp"),
    (88, 608, "Jaren Kanak"),
]

SOURCE = "Flock Fantasy SF"
SOURCE_URL = "https://flockfantasy.com"
NOW = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def seed_sqlite(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Delete existing Flock Fantasy SF rankings so re-runs are idempotent
    cur.execute("DELETE FROM rankings WHERE source = ?", (SOURCE,))
    deleted = cur.rowcount
    print(f"  SQLite: removed {deleted} existing Flock Fantasy SF rows")

    rows = [
        (player_id, SOURCE, rank, None, SOURCE_URL, NOW)
        for rank, player_id, _ in FLOCK_RANKINGS
    ]
    cur.executemany(
        "INSERT INTO rankings (player_id, source, rank_overall, tier, source_url, scraped_at) VALUES (?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    print(f"  SQLite: inserted {len(rows)} Flock Fantasy SF rankings")
    conn.close()


def seed_supabase(db_url: str) -> None:
    try:
        import psycopg2
    except ImportError:
        print("  Supabase: psycopg2 not installed — skipping")
        return

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("DELETE FROM rankings WHERE source = %s", (SOURCE,))
    deleted = cur.rowcount
    print(f"  Supabase: removed {deleted} existing Flock Fantasy SF rows")

    rows = [
        (player_id, SOURCE, rank, None, SOURCE_URL, NOW)
        for rank, player_id, _ in FLOCK_RANKINGS
    ]
    cur.executemany(
        "INSERT INTO rankings (player_id, source, rank_overall, tier, source_url, scraped_at) VALUES (%s, %s, %s, %s, %s, %s)",
        rows,
    )
    conn.commit()
    print(f"  Supabase: inserted {len(rows)} Flock Fantasy SF rankings")
    conn.close()


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)

    db_path = os.path.join(project_root, "dynasty_scout.db")
    if os.path.exists(db_path):
        print(f"Seeding local SQLite: {db_path}")
        seed_sqlite(db_path)
    else:
        print(f"SQLite DB not found at {db_path} — skipping")

    # Load .env for DATABASE_URL
    env_path = os.path.join(project_root, ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        print(f"\nSeeding Supabase...")
        seed_supabase(db_url)
    else:
        print("\nDATABASE_URL not set — skipping Supabase seed")
