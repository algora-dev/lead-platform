/**
 * Discovery Providers
 * Adapters that connect Brave Search and Apollo to the V2 discovery pipeline.
 * Each provider returns candidate references with provenance — they do NOT
 * write directly to Company fields.
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

export interface DiscoveryProvider {
  name: string;
  discover: (queries: any[], opts: DiscoveryOpts) => Promise<CandidateReference[]>;
}

export interface DiscoveryOpts {
  country: string;
  stateProvince?: string;
  city?: string;
  apiKey: string;
  maxResults?: number;
}

// --- Brave Search Provider ---

export const braveProvider: DiscoveryProvider = {
  name: 'brave',
  async discover(queries: any[], opts: DiscoveryOpts): Promise<CandidateReference[]> {
    const results: CandidateReference[] = [];
    const maxPerQuery = opts.maxResults || 20;

    for (const q of queries) {
      const queryStr = typeof q === 'string' ? q : q.query;
      if (!queryStr) continue;

      try {
        const params = new URLSearchParams({
          q: queryStr,
          count: String(Math.min(maxPerQuery, 20)),
          country: opts.country === 'United Kingdom' ? 'GB' : opts.country === 'New Zealand' ? 'NZ' : 'US',
        });

        const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': opts.apiKey,
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const webResults = data.web?.results || [];

        for (const r of webResults.slice(0, maxPerQuery)) {
          const url = r.url || '';
          let domain: string | null = null;
          try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

          // Extract company name from page title or domain
          const name = r.title?.split(/\s*[|\-–—]\s*/)[0]?.trim() || domain || url;

          results.push({
            name,
            website: url || null,
            domain,
            sourceProvider: 'brave',
            sourceQuery: queryStr,
            sourceUrl: url || null,
            rawPayload: { title: r.title, description: r.description, url },
          });
        }
      } catch (e) {
        // Continue to next query on error
      }
    }

    return results;
  },
};

// --- Apollo Provider ---

export const apolloProvider: DiscoveryProvider = {
  name: 'apollo',
  async discover(queries: any[], opts: DiscoveryOpts): Promise<CandidateReference[]> {
    const results: CandidateReference[] = [];
    const apiKey = opts.apiKey;
    if (!apiKey) return results;

    // Apollo doesn't do free-text search like Brave — it does organisation search
    // We extract keywords from queries and use them as search terms
    for (const q of queries.slice(0, 5)) {
      const queryStr = typeof q === 'string' ? q : q.query;
      // Extract quoted keywords from query string
      const quoted = queryStr.match(/"([^"]+)"/g)?.map((s: string) => s.replace(/"/g, '')) || [];
      const keyword = quoted[0] || queryStr.split(' ')[0];

      try {
        const body: any = {
          q_organization_name: keyword,
          per_page: 25,
        };

        // Add location filter
        if (opts.country === 'United Kingdom') body.organization_locations = ['United Kingdom'];
        else if (opts.country === 'New Zealand') body.organization_locations = ['New Zealand'];
        else body.organization_locations = [opts.country];

        if (opts.stateProvince) {
          body.organization_locations = [opts.stateProvince];
        }

        const res = await fetch('https://api.apollo.io/v1/organizations/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const orgs = data.organizations || [];

        for (const org of orgs) {
          const website = org.website_url || null;
          let domain: string | null = null;
          if (website) {
            try { domain = new URL(website).hostname.replace(/^www\./, ''); } catch {}
          }

          results.push({
            name: org.name || 'Unknown',
            website,
            domain,
            country: opts.country,
            location: org.headquarters_location || null,
            industry: org.industry || null,
            employeeCount: org.employee_count || null,
            employeeRange: org.estimated_num_employees || null,
            sourceProvider: 'apollo',
            sourceQuery: queryStr,
            sourceUrl: website,
            providerId: org.id ? String(org.id) : null,
            rawPayload: org,
          });
        }
      } catch (e) {
        // Continue to next query
      }
    }

    return results;
  },
};

// --- Registry ---

export function getDiscoveryProviders(apiKeys: { brave?: string; apollo?: string }): DiscoveryProvider[] {
  const providers: DiscoveryProvider[] = [];
  if (apiKeys.brave) providers.push(braveProvider);
  if (apiKeys.apollo) providers.push(apolloProvider);
  return providers;
}
