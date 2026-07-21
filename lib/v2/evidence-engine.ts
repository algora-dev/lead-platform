/**
 * Evidence Engine
 *
 * Orchestrates evidence gathering for scan candidates. Schedules providers
 * according to strategy evidence priorities and budgets, persists immutable
 * EvidenceItems and EvidenceClaims, deduplicates by content hash, records
 * freshness/reliability/independence, and triggers fact materialisation.
 *
 * This is the post-discovery phase of a scan. It does NOT run discovery —
 * it investigates companies already discovered.
 */

import { prisma } from '@/lib/prisma';
import {
  getEvidenceProviders,
  type EvidenceProvider,
  type EvidenceItemInput,
  type EvidenceCompanyInput,
  type ClaimInput,
} from '@/lib/v2/evidence-providers';
import { materialiseCompanyFacts } from '@/lib/v2/company-facts';

export interface EvidenceEngineResult {
  totalItems: number;
  totalClaims: number;
  deduplicatedItems: number;
  providersRun: number;
  errors: string[];
}

/**
 * Run evidence gathering for all candidates in a scan.
 * Called after discovery completes (from scan-handler or API route).
 */
export async function runEvidenceEngine(
  scanId: number,
  tenantId: number,
  updateProgress?: (progress: number, message: string) => void
): Promise<EvidenceEngineResult> {
  const scan = await prisma.discoveryScan.findUnique({
    where: { id: scanId },
    include: {
      strategy: true,
      candidates: {
        include: { company: true },
        orderBy: { profileScore: 'desc' },
      },
    },
  });

  if (!scan) throw new Error(`Scan ${scanId} not found`);
  if (!scan.strategy) throw new Error(`Strategy not found for scan ${scanId}`);

  // Parse evidence priorities from strategy
  const evidencePriorities = Array.isArray(scan.strategy.evidencePriorities)
    ? scan.strategy.evidencePriorities
    : JSON.parse(scan.strategy.evidencePriorities as string || '[]');

  const braveKey = process.env.BRAVE_API_KEY || '';
  const apolloKey = process.env.APOLLO_API_KEY || '';
  const providers = getEvidenceProviders({ brave: braveKey, apollo: apolloKey });

  if (!providers.length) {
    return { totalItems: 0, totalClaims: 0, deduplicatedItems: 0, providersRun: 0, errors: ['No evidence providers available'] };
  }

  // Update scan status
  await prisma.discoveryScan.update({
    where: { id: scanId },
    data: { status: 'EVIDENCE_GATHERING', progress: 5 },
  });

  updateProgress?.(5, `Starting evidence gathering for ${scan.candidates.length} candidates...`);

  let totalItems = 0;
  let totalClaims = 0;
  let deduplicatedItems = 0;
  const errors: string[] = [];
  const candidatesProcessed = scan.candidates.length;
  let candidatesDone = 0;

  for (const candidate of scan.candidates) {
    const company = candidate.company;
    const companyInput: EvidenceCompanyInput = {
      id: company.id,
      name: company.name,
      website: company.website || null,
      domain: company.domain || null,
      country: company.country || null,
      location: company.location || null,
      industry: company.industry || null,
    };

    // Create a provider run record for evidence gathering (one per company)
    const providerRun = await prisma.providerRun.create({
      data: {
        scanId,
        provider: 'evidence-batch',
        providerVersion: 'v1',
        role: 'evidence',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    let companyItems = 0;
    let providerErrors = 0;

    for (const provider of providers) {
      try {
        const items = await provider.gather(companyInput, {
          apiKey: provider.name === 'apollo' ? apolloKey : braveKey,
          strategyEvidencePriorities: evidencePriorities,
          maxItemsPerProvider: 5,
        });

        for (const item of items) {
          // Deduplicate by content hash — skip if we've already seen this exact evidence
          const existing = await prisma.evidenceItem.findFirst({
            where: {
              companyId: company.id,
              evidenceType: item.evidenceType,
              sourceUrl: item.sourceUrl,
            },
            select: { id: true, contentHash: true },
          });

          if (existing) {
            deduplicatedItems++;
            continue;
          }

          // Persist EvidenceItem
          const evidenceItem = await prisma.evidenceItem.create({
            data: {
              companyId: company.id,
              scanId,
              providerRunId: providerRun.id,
              evidenceType: item.evidenceType,
              sourceUrl: item.sourceUrl,
              sourceDomain: item.sourceDomain,
              rawPayload: item.rawPayload,
              contentHash: item.contentHash,
              normalisedPayload: item.normalisedPayload,
              reliability: item.reliability,
              freshnessDays: computeFreshnessDays(item.observedAt),
              observedAt: item.observedAt,
              collectedAt: new Date(),
            },
          });

          totalItems++;
          companyItems++;

          // Persist EvidenceClaims
          for (const claim of item.claims) {
            try {
              await prisma.evidenceClaim.create({
                data: {
                  evidenceItemId: evidenceItem.id,
                  companyId: company.id,
                  claimType: claim.claimType as any,
                  claimValue: claim.claimValue,
                  claimData: claim.claimData || undefined,
                  supports: claim.supports,
                  contradictions: [],
                },
              });
              totalClaims++;
            } catch {
              // Duplicate claim (same evidenceItem + type + value) — skip
            }
          }
        }
      } catch (e: any) {
        providerErrors++;
        errors.push(`${provider.name} error for ${company.name}: ${e.message}`);
      }
    }

    await prisma.providerRun.update({
      where: { id: providerRun.id },
      data: {
        status: providerErrors === providers.length ? 'FAILED' : 'COMPLETED',
        completedAt: new Date(),
        requestCount: providers.length,
        resultCount: companyItems,
        errorMessage: providerErrors === providers.length ? 'All providers failed' : null,
      },
    });

    // Materialise company facts from collected evidence
    if (companyItems > 0) {
      try {
        await materialiseCompanyFacts(company.id);
      } catch (e: any) {
        errors.push(`Fact materialisation error for ${company.name}: ${e.message}`);
      }
    }

    // Mark candidate as evidence gathered
    await prisma.scanCandidate.update({
      where: { id: candidate.id },
      data: { evidenceGathered: true },
    });

    candidatesDone++;
    const progress = Math.round(5 + (candidatesDone / candidatesProcessed) * 90);
    updateProgress?.(progress, `Evidence: ${candidatesDone}/${candidatesProcessed} companies processed`);
  }

  // Update scan status
  await prisma.discoveryScan.update({
    where: { id: scanId },
    data: {
      status: 'EVIDENCE_COMPLETE',
      progress: 100,
    },
  });

  updateProgress?.(100, `Evidence complete: ${totalItems} items, ${totalClaims} claims, ${deduplicatedItems} duplicates skipped`);

  return {
    totalItems,
    totalClaims,
    deduplicatedItems,
    providersRun: providers.length,
    errors,
  };
}

/**
 * Compute freshness in days from observed date to now.
 */
function computeFreshnessDays(observedAt: Date | null): number | null {
  if (!observedAt) return null;
  const diffMs = Date.now() - observedAt.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}
