/**
 * Discovery Scan Handler v2
 *
 * Phase 1+4 fixes:
 * - Tracks actual requests sent (not just query count)
 * - Provider runs record actual attempts, response codes, errors
 * - A provider with zero successful requests is FAILED, not COMPLETED
 * - If all providers fail or zero requests succeed, scan is FAILED
 * - Passes provider-specific plans (Apollo filters, Brave queries)
 */

import { prisma } from '@/lib/prisma';
import { runner, type JobHandler } from '@/lib/v2/job-runner';
import { getDiscoveryProviders, type CandidateReference } from '@/lib/v2/discovery-providers';
import { resolveCompany } from '@/lib/v2/identity-resolution';
import { calculateProfileScore } from '@/lib/v2/profile-scorer';
import { normalizeCompany } from '@/lib/pipeline/intelligence';

export const discoveryScanHandler: JobHandler = {
  type: 'discovery-scan',
  async execute(jobId, payload, updateProgress) {
    const { scanId, tenantId } = payload as { scanId: number; tenantId: number };

    const scan = await prisma.discoveryScan.findUnique({
      where: { id: scanId },
      include: { strategy: true },
    });
    if (!scan) throw new Error(`Scan ${scanId} not found`);
    if (!scan.strategy) throw new Error(`Strategy not found for scan ${scanId}`);

    const strategy = scan.strategy;

    // Update scan status
    await prisma.discoveryScan.update({
      where: { id: scanId },
      data: { status: 'DISCOVERING', startedAt: new Date(), progress: 5 },
    });

    updateProgress(5, 'Starting discovery...');

    // Get API keys
    const braveKey = process.env.BRAVE_API_KEY || '';
    const apolloKey = process.env.APOLLO_API_KEY || '';

    const providers = getDiscoveryProviders({ brave: braveKey, apollo: apolloKey });

    if (!providers.length) {
      await prisma.discoveryScan.update({
        where: { id: scanId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: 'No discovery providers available — check API keys',
        },
      });
      throw new Error('No discovery providers available — check API keys');
    }

    // Parse queries from strategy
    const queries = Array.isArray(strategy.queries) ? strategy.queries : JSON.parse(strategy.queries as string || '[]');

    if (!queries.length) {
      await prisma.discoveryScan.update({
        where: { id: scanId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: 'Strategy has zero queries — cannot perform discovery',
        },
      });
      throw new Error('Strategy has zero queries — cannot perform discovery');
    }

    // Extract provider plans from scoringConfig (stored by compiler v2)
    const scoringConfig = (strategy.scoringConfig as any) || {};
    const providerPlans = scoringConfig.providerPlans || {};
    const bravePlan = providerPlans.brave || null;
    const apolloPlan = providerPlans.apollo || null;

    // Use Brave plan queries if available (they have family metadata), else fall back to flat queries
    const braveQueries = bravePlan?.queries || queries;

    const allCandidates: CandidateReference[] = [];
    let providerIndex = 0;
    let totalSuccessfulRequests = 0;
    let totalFailedProviders = 0;
    const providerResults: { name: string; status: string; requests: number; results: number; error?: string }[] = [];

    for (const provider of providers) {
      providerIndex++;
      const progressBase = 10 + (providerIndex - 1) * 30;

      // Create provider run record
      const providerRun = await prisma.providerRun.create({
        data: {
          scanId,
          provider: provider.name,
          providerVersion: 'v2',
          role: 'discovery',
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      try {
        updateProgress(progressBase, `Running ${provider.name} discovery...`);

        const opts: any = {
          country: strategy.country,
          stateProvince: strategy.stateProvince || undefined,
          city: strategy.city || undefined,
          apiKey: provider.name === 'brave' ? braveKey : apolloKey,
          maxResults: 25,
        };

        // Pass provider-specific plans
        if (provider.name === 'apollo' && apolloPlan) {
          opts.apolloFilters = apolloPlan.filters || [];
          opts.apolloPerPage = apolloPlan.perPage || 25;
          opts.apolloMaxPages = apolloPlan.maxPages || 4;
        }

        const result = await provider.discover(braveQueries, opts);

        const candidates = result.candidates;
        const actualRequests = result.requestCount;
        const responseCodes = result.responseCodes;
        const errors = result.errors;

        // Deduplicate within this provider's results
        const seen = new Set<string>();
        const unique = candidates.filter(c => {
          const key = (c.domain || normalizeCompany(c.name)).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        allCandidates.push(...unique);

        // Determine provider status
        const hasErrors = errors.length > 0;
        const hasSuccess = actualRequests > 0;
        let providerStatus: string;

        if (!hasSuccess && hasErrors) {
          providerStatus = 'FAILED';
          totalFailedProviders++;
        } else if (hasSuccess && hasErrors) {
          providerStatus = 'PARTIAL';
        } else {
          providerStatus = 'COMPLETED';
        }

        if (hasSuccess) totalSuccessfulRequests += actualRequests;

        await prisma.providerRun.update({
          where: { id: providerRun.id },
          data: {
            status: providerStatus,
            completedAt: new Date(),
            attempts: actualRequests,
            requestCount: actualRequests,
            resultCount: unique.length,
            errorMessage: hasErrors ? errors.join('; ') : null,
          },
        });

        providerResults.push({
          name: provider.name,
          status: providerStatus,
          requests: actualRequests,
          results: unique.length,
          error: hasErrors ? errors.join('; ') : undefined,
        });

        updateProgress(progressBase + 25, `${provider.name}: ${unique.length} candidates (${actualRequests} requests, ${providerStatus})`);

      } catch (e: any) {
        totalFailedProviders++;
        await prisma.providerRun.update({
          where: { id: providerRun.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: e.message,
          },
        });

        providerResults.push({
          name: provider.name,
          status: 'FAILED',
          requests: 0,
          results: 0,
          error: e.message,
        });
      }
    }

    // If all providers failed or zero requests succeeded, mark scan as FAILED
    if (totalSuccessfulRequests === 0) {
      const failureSummary = providerResults
        .map(p => `${p.name}: ${p.status}${p.error ? ` (${p.error})` : ''}`)
        .join('; ');

      await prisma.discoveryScan.update({
        where: { id: scanId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: `All providers failed or made zero requests. ${failureSummary}`,
        },
      });

      throw new Error(`Scan failed — all providers made zero successful requests. ${failureSummary}`);
    }

    // Deduplicate across providers
    updateProgress(70, 'Resolving company identities...');
    const seenCompanies = new Set<number>();
    let newCount = 0;
    let totalCount = 0;

    for (const candidate of allCandidates) {
      const resolved = await resolveCompany(candidate, tenantId);

      if (seenCompanies.has(resolved.companyId)) continue;
      seenCompanies.add(resolved.companyId);
      totalCount++;

      if (resolved.isNew) newCount++;

      const strategyKeywords = {
        keywords: strategy.keywords || [],
        industries: extractFromStrategy(strategy, 'industries'),
        technologies: extractFromStrategy(strategy, 'technologies'),
        hiringSignals: extractFromStrategy(strategy, 'hiringSignals'),
        operationalCharacteristics: extractFromStrategy(strategy, 'operationalCharacteristics'),
        companySizeMin: null,
        companySizeMax: null,
        locations: [strategy.country, strategy.stateProvince, strategy.city].filter(Boolean) as string[],
        exclusions: strategy.exclusionFilters || [],
      };

      const scoreResult = calculateProfileScore(
        {
          name: candidate.name,
          website: candidate.website,
          domain: candidate.domain,
          country: candidate.country,
          location: candidate.location,
          industry: candidate.industry,
          employeeCount: candidate.employeeCount,
        },
        strategyKeywords
      );

      if (scoreResult.excluded) continue;

      await prisma.scanCandidate.create({
        data: {
          scanId,
          companyId: resolved.companyId,
          discoveryProvider: candidate.sourceProvider,
          discoveryQuery: candidate.sourceQuery,
          discoveryUrl: candidate.sourceUrl,
          profileScore: scoreResult.score,
          profileScoreBreakdown: scoreResult.breakdown as any,
        },
      }).catch(() => {});
    }

    updateProgress(90, 'Finalizing...');

    await prisma.discoveryScan.update({
      where: { id: scanId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        candidateCount: totalCount,
        newCompanies: newCount,
        completedAt: new Date(),
        errorMessage: totalFailedProviders > 0
          ? `Completed with ${totalFailedProviders} failed provider(s): ${providerResults.filter(p => p.status === 'FAILED').map(p => p.name).join(', ')}`
          : null,
      },
    });

    updateProgress(100, `Discovery complete: ${totalCount} candidates, ${newCount} new`);

    return { candidateCount: totalCount, newCompanies: newCount, providerResults };
  },
};

function extractFromStrategy(strategy: any, field: string): string[] {
  if (field === 'industries') {
    const filter = (strategy.inclusionFilters as string[])?.find(f => f.startsWith('Industry in:'));
    if (filter) return filter.replace('Industry in:', '').split(',').map(s => s.trim());
  }
  if (field === 'technologies') {
    const filter = (strategy.inclusionFilters as string[])?.find(f => f.startsWith('Technologies:'));
    if (filter) return filter.replace('Technologies:', '').split(',').map(s => s.trim());
  }
  if (field === 'hiringSignals') {
    const queries = Array.isArray(strategy.queries) ? strategy.queries : [];
    return queries
      .filter((q: any) => q.type === 'hiring')
      .map((q: any) => {
        const match = q.query?.match(/hiring "([^"]+)"/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
  }
  if (field === 'operationalCharacteristics') return [];
  return [];
}

runner.register(discoveryScanHandler);
