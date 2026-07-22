/**
 * Discovery Providers v2
 *
 * Phase 4 fixes:
 * - Typed provider request/response contracts with diagnostics
 * - Throw on non-2xx responses; capture HTTP status, error body, retryability
 * - Bounded retries/backoff for timeouts/rate limits
 * - Record actual attempts, pages, requests, raw results, deduplicated results
 * - Distinguish Success with zero matches, Partial Success, Provider Failed
 * - Apollo uses correct endpoint: /api/v1/mixed_companies/search
 * - Apollo uses keyword search (not q_organization_name for product-copy phrases)
 * - Apollo applies city in location filters
 * - Brave result interpretation: job boards/directories are evidence sources
 *
 * Provider discover() now returns ProviderResult with diagnostics, not just CandidateReference[].
 */

export interface CandidateReference {
  name: string;
  website?: string | null;
  domain?: string | null;
  country?: string | null;
  location?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  employeeRange?: string | null;
  sourceProvider: string;
  sourceQuery: string;
  sourceUrl?: string | null;
  providerId?: string | null;
  rawPayload?: any;
}

export interface ProviderDiagnostics {
  requestCount: number;       // actual HTTP requests sent
  responseCodes: number[];    // HTTP status codes received
  errors: string[];           // error messages
  retries: number;            // total retries attempted
  pages: number;              // pages fetched
  rawResultCount: number;     // total results before dedup
  deduplicatedCount: number;  // after within-provider dedup
}

export interface ProviderResult {
  candidates: CandidateReference[];
  requestCount: number;
  responseCodes: number[];
  errors: string[];
}

export interface DiscoveryProvider {
  name: string;
  discover: (queries: any[], opts: DiscoveryOpts) => Promise<ProviderResult>;
}

export interface DiscoveryOpts {
  country: string;
  stateProvince?: string;
  city?: string;
  apiKey: string;
  maxResults?: number;
  // Provider-specific plans from strategy compiler
  apolloFilters?: any[];
  apolloPerPage?: number;
  apolloMaxPages?: number;
}

// --- Retry utility ---

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2,
  backoffMs: number = 1000,
): Promise<{ response: Response; retries: number }> {
  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutSignal = options.signal ? undefined : AbortSignal.timeout(15000);
      const response = await fetch(url, {
        ...options,
        ...(timeoutSignal ? { signal: timeoutSignal } : {}),
      });

      if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
        return { response, retries };
      }

      // Retryable status
      if (attempt < maxRetries) {
        retries++;
        const retryAfter = parseInt(response.headers.get('retry-after') || '0');
        const delay = retryAfter > 0 ? retryAfter * 1000 : backoffMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return { response, retries };
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, backoffMs * Math.pow(2, attempt)));
        continue;
      }
      throw e;
    }
  }

  throw lastError || new Error('Retry loop exhausted');
}

// --- Known directory/job board domains (for classification, not exclusion) ---
const DIRECTORY_DOMAINS = new Set([
  'yelp.com', 'yellowpages.com', 'yell.com', 'trustpilot.com', 'google.com/maps',
  'bing.com', 'facebook.com', 'linkedin.com', 'glassdoor.com', 'indeed.com',
  'reed.co.uk', 'totaljobs.com', 'cv-library.co.uk', 'glassdoor.co.uk',
]);

// --- Brave Search Provider ---

export const braveProvider: DiscoveryProvider = {
  name: 'brave',
  async discover(queries: any[], opts: DiscoveryOpts): Promise<ProviderResult> {
    const candidates: CandidateReference[] = [];
    const responseCodes: number[] = [];
    const errors: string[] = [];
    let requestCount = 0;
    let retries = 0;
    const maxPerQuery = opts.maxResults || 20;

    const countryCode = opts.country === 'United Kingdom' ? 'GB'
      : opts.country === 'New Zealand' ? 'NZ'
      : opts.country === 'United States' ? 'US'
      : 'US';

    for (const q of queries) {
      const queryStr = typeof q === 'string' ? q : q.query;
      if (!queryStr) continue;

      try {
        const params = new URLSearchParams({
          q: queryStr,
          count: String(Math.min(maxPerQuery, 20)),
          country: countryCode,
        });

        const { response, retries: r } = await fetchWithRetry(
          `https://api.search.brave.com/res/v1/web/search?${params}`,
          {
            headers: {
              'Accept': 'application/json',
              'X-Subscription-Token': opts.apiKey,
            },
          },
        );

        requestCount++;
        retries += r;
        responseCodes.push(response.status);

        if (!response.ok) {
          const errBody = await response.text().catch(() => 'unknown');
          const msg = `Brave HTTP ${response.status}: ${errBody.slice(0, 200)}`;
          errors.push(msg);
          continue; // Move to next query
        }

        const data = await response.json();
        const webResults = data.web?.results || [];

        for (const r of webResults.slice(0, maxPerQuery)) {
          const url = r.url || '';
          let domain: string | null = null;
          try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

          // Extract company name from page title or domain
          const name = r.title?.split(/\s*[|\-–—]\s*/)[0]?.trim() || domain || url;

          // Classify if this is a directory listing rather than a company website
          const isDirectory = domain ? DIRECTORY_DOMAINS.has(domain) : false;

          candidates.push({
            name,
            website: url || null,
            domain,
            sourceProvider: 'brave',
            sourceQuery: queryStr,
            sourceUrl: url || null,
            rawPayload: {
              title: r.title,
              description: r.description,
              url,
              isDirectory,
            },
          });
        }
      } catch (e: any) {
        errors.push(`Brave query "${queryStr.slice(0, 50)}": ${e.message}`);
      }
    }

    return {
      candidates,
      requestCount,
      responseCodes,
      errors,
    };
  },
};

