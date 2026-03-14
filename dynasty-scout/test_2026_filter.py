#!/usr/bin/env python
"""Check how many 2026 prospects are in the database"""

from scrapers import config

conn = config.get_db_connection()
cursor = config.get_db_cursor(conn)

# Count 2026 prospects
cursor.execute("SELECT COUNT(*) as count FROM players WHERE draft_year = 2026")
count_2026 = cursor.fetchone()['count']
print(f"✓ 2026 prospects in database: {count_2026}")

# Count all players
cursor.execute("SELECT COUNT(*) as count FROM players")
count_all = cursor.fetchone()['count']
print(f"  Total players in database: {count_all}")

# Show sample 2026 prospects
print("\nSample 2026 prospects:")
cursor.execute("SELECT full_name, position FROM players WHERE draft_year = 2026 LIMIT 10")
for row in cursor.fetchall():
    print(f"  - {row['full_name']} ({row['position']})")

conn.close()
