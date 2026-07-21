import { describe, it, expect } from 'vitest';
import { clean, canonicalise } from '@/lib/pipeline/parser';

describe('clean', () => {
  it('collapses whitespace', () => {
    expect(clean('  hello   world  ')).toBe('hello world');
  });

  it('handles null/undefined', () => {
    expect(clean(null)).toBe('');
    expect(clean(undefined)).toBe('');
  });
});

describe('canonicalise', () => {
  it('lowercases protocol and host', () => {
    expect(canonicalise('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('strips trailing slash', () => {
    expect(canonicalise('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('removes UTM tracking params', () => {
    const result = canonicalise('https://example.com/page?utm_source=google&id=123');
    expect(result).not.toContain('utm_source');
    expect(result).toContain('id=123');
  });

  it('removes gclid and fbclid', () => {
    const result = canonicalise('https://example.com/page?gclid=abc&fbclid=def&keep=1');
    expect(result).not.toContain('gclid');
    expect(result).not.toContain('fbclid');
    expect(result).toContain('keep=1');
  });

  it('returns original string for invalid URL', () => {
    expect(canonicalise('not a url')).toBe('not a url');
  });

  it('handles URL without path', () => {
    const result = canonicalise('https://example.com');
    expect(result).toBe('https://example.com');
  });
});
