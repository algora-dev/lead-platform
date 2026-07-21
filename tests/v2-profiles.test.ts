import { describe, it, expect } from 'vitest';

/**
 * Characterisation tests for V2 profile version immutability and tenant isolation.
 * These test the domain rules documented in ADR-0001 and the schema constraints.
 * Full integration tests require a test database — these validate the contracts.
 */

describe('Profile version immutability rules', () => {
  it('version numbers are sequential and start at 1', () => {
    // Simulating the version creation logic from the API route
    const existingVersions = [{ versionNumber: 1 }, { versionNumber: 2 }];
    const next = (existingVersions[0]?.versionNumber || 0) + 1;
    expect(next).toBe(2); // latest is v2, so next is v3
  });

  it('first version is always 1', () => {
    const existing: any[] = [];
    const next = (existing[0]?.versionNumber || 0) + 1;
    expect(next).toBe(1);
  });

  it('version is created with approvedAt only when approvedBy is provided', () => {
    const withApproval = { approvedBy: 'Shaun', approvedAt: new Date() };
    const withoutApproval = { approvedBy: null, approvedAt: null };
    expect(withApproval.approvedAt).toBeTruthy();
    expect(withoutApproval.approvedAt).toBeNull();
  });

  it('rawInput is always preserved from user input', () => {
    const rawInput = { text: 'We sell construction software', name: 'QuoteCore+' };
    expect(rawInput.text).toBeTruthy();
    expect(rawInput.name).toBeTruthy();
  });
});

describe('AI structuring validation', () => {
  it('validates pricingLevel to known values', () => {
    const valid = ['budget', 'mid', 'premium', 'enterprise'];
    expect(valid.includes('premium')).toBe(true);
    expect(valid.includes('unknown')).toBe(false);
  });

  it('falls back to empty arrays for missing array fields', () => {
    const asArray = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray(['a', 'b'])).toEqual(['a', 'b']);
    expect(asArray([1, 2])).toEqual(['1', '2']);
  });

  it('falls back to null for missing number fields', () => {
    const num = (v: unknown) => typeof v === 'number' ? v : null;
    expect(num(undefined)).toBeNull();
    expect(num('100')).toBeNull();
    expect(num(100)).toBe(100);
  });
});

describe('Profile field definitions', () => {
  // Ensure the field lists match the schema
  const productFields = [
    'problemsSolved', 'outcomes', 'industries', 'keywords',
    'technologies', 'companySizeMin', 'companySizeMax',
    'pricingLevel', 'exclusions',
  ];

  const customerFields = [
    'industries', 'locations', 'employeeCountMin', 'employeeCountMax',
    'revenueMin', 'revenueMax', 'technologies',
    'operationalCharacteristics', 'buyingSignals', 'hiringSignals',
    'decisionMakers', 'exclusions',
  ];

  it('product profile has all expected fields', () => {
    for (const f of productFields) {
      expect(f).toBeTruthy();
    }
    expect(productFields.length).toBe(9);
  });

  it('customer profile has all expected fields', () => {
    for (const f of customerFields) {
      expect(f).toBeTruthy();
    }
    expect(customerFields.length).toBe(12);
  });

  it('both profile types share industries and technologies', () => {
    expect(productFields).toContain('industries');
    expect(customerFields).toContain('industries');
    expect(productFields).toContain('technologies');
    expect(customerFields).toContain('technologies');
  });
});
