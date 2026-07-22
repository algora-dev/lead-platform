import { describe, it, expect } from 'vitest';
import { validateStrategy } from '@/lib/v2/strategy-validator';

describe('validateStrategy', () => {
  it('rejects strategy with zero queries', () => {
    const result = validateStrategy(
      {
        queries: [],
        keywords: ['roofing'],
        country: 'United States',
        productProfileVersionIds: [1],
        customerProfileVersionIds: [1],
      },
      [{ id: 1, approvedAt: new Date() }],
      [{ id: 1, approvedAt: new Date() }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Strategy has zero discovery queries — cannot perform discovery');
  });

  it('rejects strategy with zero keywords', () => {
    const result = validateStrategy(
      {
        queries: [{ query: 'test' }],
        keywords: [],
        country: 'United States',
        productProfileVersionIds: [1],
        customerProfileVersionIds: [1],
      },
      [{ id: 1, approvedAt: new Date() }],
      [{ id: 1, approvedAt: new Date() }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Strategy has zero keywords — cannot match companies');
  });

  it('rejects strategy with unapproved profile versions', () => {
    const result = validateStrategy(
      {
        queries: [{ query: 'test' }],
        keywords: ['roofing'],
        country: 'United States',
        productProfileVersionIds: [1],
        customerProfileVersionIds: [1],
      },
      [{ id: 1, approvedAt: null }],
      [{ id: 1, approvedAt: new Date() }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('product profile versions are not approved'))).toBe(true);
  });

  it('accepts valid strategy with approved profiles and queries', () => {
    const result = validateStrategy(
      {
        queries: [{ query: '"roofing" Detroit, Michigan, United States' }],
        keywords: ['roofing', 'contractor'],
        country: 'United States',
        stateProvince: 'Michigan',
        city: 'Detroit',
        productProfileVersionIds: [1],
        customerProfileVersionIds: [1],
      },
      [{ id: 1, approvedAt: new Date() }],
      [{ id: 1, approvedAt: new Date() }],
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('warns when city is set without state', () => {
    const result = validateStrategy(
      {
        queries: [{ query: 'test' }],
        keywords: ['test'],
        country: 'United States',
        city: 'Detroit',
        productProfileVersionIds: [1],
        customerProfileVersionIds: [1],
      },
      [{ id: 1, approvedAt: new Date() }],
      [{ id: 1, approvedAt: new Date() }],
    );
    expect(result.warnings.some(w => w.includes('state/province'))).toBe(true);
  });

  it('rejects strategy missing country', () => {
    const result = validateStrategy(
      {
        queries: [{ query: 'test' }],
        keywords: ['test'],
        country: '',
        productProfileVersionIds: [1],
        customerProfileVersionIds: [1],
      },
      [{ id: 1, approvedAt: new Date() }],
      [{ id: 1, approvedAt: new Date() }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Country is required');
  });
});
