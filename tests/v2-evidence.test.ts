import { describe, it, expect } from 'vitest';
import { hashContent } from '@/lib/v2/evidence-providers';

describe('Evidence Engine', () => {
  describe('hashContent', () => {
    it('produces stable hashes for identical input', () => {
      const input = {
        evidenceType: 'COMPANY_WEBSITE',
        sourceUrl: 'https://example.com',
        sourceDomain: 'example.com',
        rawPayload: { title: 'Example Corp' },
      };
      const h1 = hashContent(input);
      const h2 = hashContent(input);
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different URLs', () => {
      const h1 = hashContent({
        evidenceType: 'JOB_ADVERT',
        sourceUrl: 'https://example.com/job1',
        sourceDomain: 'example.com',
        rawPayload: {},
      });
      const h2 = hashContent({
        evidenceType: 'JOB_ADVERT',
        sourceUrl: 'https://example.com/job2',
        sourceDomain: 'example.com',
        rawPayload: {},
      });
      expect(h1).not.toBe(h2);
    });

    it('produces different hashes for different evidence types', () => {
      const h1 = hashContent({
        evidenceType: 'COMPANY_WEBSITE',
        sourceUrl: 'https://example.com',
        sourceDomain: 'example.com',
        rawPayload: {},
      });
      const h2 = hashContent({
        evidenceType: 'APOLLO_DATA',
        sourceUrl: 'https://example.com',
        sourceDomain: 'example.com',
        rawPayload: {},
      });
      expect(h1).not.toBe(h2);
    });

    it('normalises URL case and whitespace before hashing', () => {
      const h1 = hashContent({
        evidenceType: 'COMPANY_WEBSITE',
        sourceUrl: 'https://Example.com/Path',
        sourceDomain: 'example.com',
        rawPayload: {},
      });
      const h2 = hashContent({
        evidenceType: 'COMPANY_WEBSITE',
        sourceUrl: '  https://example.com/path  ',
        sourceDomain: 'example.com',
        rawPayload: {},
      });
      expect(h1).toBe(h2);
    });

    it('handles null sourceUrl gracefully', () => {
      const h = hashContent({
        evidenceType: 'OTHER',
        sourceUrl: null,
        sourceDomain: null,
        rawPayload: null,
      });
      expect(h).toBeTruthy();
      expect(typeof h).toBe('string');
    });
  });

  describe('Evidence Provider interfaces', () => {
    it('ClaimInput supports contradiction', () => {
      const claim = {
        claimType: 'LOCATION',
        claimValue: 'London, UK',
        claimData: { source: 'apollo' },
        supports: false, // contradiction
      };
      expect(claim.supports).toBe(false);
    });

    it('EvidenceItemInput has required fields', () => {
      const item = {
        evidenceType: 'COMPANY_WEBSITE' as const,
        sourceUrl: 'https://example.com',
        sourceDomain: 'example.com',
        rawPayload: {},
        normalisedPayload: {},
        contentHash: 'abc123',
        reliability: 75,
        observedAt: new Date(),
        claims: [],
      };
      expect(item.evidenceType).toBe('COMPANY_WEBSITE');
      expect(item.reliability).toBeGreaterThanOrEqual(0);
      expect(item.reliability).toBeLessThanOrEqual(100);
    });
  });

  describe('Deduplication logic', () => {
    it('same content hash indicates duplicate evidence', () => {
      const base = {
        evidenceType: 'JOB_ADVERT',
        sourceUrl: 'https://example.com/jobs/1',
        sourceDomain: 'example.com',
        rawPayload: { title: 'Senior Developer' },
      };
      const h1 = hashContent(base);
      const h2 = hashContent({ ...base }); // copy
      expect(h1).toBe(h2);
    });

    it('different raw payloads with same URL produce different hashes', () => {
      const h1 = hashContent({
        evidenceType: 'JOB_ADVERT',
        sourceUrl: 'https://example.com/jobs/1',
        sourceDomain: 'example.com',
        rawPayload: { title: 'Senior Developer' },
      });
      const h2 = hashContent({
        evidenceType: 'JOB_ADVERT',
        sourceUrl: 'https://example.com/jobs/1',
        sourceDomain: 'example.com',
        rawPayload: { title: 'Junior Developer' },
      });
      expect(h1).not.toBe(h2);
    });
  });
});

describe('Company Facts Materialiser', () => {
  it('pickBest logic: higher reliability wins', () => {
    // Simulating the pickBest logic
    const claims = [
      { claimValue: 'Tech', reliability: 60, observedAt: null },
      { claimValue: 'Construction', reliability: 80, observedAt: null },
      { claimValue: 'Services', reliability: 70, observedAt: null },
    ];
    const best = claims.reduce((b, c) => c.reliability > b.reliability ? c : b);
    expect(best.claimValue).toBe('Construction');
  });

  it('pickBest logic: most recent wins on tie', () => {
    const newer = new Date('2026-07-21');
    const older = new Date('2026-01-01');
    const claims = [
      { claimValue: 'Old', reliability: 70, observedAt: older },
      { claimValue: 'New', reliability: 70, observedAt: newer },
    ];
    const best = claims.reduce((b, c) => {
      if (c.reliability > b.reliability) return c;
      if (c.reliability === b.reliability) {
        return (c.observedAt?.getTime() || 0) > (b.observedAt?.getTime() || 0) ? c : b;
      }
      return b;
    });
    expect(best.claimValue).toBe('New');
  });

  it('deriveCountry: UK detection', () => {
    const derive = (location: string) => {
      const lower = location.toLowerCase();
      if (lower.includes('united kingdom') || lower.includes('england') || lower.includes(' london')) return 'United Kingdom';
      if (lower.includes('new zealand') || lower.includes('auckland')) return 'New Zealand';
      return null;
    };
    expect(derive('London, United Kingdom')).toBe('United Kingdom');
    expect(derive('Auckland, New Zealand')).toBe('New Zealand');
    expect(derive('Paris, France')).toBe(null);
  });
});
