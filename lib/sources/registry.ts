/**
 * Source Registry — pluggable scan source architecture.
 *
 * Each source implements the ScanSource interface. New sources can be added
 * without touching scan logic. Sources are registered in the SOURCES map.
 *
 * Current sources:
 * - Brave Search (web search for job adverts, company pages)
 * - Apollo.io (B2B company database, organization search)
 *
 * Future sources can be added by implementing ScanSource and registering here.
 */

export interface ScanResult {
  source: string;
  companyName: string;
  website?: string;
  location?: string;
  country?: string;
  industry?: string;
  employeeCount?: number;
  employeeRange?: string;
  email?: string;
  phone?: string;
  rawText?: string;
  sourceUrl: string;
  discoveryQuery?: string;
}

export interface ScanContext {
  scanArea: string;
  keywords: string[];
  queryPairs: [string, string][];
  negativeTerms: string[];
  jobTerms: string[];
  resultsPerPage: number;
  queryLimit: number;
  freshness: string;
  tenantId: number;
}

export interface ScanSource {
  id: string;
  name: string;
  requiresApiKey: boolean;
  envKey: string;

  /**
   * Run a scan using this source.
   * Returns raw results that will be deduplicated and enriched by the pipeline.
   */
  scan(ctx: ScanContext): Promise<ScanResult[]>;

  /**
   * Check if this source is configured and ready to use.
   */
  isAvailable(): boolean;
}

// --- Source implementations ---

// Brave Search Source
import { braveSearch } from '@/lib/pipeline/collector';
import { JOB_BOARD_DOMAINS } from '@/lib/pipeline/config';
import type { ScanProfileConfig } from '@/lib/pipeline/scan-profile';

class BraveScanSource implements ScanSource {
  id = 'brave';
  name = 'Brave Search';
  requiresApiKey = true;
  envKey = 'BRAVE_API_KEY';

  isAvailable(): boolean {
    return !!process.env.BRAVE_API_KEY;
  }

  async scan(ctx: ScanContext): Promise<ScanResult[]> {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) throw new Error('BRAVE_API_KEY is missing');

    const countryCode = ctx.scanArea === 'UK' ? 'GB' : ctx.scanArea === 'NZ' ? 'NZ' : 'GB';
    const place = ctx.scanArea === 'UK' ? 'UK' : ctx.scanArea === 'NZ' ? 'New Zealand' : ctx.scanArea;
    const negatives = ctx.negativeTerms.map(t => `-${t}`).join(' ');

    const queries = ctx.queryPairs
      .map(([a, b]) => `"${a}" "${b}" job ${place} ${negatives}`.trim())
      .slice(0, ctx.queryLimit);

    const results: ScanResult[] = [];
    const ignoreDomains = ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'reddit.com'];

    for (const query of queries) {
      for (const offset of [0, 1]) {
        try {
          const braveResults = await braveSearch(apiKey, query, countryCode, ctx.resultsPerPage, offset);
          for (const item of braveResults) {
            let host: string;
            try { host = new URL(item.url).hostname.toLowerCase(); } catch { continue; }

            const snippet = `${item.title} ${item.description} ${item.url}`.toLowerCase();

            if (!item.url || ignoreDomains.some(d => host.includes(d))) continue;
            if (JOB_BOARD_DOMAINS.some(d => host.includes(d))) continue;
            if (!ctx.jobTerms.some(x => snippet.includes(x.toLowerCase()))) continue;

            // Extract company name from title or snippet
            const companyName = extractCompanyName(item.title) || item.title.split(' - ')[0] || 'Unknown';

            results.push({
              source: 'brave',
              companyName,
              rawText: `${item.title}\n${item.description}`,
              sourceUrl: item.url,
              discoveryQuery: query,
              location: extractLocation(item.description, ctx.scanArea),
            });
          }
        } catch (e) {
          console.error(`[brave] Query failed: ${query}`, e);
        }
      }
    }

    return results;
  }
}

// Apollo Source
class ApolloScanSource implements ScanSource {
  id = 'apollo';
  name = 'Apollo.io';
  requiresApiKey = true;
  envKey = 'APOLLO_API_KEY';

  isAvailable(): boolean {
    return !!process.env.APOLLO_API_KEY;
  }

  async scan(ctx: ScanContext): Promise<ScanResult[]> {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) throw new Error('APOLLO_API_KEY is missing');

