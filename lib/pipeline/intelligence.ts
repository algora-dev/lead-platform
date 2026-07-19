import { JOB_BOARD_DOMAINS, IGNORE_DOMAINS, TASK_GROUPS, SCORING } from './config';
import { EMAIL_RE, PHONE_RE, clean } from './parser';

export function taskSignals(text: string): string[] {
  const t = (text || '').toLowerCase();
  const found: string[] = [];
  for (const [label, terms] of Object.entries(TASK_GROUPS)) {
    if (terms.some((x: string) => x.toLowerCase().includes(t) || t.includes(x.toLowerCase()))) {
      found.push(label);
    }
  }
  // More precise: check each term as substring
  const precise: string[] = [];
  for (const [label, terms] of Object.entries(TASK_GROUPS)) {
    if ((terms as string[]).some((x) => t.includes(x.toLowerCase()))) {
      precise.push(label);
    }
  }
  return precise.length > 0 ? precise : found;
}

export function advertScore(signals: string[]): number {
  const cap = SCORING.advertTaskPointsCap || 40;
  const per = SCORING.advertTaskPointsPerGroup || 8;
  return Math.min(cap, per * new Set(signals).size);
}

export function normalizeCompany(name: string): string {
  let x = (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  x = x.replace(/\b(limited|ltd|plc|llp|inc|incorporated|company|co|group|holdings|nz)\b/g, ' ');
  return x.replace(/\s+/g, ' ').trim() || 'unknown';
}

export function parseEmployeeRange(text: string): { range: string | null; count: number | null } {
  const patterns: RegExp[] = [
    /(?<!\d)(\d{1,4})\s*[-–]\s*(\d{1,4})\s+employees/i,
    /company size\s*[:\-]?\s*(\d{1,4})\s*[-–]\s*(\d{1,4})/i,
    /over\s+(\d{1,4})\s+employees/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      if (m.length === 3) {
        const lo = parseInt(m[1], 10);
        const hi = parseInt(m[2], 10);
        return { range: `${lo}-${hi}`, count: Math.round((lo + hi) / 2) };
      }
      const n = parseInt(m[1], 10);
      return { range: `${n}+`, count: n };
    }
  }
  return { range: null, count: null };
}

export interface EnrichmentInfo {
  website: string | null;
  email: string | null;
  phone: string | null;
  contact_source: string | null;
  employee_range: string | null;
  employee_count: number | null;
}

