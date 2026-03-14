import sqlite3
import os

DB_FILE = "dynasty_scout.db"

def inspect():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT slug, full_name FROM players LIMIT 10")
    rows = cursor.fetchall()
    print("--- SLUGS IN DB ---")
    for r in rows:
        print(f"'{r[0]}' -> {r[1]}")
    conn.close()

if __name__ == "__main__":
    inspect()
