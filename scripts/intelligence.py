import re,requests
from collections import Counter
from urllib.parse import urlparse,urljoin
from bs4 import BeautifulSoup
from config import TASK_GROUPS,JOB_BOARD_DOMAINS,IGNORE_DOMAINS,SCORING
from parser import EMAIL_RE,PHONE_RE,UA,clean

def task_signals(text):
 t=(text or '').lower();found=[]
 for label,terms in TASK_GROUPS.items():
  if any(x.lower() in t for x in terms):found.append(label)
 return found

def advert_score(signals):
 return min(SCORING.get('advertTaskPointsCap',40), SCORING.get('advertTaskPointsPerGroup',8)*len(set(signals)))
def normalize_company(name):
 x=re.sub(r'[^a-z0-9 ]',' ',(name or '').lower());x=re.sub(r'\b(limited|ltd|plc|llp|inc|incorporated|company|co|group|holdings|nz)\b',' ',x);return re.sub(r'\s+',' ',x).strip() or 'unknown'
def parse_employee_range(text):
 patterns=[r'(?<!\d)(\d{1,4})\s*[-–]\s*(\d{1,4})\s+employees',r'company size\s*[:\-]?\s*(\d{1,4})\s*[-–]\s*(\d{1,4})',r'over\s+(\d{1,4})\s+employees']
 for p in patterns:
  m=re.search(p,text,re.I)
  if m:
   if len(m.groups())==2:
    lo,hi=map(int,m.groups());return f'{lo}-{hi}',round((lo+hi)/2)
   n=int(m.group(1));return f'{n}+',n
 return None,None
def enrich_company(company,key,country_code,search_fn):
 candidates=[];snippets=[]
 for url,title,desc in search_fn(key,company,country_code):
  host=urlparse(url).netloc.lower();snippets.append(title+' '+desc)
  if not any(d in host for d in JOB_BOARD_DOMAINS+IGNORE_DOMAINS):candidates.append(f'{urlparse(url).scheme}://{urlparse(url).netloc}')
 employee_range,employee_count=parse_employee_range(' '.join(snippets));seen=set()
 for base in candidates[:4]:
  if base in seen:continue
  seen.add(base)
  for path in ('','/contact','/contact-us','/about','/about-us'):
   u=urljoin(base,path)
   try:
    r=requests.get(u,headers={'User-Agent':UA},timeout=10)
    if r.status_code>=400 or 'text/html' not in r.headers.get('content-type',''):continue
    text=clean(BeautifulSoup(r.text,'html.parser').get_text(' '));emails=[e.lower() for e in EMAIL_RE.findall(text) if not e.lower().endswith('example.com')];phones=PHONE_RE.findall(text)
    if not employee_range:employee_range,employee_count=parse_employee_range(text)
    if emails or phones:return {'website':base,'email':emails[0] if emails else None,'phone':clean(phones[0]) if phones else None,'contact_source':u,'employee_range':employee_range,'employee_count':employee_count}
   except requests.RequestException:pass
 return {'website':candidates[0] if candidates else None,'email':None,'phone':None,'contact_source':None,'employee_range':employee_range,'employee_count':employee_count}
def _active_job_points(active):
 bands=SCORING.get('activeJobPoints',{})
 if active>=4:return bands.get('4_plus',30)
 return bands.get(str(active),0)

def _salary_points(salary):
 points=0
 for band in sorted(SCORING.get('salaryBands',[]), key=lambda x:x.get('minimum',0)):
  if salary>=band.get('minimum',0):points=band.get('points',points)
 return points

def _size_points(employee_count):
 if employee_count is None:return 0
 for band in SCORING.get('companySizeBands',[]):
  if band.get('minimum',0)<=employee_count<=band.get('maximum',999999):return band.get('points',0)
 return 0

def company_score(jobs,email,phone,employee_count):
 all_signals=[s for j in jobs for s in (j.get('signals') or [])]
 counts=Counter(all_signals);unique=len(counts);active=len(jobs)
 salary=sum(j.get('salary_high') or 0 for j in jobs)
 task_points=min(SCORING.get('companyTaskPointsCap',30),unique*SCORING.get('companyTaskPointsPerGroup',5))
 hiring_points=_active_job_points(active)
 repeat_points=min(SCORING.get('repeatTaskPointsCap',15),sum(max(0,n-1)*SCORING.get('repeatTaskPointsPerExtraAdvert',5) for n in counts.values()))
 salary_points=_salary_points(salary)
 contact_cfg=SCORING.get('contactPoints',{})
 contact_points=(contact_cfg.get('email',5) if email else 0)+(contact_cfg.get('phone',5) if phone else 0)
 size_points=_size_points(employee_count)
 base=SCORING.get('baseHiringSignal',12)
 total=min(SCORING.get('maximumScore',100),base+task_points+hiring_points+repeat_points+salary_points+contact_points+size_points)
 recurring=', '.join(f'{k} ({v} adverts)' for k,v in counts.most_common() if v>1) or ', '.join(counts.keys())
 reason=f'Base hiring signal: +{base}; hiring {active} role(s): +{hiring_points}; operational evidence: +{task_points}; repeated task evidence: +{repeat_points}; salary investment: +{salary_points}; contactability: +{contact_points}; company size: +{size_points}.'
 summary=f'{active} active advert(s), estimated annual salary commitment {salary:,} where disclosed. Strongest task signals: {recurring or "limited detail extracted"}.'
 return total,reason,recurring,summary,salary
