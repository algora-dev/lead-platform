/**
 * Multi-Source Scan Pipeline
 *
 * Flow:
 * 1. Collect from all selected sources (Brave, Apollo, etc.)
 * 2. Deduplicate across sources
 * 3. Enrich missing data (Apollo enrichment, OpenAI classification)
 * 4. Score using per-scan scoring rules
 * 5. Save to database with source attribution
 *
 * Rescan behavior:
 * - Only adds NEW companies not already in the batch
 * - Re-checks existing companies and flags score changes as "UPDATED"
 * - Does not touch companies the user has already actioned
 */

import { prisma } from '@/lib/prisma';
import { getAvailableSources, getSource, deduplicateResults, type ScanResult, type ScanContext } from '@/lib/sources/registry';
import { enrichWithApollo } from '@/lib/sources/apollo-enrich';
import { enrichWithOpenAI } from '@/lib/sources/openai-enrich';
import { parseJob, canonicalise } from '@/lib/pipeline/parser';
import { taskSignals, advertScore, normalizeCompany, companyScore } from '@/lib/pipeline/intelligence';
import { SCORING as DEFAULT_SCORING } from '@/lib/pipeline/config';
import type { ScanProfileConfig } from '@/lib/pipeline/scan-profile';

export interface MultiSourceScanStats {
  sourcesUsed: string[];
  totalResults: number;
  deduplicated: number;
  newCompanies: number;
  existingCompanies: number;
  updatedCompanies: number;
  enrichmentCalls: number;
  errors: number;
}

export interface MultiSourceScanOptions {
  scanName: string;
  scanArea: string;
  sources: string[];
  profileConfig: ScanProfileConfig;
  tenantId: number;
  userId?: string;
  userName?: string;
  batchId?: number;
  leadsParentId?: number;
  isRescan?: boolean;
  rescanBatchId?: number;
}

