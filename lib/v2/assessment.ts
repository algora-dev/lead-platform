/**
 * Combined Assessment
 *
 * Generates Assessment Snapshots combining Profile Score (from discovery)
 * and Confidence Score (from evidence) using a versioned harmonic mean policy.
 *
 * Also generates AI summary and outreach rationale via GPT-4o-mini.
 *
 * Deterministic arithmetic is NOT delegated to AI. AI only writes
 * natural-language summaries from the computed scores.
 */

import { prisma } from '@/lib/prisma';
import { calculateConfidenceScore, DEFAULT_CONFIDENCE_POLICY } from '@/lib/v2/confidence-scorer';

export interface CombinedPolicy {
  version: string;
  formula: 'harmonic_mean';
}

export const DEFAULT_COMBINED_POLICY: CombinedPolicy = {
  version: 'v1',
  formula: 'harmonic_mean',
};

/**
 * Harmonic mean of two values (0-100).
 * Returns 0 if either is 0.
 */
export function harmonicMean(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.round((2 * a * b) / (a + b));
}

/**
 * Generate an Assessment Snapshot for a company in a scan.
 * Reads the Profile Score from ScanCandidate, calculates Confidence Score,
 * computes Combined Score, and persists the snapshot.
 */
export async function generateAssessmentSnapshot(
  companyId: number,
  scanId: number,
  strategyId: number
): Promise<{ snapshotId: number; profileScore: number; confidenceScore: number; combinedScore: number }> {
  // Get the scan candidate (has Profile Score)
  const candidate = await prisma.scanCandidate.findFirst({
    where: { scanId, companyId },
  });

  if (!candidate) {
    throw new Error(`No ScanCandidate found for company ${companyId} in scan ${scanId}`);
  }

  const profileScore = candidate.profileScore;

  // Calculate Confidence Score
  const confidenceResult = await calculateConfidenceScore(companyId, scanId);

  // Calculate Combined Score (harmonic mean)
  const combinedScore = harmonicMean(profileScore, confidenceResult.score);

  // Check for prior snapshot (for comparison)
  const priorSnapshot = await prisma.assessmentSnapshot.findFirst({
    where: { companyId, scanId: { not: scanId } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, combinedScore: true },
  });

  const scoreChange = priorSnapshot ? combinedScore - priorSnapshot.combinedScore : null;

  // Generate AI summary and outreach rationale
  const aiResult = await generateAiSummary(companyId, scanId, profileScore, confidenceResult.score, combinedScore);

  // Persist Assessment Snapshot
  const snapshot = await prisma.assessmentSnapshot.create({
    data: {
      scanId,
      companyId,
      strategyId,
      profileScore,
      confidenceScore: confidenceResult.score,
      combinedScore,
      profileBreakdown: candidate.profileScoreBreakdown as any,
      confidenceBreakdown: confidenceResult.breakdown as any,
      scoringPolicyVersion: DEFAULT_CONFIDENCE_POLICY.version,
      combinedPolicyVersion: DEFAULT_COMBINED_POLICY.version,
      aiSummary: aiResult.summary,
      outreachRationale: aiResult.outreachRationale,
      unknowns: confidenceResult.unknowns,
      contradictions: confidenceResult.contradictions,
      evidenceItemIds: confidenceResult.evidenceItemIds,
      priorSnapshotId: priorSnapshot?.id || null,
      scoreChange,
    },
  });

  return {
    snapshotId: snapshot.id,
    profileScore,
    confidenceScore: confidenceResult.score,
    combinedScore,
  };
}

/**
 * Run assessment for all candidates in a scan.
 */
