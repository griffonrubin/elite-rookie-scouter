import requests
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scrapers import config

url = "https://www.nflmockdraftdatabase.com/big-boards/2026/consensus-big-board-2026"
headers = {"User-Agent": config.USER_AGENT}

resp = requests.get(url, headers=headers)
print(f"Status: {resp.status_code}")

with open("mddb_dump.html", "w", encoding="utf-8") as f:
    f.write(resp.text)

print("Saved to mddb_dump.html")
print(f"Content length: {len(resp.text)} chars")
print("\nFirst 2000 chars:")
print(resp.text[:2000])
