import argparse,os,sqlite3,sys
from datetime import datetime,timezone
from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import urlparse
BASE=Path(__file__).resolve().parents[1];load_dotenv(BASE/'.env');sys.path.insert(0,str(Path(__file__).parent))
from config import JOB_TERMS,IGNORE_DOMAINS,TASK_GROUPS
from collector import build_queries,brave_search,official_site_search
from parser import parse_job,canonicalise,country_ok
from intelligence import task_signals,advert_score,normalize_company,enrich_company,company_score
DB=BASE/'prisma'/'dev.db'
def now():return int(datetime.now(timezone.utc).timestamp()*1000)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--country',choices=['UK','NZ'],required=True);ap.add_argument('--queries',type=int,default=16);args=ap.parse_args();key=os.getenv('BRAVE_API_KEY')
 if not key:print('BRAVE_API_KEY is missing from .env',file=sys.stderr);return 2
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;country_code='GB' if args.country=='UK' else 'NZ';prior=c.execute("SELECT COUNT(*) n FROM ScanRun WHERE country=?",(args.country,)).fetchone()['n'];deep=1+(prior%9);rid=c.execute('INSERT INTO ScanRun(source,country,startedAt,status,deepOffset) VALUES(?,?,?,?,?)',('BRAVE',args.country,now(),'RUNNING',deep)).lastrowid;c.commit();stats={k:0 for k in ['searchRequests','resultsFound','pagesFetched','duplicateAdverts','advertsSaved','companiesCreated','companiesUpdated','contactsFound','errors']}
 try:
  touched=set()
  for query in build_queries(args.country)[:args.queries]:
   for offset in (0,deep):
    try:results=brave_search(key,query,country_code,20,offset);stats['searchRequests']+=1
    except Exception as e:stats['errors']+=1;print('Search failed:',e);continue
    stats['resultsFound']+=len(results)
    for item in results:
     url=canonicalise(item.get('url',''));host=urlparse(url).netloc.lower();snippet=(item.get('title','')+' '+item.get('description','')+' '+url).lower()
     if not url or any(d in host for d in IGNORE_DOMAINS) or not any(x in snippet for x in JOB_TERMS):continue
     if not any(term in snippet for terms in TASK_GROUPS.values() for term in terms):continue
     existing=c.execute('SELECT id,companyId FROM JobAdvert WHERE canonicalUrl=? OR sourceUrl=?',(url,url)).fetchone()
     if existing:c.execute('UPDATE JobAdvert SET lastSeenAt=?,isActive=1 WHERE id=?',(now(),existing['id']));touched.add(existing['companyId']);stats['duplicateAdverts']+=1;continue
     page=parse_job(url);stats['pagesFetched']+=1
     if not page or not page['company'] or not country_ok(args.country,page['description']+' '+page['location'],page['url']):continue
     signals=task_signals(page['description'])
     if not signals:continue
     norm=normalize_company(page['company']);company=c.execute('SELECT * FROM Company WHERE normalizedName=? AND country=?',(norm,args.country)).fetchone();ts=now()
     if company:cid=company['id'];stats['companiesUpdated']+=1
     else:
      cur=c.execute('INSERT INTO Company(createdAt,updatedAt,name,normalizedName,country,location,firstSeenAt,lastSeenAt) VALUES(?,?,?,?,?,?,?,?)',(ts,ts,page['company'],norm,args.country,page['location'],ts,ts));cid=cur.lastrowid;stats['companiesCreated']+=1
     c.execute('INSERT INTO JobAdvert(createdAt,updatedAt,companyId,title,country,location,salaryText,annualSalaryHigh,source,sourceUrl,canonicalUrl,discoveryQuery,description,taskSignals,advertScore,firstSeenAt,lastSeenAt,isActive) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(ts,ts,cid,page['title'] or 'Job advert',args.country,page['location'],page['salary_text'],page['salary_high'],'BRAVE',page['url'],page['url'],query,page['description'],', '.join(signals),advert_score(signals),ts,ts,1));stats['advertsSaved']+=1;touched.add(cid)
     if page['emails'] or page['phones'] or page['website']:
      c.execute('UPDATE Company SET email=COALESCE(email,?),phone=COALESCE(phone,?),website=COALESCE(website,?),updatedAt=?,lastSeenAt=? WHERE id=?',(page['emails'][0] if page['emails'] else None,page['phones'][0] if page['phones'] else None,page['website'] or None,ts,ts,cid))
    c.commit()
  for cid in touched:
   comp=c.execute('SELECT * FROM Company WHERE id=?',(cid,)).fetchone();jobs=[dict(x) for x in c.execute('SELECT * FROM JobAdvert WHERE companyId=? AND isActive=1',(cid,)).fetchall()]
   for j in jobs:j['signals']=[x.strip() for x in (j.get('taskSignals') or '').split(',') if x.strip()];j['salary_high']=j.get('annualSalaryHigh')
   info={'website':comp['website'],'email':comp['email'],'phone':comp['phone'],'contact_source':comp['contactSourceUrl'],'employee_range':comp['employeeRange'],'employee_count':comp['employeeCount']}
   if not(info['email'] or info['phone']) or info['employee_count'] is None:
    try:extra=enrich_company(comp['name'],key,country_code,official_site_search);stats['searchRequests']+=1;info={k:(info.get(k) or extra.get(k)) for k in info}
    except Exception:stats['errors']+=1
   if info['email'] or info['phone']:stats['contactsFound']+=1
   score,reason,recurring,summary,salary=company_score(jobs,info['email'],info['phone'],info['employee_count']);ts=now()
   c.execute('UPDATE Company SET updatedAt=?,lastSeenAt=?,website=?,email=?,phone=?,contactSourceUrl=?,employeeRange=?,employeeCount=?,activeJobCount=?,totalJobCount=(SELECT COUNT(*) FROM JobAdvert WHERE companyId=?),estimatedSalarySpend=?,opportunityScore=?,scoreReason=?,recurringTasks=?,opportunitySummary=? WHERE id=?',(ts,ts,info['website'],info['email'],info['phone'],info['contact_source'],info['employee_range'],info['employee_count'],len(jobs),cid,salary,score,reason,recurring,summary,cid));c.commit()
  msg=f"Saved {stats['advertsSaved']} adverts; created {stats['companiesCreated']} companies and updated {stats['companiesUpdated']} company matches."
  c.execute('UPDATE ScanRun SET completedAt=?,status=?,searchRequests=?,resultsFound=?,pagesFetched=?,duplicateAdverts=?,advertsSaved=?,companiesCreated=?,companiesUpdated=?,contactsFound=?,errors=?,message=? WHERE id=?',(now(),'COMPLETED',stats['searchRequests'],stats['resultsFound'],stats['pagesFetched'],stats['duplicateAdverts'],stats['advertsSaved'],stats['companiesCreated'],stats['companiesUpdated'],stats['contactsFound'],stats['errors'],msg,rid));c.commit();print(msg);return 0
 except Exception as e:
  c.execute('UPDATE ScanRun SET completedAt=?,status=?,errors=errors+1,message=? WHERE id=?',(now(),'FAILED',str(e),rid));c.commit();print(str(e),file=sys.stderr);return 1
 finally:c.close()
if __name__=='__main__':raise SystemExit(main())