export async function enrichCompany(
  company: string,
  apiKey: string,
  countryCode: string,
  searchFn: (key: string, company: string, cc: string) => Promise<[string, string, string][]>
): Promise<EnrichmentInfo> {
  const candidates: string[] = [];
  const snippets: string[] = [];

  for (const [url, title, desc] of await searchFn(apiKey, company, countryCode)) {
    const host = new URL(url).hostname.toLowerCase();
    snippets.push(`${title} ${desc}`);
    if (!JOB_BOARD_DOMAINS.some((d) => host.includes(d)) && !IGNORE_DOMAINS.some((d) => host.includes(d))) {
      candidates.push(`${new URL(url).protocol}//${new URL(url).host}`);
    }
  }

  let { range: employeeRange, count: employeeCount } = parseEmployeeRange(snippets.join(' '));
  const seen = new Set<string>();

  for (const base of candidates.slice(0, 4)) {
    if (seen.has(base)) continue;
    seen.add(base);
    for (const p of ['', '/contact', '/contact-us', '/about', '/about-us']) {
      const u = base + p;
      try {
        const res = await fetch(u, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadIntelligenceBot/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        if (res.status >= 400) continue;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/html')) continue;
        const text = await res.text();
        const emails = EMAIL_RE.exec(text);
        const phoneMatch = PHONE_RE.exec(text);
        const emailVal = emails?.[0]?.toLowerCase() || null;
        const phoneVal = phoneMatch ? clean(phoneMatch[0]) : null;

        if (!employeeRange) {
          const parsed = parseEmployeeRange(text);
          employeeRange = parsed.range;
          employeeCount = parsed.count;
        }

        if (emailVal || phoneVal) {
          return {
            website: base,
            email: emailVal,
            phone: phoneVal,
            contact_source: u,
            employee_range: employeeRange,
            employee_count: employeeCount,
          };
        }
      } catch {
        // continue
      }
    }
  }

  return {
    website: candidates[0] || null,
    email: null,
    phone: null,
    contact_source: null,
    employee_range: employeeRange,
    employee_count: employeeCount,
  };
}

function activeJobPoints(active: number): number {
  const bands: Record<string, number> = (SCORING.activeJobPoints || {}) as Record<string, number>;
  if (active >= 4) return bands['4_plus'] || 30;
  return bands[String(active)] || 0;
}

function salaryPoints(salary: number): number {
  let points = 0;
  const bands = [...(SCORING.salaryBands || [])].sort(
    (a: any, b: any) => (a.minimum || 0) - (b.minimum || 0)
  );
  for (const band of bands) {
    if (salary >= (band.minimum || 0)) points = band.points || points;
  }
  return points;
}

function sizePoints(employeeCount: number | null): number {
  if (employeeCount === null) return 0;
  for (const band of SCORING.companySizeBands || []) {
    if (
      (band.minimum || 0) <= employeeCount &&
      employeeCount <= (band.maximum || 999999)
    ) {
      return band.points || 0;
    }
  }
  return 0;
}

export interface ScoreResult {
  total: number;
  reason: string;
  recurring: string;
  summary: string;
  salary: number;
}

export function companyScore(
  jobs: { signals?: string[]; salary_high?: number | null }[],
  email: string | null,
  phone: string | null,
  employeeCount: number | null
): ScoreResult {
  const allSignals = jobs.flatMap((j) => j.signals || []);
  const counts: Record<string, number> = {};
  for (const s of allSignals) counts[s] = (counts[s] || 0) + 1;
  const unique = Object.keys(counts).length;
  const active = jobs.length;
  const salary = jobs.reduce((sum, j) => sum + (j.salary_high || 0), 0);

  const taskPoints = Math.min(
    SCORING.companyTaskPointsCap || 30,
    unique * (SCORING.companyTaskPointsPerGroup || 5)
  );
  const hiringPoints = activeJobPoints(active);
  const repeatPoints = Math.min(
    SCORING.repeatTaskPointsCap || 15,
    Object.values(counts).reduce(
      (sum, n) => sum + Math.max(0, n - 1) * (SCORING.repeatTaskPointsPerExtraAdvert || 5),
      0
    )
  );
  const salaryPts = salaryPoints(salary);
  const contactCfg = SCORING.contactPoints || {};
  const contactPoints =
    (email ? contactCfg.email || 5 : 0) + (phone ? contactCfg.phone || 5 : 0);
  const sizePts = sizePoints(employeeCount);
  const base = SCORING.baseHiringSignal || 12;

  const total = Math.min(
    SCORING.maximumScore || 100,
    base + taskPoints + hiringPoints + repeatPoints + salaryPts + contactPoints + sizePts
  );

  const recurringEntries = Object.entries(counts)
    .filter(([, v]) => v > 1)
    .map(([k, v]) => `${k} (${v} adverts)`);
  const recurring =
    recurringEntries.join(', ') ||
    Object.keys(counts).join(', ');

  const reason = `Base hiring signal: +${base}; hiring ${active} role(s): +${hiringPoints}; operational evidence: +${taskPoints}; repeated task evidence: +${repeatPoints}; salary investment: +${salaryPts}; contactability: +${contactPoints}; company size: +${sizePts}.`;
  const summary = `${active} active advert(s), estimated annual salary commitment ${salary.toLocaleString()} where disclosed. Strongest task signals: ${recurring || 'limited detail extracted'}.`;

  return { total, reason, recurring, summary, salary };
}
