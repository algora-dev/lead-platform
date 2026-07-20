import { QUERY_PAIRS as DEFAULT_QUERY_PAIRS, SOURCES as DEFAULT_SOURCES } from './config';
import type { ScanProfileConfig } from './scan-profile';

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

export interface BraveResult {
  url: string;
  title: string;
  description: string;
}

export function buildQueries(country: string, profile?: ScanProfileConfig): string[] {
  const queryPairs = profile?.brave.queryPairs || DEFAULT_QUERY_PAIRS;
  const negativeTerms = profile?.brave.negativeTerms || (DEFAULT_SOURCES.brave.negativeTerms || []);
  const place = country === 'UK' ? 'UK' : 'New Zealand';
  const negatives = negativeTerms.map((t: string) => `-${t}`).join(' ');
  return queryPairs.map(
    ([a, b]) => `"${a}" "${b}" job ${place} ${negatives}`.trim()
  );
}

export async function braveSearch(
  apiKey: string,
  query: string,
  countryCode: string,
  count = 20,
  offset = 0,
  profile?: ScanProfileConfig
): Promise<BraveResult[]> {
  const brave = profile?.brave || DEFAULT_SOURCES.brave;
  const params = new URLSearchParams({
    q: query,
    country: countryCode,
    search_lang: 'en',
    count: String(Math.min(count, brave.resultsPerPage || 20, 20)),
    offset: String(offset),
    freshness: brave.freshness || 'pm',
  });

  const url = `${BRAVE_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    throw new Error(`Brave API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data?.web?.results || []) as BraveResult[];
}

export async function officialSiteSearch(
  apiKey: string,
  company: string,
  countryCode: string
): Promise<[string, string, string][]> {
  const results = await braveSearch(
    apiKey,
    `"${company}" official website contact employees`,
    countryCode,
    8,
    0
  );
  return results
    .filter((r) => r.url)
    .map((r) => [r.url, r.title, r.description]);
}
