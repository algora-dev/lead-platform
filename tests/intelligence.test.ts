import { describe, it, expect } from 'vitest';
import { normalizeCompany, advertScore, companyScore, taskSignals } from '@/lib/pipeline/intelligence';

describe('normalizeCompany', () => {
  it('strips suffixes and lowercases', () => {
    expect(normalizeCompany('Example Holdings Limited')).toBe('example');
  });

  it('handles empty input', () => {
    expect(normalizeCompany('')).toBe('unknown');
  });

  it('strips multiple suffixes', () => {
    expect(normalizeCompany('ABC Group Ltd')).toBe('abc');
  });

  it('preserves core name with numbers', () => {
    expect(normalizeCompany('Building 24 Ltd')).toBe('building 24');
  });

  it('strips NZ suffix', () => {
    expect(normalizeCompany('Test Co NZ')).toBe('test');
  });
});

describe('taskSignals', () => {
  it('detects data and records signal', () => {
    const signals = taskSignals('Maintain the CRM, answer customer enquiries and prepare monthly reports.');
    expect(signals).toContain('data and records');
    expect(signals).toContain('customer communication');
    expect(signals).toContain('reporting and reconciliation');
  });

  it('returns empty for irrelevant text', () => {
    const signals = taskSignals('The weather is nice today.');
    expect(signals).toEqual([]);
  });

  it('is case insensitive', () => {
    const signals = taskSignals('DATA ENTRY and CRM management');
    expect(signals).toContain('data and records');
  });
});

describe('advertScore', () => {
  it('returns 0 for no signals', () => {
    expect(advertScore([])).toBe(0);
  });

  it('returns positive for one signal', () => {
    expect(advertScore(['data and records'])).toBeGreaterThan(0);
  });

  it('caps at maximum', () => {
    const many = Array.from({ length: 20 }, (_, i) => `signal-${i}`);
    expect(advertScore(many)).toBeLessThanOrEqual(40);
  });

  it('deduplicates signals', () => {
    expect(advertScore(['a', 'a', 'a'])).toBe(advertScore(['a']));
  });
});

describe('companyScore', () => {
  it('higher score for multiple jobs with contact info vs single job without', () => {
    const one = [{ signals: ['data and records'], salary_high: 30000 }];
    const three = [
      { signals: ['data and records'], salary_high: 30000 },
      { signals: ['data and records', 'reporting and reconciliation'], salary_high: 32000 },
      { signals: ['data and records'], salary_high: 35000 },
    ];
    const scoreOne = companyScore(one, null, null, null).total;
    const scoreThree = companyScore(three, 'hello@example.com', '0123456789', 50).total;
    expect(scoreThree).toBeGreaterThan(scoreOne);
  });

  it('never exceeds 100', () => {
    const jobs = Array.from({ length: 10 }, () => ({
      signals: ['data and records', 'reporting and reconciliation', 'customer communication'],
      salary_high: 80000,
    }));
    const result = companyScore(jobs, 'a@b.com', '123456', 200);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('produces a reason string explaining all points', () => {
    const result = companyScore(
      [{ signals: ['data and records'], salary_high: 35000 }],
      'test@example.com',
      null,
      null
    );
    expect(result.reason).toContain('Base hiring signal');
    expect(result.reason).toContain('contactability');
  });

  it('produces a summary with active advert count', () => {
    const result = companyScore(
      [{ signals: ['data and records'], salary_high: 35000 }],
      null, null, null
    );
    expect(result.summary).toContain('1 active advert');
  });
});
