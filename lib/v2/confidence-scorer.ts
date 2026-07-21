/**
 * Confidence Scorer
 *
 * Calculates the Confidence Score for a company after evidence gathering.
 * Answers: "How strongly does reliable, recent and independent evidence
 * support this opportunity assessment?"
 *
 * Rules:
 *  - Range: 0-100.
 *  - Measures support for the assessment, not simply the amount of data.
 *  - Considers coverage, reliability, independence, freshness, consistency.
 *  - Copies of the same underlying source do not count as independent.
 *  - Missing evidence remains unknown, not automatically negative.
 *  - Direct contradictions are shown and reduce confidence.
 *  - Every contribution links to supporting Evidence Items.
 *  - Frozen within its Assessment Snapshot.
 *
 * Deterministic arithmetic — NO AI involved in score calculation.
 */

import { prisma } from '@/lib/prisma';

export interface ConfidenceBreakdownComponent {
  criterionId: string;
  label: string;
  description: string;
  maxPoints: number;
  awardedPoints: number;
  evidenceItemIds: number[];
  explanation: string;
}

export interface ConfidenceResult {
  score: number; // 0-100
  breakdown: ConfidenceBreakdownComponent[];
  contradictions: string[];
  unknowns: string[];
  evidenceItemIds: number[];
}

export interface ConfidencePolicy {
  version: string;
  weights: {
    coverage: number;      // max 30 — how many claim types are covered
    reliability: number;   // max 25 — average reliability of sources
    independence: number;  // max 20 — unique source domains
    freshness: number;     // max 15 — recency of observations
    consistency: number;   // max 10 — lack of contradictions
  };
}

// Default policy v1
export const DEFAULT_CONFIDENCE_POLICY: ConfidencePolicy = {
  version: 'v1',
  weights: {
    coverage: 30,
    reliability: 25,
    independence: 20,
    freshness: 15,
    consistency: 10,
  },
};

/**
 * Calculate confidence score for a company in a scan.
 */
