from urllib.parse import urlparse
import requests
from config import QUERY_PAIRS, SOURCES

BRAVE_URL='https://api.search.brave.com/res/v1/web/search'


def build_queries(country):
    place='UK' if country=='UK' else 'New Zealand'
    negatives=' '.join(f'-{term}' for term in SOURCES['brave'].get('negativeTerms', []))
    return [f'"{a}" "{b}" job {place} {negatives}'.strip() for a,b in QUERY_PAIRS]


def brave_search(key,query,country_code,count=20,offset=0):
    brave=SOURCES['brave']
    r=requests.get(
        BRAVE_URL,
        headers={'Accept':'application/json','X-Subscription-Token':key},
        params={
            'q':query,
            'country':country_code,
            'search_lang':'en',
            'count':min(count, brave.get('resultsPerPage', 20), 20),
            'offset':offset,
            'freshness':brave.get('freshness', 'pm')
        },
        timeout=25
    )
    r.raise_for_status()
    return r.json().get('web',{}).get('results',[])


def official_site_search(key,company,country_code):
    results=brave_search(key,f'"{company}" official website contact employees',country_code,8,0)
    return [(x.get('url',''),x.get('title',''),x.get('description','')) for x in results if x.get('url')]
