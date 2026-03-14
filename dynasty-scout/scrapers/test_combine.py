import requests
from bs4 import BeautifulSoup
import json

def test_nfl():
    try:
        r = requests.get('https://www.nfl.com/combine/tracker/participants/', headers={'User-Agent': 'Mozilla/5.0'})
        print("NFL.com status:", r.status_code)
        # Look for the __NEXT_DATA__ script
        soup = BeautifulSoup(r.text, 'html.parser')
        next_data = soup.find('script', id='__NEXT_DATA__')
        if next_data:
            print("Found __NEXT_DATA__ on NFL.com")
            # We can parse it!
        else:
            print("NFL.com HTML length (no next data):", len(r.text))
    except Exception as e:
        print("NFL.com error:", e)

def test_espn():
    try:
        # Search for espn combine endpoint format
        url = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/draft/combine?season=2026'
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        print("ESPN status:", r.status_code)
        if r.status_code == 200:
            print("ESPN JSON response length:", len(r.text))
            
        r2 = requests.get('https://www.espn.com/nfl/draft/combine', headers={'User-Agent': 'Mozilla/5.0'})
        print("ESPN HTML status:", r2.status_code)
    except Exception as e:
        print("ESPN error:", e)

def test_pfr():
    try:
        import subprocess
        print("PFR curl test:")
        res = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://www.pro-football-reference.com/draft/2026-combine.htm', '-H', 'User-Agent: Mozilla/5.0'], capture_output=True, text=True)
        print("PFR curl HTTP Code:", res.stdout)
    except Exception as e:
        print("PFR error:", e)

if __name__ == '__main__':
    test_nfl()
    test_espn()
    test_pfr()
