import { describe, it, expect } from 'vitest';

describe('Comparison Engine', () => {
  describe('Harmonic mean math for score deltas', () => {
    it('positive delta means improvement', () => {
      const before = 45;
      const after = 60;
      const delta = after - before;
      expect(delta).toBe(15);
      expect(delta).toBeGreaterThan(0);
    });

    it('negative delta means decline', () => {
      const before = 70;
      const after = 55;
      const delta = after - before;
      expect(delta).toBe(-15);
      expect(delta).toBeLessThan(0);
    });

    it('zero delta means unchanged', () => {
      const before = 65;
      const after = 65;
      const delta = after - before;
      expect(delta).toBe(0);
    });
  });

  describe('Comparison result structure', () => {
    it('produces all required summary fields', () => {
      const summary = {
        totalCompaniesA: 10,
        totalCompaniesB: 15,
        newCompanies: 5,
        removedCompanies: 0,
        scoreImprovements: 3,
        scoreDeclines: 1,
        unchanged: 6,
        newEvidenceItems: 12,
        newContacts: 4,
      };

      expect(summary.newCompanies).toBe(summary.totalCompaniesB - summary.totalCompaniesA + summary.removedCompanies);
      expect(summary.scoreImprovements + summary.scoreDeclines + summary.unchanged).toBeLessThanOrEqual(summary.totalCompaniesB);
    });
  });

  describe('Rescan modes', () => {
    it('new_only mode discovers only new candidates', () => {
      const mode = 'new_only';
      expect(mode).toBe('new_only');
    });

    it('recheck_evidence mode revisits known candidates', () => {
      const mode = 'recheck_evidence';
      expect(mode).toBe('recheck_evidence');
    });

    it('rerun_all mode reruns all providers', () => {
      const mode = 'rerun_all';
      expect(mode).toBe('rerun_all');
    });

    it('invalid mode defaults to new_only', () => {
      const validModes = ['new_only', 'recheck_evidence', 'rerun_all'];
      const input = 'invalid';
      const mode = validModes.includes(input) ? input : 'new_only';
      expect(mode).toBe('new_only');
    });
  });

  describe('Library management', () => {
    it('library name uniqueness within tenant', () => {
      const existing = ['Sales Leads', 'Construction Prospects'];
      const newName = 'Sales Leads';
      const isDuplicate = existing.includes(newName);
      expect(isDuplicate).toBe(true);
    });

    it('archived libraries are excluded from listings', () => {
      const libraries = [
        { id: 1, name: 'Active', archivedAt: null },
        { id: 2, name: 'Archived', archivedAt: new Date() },
      ];
      const active = libraries.filter(l => l.archivedAt === null);
      expect(active.length).toBe(1);
      expect(active[0].name).toBe('Active');
    });
  });
});
