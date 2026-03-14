import sqlite3
import pandas as pd

def debug_query():
    conn = sqlite3.connect('dynasty_scout.db')
    
    # Exact query from app/page.tsx
    sql = """
      SELECT 
        p.full_name,
        c.rank_overall
      FROM players p
      LEFT JOIN consensus_rankings c ON p.id = c.player_id
        AND c.calculated_at = (SELECT MAX(calculated_at) FROM consensus_rankings)
      WHERE c.rank_overall IS NOT NULL
      ORDER BY c.rank_overall ASC
    """
    
    print("--- EXECUTE QUERY ---")
    try:
        df = pd.read_sql_query(sql, conn)
        print(f"Rows returned: {len(df)}")
        print(df.head())
    except Exception as e:
        print(f"Error: {e}")
        
    print("\n--- CONSENSUS TABLE RAW ---")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM consensus_rankings LIMIT 5")
    for r in cursor.fetchall():
        print(r)
        
    conn.close()

if __name__ == "__main__":
    debug_query()
