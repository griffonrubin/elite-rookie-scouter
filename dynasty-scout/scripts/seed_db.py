import sqlite3
import os
from datetime import datetime

# Database path
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dynasty_scout.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def seed_data():
    conn = get_db()
    cursor = conn.cursor()

    print(f"Seeding database at {DB_PATH}...")
    
    # Use same timestamp for all rankings in this batch
    batch_timestamp = datetime.now().isoformat()

    # Top 2026 Prospects
    prospects = [
        {
            "slug": "arch-manning",
            "full_name": "Arch Manning",
            "first_name": "Arch",
            "last_name": "Manning",
            "position": "QB",
            "school": "Texas",
            "age_at_draft": 21.0,
            "rank": 1
        },
        {
            "slug": "nico-iamaleava",
            "full_name": "Nico Iamaleava",
            "first_name": "Nico",
            "last_name": "Iamaleava",
            "position": "QB",
            "school": "Tennessee",
            "age_at_draft": 21.5,
            "rank": 2
        },
        {
            "slug": "dante-moore",
            "full_name": "Dante Moore",
            "first_name": "Dante",
            "last_name": "Moore",
            "position": "QB",
            "school": "Oregon",
            "age_at_draft": 20.9,
            "rank": 3
        },
        {
            "slug": "jackson-arnold",
            "full_name": "Jackson Arnold",
            "first_name": "Jackson",
            "last_name": "Arnold",
            "position": "QB",
            "school": "Oklahoma",
            "age_at_draft": 21.2,
            "rank": 4
        },
        {
            "slug": "malachi-nelson",
            "full_name": "Malachi Nelson",
            "first_name": "Malachi",
            "last_name": "Nelson",
            "position": "QB",
            "school": "Boise State",
            "age_at_draft": 21.3,
            "rank": 5
        },
        {
            "slug": "jeremiah-love",
            "full_name": "Jeremiah Love",
            "first_name": "Jeremiah",
            "last_name": "Love",
            "position": "RB",
            "school": "Notre Dame",
            "age_at_draft": 21.4,
            "rank": 6
        },
        {
            "slug": "aidan-chiles",
            "full_name": "Aidan Chiles",
            "first_name": "Aidan",
            "last_name": "Chiles",
            "position": "QB",
            "school": "Michigan State",
            "age_at_draft": 20.8,
            "rank": 7
        },
        {
            "slug": "trevor-etienne",
            "full_name": "Trevor Etienne",
            "first_name": "Trevor",
            "last_name": "Etienne",
            "position": "RB",
            "school": "Georgia",
            "age_at_draft": 21.7,
            "rank": 8
        },
        {
            "slug": "nyckoles-harbor",
            "full_name": "Nyckoles Harbor",
            "first_name": "Nyckoles",
            "last_name": "Harbor",
            "position": "WR",
            "school": "South Carolina",
            "age_at_draft": 20.9,
            "rank": 9
        },
        {
            "slug": "dylan-raiola",
            "full_name": "Dylan Raiola",
            "first_name": "Dylan",
            "last_name": "Raiola",
            "position": "QB",
            "school": "Nebraska",
            "age_at_draft": 20.5,
            "rank": 10
        },
         {
            "slug": "jeremiah-smith",
            "full_name": "Jeremiah Smith",
            "first_name": "Jeremiah",
            "last_name": "Smith",
            "position": "WR",
            "school": "Ohio State",
            "age_at_draft": 19.8,
            "rank": 11
        },
        {
            "slug": "justice-haynes",
            "full_name": "Justice Haynes",
            "first_name": "Justice",
            "last_name": "Haynes",
            "position": "RB",
            "school": "Alabama",
            "age_at_draft": 21.0,
            "rank": 12
        },
        {
            "slug": "zachariah-branch",
            "full_name": "Zachariah Branch",
            "first_name": "Zachariah",
            "last_name": "Branch",
            "position": "WR",
            "school": "USC",
            "age_at_draft": 21.1,
            "rank": 13
        },
        {
            "slug": "rueben-owens",
            "full_name": "Rueben Owens",
            "first_name": "Rueben",
            "last_name": "Owens",
            "position": "RB",
            "school": "Texas A&M",
            "age_at_draft": 21.2,
            "rank": 14
        },
        {
            "slug": "carnell-tate",
            "full_name": "Carnell Tate",
            "first_name": "Carnell",
            "last_name": "Tate",
            "position": "WR",
            "school": "Ohio State",
            "age_at_draft": 21.3,
            "rank": 15
        }
    ]

    for p in prospects:
        # Insert Player
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO players 
                (slug, full_name, first_name, last_name, position, age_at_draft, draft_year)
                VALUES (?, ?, ?, ?, ?, ?, 2026)
            """, (p['slug'], p['full_name'], p['first_name'], p['last_name'], p['position'], p['age_at_draft']))
            
            # Get Player ID
            cursor.execute("SELECT id FROM players WHERE slug = ?", (p['slug'],))
            player_id = cursor.fetchone()[0]

            # Insert College Career
            cursor.execute("""
                INSERT OR IGNORE INTO college_career (player_id, school, seasons)
                VALUES (?, ?, ?)
            """, (player_id, p['school'], '2024-2025'))

            # Insert Consensus Ranking
            cursor.execute("""
                INSERT OR REPLACE INTO consensus_rankings 
                (player_id, rank_overall, rank_positional, avg_rank, best_rank, worst_rank, std_deviation, num_sources, calculated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                player_id, 
                p['rank'], 
                0, # Todo: calc positional rank
                float(p['rank']), 
                p['rank'], 
                p['rank'], 
                0.0, 
                1, 
                batch_timestamp
            ))
            
            print(f"Seeded {p['full_name']}")

        except Exception as e:
            print(f"Error seeding {p['full_name']}: {e}")

    conn.commit()
    conn.close()
    print("Database seeding complete!")

if __name__ == "__main__":
    seed_data()
