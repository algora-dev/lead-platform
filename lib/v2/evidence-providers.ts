/**
 * Evidence Providers
 *
 * Adapters that gather evidence for KNOWN companies (post-discovery).
 * Each provider returns EvidenceItemInput records with provenance.
 * They do NOT write directly to Company fields — claims are extracted
 * and materialised separately.
 *
 * Contract:
 *  - Discovery providers find candidate companies.
 *  - Evidence providers investigate known companies.
 *  - One provider may support both contracts, but responsibilities are separate.
 */

import { canonicalise, UA, EMAIL_RE, PHONE_RE, clean } from '@/lib/pipeline/parser';
import { normalizeCompany } from '@/lib/pipeline/intelligence';

// --- Types ---

export type EvidenceType =
  | 'JOB_ADVERT'
  | 'COMPANY_WEBSITE'
  | 'APOLLO_DATA'
  | 'TECH_STACK'
  | 'CONTACT_INFO'
  | 'NEWS_ARTICLE'
  | 'FUNDING_EVENT'
  | 'TENDER'
  | 'REVIEW'
  | 'SOCIAL_PROFILE'
  | 'OTHER';

export interface EvidenceItemInput {
  evidenceType: EvidenceType;
  sourceUrl: string | null;
  sourceDomain: string | null;
  rawPayload: any;
  normalisedPayload: any;
  contentHash: string; // for deduplication
  reliability: number; // 0-100
  observedAt: Date | null;
  // Claims extracted at source (provider does its own extraction)
  claims: ClaimInput[];
}

export interface ClaimInput {
  claimType: string;
  claimValue: string;
  claimData?: any;
  supports: boolean;
}

export interface EvidenceProvider {
  name: string;
  /** Returns evidence items for a known company */
  gather: (company: EvidenceCompanyInput, opts: EvidenceOpts) => Promise<EvidenceItemInput[]>;
}

export interface EvidenceCompanyInput {
  id: number;
  name: string;
  website: string | null;
  domain: string | null;
  country: string | null;
  location: string | null;
  industry: string | null;
}

export interface EvidenceOpts {
  apiKey: string;
  strategyEvidencePriorities: string[]; // ordered evidence types
  maxItemsPerProvider: number;
}

// --- Content hashing (simple but stable) ---

