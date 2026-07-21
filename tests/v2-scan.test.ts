import { describe, it, expect } from 'vitest';
import { calculateProfileScore, type ProfileScoreInput, type StrategyKeywords } from '@/lib/v2/profile-scorer';

const baseStrategy: StrategyKeywords = {
  keywords: ['quoting', 'estimating', 'construction software'],
  industries: ['construction', 'building'],
  technologies: ['saas', 'cloud'],
  hiringSignals: ['estimator', 'quantity surveyor'],
  operationalCharacteristics: [],
  companySizeMin: 10,
  companySizeMax: 200,
  locations: ['United Kingdom', 'Scotland'],
  exclusions: ['sole trader'],
};

const baseCandidate: ProfileScoreInput = {
  name: 'ABC Construction Ltd',
  website: 'https://abc-construction.com',
  domain: 'abc-construction.com',
  country: 'United Kingdom',
  location: 'Edinburgh, Scotland',
  industry: 'construction',
  employeeCount: 45,
};

describe('calculateProfileScore', () => {
  it('scores a well-matched candidate positively', () => {
    const result = calculateProfileScore(baseCandidate, baseStrategy);
    expect(result.score).toBeGreaterThan(15);
    expect(result.excluded).toBe(false);
  });

  it('awards keyword points only when keywords appear in candidate data', () => {
    const noKeywordCandidate = { ...baseCandidate, name: 'ABC Ltd', website: null, domain: 'abc.com' };
    const result = calculateProfileScore(noKeywordCandidate, baseStrategy);
    const keywordBreakdown = result.breakdown.find(b => b.criterion === 'Keyword Match');
    expect(keywordBreakdown).toBeUndefined();
  });

  it('excludes candidates matching exclusions', () => {
    const excludedCandidate = {
      ...baseCandidate,
      industry: 'sole trader construction',
    };
    const result = calculateProfileScore(excludedCandidate, baseStrategy);
    expect(result.excluded).toBe(true);
    expect(result.exclusionReason).toContain('sole trader');
    expect(result.score).toBe(0);
  });

  it('awards industry points for matching industry', () => {
    const result = calculateProfileScore(baseCandidate, baseStrategy);
    const industryBreakdown = result.breakdown.find(b => b.criterion === 'Industry Match');
    expect(industryBreakdown).toBeDefined();
    expect(industryBreakdown!.awarded).toBeGreaterThan(0);
  });

  it('awards location points for matching geography', () => {
    const result = calculateProfileScore(baseCandidate, baseStrategy);
    const locBreakdown = result.breakdown.find(b => b.criterion === 'Location Match');
    expect(locBreakdown).toBeDefined();
    expect(locBreakdown!.matched).toContain('United Kingdom');
  });

  it('awards size points when employee count is in range', () => {
    const result = calculateProfileScore(baseCandidate, baseStrategy);
    const sizeBreakdown = result.breakdown.find(b => b.criterion === 'Company Size Match');
    expect(sizeBreakdown).toBeDefined();
    expect(sizeBreakdown!.awarded).toBeGreaterThan(0);
  });

  it('does not award size points when employee count is out of range', () => {
    const tooSmall = { ...baseCandidate, employeeCount: 2 };
    const result = calculateProfileScore(tooSmall, baseStrategy);
    const sizeBreakdown = result.breakdown.find(b => b.criterion === 'Company Size Match');
    expect(sizeBreakdown).toBeUndefined();
  });

  it('never exceeds 100', () => {
    const perfectCandidate: ProfileScoreInput = {
      name: 'Construction Software Quoting Estimating Cloud SaaS',
      website: 'https://construction-software.com/quoting',
      domain: 'construction-software.com',
      country: 'United Kingdom',
      location: 'Scotland, United Kingdom',
      industry: 'construction building',
      employeeCount: 100,
      technologies: ['saas', 'cloud'],
      hiringSignals: ['estimator', 'quantity surveyor'],
    };
    const result = calculateProfileScore(perfectCandidate, baseStrategy);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('produces explanation for every awarded criterion', () => {
    const result = calculateProfileScore(baseCandidate, baseStrategy);
    for (const item of result.breakdown) {
      expect(item.explanation).toBeTruthy();
      expect(item.matched.length).toBeGreaterThan(0);
    }
  });

  it('returns 0 score for candidate with no matches and no exclusions', () => {
    const noMatch: ProfileScoreInput = {
      name: 'XYZ Corp',
      domain: 'xyz.com',
      country: 'Australia',
      location: 'Sydney',
      industry: 'mining',
      employeeCount: 500,
    };
    const result = calculateProfileScore(noMatch, baseStrategy);
    expect(result.score).toBe(0);
    expect(result.excluded).toBe(false);
    expect(result.breakdown.length).toBe(0);
  });
});