export async function runMultiSourceScan(opts: MultiSourceScanOptions): Promise<{
  message: string;
  stats: MultiSourceScanStats;
  batchId: number;
  scanRunId: number;
}> {
  const stats: MultiSourceScanStats = {
    sourcesUsed: [],
    totalResults: 0,
    deduplicated: 0,
    newCompanies: 0,
    existingCompanies: 0,
    updatedCompanies: 0,
    enrichmentCalls: 0,
    errors: 0,
  };

  // Build scan context
  const ctx: ScanContext = {
    scanArea: opts.scanArea,
    keywords: opts.profileConfig.brave.queryPairs.map(([a, b]) => `${a} ${b}`),
    queryPairs: opts.profileConfig.brave.queryPairs,
    negativeTerms: opts.profileConfig.brave.negativeTerms || [],
    jobTerms: opts.profileConfig.jobTerms,
    resultsPerPage: opts.profileConfig.brave.resultsPerPage || 20,
    queryLimit: opts.profileConfig.brave.defaultQueryLimit || 16,
    freshness: opts.profileConfig.brave.freshness || 'pm',
    tenantId: opts.tenantId,
  };

  // Determine available sources
  const requestedSources = opts.sources.length > 0 ? opts.sources : ['brave'];
  const availableSources = getAvailableSources();
  const sourcesToUse = requestedSources
    .map(id => getSource(id))
    .filter((s): s is NonNullable<typeof s> => !!s && s.isAvailable());

  stats.sourcesUsed = sourcesToUse.map(s => s.id);

  if (sourcesToUse.length === 0) {
    throw new Error('No scan sources are available. Check API keys in .env.local');
  }

  // Create or use batch
  let batchId = opts.batchId;
  if (!batchId) {
    const batch = await prisma.batch.create({
      data: {
        name: opts.scanName,
        tenantId: opts.tenantId,
        scanArea: opts.scanArea,
        createdBy: opts.userName || undefined,
        originalScanDate: new Date(),
        lastScanDate: new Date(),
        leadsParentId: opts.leadsParentId,
      },
    });
    batchId = batch.id;
  } else {
    // Update last scan date on existing batch
    await prisma.batch.update({
      where: { id: batchId },
      data: { lastScanDate: new Date() },
    });
  }

  // Create scan run record
  const scanRun = await prisma.scanRun.create({
    data: {
      source: stats.sourcesUsed.join(','),
      scanArea: opts.scanArea,
      status: 'RUNNING',
      tenantId: opts.tenantId,
      batchId,
      isRescan: opts.isRescan || false,
    },
  });

  try {
    // --- PHASE 1: COLLECT ---
    let allResults: ScanResult[] = [];

    for (const source of sourcesToUse) {
      try {
        console.log(`[scan] Running source: ${source.name}`);
        const results = await source.scan(ctx);
        allResults = allResults.concat(results);
        stats.totalResults += results.length;
      } catch (e) {
        console.error(`[scan] Source ${source.name} failed:`, e);
        stats.errors++;
      }
    }

    // --- PHASE 2: DEDUPLICATE ---
    const deduped = deduplicateResults(allResults);
    stats.deduplicated = allResults.length - deduped.length;

    // --- PHASE 3: ENRICH + SAVE ---
    const touchedCompanyIds = new Set<number>();
    const actionedStatuses = ['CONTACTED', 'FOLLOW_UP', 'MEETING', 'ASSESSMENT', 'WON', 'PASSED', 'NOT_INTERESTED', 'NO_RESPONSE'];

    for (const result of deduped) {
      try {
        const norm = normalizeCompany(result.companyName);
        const country = result.country || opts.scanArea;

        // Check if company already exists in this tenant
        let company = await prisma.company.findFirst({
          where: { normalizedName: norm, country, tenantId: opts.tenantId },
        });

        // Check if already in this batch
        let alreadyInBatch = false;
        if (company) {
          const batchCompany = await prisma.company.findFirst({
            where: { id: company.id, batches: { some: { id: batchId } } },
          });
          alreadyInBatch = !!batchCompany;
        }

        // Enrichment: fill missing data
        let enriched: { website?: string; email?: string; phone?: string; employeeCount?: number; employeeRange?: string; industry?: string; } = {};

        // Apollo enrichment if missing critical data
        if (!company || (!company.email && !company.phone) || !company.employeeCount) {
          const apolloData = await enrichWithApollo(result.companyName, result.website || company?.website || undefined);
          stats.enrichmentCalls++;
          if (apolloData) {
            enriched = { ...apolloData };
          }
        }

        // OpenAI enrichment if no industry/summary
        if (!company || !company.industry) {
          const openaiData = await enrichWithOpenAI(result.companyName, result.rawText || '', opts.profileConfig.taskGroups);
          stats.enrichmentCalls++;
          if (openaiData) {
            enriched.industry = enriched.industry || openaiData.industry;
            enriched.email = enriched.email || openaiData.contacts?.email;
            enriched.phone = enriched.phone || openaiData.contacts?.phone;
          }
        }

        // Create company if new
        if (!company) {
          company = await prisma.company.create({
            data: {
              name: result.companyName,
              normalizedName: norm,
              country,
              location: result.location,
              website: result.website || enriched.website,
              email: result.email || enriched.email,
              phone: result.phone || enriched.phone,
              industry: result.industry || enriched.industry,
              employeeCount: result.employeeCount || enriched.employeeCount,
              employeeRange: result.employeeRange || enriched.employeeRange,
              tenantId: opts.tenantId,
            },
          });
          stats.newCompanies++;
        } else {
          // Update existing company with any new enrichment data
          const updates: Record<string, unknown> = { lastSeenAt: new Date() };
          if (!company.website && enriched.website) updates.website = enriched.website;
          if (!company.email && enriched.email) updates.email = enriched.email;
          if (!company.phone && enriched.phone) updates.phone = enriched.phone;
          if (!company.employeeCount && enriched.employeeCount) updates.employeeCount = enriched.employeeCount;
          if (!company.employeeRange && enriched.employeeRange) updates.employeeRange = enriched.employeeRange;
          if (!company.industry && enriched.industry) updates.industry = enriched.industry;

          if (Object.keys(updates).length > 1) {
            await prisma.company.update({ where: { id: company.id }, data: updates });
          }
        }

        // Link to batch
        if (!alreadyInBatch) {
          await prisma.company.update({
            where: { id: company.id },
            data: { batches: { connect: { id: batchId } } },
          });
        }

        // Create flag for new leads
        if (!alreadyInBatch) {
          await prisma.scanLeadFlag.create({
            data: {
              companyId: company.id,
              batchId,
              flagType: 'NEW',
              newScore: company.opportunityScore,
            },
          }).catch(() => { /* unique constraint - already flagged */ });
        }

        touchedCompanyIds.add(company.id);

        // Parse and save job advert if from Brave (URL-based source)
        if (result.source.includes('brave') && result.sourceUrl) {
          const url = canonicalise(result.sourceUrl);
          const existing = await prisma.jobAdvert.findFirst({
            where: { OR: [{ canonicalUrl: url }, { sourceUrl: url }], company: { tenantId: opts.tenantId } },
          });

          if (!existing) {
            const page = await parseJob(url).catch(() => null);
            if (page && page.company) {
              const signals = taskSignals(page.description, opts.profileConfig.taskGroups);
              if (signals.length > 0) {
                await prisma.jobAdvert.create({
                  data: {
                    companyId: company.id,
                    title: page.title || 'Job advert',
                    country,
                    location: page.location,
                    salaryText: page.salary_text,
                    annualSalaryHigh: page.salary_high,
                    source: 'BRAVE',
                    sourceUrl: page.url,
                    canonicalUrl: page.url,
                    discoveryQuery: result.discoveryQuery,
                    description: page.description,
                    taskSignals: signals.join(', '),
                    advertScore: advertScore(signals, { ...DEFAULT_SCORING, ...opts.profileConfig.scoring }),
                    isActive: true,
                  },
                });
              }
            }
          } else {
            // Update last seen
            await prisma.jobAdvert.update({
              where: { id: existing.id },
              data: { lastSeenAt: new Date(), isActive: true },
            });
          }
        }
      } catch (e) {
        console.error(`[scan] Failed to process result for ${result.companyName}:`, e);
        stats.errors++;
      }
    }

    // --- PHASE 4: SCORE ---
    const scoring = { ...DEFAULT_SCORING, ...opts.profileConfig.scoring };

    for (const cid of touchedCompanyIds) {
      const comp = await prisma.company.findUnique({ where: { id: cid } });
      if (!comp) continue;

      const oldScore = comp.opportunityScore;
      const jobs = await prisma.jobAdvert.findMany({
        where: { companyId: cid, isActive: true },
      });

      const jobsForScoring = jobs.map(j => ({
        signals: (j.taskSignals || '').split(',').map(s => s.trim()).filter(Boolean),
        salary_high: j.annualSalaryHigh,
      }));

      const { total, reason, recurring, summary, salary } = companyScore(
        jobsForScoring,
        comp.email,
        comp.phone,
        comp.employeeCount,
        scoring
      );

      await prisma.company.update({
        where: { id: cid },
        data: {
          activeJobCount: jobs.length,
          totalJobCount: await prisma.jobAdvert.count({ where: { companyId: cid } }),
          estimatedSalarySpend: salary,
          opportunityScore: total,
          scoreReason: reason,
          recurringTasks: recurring,
          opportunitySummary: summary,
          lastSeenAt: new Date(),
        },
      });

      // Flag updated scores on rescan (only if not actioned)
      if (opts.isRescan && oldScore !== total && !actionedStatuses.includes(comp.status)) {
        stats.updatedCompanies++;

        // Remove old UPDATED flag if exists, then create new one
        await prisma.scanLeadFlag.deleteMany({
          where: { companyId: cid, batchId, flagType: 'UPDATED' },
        });

        await prisma.scanLeadFlag.create({
          data: {
            companyId: cid,
            batchId,
            flagType: 'UPDATED',
            previousScore: oldScore,
            newScore: total,
          },
        });
      }
    }

    // Update scan run record
    const message = `Scanned ${stats.totalResults} results from ${stats.sourcesUsed.join(', ')}. ${stats.newCompanies} new, ${stats.updatedCompanies} updated.`;

    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        completedAt: new Date(),
        status: 'COMPLETED',
        resultsFound: stats.totalResults,
        companiesCreated: stats.newCompanies,
        companiesUpdated: stats.updatedCompanies,
        newCompanies: stats.newCompanies,
        updatedCompanies: stats.updatedCompanies,
        errors: stats.errors,
        message,
      },
    });

    return { message, stats, batchId, scanRunId: scanRun.id };
  } catch (e: any) {
    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        completedAt: new Date(),
        status: 'FAILED',
        errors: stats.errors + 1,
        message: e.message,
      },
    });
    throw e;
  }
}
