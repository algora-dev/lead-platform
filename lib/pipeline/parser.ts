import { JSDOM } from 'jsdom';

export const UA = 'Mozilla/5.0 (compatible; LeadIntelligenceBot/1.0)';
export const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const PHONE_RE =
  /(?<!\d)(?:\+?44\s?\d{2,4}|0\d{2,4}|\+?64\s?\d{1,2})[\s().-]*\d{3,4}[\s.-]*\d{3,4}(?!\d)/g;

export function clean(v: string | null | undefined): string {
  return (v || '').replace(/\s+/g, ' ').trim();
}

export function canonicalise(url: string): string {
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    // Strip tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach(
      (k) => params.delete(k)
    );
    const search = params.toString();
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, '')}${search ? '?' + search : ''}`;
  } catch {
    return url;
  }
}

interface JobPosting {
  url: string;
  title: string;
  company: string;
  description: string;
  location: string;
  salary_text: string | null;
  salary_high: number | null;
  emails: string[];
  phones: string[];
  website: string;
}

function findJobPosting(data: any): any | null {
  if (!data) return null;
  if (typeof data !== 'object') return null;
  const t = data['@type'];
  if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return data;
  for (const v of Object.values(data)) {
    const found = findJobPosting(v);
    if (found) return found;
  }
  return null;
}

function parseSalary(value: any, text: string): { text: string | null; high: number | null } {
  const raw = clean(value ? JSON.stringify(value) : '');
  const source = `${raw} ${text.slice(0, 4000)}`;
  const nums: number[] = [];
  const matches = source.matchAll(/(?<!\d)(\d{2,3}(?:,\d{3})|\d{2,3}k)(?!\d)/gi);
  for (const m of matches) {
    const n = parseInt(m[1].toLowerCase().replace(/,/g, '').replace('k', '000'), 10);
    if (n >= 15000 && n <= 300000) nums.push(n);
  }
  return { text: raw || null, high: nums.length ? Math.max(...nums) : null };
}

export async function parseJob(url: string): Promise<JobPosting | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (res.status >= 400) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;

    const html = await res.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Extract JSON-LD JobPosting
    let job: any = null;
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent || '');
        job = findJobPosting(data);
        if (job) break;
      } catch {
        continue;
      }
    }

    // Remove non-content tags
    doc.querySelectorAll('script,style,noscript,svg').forEach((el) => el.remove());
    const pageText = clean(doc.body?.textContent || '').slice(0, 100000);

    const j = job || {};
    const org = j.hiringOrganization || {};
    const company = clean(typeof org === 'object' ? org.name : org);
    const title = clean(j.title) || clean(doc.querySelector('title')?.textContent || '');
    const descHtml = j.description || '';
    let desc: string;
    if (descHtml) {
      const descDom = new JSDOM(descHtml);
      desc = clean(descDom.window.document.body?.textContent || '');
    } else {
      desc = pageText;
    }
    const location = clean(JSON.stringify(j.jobLocation || ''));
    const { text: salaryText, high: salaryHigh } = parseSalary(j.baseSalary, desc);

    const emailSet = new Set<string>();
    const emailMatches = pageText.matchAll(EMAIL_RE);
    for (const m of emailMatches) {
      const e = m[0].toLowerCase();
      if (!e.endsWith('example.com') && !e.endsWith('sentry.io')) emailSet.add(e);
    }
    const emails = [...emailSet].sort();

    const phoneSet = new Set<string>();
    const phoneMatches = pageText.matchAll(PHONE_RE);
    for (const m of phoneMatches) phoneSet.add(clean(m[0]));
    const phones = [...phoneSet].sort();

    const website = clean(typeof org === 'object' ? org.sameAs : '');

    return {
      url: canonicalise(res.url || url),
      title: title.slice(0, 300),
      company: company.slice(0, 300),
      description: desc.slice(0, 70000),
      location: location.slice(0, 1000),
      salary_text: salaryText,
      salary_high: salaryHigh,
      emails,
      phones,
      website,
    };
  } catch {
    return null;
  }
}

export function countryOk(country: string, text: string, url: string): boolean {
  const b = ` ${text} ${url} `.toLowerCase();
  const signals =
    country === 'UK'
      ? ['united kingdom', ' uk ', 'england', 'scotland', 'wales', 'northern ireland', '.co.uk']
      : ['new zealand', 'aotearoa', '.co.nz', ' nz '];
  return signals.some((x) => b.includes(x));
}