    const results: ScanResult[] = [];
    const keywords = ctx.keywords.length > 0 ? ctx.keywords : ctx.queryPairs.map(([a, b]) => `${a} ${b}`);

    // Apollo Organization Search API
    // https://docs.apollo.io/docs/organization-search
    for (const keyword of keywords) {
      try {
        const body = {
          q_organization_keyword_tags: [keyword],
          ...(ctx.scanArea ? { q_locations: [ctx.scanArea] } : {}),
          per_page: 100,
          page: 1,
        };

        const res = await fetch('https://api.apollo.io/v1/organizations/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          console.error(`[apollo] API error: ${res.status} ${res.statusText}`);
          continue;
        }

        const data = await res.json();
        const orgs = data?.organizations || [];

        for (const org of orgs) {
          results.push({
            source: 'apollo',
            companyName: org.name || 'Unknown',
            website: org.website_url || undefined,
            location: [org.city, org.state, org.country].filter(Boolean).join(', ') || undefined,
            country: org.country || undefined,
            industry: org.industry || undefined,
            employeeCount: org.employee_count || undefined,
            employeeRange: org.employee_range || undefined,
            email: org.primary_domain ? `info@${org.primary_domain}` : undefined,
            phone: org.phone || undefined,
            rawText: `${org.name} ${org.industry || ''} ${org.short_description || ''}`.trim(),
            sourceUrl: org.website_url || `https://app.apollo.io/#/companies/${org.id}`,
            discoveryQuery: keyword,
          });
        }
      } catch (e) {
        console.error(`[apollo] Search failed for keyword: ${keyword}`, e);
      }
    }

    return results;
  }
}

// --- Registry ---
const braveSource = new BraveScanSource();
const apolloSource = new ApolloScanSource();

export const SOURCE_REGISTRY: Record<string, ScanSource> = {
  brave: braveSource,
  apollo: apolloSource,
};

export function getAvailableSources(): ScanSource[] {
  return Object.values(SOURCE_REGISTRY).filter(s => s.isAvailable());
}

export function getSource(id: string): ScanSource | undefined {
  return SOURCE_REGISTRY[id];
}

// --- Helpers ---
function extractCompanyName(title: string): string | undefined {
  // Try patterns like "Company Name - Job Title" or "Job Title at Company Name"
  const dashMatch = title.split(' - ');
  if (dashMatch.length >= 2) return dashMatch[0].trim();

  const atMatch = title.match(/\bat\s+(.+?)(?:\s*[-|]|\s*$)/i);
  if (atMatch) return atMatch[1].trim();

  return undefined;
}

function extractLocation(text: string, scanArea: string): string | undefined {
  // Simple extraction — look for common location patterns
  const locMatch = text.match(/\b(London|Manchester|Birmingham|Leeds|Bristol|Glasgow|Edinburgh|Liverpool|Sheffield|Newcastle|Nottingham|Cardiff|Belfast|Southampton|Brighton|Cambridge|Oxford|Auckland|Wellington|Christchurch)\b/i);
  if (locMatch) return locMatch[0];
  return scanArea;
}

/**
 * Deduplicate scan results across sources.
 * Key: normalized company name + country.
 * Merges data from multiple sources into a single result.
 */
export function deduplicateResults(results: ScanResult[]): ScanResult[] {
  const seen = new Map<string, ScanResult>();

  for (const r of results) {
    const key = `${r.companyName.toLowerCase().trim()}|${r.country || ''}`;

    if (seen.has(key)) {
      // Merge — prefer existing data but fill gaps from new source
      const existing = seen.get(key)!;
      existing.website = existing.website || r.website;
      existing.email = existing.email || r.email;
      existing.phone = existing.phone || r.phone;
      existing.employeeCount = existing.employeeCount || r.employeeCount;
      existing.employeeRange = existing.employeeRange || r.employeeRange;
      existing.industry = existing.industry || r.industry;
      existing.location = existing.location || r.location;
      existing.rawText = `${existing.rawText || ''}\n--- ${r.source} ---\n${r.rawText || ''}`;
      // Track all sources
      const sources = new Set(existing.source.split(','));
      sources.add(r.source);
      existing.source = Array.from(sources).join(',');
    } else {
      seen.set(key, { ...r });
    }
  }

  return Array.from(seen.values());
}