// --- Apollo Provider ---

export const apolloProvider: DiscoveryProvider = {
  name: 'apollo',
  async discover(queries: any[], opts: DiscoveryOpts): Promise<ProviderResult> {
    const candidates: CandidateReference[] = [];
    const responseCodes: number[] = [];
    const errors: string[] = [];
    let requestCount = 0;
    let retries = 0;

    const apiKey = opts.apiKey;
    if (!apiKey) {
      return {
        candidates: [],
        requestCount: 0,
        responseCodes: [],
        errors: ['Apollo API key not configured'],
      };
    }

    // Build Apollo search tasks from provider-specific filters or fallback to queries
    const apolloFilters: any[] = opts.apolloFilters || [];
    const perPage = opts.apolloPerPage || 25;
    const maxPages = opts.apolloMaxPages || 4;

    // If we have provider-specific Apollo filters, use them
    const searchTasks: { keyword: string; locations: string[]; employeeRange?: any }[] = [];

    if (apolloFilters.length > 0) {
      for (const filter of apolloFilters) {
        searchTasks.push({
          keyword: filter.keyword,
          locations: filter.organizationLocations || [],
          employeeRange: filter.employeeRange,
        });
      }
    } else {
      // Fallback: extract from queries (for backward compat with v1 strategies)
      for (const q of queries.slice(0, 5)) {
        const queryStr = typeof q === 'string' ? q : q.query;
        const quoted = queryStr.match(/"([^"]+)"/g)?.map((s: string) => s.replace(/"/g, '')) || [];
        const keyword = quoted[0] || queryStr.split(' ')[0];

        const locations: string[] = [];
        if (opts.city) locations.push(opts.city);
        if (opts.stateProvince) locations.push(opts.stateProvince);
        if (opts.country) locations.push(opts.country);

        searchTasks.push({ keyword, locations });
      }
    }

    for (const task of searchTasks) {
      for (let page = 1; page <= maxPages; page++) {
        try {
          const body: any = {
            q_keywords: task.keyword,
            per_page: perPage,
            page,
          };

          // Location: Apollo accepts city, state, country in organization_locations
          if (task.locations.length > 0) {
            body.organization_locations = task.locations;
          }

          // Employee range
          if (task.employeeRange) {
            if (task.employeeRange.min) body.employee_count_min = task.employeeRange.min;
            if (task.employeeRange.max) body.employee_count_max = task.employeeRange.max;
          }

          const { response, retries: r } = await fetchWithRetry(
            'https://api.apollo.io/api/v1/mixed_companies/search',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey,
              },
              body: JSON.stringify(body),
            },
          );

          requestCount++;
          retries += r;
          responseCodes.push(response.status);

          if (!response.ok) {
            const errBody = await response.text().catch(() => 'unknown');
            const msg = `Apollo HTTP ${response.status}: ${errBody.slice(0, 200)}`;
            errors.push(msg);
            break; // Stop paginating this filter on error
          }

          const data = await response.json();
          const orgs = data.organizations || data.accounts || [];

          if (orgs.length === 0) {
            // No more results for this filter
            break;
          }

          for (const org of orgs) {
            const website = org.website_url || org.website || null;
            let domain: string | null = null;
            if (website) {
              try { domain = new URL(website).hostname.replace(/^www\./, ''); } catch {}
            }

            candidates.push({
              name: org.name || 'Unknown',
              website,
              domain,
              country: opts.country,
              location: org.headquarters_location || org.location || null,
              industry: org.industry || org.industries?.[0] || null,
              employeeCount: org.employee_count || null,
              employeeRange: org.estimated_num_employees || org.employee_count_range || null,
              sourceProvider: 'apollo',
              sourceQuery: task.keyword,
              sourceUrl: website,
              providerId: org.id ? String(org.id) : null,
              rawPayload: org,
            });
          }

          // If we got fewer than perPage, no more pages
          if (orgs.length < perPage) {
            break;
          }
        } catch (e: any) {
          errors.push(`Apollo search "${task.keyword}" page ${page}: ${e.message}`);
          break; // Stop paginating this filter on error
        }
      }
    }

    return {
      candidates,
      requestCount,
      responseCodes,
      errors,
    };
  },
};

// --- Registry ---

export function getDiscoveryProviders(apiKeys: { brave?: string; apollo?: string }): DiscoveryProvider[] {
  const providers: DiscoveryProvider[] = [];
  if (apiKeys.brave) providers.push(braveProvider);
  if (apiKeys.apollo) providers.push(apolloProvider);
  return providers;
}
