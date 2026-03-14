import requests
from bs4 import BeautifulSoup
import re
import json

url = "https://www.fantasypros.com/nfl/rankings/devy.php"
resp = requests.get(url)
soup = BeautifulSoup(resp.text, "html.parser")
script_text = ""
for s in soup.find_all("script"):
    if "ecrData" in (s.string or ""):
        script_text = s.string
        break

m = re.search(r'"players"\s*:\s*(\[.+?\])\s*[,}]', script_text, re.DOTALL)
if m:
    players_json = json.loads(m.group(1))
    print("Rank 43:", players_json[42].get("player_name"), "Actual Rank:", players_json[42].get("rank_ecr"))
    for item in players_json[:50]:
        if "Williams" in str(item.get("player_name")):
            print("Found:", item.get("player_name"), item.get("rank_ecr"))