export function hashContent(input: {
  evidenceType: string;
  sourceUrl: string | null;
  sourceDomain: string | null;
  rawPayload: any;
}): string {
  const str = JSON.stringify({
    t: input.evidenceType,
    u: (input.sourceUrl || '').toLowerCase().trim(),
    d: (input.sourceDomain || '').toLowerCase().trim(),
    // Use a subset of raw payload for hash stability
    r: input.rawPayload ? JSON.stringify(input.rawPayload).slice(0, 5000) : '',
  });
  // FNV-1a hash (no crypto dependency needed, fast, good enough for dedup)
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// --- Website Evidence Provider ---

export const websiteProvider: EvidenceProvider = {
  name: 'website',
  async gather(company: EvidenceCompanyInput, opts: EvidenceOpts): Promise<EvidenceItemInput[]> {
    if (!company.website && !company.domain) return [];

    const url = company.website || `https://${company.domain}`;
    const items: EvidenceItemInput[] = [];

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return [];

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html')) return [];

      const html = await res.text();
      const finalUrl = canonicalise(res.url || url);
      let domain: string | null = null;
      try { domain = new URL(finalUrl).hostname.replace(/^www\./, ''); } catch {}

      const pageText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                          .replace(/<[^>]+>/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim()
                          .slice(0, 50000);

      // Extract emails
      const emailSet = new Set<string>();
      for (const m of pageText.matchAll(EMAIL_RE)) {
        const e = m[0].toLowerCase();
        if (!e.endsWith('example.com') && !e.endsWith('sentry.io') && !e.endsWith('wixpress.com')) {
          emailSet.add(e);
        }
      }

      // Extract phones
      const phoneSet = new Set<string>();
      for (const m of pageText.matchAll(PHONE_RE)) {
        phoneSet.add(clean(m[0]));
      }

      const claims: ClaimInput[] = [];

      if (emailSet.size > 0) {
        claims.push({
          claimType: 'CONTACT_INFO',
          claimValue: [...emailSet].slice(0, 5).join(', '),
          claimData: { emails: [...emailSet].slice(0, 5), type: 'email' },
          supports: true,
        });
      }

      if (phoneSet.size > 0) {
        claims.push({
          claimType: 'CONTACT_INFO',
          claimValue: [...phoneSet].slice(0, 3).join(', '),
          claimData: { phones: [...phoneSet].slice(0, 3), type: 'phone' },
          supports: true,
        });
      }

      // Detect technologies from HTML
      const technologies: string[] = [];
      if (html.includes('wp-content') || html.includes('wp-includes')) technologies.push('WordPress');
      if (html.includes('shopify')) technologies.push('Shopify');
      if (html.includes('__next') || html.includes('_next/')) technologies.push('Next.js');
      if (html.includes('react')) technologies.push('React');
      if (html.includes('wix.com')) technologies.push('Wix');
      if (html.includes('squarespace')) technologies.push('Squarespace');
      if (html.includes('elementor')) technologies.push('Elementor');
      if (html.includes('hubspot')) technologies.push('HubSpot');
      if (html.includes('mailchimp')) technologies.push('Mailchimp');

      if (technologies.length > 0) {
        for (const tech of technologies) {
          claims.push({
            claimType: 'TECHNOLOGY',
            claimValue: tech,
            claimData: { source: 'html_analysis' },
            supports: true,
          });
        }
      }

      // Detect operational signals from page text
      const lowerText = pageText.toLowerCase();
      const operationalSignals: string[] = [];
      if (lowerText.includes('quote') || lowerText.includes('get a quote') || lowerText.includes('free quote')) {
        operationalSignals.push('offers quoting');
      }
      if (lowerText.includes('contact us') || lowerText.includes('get in touch')) {
        operationalSignals.push('contactable');
      }
      if (lowerText.includes('services') || lowerText.includes('what we do')) {
        operationalSignals.push('services listed');
      }
      if (lowerText.includes('about us') || lowerText.includes('our team')) {
        operationalSignals.push('team info');
      }
      if (lowerText.includes('case stud') || lowerText.includes('portfolio')) {
        operationalSignals.push('case studies/portfolio');
      }
      if (lowerText.includes('blog') || lowerText.includes('news')) {
        operationalSignals.push('content/blog');
      }

      for (const signal of operationalSignals) {
        claims.push({
          claimType: 'OPERATIONAL_ACTIVITY',
          claimValue: signal,
          claimData: { source: 'website_analysis' },
          supports: true,
        });
      }

      // Extract meta description as industry hint
      const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
      const description = clean(metaDesc?.[1] || ogDesc?.[1] || '');
      if (description) {
        claims.push({
          claimType: 'INDUSTRY',
          claimValue: description.slice(0, 500),
          claimData: { source: 'meta_description' },
          supports: true,
        });
      }

      const contentHash = hashContent({
        evidenceType: 'COMPANY_WEBSITE',
        sourceUrl: finalUrl,
        sourceDomain: domain,
        rawPayload: { title: html.match(/<title>([^<]*)<\/title>/i)?.[1] || '' },
      });

      items.push({
        evidenceType: 'COMPANY_WEBSITE',
        sourceUrl: finalUrl,
        sourceDomain: domain,
        rawPayload: {
          title: html.match(/<title>([^<]*)<\/title>/i)?.[1] || company.name,
          pageTextPreview: pageText.slice(0, 2000),
        },
        normalisedPayload: {
          emails: [...emailSet],
          phones: [...phoneSet],
          technologies,
          operationalSignals,
          description,
        },
        contentHash,
        reliability: 75,
        observedAt: new Date(),
        claims,
      });
    } catch {
      // Network error, timeout, etc.
    }

    return items;
  },
};

// --- Apollo Enrichment Evidence Provider ---

export const apolloEvidenceProvider: EvidenceProvider = {
  name: 'apollo',
  async gather(company: EvidenceCompanyInput, opts: EvidenceOpts): Promise<EvidenceItemInput[]> {
    const apiKey = opts.apiKey;
    if (!apiKey) return [];

    const items: EvidenceItemInput[] = [];

    try {
      const body: Record<string, string> = { name: company.name };
      if (company.domain) {
        body.domain = company.domain;
      } else if (company.website) {
        try {
          body.domain = new URL(company.website).hostname.replace(/^www\./, '');
        } catch {}
      }

      const res = await fetch('https://api.apollo.io/v1/organizations/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return [];
      const data = await res.json();
      const org = data.organization;
      if (!org) return [];

      const claims: ClaimInput[] = [];

      if (org.industry) {
        claims.push({
          claimType: 'INDUSTRY',
          claimValue: org.industry,
          claimData: { source: 'apollo' },
          supports: true,
        });
      }

      if (org.estimated_num_employees) {
        claims.push({
          claimType: 'EMPLOYEE_COUNT',
          claimValue: org.estimated_num_employees,
          claimData: { count: org.employee_count || null, source: 'apollo' },
          supports: true,
        });
      }

      if (org.headquarters_location) {
        claims.push({
          claimType: 'LOCATION',
          claimValue: org.headquarters_location,
          claimData: { source: 'apollo', type: 'headquarters' },
          supports: true,
        });
      }

      if (org.website_url) {
        let domain: string | null = null;
        try { domain = new URL(org.website_url).hostname.replace(/^www\./, ''); } catch {}
        if (domain && domain !== company.domain) {
          claims.push({
            claimType: 'CONTACT_INFO',
            claimValue: org.website_url,
            claimData: { type: 'website', domain, source: 'apollo' },
            supports: true,
          });
        }
      }

      if (org.linkedin_url) {
        claims.push({
          claimType: 'CONTACT_INFO',
          claimValue: org.linkedin_url,
          claimData: { type: 'linkedin', source: 'apollo' },
          supports: true,
        });
      }

      if (org.founded_year) {
        claims.push({
          claimType: 'OPERATIONAL_ACTIVITY',
          claimValue: `Founded ${org.founded_year}`,
          claimData: { source: 'apollo', foundedYear: org.founded_year },
          supports: true,
        });
      }

      const contentHash = hashContent({
        evidenceType: 'APOLLO_DATA',
        sourceUrl: org.website_url || null,
        sourceDomain: body.domain || null,
        rawPayload: { apolloId: org.id, name: org.name },
      });

      items.push({
        evidenceType: 'APOLLO_DATA',
        sourceUrl: org.website_url || null,
        sourceDomain: body.domain || null,
        rawPayload: org,
        normalisedPayload: {
          industry: org.industry || null,
          employeeRange: org.estimated_num_employees || null,
          employeeCount: org.employee_count || null,
          location: org.headquarters_location || null,
          linkedin: org.linkedin_url || null,
          foundedYear: org.founded_year || null,
        },
        contentHash,
        reliability: 80, // Apollo is a curated B2B database
        observedAt: new Date(),
        claims,
      });
    } catch {
      // API error, timeout
    }

    return items;
  },
};

// --- Job Advert Evidence Provider (via Brave Search) ---

export const jobAdvertProvider: EvidenceProvider = {
  name: 'job-adverts',
  async gather(company: EvidenceCompanyInput, opts: EvidenceOpts): Promise<EvidenceItemInput[]> {
    const apiKey = opts.apiKey;
    if (!apiKey) return [];

    const items: EvidenceItemInput[] = [];
    const searchTerm = `"${company.name}" (hiring OR jobs OR careers OR "we're looking for")`;

    try {
      const params = new URLSearchParams({
        q: searchTerm,
        count: '10',
      });
      if (company.country === 'United Kingdom') params.set('country', 'GB');
      else if (company.country === 'New Zealand') params.set('country', 'NZ');

      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return [];
      const data = await res.json();
      const webResults = data.web?.results || [];

      for (const r of webResults.slice(0, opts.maxItemsPerProvider)) {
        const url = r.url || '';
        if (!url) continue;

        let domain: string | null = null;
        try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

        // Verify this is actually about this company
        const titleLower = (r.title || '').toLowerCase();
        const descLower = (r.description || '').toLowerCase();
        const companyNameLower = company.name.toLowerCase();
        if (!titleLower.includes(companyNameLower) && !descLower.includes(companyNameLower)) continue;

        // Determine job board vs company careers page
        const jobBoards = ['indeed.com', 'indeed.co.uk', 'linkedin.com', 'glassdoor.com', 'reed.co.uk', 'totaljobs.com', 'seek.co.nz', 'trade.me'];
        const isJobBoard = jobBoards.some(b => domain?.includes(b));
        const reliability = isJobBoard ? 70 : 85; // Company careers page is more reliable

        const claims: ClaimInput[] = [
          {
            claimType: 'JOB_ADVERT',
            claimValue: r.title || 'Job advert',
            claimData: {
              url,
              description: r.description?.slice(0, 1000) || null,
              source: isJobBoard ? 'job_board' : 'company_careers',
              domain,
            },
            supports: true,
          },
          {
            claimType: 'REPEATED_SIGNAL',
            claimValue: 'hiring',
            claimData: { source: 'brave_search', type: 'hiring_signal' },
            supports: true,
          },
        ];

        const contentHash = hashContent({
          evidenceType: 'JOB_ADVERT',
          sourceUrl: url,
          sourceDomain: domain,
          rawPayload: { title: r.title, description: r.description },
        });

        items.push({
          evidenceType: 'JOB_ADVERT',
          sourceUrl: url,
          sourceDomain: domain,
          rawPayload: { title: r.title, description: r.description, url },
          normalisedPayload: {
            jobTitle: r.title,
            description: r.description?.slice(0, 2000) || null,
            isJobBoard,
            domain,
          },
          contentHash,
          reliability,
          observedAt: new Date(),
          claims,
        });
      }
    } catch {
      // Search error
    }

    return items;
  },
};

// --- Registry ---

export function getEvidenceProviders(apiKeys: {
  brave?: string;
  apollo?: string;
}): EvidenceProvider[] {
  const providers: EvidenceProvider[] = [];

  // Apollo enrichment always first (highest reliability, structured data)
  if (apiKeys.apollo) providers.push(apolloEvidenceProvider);

  // Website scraping second (good for contact info, tech, operational signals)
  providers.push(websiteProvider);

  // Job adverts last (uses Brave credits, lower priority)
  if (apiKeys.brave) providers.push(jobAdvertProvider);

  return providers;
}
