import shutil
import os
import datetime

def backup():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base_dir, 'dynasty_scout.db')
    
    if os.path.exists(db_path):
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        bak_path = f"{db_path}.bak.{ts}"
        shutil.copy2(db_path, bak_path)
        print(f"Backed up {db_path} to {bak_path}")
    else:
        print("No database found to backup.")

if __name__ == "__main__":
    backup()