export async function runAssessmentForScan(
  scanId: number,
  updateProgress?: (progress: number, message: string) => void
): Promise<{ snapshots: number; errors: string[] }> {
  const scan = await prisma.discoveryScan.findUnique({
    where: { id: scanId },
    include: {
      candidates: { select: { companyId: true } },
      strategy: { select: { id: true } },
    },
  });

  if (!scan) throw new Error(`Scan ${scanId} not found`);

  await prisma.discoveryScan.update({
    where: { id: scanId },
    data: { status: 'SCORING', progress: 5 },
  });

  const errors: string[] = [];
  let snapshots = 0;
  const total = scan.candidates.length;

  for (let i = 0; i < scan.candidates.length; i++) {
    const { companyId } = scan.candidates[i];
    try {
      await generateAssessmentSnapshot(companyId, scanId, scan.strategy.id);
      snapshots++;
    } catch (e: any) {
      errors.push(`Company ${companyId}: ${e.message}`);
    }

    const progress = Math.round(5 + ((i + 1) / total) * 90);
    updateProgress?.(progress, `Assessing: ${i + 1}/${total} companies`);
  }

  await prisma.discoveryScan.update({
    where: { id: scanId },
    data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
  });

  updateProgress?.(100, `Assessment complete: ${snapshots} snapshots, ${errors.length} errors`);

  return { snapshots, errors };
}

/**
 * Generate AI summary and outreach rationale using GPT-4o-mini.
 * If AI fails, gracefully degrade — the scores are deterministic and
 * do not depend on AI.
 */
async function generateAiSummary(
  companyId: number,
  scanId: number,
  profileScore: number,
  confidenceScore: number,
  combinedScore: number
): Promise<{ summary: string; outreachRationale: string }> {
  // Fetch company + evidence summary for context
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true, industry: true, country: true, location: true,
      employeeRange: true, website: true, materialisedFacts: true,
    },
  });

  const evidenceCount = await prisma.evidenceItem.count({ where: { companyId, scanId } });
  const claimCount = await prisma.evidenceClaim.count({ where: { companyId } });

  const facts = (company?.materialisedFacts as any) || {};
  const technologies = facts.technologies?.values || [];
  const signals = facts.operationalSignals?.values || [];
  const jobs = facts.jobAdverts?.count || 0;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      summary: `${company?.name || 'Company'}: Profile ${profileScore}, Confidence ${confidenceScore}, Combined ${combinedScore}. ${evidenceCount} evidence items, ${claimCount} claims.`,
      outreachRationale: `Combined opportunity score of ${combinedScore}/100 based on Profile Score (${profileScore}) and Confidence Score (${confidenceScore}).`,
    };
  }

  const prompt = `Analyse this company as a sales opportunity. Write a concise summary (2-3 sentences) and an outreach rationale (2-3 sentences explaining why this company is worth contacting and what approach to use).

Company: ${company?.name}
Industry: ${company?.industry || 'Unknown'}
Location: ${company?.location || company?.country || 'Unknown'}
Size: ${company?.employeeRange || 'Unknown'}
Website: ${company?.website || 'None'}
Technologies: ${technologies.join(', ') || 'None detected'}
Operational signals: ${signals.join(', ') || 'None'}
Job adverts: ${jobs}

Scores:
- Profile Score: ${profileScore}/100 (how well they match the target profile)
- Confidence Score: ${confidenceScore}/100 (how strongly evidence supports this)
- Combined Score: ${combinedScore}/100 (harmonic mean)

Evidence: ${evidenceCount} items, ${claimCount} claims collected.

Respond as JSON: {"summary": "...", "outreachRationale": "..."}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in OpenAI response');

    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || '',
      outreachRationale: parsed.outreachRationale || '',
    };
  } catch {
    // Graceful degradation — scores are still valid
    return {
      summary: `${company?.name || 'Company'}: Profile ${profileScore}, Confidence ${confidenceScore}, Combined ${combinedScore}. ${evidenceCount} evidence items, ${claimCount} claims.`,
      outreachRationale: `Combined opportunity score of ${combinedScore}/100. Profile fit: ${profileScore}/100. Evidence strength: ${confidenceScore}/100.`,
    };
  }
}
