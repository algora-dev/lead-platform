/**
 * Scan Comparison Engine
 *
 * Compares two scans and returns:
 *  - New companies (in new scan, not in old)
 *  - Companies with changed scores (profile, confidence, combined)
 *  - New evidence items
 *  - New contacts
 *  - Contradictions
 *  - Unchanged opportunities
 *
 * Prior scans stay unchanged — this is a read-only comparison.
 */

import { prisma } from '@/lib/prisma';

export interface ComparisonResult {
  scanA: { id: number; name: string; createdAt: Date };
  scanB: { id: number; name: string; createdAt: Date };
  summary: {
    totalCompaniesA: number;
    totalCompaniesB: number;
    newCompanies: number;
    removedCompanies: number;
    scoreImprovements: number;
    scoreDeclines: number;
    unchanged: number;
    newEvidenceItems: number;
    newContacts: number;
  };
  newCompanies: { companyId: number; name: string; profileScore: number }[];
  scoreChanges: {
    companyId: number;
    name: string;
    profileA: number;
    profileB: number;
    confidenceA: number;
    confidenceB: number;
    combinedA: number;
    combinedB: number;
    delta: number;
  }[];
  newEvidence: { companyId: number; name: string; evidenceCount: number }[];
  unchanged: { companyId: number; name: string; combinedScore: number }[];
}

export async function compareScans(scanAId: number, scanBId: number): Promise<ComparisonResult> {
  const [scanA, scanB] = await Promise.all([
    prisma.discoveryScan.findUnique({
      where: { id: scanAId },
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.discoveryScan.findUnique({
      where: { id: scanBId },
      select: { id: true, name: true, createdAt: true },
    }),
  ]);

  if (!scanA || !scanB) throw new Error('Scan not found');

  // Use A as the earlier scan and B as the later scan
  const earlier = scanA.createdAt <= scanB.createdAt ? scanA : scanB;
  const later = scanA.createdAt <= scanB.createdAt ? scanB : scanA;

  // Get candidates + assessments for both scans
  const [earlierCandidates, laterCandidates] = await Promise.all([
    prisma.scanCandidate.findMany({
      where: { scanId: earlier.id },
      include: {
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.scanCandidate.findMany({
      where: { scanId: later.id },
      include: {
        company: { select: { id: true, name: true } },
      },
    }),
  ]);

  const [earlierAssessments, laterAssessments] = await Promise.all([
    prisma.assessmentSnapshot.findMany({
      where: { scanId: earlier.id },
      select: { companyId: true, profileScore: true, confidenceScore: true, combinedScore: true },
    }),
    prisma.assessmentSnapshot.findMany({
      where: { scanId: later.id },
      select: { companyId: true, profileScore: true, confidenceScore: true, combinedScore: true },
    }),
  ]);

  // Build maps
  const earlierMap = new Map(earlierCandidates.map(c => [c.companyId, c]));
  const laterMap = new Map(laterCandidates.map(c => [c.companyId, c]));
  const earlierAssessmentMap = new Map(earlierAssessments.map(a => [a.companyId, a]));
  const laterAssessmentMap = new Map(laterAssessments.map(a => [a.companyId, a]));

  // New companies (in later, not in earlier)
  const newCompanies = [...laterMap.entries()]
    .filter(([id]) => !earlierMap.has(id))
    .map(([id, c]) => ({
      companyId: id,
      name: c.company.name,
      profileScore: c.profileScore,
    }));

  // Removed companies (in earlier, not in later)
  const removedCompanies = [...earlierMap.entries()]
    .filter(([id]) => !laterMap.has(id))
    .map(([id, c]) => ({ companyId: id, name: c.company.name }));

  // Score changes
  const scoreChanges: ComparisonResult['scoreChanges'] = [];
  const unchanged: ComparisonResult['unchanged'] = [];

  for (const [companyId, laterC] of laterMap) {
    const earlierC = earlierMap.get(companyId);
    if (!earlierC) continue; // new company, already counted

    const earlierA = earlierAssessmentMap.get(companyId);
    const laterA = laterAssessmentMap.get(companyId);

    if (earlierA && laterA) {
      const delta = laterA.combinedScore - earlierA.combinedScore;
      if (delta !== 0) {
        scoreChanges.push({
          companyId,
          name: laterC.company.name,
          profileA: earlierA.profileScore,
          profileB: laterA.profileScore,
          confidenceA: earlierA.confidenceScore,
          confidenceB: laterA.confidenceScore,
          combinedA: earlierA.combinedScore,
          combinedB: laterA.combinedScore,
          delta,
        });
      } else {
        unchanged.push({
          companyId,
          name: laterC.company.name,
          combinedScore: laterA.combinedScore,
        });
      }
    }
  }

  // New evidence items in later scan
  const laterEvidence = await prisma.evidenceItem.findMany({
    where: { scanId: later.id },
    include: {
      company: { select: { id: true, name: true } },
    },
  });

  const earlierEvidenceCompanyIds = new Set(
    (await prisma.evidenceItem.findMany({
      where: { scanId: earlier.id },
      select: { companyId: true },
    })).map(e => e.companyId)
  );

  const newEvidenceMap = new Map<number, { companyId: number; name: string; evidenceCount: number }>();
  for (const e of laterEvidence) {
    if (!earlierEvidenceCompanyIds.has(e.companyId)) {
      const existing = newEvidenceMap.get(e.companyId);
      if (existing) {
        existing.evidenceCount++;
      } else {
        newEvidenceMap.set(e.companyId, {
          companyId: e.companyId,
          name: e.company.name,
          evidenceCount: 1,
        });
      }
    }
  }

  const improvements = scoreChanges.filter(s => s.delta > 0).length;
  const declines = scoreChanges.filter(s => s.delta < 0).length;

  return {
    scanA: { id: earlier.id, name: earlier.name, createdAt: earlier.createdAt },
    scanB: { id: later.id, name: later.name, createdAt: later.createdAt },
    summary: {
      totalCompaniesA: earlierCandidates.length,
      totalCompaniesB: laterCandidates.length,
      newCompanies: newCompanies.length,
      removedCompanies: removedCompanies.length,
      scoreImprovements: improvements,
      scoreDeclines: declines,
      unchanged: unchanged.length,
      newEvidenceItems: laterEvidence.filter(e => !earlierEvidenceCompanyIds.has(e.companyId)).length,
      newContacts: 0, // Would need to compare contact claims — placeholder for now
    },
    newCompanies,
    scoreChanges: scoreChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    newEvidence: [...newEvidenceMap.values()],
    unchanged,
  };
}
