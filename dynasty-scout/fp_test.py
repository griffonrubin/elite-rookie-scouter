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
    for item in players_json[:20]:
        print(item.get("player_name"), item.get("rank_ecr"))
    
    print("\nSearch for Williams:")
    for item in players_json:
        if "Williams" in str(item.get("player_name")):
            print(item.get("player_name"), item.get("rank_ecr"), item.get("pos"))
