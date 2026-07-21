import { describe, it, expect } from 'vitest';
import { compileStrategy } from '@/lib/v2/strategy-compiler';

const mockProducts = [
  {
    id: 1,
    profile: { name: 'QuoteCore+' },
    problemsSolved: ['slow quoting', 'inconsistent pricing'],
    outcomes: ['faster quotes', 'accurate pricing'],
    industries: ['construction', 'building'],
    keywords: ['quoting', 'estimating', 'construction software'],
    technologies: ['SaaS', 'cloud'],
    companySizeMin: 5,
    companySizeMax: 200,
    pricingLevel: 'mid',
    exclusions: ['sole traders'],
    notes: null,
  },
];

const mockCustomers = [
  {
    id: 1,
    profile: { name: 'UK Construction' },
    industries: ['construction'],
    locations: ['Scotland', 'North England'],
    employeeCountMin: 10,
    employeeCountMax: 150,
    revenueMin: null,
    revenueMax: null,
    technologies: ['spreadsheet', 'paper-based'],
    operationalCharacteristics: ['manual quoting', 'growing teams'],
    buyingSignals: ['hiring estimators', 'multiple projects'],
    hiringSignals: ['estimator', 'quantity surveyor'],
    decisionMakers: ['MD', 'operations manager'],
    exclusions: ['residential only'],
    notes: null,
  },
];

const geo = {
  productProfileVersionIds: [1],
  customerProfileVersionIds: [1],
  country: 'United Kingdom',
  stateProvince: 'Scotland',
  county: undefined,
  city: undefined,
  radiusKm: undefined,
};

describe('compileStrategy', () => {
  const result = compileStrategy(mockProducts, mockCustomers, geo);

  it('generates search queries', () => {
    expect(result.queries.length).toBeGreaterThan(0);
    expect(result.queries.some(q => q.type === 'keyword')).toBe(true);
    expect(result.queries.some(q => q.type === 'hiring')).toBe(true);
    expect(result.queries.some(q => q.type === 'combination')).toBe(true);
    expect(result.queries.some(q => q.type === 'site')).toBe(true);
  });

  it('scopes queries to geography', () => {
    expect(result.queries.every(q => q.query.includes('United Kingdom'))).toBe(true);
    expect(result.queries.some(q => q.query.includes('Scotland'))).toBe(true);
  });

  it('merges keywords from product and customer profiles', () => {
    expect(result.keywords).toContain('quoting');
    expect(result.keywords).toContain('estimating');
    expect(result.keywords).toContain('construction software');
    expect(result.keywords).toContain('manual quoting');
  });

  it('deduplicates keywords', () => {
    const counts: Record<string, number> = {};
    for (const k of result.keywords) {
      counts[k] = (counts[k] || 0) + 1;
    }
    expect(Object.values(counts).every(c => c === 1)).toBe(true);
  });

  it('merges exclusions', () => {
    expect(result.exclusionFilters).toContain('sole traders');
    expect(result.exclusionFilters).toContain('residential only');
  });

  it('builds inclusion filters with industry and size', () => {
    expect(result.inclusionFilters.some(f => f.includes('construction'))).toBe(true);
    expect(result.inclusionFilters.some(f => f.includes('Minimum employees: 5'))).toBe(true);
    expect(result.inclusionFilters.some(f => f.includes('Maximum employees: 200'))).toBe(true);
  });

  it('prioritises evidence sources', () => {
    expect(result.evidencePriorities).toContain('job_advert');
    expect(result.evidencePriorities).toContain('company_website');
    expect(result.evidencePriorities).toContain('contact_info');
  });

  it('generates a default name from profile names', () => {
    expect(result.defaultName).toBe('QuoteCore+ × UK Construction');
  });

  it('produces scoring config with profile and confidence sections', () => {
    expect(result.scoringConfig.profileScore).toBeDefined();
    expect(result.scoringConfig.confidenceScore).toBeDefined();
    expect(result.scoringConfig.combinedPolicy).toBe('harmonic_mean');
  });

  it('includes hiring signal queries', () => {
    const hiringQueries = result.queries.filter(q => q.type === 'hiring');
    expect(hiringQueries.length).toBeGreaterThan(0);
    expect(hiringQueries.some(q => q.query.includes('estimator'))).toBe(true);
    expect(hiringQueries.some(q => q.query.includes('quantity surveyor'))).toBe(true);
  });

  it('limits keyword queries to 15', () => {
    const keywordQueries = result.queries.filter(q => q.type === 'keyword');
    expect(keywordQueries.length).toBeLessThanOrEqual(15);
  });

  it('generates site-specific queries for job boards', () => {
    const siteQueries = result.queries.filter(q => q.type === 'site');
    expect(siteQueries.length).toBeGreaterThan(0);
    expect(siteQueries.some(q => q.query.includes('indeed.com'))).toBe(true);
  });
});
