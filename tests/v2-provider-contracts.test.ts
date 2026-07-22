/**
 * Provider Contract Tests (Stage 10)
 *
 * Tests that verify provider behaviour against recorded fixtures,
 * ensuring the provider adapters correctly parse API responses and
 * produce expected candidates/evidence items.
 *
 * No real API calls — all responses are mocked via global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// --- Fixtures ---

function loadFixture(name: string) {
  return JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8'),
  );
}

const braveDiscoveryFixture = loadFixture('brave-discovery.json');
const apolloDiscoveryFixture = loadFixture('apollo-discovery.json');
const apolloEnrichmentFixture = loadFixture('apollo-enrichment.json');
const websiteEvidenceFixture = loadFixture('website-evidence.json');
const jobAdvertEvidenceFixture = loadFixture('job-advert-evidence.json');

// --- Mock helpers ---

function mockFetchBrave(params: { queries: string[]; response: any }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('api.search.brave.com')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => params.response,
        text: async () => JSON.stringify(params.response),
        url: urlStr,
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${urlStr}`);
  }) as any;
}

function mockFetchApollo(params: { response: any; expectedUrl?: string }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('api.apollo.io')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => params.response,
        text: async () => JSON.stringify(params.response),
        url: urlStr,
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${urlStr}`);
  }) as any;
}

function mockFetchWebsite(params: { html: string }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: async () => ({}),
      text: async () => params.html,
      url: urlStr,
    } as Response;
  }) as any;
}

// --- Tests ---

describe('Provider Contract Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Brave Discovery Provider', () => {
    it('parses Brave Search results into candidates', async () => {
      globalThis.fetch = mockFetchBrave(braveDiscoveryFixture);

      const { braveProvider } = await import('@/lib/v2/discovery-providers');

      const result = await braveProvider.discover(
        braveDiscoveryFixture.queries,
        {
          country: 'United Kingdom',
          apiKey: 'test-key',
          maxResults: 20,
        },
      );

      // 3 results per query × 2 queries = 6 total candidates
      expect(result.candidates).toHaveLength(braveDiscoveryFixture.expectedCandidates * braveDiscoveryFixture.queries.length);
      expect(result.requestCount).toBe(2); // 2 queries

      const first = result.candidates[0];
      expect(first.name).toBe(braveDiscoveryFixture.expectedFirstCandidate.name);
      expect(first.domain).toBe(braveDiscoveryFixture.expectedFirstCandidate.domain);
      expect(first.sourceProvider).toBe(braveDiscoveryFixture.expectedFirstCandidate.sourceProvider);
      expect(first.sourceUrl).toBeTruthy();
      expect(first.rawPayload).toBeDefined();
    });

    it('handles empty Brave response gracefully', async () => {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ web: { results: [] } }),
        text: async () => '{"web":{"results":[]}}',
        url: '',
      }) as Response) as any;

      const { braveProvider } = await import('@/lib/v2/discovery-providers');

      const result = await braveProvider.discover(
        ['no results expected'],
        { country: 'United Kingdom', apiKey: 'test-key' },
      );

      expect(result.candidates).toHaveLength(0);
      expect(result.requestCount).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('records HTTP errors and continues', async () => {
      // Non-retryable error (400) on first query, success on second
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({}),
            text: async () => 'Bad Request',
            url: '',
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => braveDiscoveryFixture.response,
          text: async () => JSON.stringify(braveDiscoveryFixture.response),
          url: '',
        } as Response;
      }) as any;

      const { braveProvider } = await import('@/lib/v2/discovery-providers');

      const result = await braveProvider.discover(
        ['query 1', 'query 2'],
        { country: 'United Kingdom', apiKey: 'test-key' },
      );

      // 400 is non-retryable, so it's recorded immediately
      expect(result.responseCodes).toContain(400);
      expect(result.responseCodes).toContain(200);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('400');
      // Second query should still produce candidates
      expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('classifies directory/job board domains', async () => {
      globalThis.fetch = mockFetchBrave(braveDiscoveryFixture);

      const { braveProvider } = await import('@/lib/v2/discovery-providers');

      const result = await braveProvider.discover(
        braveDiscoveryFixture.queries,
        { country: 'United Kingdom', apiKey: 'test-key' },
      );

      // Indeed result should be classified as directory
      const indeedResult = result.candidates.find(c => c.domain === 'indeed.co.uk');
      expect(indeedResult).toBeDefined();
      expect(indeedResult!.rawPayload.isDirectory).toBe(true);
      // The fixture includes indeed.co.uk in the DIRECTORY_DOMAINS set

      // ABC Construction should NOT be a directory
      const abcResult = result.candidates.find(c => c.domain === 'abcconstruction.co.uk');
      expect(abcResult).toBeDefined();
      expect(abcResult!.rawPayload.isDirectory).toBe(false);
    });
  });

  describe('Apollo Discovery Provider', () => {
    it('parses Apollo mixed_companies/search response', async () => {
      globalThis.fetch = mockFetchApollo(apolloDiscoveryFixture);

      const { apolloProvider } = await import('@/lib/v2/discovery-providers');

      const result = await apolloProvider.discover(
        [],
        {
          country: 'United Kingdom',
          apiKey: 'test-key',
          apolloFilters: [{
            keyword: apolloDiscoveryFixture.searchTask.keyword,
            organizationLocations: apolloDiscoveryFixture.searchTask.locations,
            employeeRange: apolloDiscoveryFixture.searchTask.employeeRange,
          }],
          apolloPerPage: 25,
          apolloMaxPages: 1,
        },
      );

      expect(result.candidates).toHaveLength(apolloDiscoveryFixture.expectedCandidates);

      const first = result.candidates[0];
      expect(first.name).toBe(apolloDiscoveryFixture.expectedFirstCandidate.name);
      expect(first.domain).toBe(apolloDiscoveryFixture.expectedFirstCandidate.domain);
      expect(first.industry).toBe(apolloDiscoveryFixture.expectedFirstCandidate.industry);
      expect(first.employeeCount).toBe(apolloDiscoveryFixture.expectedFirstCandidate.employeeCount);
      expect(first.sourceProvider).toBe('apollo');
      expect(first.providerId).toBe('org_001');
    });

    it('sends correct Apollo request format', async () => {
      const fetchMock = mockFetchApollo(apolloDiscoveryFixture);
      globalThis.fetch = fetchMock;

      const { apolloProvider } = await import('@/lib/v2/discovery-providers');

      await apolloProvider.discover(
        [],
        {
          country: 'United Kingdom',
          city: 'London',
          apiKey: 'test-key',
          apolloFilters: [{
            keyword: 'construction',
            organizationLocations: ['London'],
          }],
          apolloPerPage: 25,
          apolloMaxPages: 1,
        },
      );

      expect(fetchMock).toHaveBeenCalled();
      const callArgs = fetchMock.mock.calls[0];
      const callUrl = callArgs[0] as string;
      const callInit = callArgs[1] as RequestInit;

      expect(callUrl).toContain('/api/v1/mixed_companies/search');
      expect(callInit.method).toBe('POST');

      const headers = callInit.headers as Record<string, string>;
      expect(headers['X-Api-Key']).toBe('test-key');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(callInit.body as string);
      expect(body.q_keywords).toBe('construction');
      expect(body.organization_locations).toEqual(['London']);
      expect(body.per_page).toBe(25);
    });

    it('handles Apollo API error gracefully', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid API key' }),
        text: async () => 'Invalid API key',
        url: '',
      }) as Response) as any;

      const { apolloProvider } = await import('@/lib/v2/discovery-providers');

      const result = await apolloProvider.discover(
        [],
        {
          country: 'United Kingdom',
          apiKey: 'bad-key',
          apolloFilters: [{ keyword: 'test', organizationLocations: ['London'] }],
          apolloMaxPages: 1,
        },
      );

      expect(result.candidates).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('401');
    });
  });

  describe('Apollo Evidence Provider', () => {
    it('enriches company with Apollo data', async () => {
      globalThis.fetch = mockFetchApollo(apolloEnrichmentFixture);

      const { apolloEvidenceProvider } = await import('@/lib/v2/evidence-providers');

      const items = await apolloEvidenceProvider.gather(
        apolloEnrichmentFixture.company,
        {
          apiKey: 'test-key',
          strategyEvidencePriorities: ['APOLLO_DATA'],
          maxItemsPerProvider: 5,
        },
      );

      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.evidenceType).toBe(apolloEnrichmentFixture.expectedEvidenceType);
      expect(item.reliability).toBe(apolloEnrichmentFixture.expectedReliability);
      expect(item.contentHash).toBeTruthy();

      // Check claims
      const claimTypes = item.claims.map(c => c.claimType);
      for (const expected of apolloEnrichmentFixture.expectedClaims) {
        expect(claimTypes).toContain(expected.type);
        const claim = item.claims.find(c => c.claimType === expected.type);
        expect(claim?.claimValue).toBe(expected.value);
      }
    });

    it('returns empty when Apollo has no match', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ organization: null }),
        text: async () => '{"organization":null}',
        url: '',
      }) as Response) as any;

      const { apolloEvidenceProvider } = await import('@/lib/v2/evidence-providers');

      const items = await apolloEvidenceProvider.gather(
        { id: 99, name: 'Nonexistent Corp', website: null, domain: null, country: 'United Kingdom', location: null, industry: null },
        { apiKey: 'test-key', strategyEvidencePriorities: [], maxItemsPerProvider: 5 },
      );

      expect(items).toHaveLength(0);
    });
  });

  describe('Website Evidence Provider', () => {
    it('scrapes website and extracts contact/tech/operational signals', async () => {
      globalThis.fetch = mockFetchWebsite({ html: websiteEvidenceFixture.htmlResponse });

      const { websiteProvider } = await import('@/lib/v2/evidence-providers');

      const items = await websiteProvider.gather(
        websiteEvidenceFixture.company,
        {
          apiKey: 'test-key',
          strategyEvidencePriorities: ['COMPANY_WEBSITE'],
          maxItemsPerProvider: 5,
        },
      );

      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.evidenceType).toBe(websiteEvidenceFixture.expectedEvidenceType);
      expect(item.reliability).toBe(websiteEvidenceFixture.expectedReliability);

      // Check extracted claims
      const contactClaims = item.claims.filter(c => c.claimType === 'CONTACT_INFO');
      const emails = contactClaims.find(c => c.claimData?.type === 'email');
      expect(emails?.claimData.emails).toEqual(websiteEvidenceFixture.expectedClaims.emails);

      const phones = contactClaims.find(c => c.claimData?.type === 'phone');
      expect(phones?.claimData.phones).toEqual(websiteEvidenceFixture.expectedClaims.phones);

      const techClaims = item.claims.filter(c => c.claimType === 'TECHNOLOGY');
      const techValues = techClaims.map(c => c.claimValue);
      for (const expectedTech of websiteEvidenceFixture.expectedClaims.technologies) {
        expect(techValues).toContain(expectedTech);
      }

      const opClaims = item.claims.filter(c => c.claimType === 'OPERATIONAL_ACTIVITY');
      const opValues = opClaims.map(c => c.claimValue);
      for (const expectedSignal of websiteEvidenceFixture.expectedClaims.operationalSignals) {
        expect(opValues).toContain(expectedSignal);
      }
    });

    it('returns empty when company has no website', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        json: async () => ({}),
        text: async () => '',
        url: '',
      }) as Response) as any;

      const { websiteProvider } = await import('@/lib/v2/evidence-providers');

      const items = await websiteProvider.gather(
        { id: 1, name: 'No Website Corp', website: null, domain: null, country: 'United Kingdom', location: null, industry: null },
        { apiKey: 'test', strategyEvidencePriorities: [], maxItemsPerProvider: 5 },
      );

      expect(items).toHaveLength(0);
    });

    it('handles non-HTML responses', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        json: async () => ({}),
        text: async () => 'binary data',
        url: '',
      }) as Response) as any;

      const { websiteProvider } = await import('@/lib/v2/evidence-providers');

      const items = await websiteProvider.gather(
        { id: 1, name: 'PDF Corp', website: 'https://example.com/brochure.pdf', domain: 'example.com', country: 'United Kingdom', location: null, industry: null },
        { apiKey: 'test', strategyEvidencePriorities: [], maxItemsPerProvider: 5 },
      );

      expect(items).toHaveLength(0);
    });
  });

  describe('Job Advert Evidence Provider', () => {
    it('finds job adverts via Brave and classifies job boards', async () => {
      globalThis.fetch = mockFetchBrave(jobAdvertEvidenceFixture);

      const { jobAdvertProvider } = await import('@/lib/v2/evidence-providers');

      const items = await jobAdvertProvider.gather(
        jobAdvertEvidenceFixture.company,
        {
          apiKey: 'test-key',
          strategyEvidencePriorities: ['JOB_ADVERT'],
          maxItemsPerProvider: 10,
        },
      );

      expect(items).toHaveLength(jobAdvertEvidenceFixture.expectedEvidenceCount);

      // First result: company careers page (not a job board)
      const first = items[0];
      expect(first.evidenceType).toBe(jobAdvertEvidenceFixture.expectedFirstEvidence.evidenceType);
      expect(first.normalisedPayload.isJobBoard).toBe(false);
      expect(first.reliability).toBe(jobAdvertEvidenceFixture.expectedFirstEvidence.reliability);

      // Second result: Indeed (job board)
      const second = items[1];
      expect(second.evidenceType).toBe(jobAdvertEvidenceFixture.expectedSecondEvidence.evidenceType);
      expect(second.normalisedPayload.isJobBoard).toBe(true);
      expect(second.reliability).toBe(jobAdvertEvidenceFixture.expectedSecondEvidence.reliability);
      // Note: indeed.co.uk must be in the jobBoards list in the provider
    });

    it('filters out results not about the company', async () => {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          web: {
            results: [
              {
                title: 'Completely Different Company - Jobs',
                url: 'https://www.different.com/careers',
                description: 'A different company is hiring. Nothing to do with BuildRight.',
              },
            ],
          },
        }),
        text: async () => '',
        url: typeof url === 'string' ? url : '',
      }) as Response) as any;

      const { jobAdvertProvider } = await import('@/lib/v2/evidence-providers');

      const items = await jobAdvertProvider.gather(
        jobAdvertEvidenceFixture.company,
        { apiKey: 'test-key', strategyEvidencePriorities: [], maxItemsPerProvider: 10 },
      );

      expect(items).toHaveLength(0);
    });
  });

  describe('Provider Registry', () => {
    it('returns correct providers based on available API keys', async () => {
      const { getDiscoveryProviders } = await import('@/lib/v2/discovery-providers');
      const { getEvidenceProviders } = await import('@/lib/v2/evidence-providers');

      // Both keys
      const both = getDiscoveryProviders({ brave: 'key', apollo: 'key' });
      expect(both).toHaveLength(2);
      expect(both.map(p => p.name)).toContain('brave');
      expect(both.map(p => p.name)).toContain('apollo');

      // Only brave
      const braveOnly = getDiscoveryProviders({ brave: 'key' });
      expect(braveOnly).toHaveLength(1);
      expect(braveOnly[0].name).toBe('brave');

      // Only apollo
      const apolloOnly = getDiscoveryProviders({ apollo: 'key' });
      expect(apolloOnly).toHaveLength(1);
      expect(apolloOnly[0].name).toBe('apollo');

      // Evidence providers
      const evidenceBoth = getEvidenceProviders({ brave: 'key', apollo: 'key' });
      expect(evidenceBoth).toHaveLength(3);
      expect(evidenceBoth[0].name).toBe('apollo'); // Apollo first
      expect(evidenceBoth[1].name).toBe('website'); // Website second
      expect(evidenceBoth[2].name).toBe('job-adverts'); // Job adverts last

      // Without brave, no job-adverts
      const noBrave = getEvidenceProviders({ apollo: 'key' });
      expect(noBrave).toHaveLength(2);
      expect(noBrave.find(p => p.name === 'job-adverts')).toBeUndefined();
    });
  });

  describe('Content Hash Deduplication', () => {
    it('produces same hash for same evidence', async () => {
      const { hashContent } = await import('@/lib/v2/evidence-providers');

      const input = {
        evidenceType: 'JOB_ADVERT' as const,
        sourceUrl: 'https://example.com/job/1',
        sourceDomain: 'example.com',
        rawPayload: { title: 'Job Title' },
      };

      const h1 = hashContent(input);
      const h2 = hashContent(input);
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different evidence', async () => {
      const { hashContent } = await import('@/lib/v2/evidence-providers');

      const h1 = hashContent({
        evidenceType: 'JOB_ADVERT',
        sourceUrl: 'https://example.com/job/1',
        sourceDomain: 'example.com',
        rawPayload: {},
      });

      const h2 = hashContent({
        evidenceType: 'JOB_ADVERT',
        sourceUrl: 'https://example.com/job/2',
        sourceDomain: 'example.com',
        rawPayload: {},
      });

      expect(h1).not.toBe(h2);
    });
  });
});