export async function calculateConfidenceScore(
  companyId: number,
  scanId: number,
  policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY
): Promise<ConfidenceResult> {
  const evidenceItems = await prisma.evidenceItem.findMany({
    where: { companyId, scanId },
    include: {
      claims: true,
    },
  });

  if (!evidenceItems.length) {
    return {
      score: 0,
      breakdown: [{
        criterionId: 'no-evidence',
        label: 'No Evidence',
        description: 'No evidence items collected for this company in this scan.',
        maxPoints: 100,
        awardedPoints: 0,
        evidenceItemIds: [],
        explanation: 'No evidence was collected. Confidence is zero.',
      }],
      contradictions: [],
      unknowns: ['No evidence collected — all claim types are unknown.'],
      evidenceItemIds: [],
    };
  }

  const breakdown: ConfidenceBreakdownComponent[] = [];
  const allEvidenceIds = evidenceItems.map(e => e.id);

  // --- 1. Coverage (max 30) ---
  // How many distinct claim types have evidence?
  const claimTypesCovered = new Set<string>();
  for (const item of evidenceItems) {
    for (const claim of item.claims) {
      claimTypesCovered.add(claim.claimType);
    }
  }
  // Expected claim types for a well-assessed company
  const expectedTypes = ['INDUSTRY', 'LOCATION', 'EMPLOYEE_COUNT', 'TECHNOLOGY', 'CONTACT_INFO', 'OPERATIONAL_ACTIVITY', 'JOB_ADVERT'];
  const coveredCount = expectedTypes.filter(t => claimTypesCovered.has(t)).length;
  const coverageRatio = coveredCount / expectedTypes.length;
  const coveragePoints = Math.round(coverageRatio * policy.weights.coverage);

  breakdown.push({
    criterionId: 'coverage',
    label: 'Evidence Coverage',
    description: `How many evidence types are covered (${coveredCount}/${expectedTypes.length} expected types)`,
    maxPoints: policy.weights.coverage,
    awardedPoints: coveragePoints,
    evidenceItemIds: allEvidenceIds,
    explanation: `Found evidence for ${coveredCount} of ${expectedTypes.length} expected claim types: ${[...claimTypesCovered].join(', ')}.`,
  });

  // --- 2. Reliability (max 25) ---
  // Average reliability of evidence sources, weighted by number of claims
  let totalReliabilityWeight = 0;
  let totalClaims = 0;
  for (const item of evidenceItems) {
    const claimCount = item.claims.length || 1;
    totalReliabilityWeight += item.reliability * claimCount;
    totalClaims += claimCount;
  }
  const avgReliability = totalClaims > 0 ? totalReliabilityWeight / totalClaims : 0;
  const reliabilityPoints = Math.round((avgReliability / 100) * policy.weights.reliability);

  breakdown.push({
    criterionId: 'reliability',
    label: 'Source Reliability',
    description: `Average reliability of evidence sources (weighted by claims)`,
    maxPoints: policy.weights.reliability,
    awardedPoints: reliabilityPoints,
    evidenceItemIds: allEvidenceIds,
    explanation: `Average reliability: ${Math.round(avgReliability)}/100 across ${totalClaims} claims from ${evidenceItems.length} sources.`,
  });

  // --- 3. Independence (max 20) ---
  // Unique source domains — syndicated duplicates don't count
  const sourceDomains = new Set<string>();
  for (const item of evidenceItems) {
    if (item.sourceDomain) sourceDomains.add(item.sourceDomain);
    else if (item.evidenceType === 'APOLLO_DATA') sourceDomains.add('apollo.io');
    else if (item.evidenceType === 'COMPANY_WEBSITE' && !item.sourceDomain) sourceDomains.add('company-website');
  }
  const uniqueDomains = sourceDomains.size;
  // 1 domain = 5 pts, 2 = 10, 3 = 15, 4+ = 20
  const independencePoints = Math.min(policy.weights.independence, uniqueDomains * 5);

  breakdown.push({
    criterionId: 'independence',
    label: 'Source Independence',
    description: `Number of independent source domains providing evidence`,
    maxPoints: policy.weights.independence,
    awardedPoints: independencePoints,
    evidenceItemIds: allEvidenceIds,
    explanation: `${uniqueDomains} independent source domain(s): ${[...sourceDomains].join(', ')}.`,
  });

  // --- 4. Freshness (max 15) ---
  // Recency of observations (based on observedAt or collectedAt)
  const now = Date.now();
  let freshnessScore = 0;
  let countedItems = 0;
  for (const item of evidenceItems) {
    const date = item.observedAt || item.collectedAt;
    if (!date) continue;
    const ageDays = Math.max(0, (now - date.getTime()) / (1000 * 60 * 60 * 24));
    // Freshness scoring: 0 days = 100%, 30 days = 80%, 90 days = 50%, 365 days = 10%
    let itemFreshness: number;
    if (ageDays <= 7) itemFreshness = 100;
    else if (ageDays <= 30) itemFreshness = 80;
    else if (ageDays <= 90) itemFreshness = 50;
    else if (ageDays <= 365) itemFreshness = 20;
    else itemFreshness = 5;
    freshnessScore += itemFreshness;
    countedItems++;
  }
  const avgFreshness = countedItems > 0 ? freshnessScore / countedItems : 0;
  const freshnessPoints = Math.round((avgFreshness / 100) * policy.weights.freshness);

  breakdown.push({
    criterionId: 'freshness',
    label: 'Evidence Freshness',
    description: 'How recently evidence was observed',
    maxPoints: policy.weights.freshness,
    awardedPoints: freshnessPoints,
    evidenceItemIds: allEvidenceIds,
    explanation: `Average freshness: ${Math.round(avgFreshness)}% (${countedItems} items with observation dates).`,
  });

  // --- 5. Consistency (max 10) ---
  // Detect contradictions — claims that don't support
  const contradictions: string[] = [];
  const unsupportingClaims = evidenceItems.flatMap(item =>
    item.claims.filter(c => !c.supports).map(c => ({
      type: c.claimType,
      value: c.claimValue,
      source: item.sourceDomain || item.evidenceType,
    }))
  );

  for (const c of unsupportingClaims) {
    contradictions.push(`${c.type} contradiction from ${c.source}: ${c.value}`);
  }

  // Also detect conflicting values for the same claim type
  const claimsByType = new Map<string, Set<string>>();
  for (const item of evidenceItems) {
    for (const claim of item.claims) {
      if (!claim.supports) continue;
      const set = claimsByType.get(claim.claimType) || new Set();
      set.add(claim.claimValue.toLowerCase());
      claimsByType.set(claim.claimType, set);
    }
  }
  for (const [type, values] of claimsByType) {
    if (values.size > 3) {
      contradictions.push(`${type}: ${values.size} different values observed — potential inconsistency.`);
    }
  }

  const consistencyPoints = Math.max(0, policy.weights.consistency - contradictions.length * 2);

  breakdown.push({
    criterionId: 'consistency',
    label: 'Evidence Consistency',
    description: 'Lack of contradictions across evidence sources',
    maxPoints: policy.weights.consistency,
    awardedPoints: consistencyPoints,
    evidenceItemIds: allEvidenceIds,
    explanation: contradictions.length === 0
      ? 'No contradictions detected across evidence sources.'
      : `${contradictions.length} contradiction(s) detected: ${contradictions.slice(0, 3).join('; ')}.`,
  });

  // --- Unknowns ---
  const unknowns: string[] = [];
  for (const expected of expectedTypes) {
    if (!claimTypesCovered.has(expected)) {
      unknowns.push(`No ${expected.toLowerCase().replace(/_/g, ' ')} evidence collected — status unknown.`);
    }
  }

  // --- Total ---
  const total = breakdown.reduce((sum, b) => sum + b.awardedPoints, 0);
  const score = Math.min(100, Math.max(0, total));

  return {
    score,
    breakdown,
    contradictions,
    unknowns,
    evidenceItemIds: allEvidenceIds,
  };
}
