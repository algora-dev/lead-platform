import json,re,requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse,urlunparse,parse_qsl,urlencode
UA='Mozilla/5.0 (compatible; LeadIntelligenceBot/1.0)'
EMAIL_RE=re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',re.I)
PHONE_RE=re.compile(r'(?<!\d)(?:\+?44\s?\d{2,4}|0\d{2,4}|\+?64\s?\d{1,2})[\s().-]*\d{3,4}[\s.-]*\d{3,4}(?!\d)')

def clean(v):return re.sub(r'\s+',' ',str(v or '')).strip()
def canonicalise(url):
 p=urlparse(url);q=[(k,v) for k,v in parse_qsl(p.query,keep_blank_values=True) if not k.lower().startswith(('utm_','gclid','fbclid'))];return urlunparse((p.scheme.lower(),p.netloc.lower(),p.path.rstrip('/'),'',urlencode(q),''))
def find_jobposting(data):
 if isinstance(data,dict):
  t=data.get('@type');
  if t=='JobPosting' or isinstance(t,list) and 'JobPosting' in t:return data
  for v in data.values():
   f=find_jobposting(v)
   if f:return f
 elif isinstance(data,list):
  for v in data:
   f=find_jobposting(v)
   if f:return f
 return None
def parse_salary(value,text):
 raw=clean(json.dumps(value,ensure_ascii=False) if value else '')
 source=raw+' '+text[:4000]
 nums=[]
 for m in re.findall(r'(?<!\d)(\d{2,3}(?:,\d{3})|\d{2,3}k)(?!\d)',source,re.I):
  n=int(m.lower().replace(',','').replace('k','000'))
  if 15000<=n<=300000:nums.append(n)
 return raw or None,max(nums) if nums else None
def parse_job(url):
 try:
  r=requests.get(url,headers={'User-Agent':UA},timeout=20,allow_redirects=True)
  if r.status_code>=400 or 'text/html' not in r.headers.get('content-type',''):return None
 except requests.RequestException:return None
 soup=BeautifulSoup(r.text,'html.parser');job=None
 for s in soup.select('script[type="application/ld+json"]'):
  try:job=find_jobposting(json.loads(s.get_text()))
  except Exception:continue
  if job:break
 for tag in soup(['script','style','noscript','svg']):tag.decompose()
 page=clean(soup.get_text(' '))[:100000]; j=job or {}; org=j.get('hiringOrganization') or {}
 company=clean(org.get('name') if isinstance(org,dict) else org);title=clean(j.get('title')) or clean(soup.title.string if soup.title else '')
 desc=clean(BeautifulSoup(str(j.get('description','')),'html.parser').get_text(' ')) or page
 location=clean(json.dumps(j.get('jobLocation',''),ensure_ascii=False));salary_text,salary_high=parse_salary(j.get('baseSalary'),desc)
 emails=sorted({x.lower() for x in EMAIL_RE.findall(page) if not x.lower().endswith(('example.com','sentry.io'))});phones=sorted({clean(x) for x in PHONE_RE.findall(page)})
 website=clean(org.get('sameAs') if isinstance(org,dict) else '')
 return {'url':canonicalise(r.url),'title':title[:300],'company':company[:300],'description':desc[:70000],'location':location[:1000],'salary_text':salary_text,'salary_high':salary_high,'emails':emails,'phones':phones,'website':website}
def country_ok(country,text,url):
 b=(' '+text+' '+url+' ').lower();signals=['united kingdom',' uk ','england','scotland','wales','northern ireland','.co.uk'] if country=='UK' else ['new zealand','aotearoa','.co.nz',' nz '];return any(x in b for x in signals)
