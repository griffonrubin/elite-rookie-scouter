import requests
from bs4 import BeautifulSoup
import json

def test_nfl():
    try:
        r = requests.get('https://www.nfl.com/combine/tracker/participants/', headers={'User-Agent': 'Mozilla/5.0'})
        with open('nfl_combine.html', 'w', encoding='utf-8') as f:
            f.write(r.text)
        
        soup = BeautifulSoup(r.text, 'html.parser')
        next_data = soup.find('script', id='__NEXT_DATA__')
        if next_data:
            with open('nfl_next_data.json', 'w', encoding='utf-8') as f:
                f.write(next_data.string)
            print("Wrote nfl_next_data.json")
    except Exception as e:
        print("NFL error", e)

if __name__ == '__main__':
    test_nfl()
