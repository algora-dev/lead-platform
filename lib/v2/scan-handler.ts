/**
 * Discovery Scan Handler v2/v3
 *
 * v3 changes:
 * - Uses strategy.finalQueries (broad) if available, falls back to v2 queries
 * - Aggregates all provider candidates per company before scoring (not score after each dedup)
 * - Uses keyword-scorer (v3) if strategy.finalKeywords exists, falls back to profile-scorer (v2)
 * - Stores discoveryData snapshot on ScanCandidate
 * - Stores keywordMatches on ScanCandidate
 */

import { prisma } from '@/lib/prisma';
import { runner, type JobHandler } from '@/lib/v2/job-runner';
import { getDiscoveryProviders, type CandidateReference } from '@/lib/v2/discovery-providers';
import { resolveCompany } from '@/lib/v2/identity-resolution';
import { calculateProfileScore } from '@/lib/v2/profile-scorer';
import { scoreCandidate, type CandidateData, type ScoringKeyword } from '@/lib/v3/keyword-scorer';
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

    // Determine if this is a v3 strategy (has finalKeywords)
    const isV3 = strategy.finalKeywords && Array.isArray(strategy.finalKeywords) && strategy.finalKeywords.length > 0;
    const finalKeywords = isV3 ? (strategy.finalKeywords as unknown as ScoringKeyword[]) : null;
    const scoreThreshold = strategy.scoreThreshold ?? 0;

    // Determine which queries to use
    let queries: any[];
    if (isV3 && strategy.finalQueries && strategy.finalQueries.length > 0) {
      // v3: use broad queries from confirmed assessment
      queries = strategy.finalQueries.map(q => ({ query: q, type: 'keyword', rationale: 'v3 broad query' }));
    } else {
      // v2 fallback: use compiled queries
      queries = Array.isArray(strategy.queries) ? strategy.queries : JSON.parse(strategy.queries as string || '[]');
    }

    // Update scan status
    await prisma.discoveryScan.update({
      where: { id: scanId },
      data: { status: 'DISCOVERING', startedAt: new Date(), progress: 5 },
    });

    updateProgress(5, `Starting discovery${isV3 ? ' (v3)' : ''}...`);

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

    // Use Brave plan queries if available (they have family metadata), else use flat queries
    // For v3, we override with broad queries
    const braveQueries = isV3 ? queries : (bravePlan?.queries || queries);

    // Collect ALL candidates from all providers first (v3: aggregate before scoring)
    const allCandidates: CandidateReference[] = [];
    let providerIndex = 0;
    let totalSuccessfulRequests = 0;
    let totalFailedProviders = 0;
    const providerResults: { name: string; status: string; requests: number; results: number; error?: string }[] = [];

    for (const provider of providers) {
      providerIndex++;
      const progressBase = 10 + (providerIndex - 1) * 30;

      const providerRun = await prisma.providerRun.create({
        data: {
          scanId,
          provider: provider.name,
          providerVersion: isV3 ? 'v3' : 'v2',
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
          maxResults: isV3 ? 25 : 25, // v3 wants more results from broad queries
        };

        if (provider.name === 'apollo' && apolloPlan && !isV3) {
          opts.apolloFilters = apolloPlan.filters || [];
          opts.apolloPerPage = apolloPlan.perPage || 25;
          opts.apolloMaxPages = apolloPlan.maxPages || 4;
        }

        // For v3 with Apollo, build filters from broad queries
        if (provider.name === 'apollo' && isV3) {
          const geoStr = [strategy.city, strategy.stateProvince, strategy.country].filter(Boolean).join(', ');
          opts.apolloFilters = queries.slice(0, 5).map((q: any) => ({
            keyword: q.query.split(' ')[0] || q.query,
            organizationLocations: [strategy.city, strategy.stateProvince, strategy.country].filter(Boolean),
            rationale: q.rationale || 'v3 broad query',
          }));
          opts.apolloPerPage = 25;
          opts.apolloMaxPages = 4;
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

    // ==========================================
    // v3: Aggregate candidates per company before scoring
    // ==========================================
    updateProgress(70, 'Resolving company identities...');

    // Group candidates by resolved company ID
    const companyCandidatesMap = new Map<number, { candidate: CandidateReference; companyId: number; isNew: boolean }>();
    let newCount = 0;

    for (const candidate of allCandidates) {
      const resolved = await resolveCompany(candidate, tenantId);

      // Keep the first candidate for each company (primary source)
      if (!companyCandidatesMap.has(resolved.companyId)) {
        companyCandidatesMap.set(resolved.companyId, { candidate, companyId: resolved.companyId, isNew: resolved.isNew });
        if (resolved.isNew) newCount++;
      } else {
        // Merge additional data into existing candidate's rawPayload
        const existing = companyCandidatesMap.get(resolved.companyId)!;
        // Enrich: if the existing candidate has no description but this one does, use it
        if (!existing.candidate.rawPayload && candidate.rawPayload) {
          existing.candidate.rawPayload = candidate.rawPayload;
        }
      }
    }

    // Score and persist candidates
    let totalCount = 0;
    for (const { candidate, companyId, isNew } of companyCandidatesMap.values()) {
      totalCount++;

      let profileScore = 0;
      let profileScoreBreakdown: any = null;
      let keywordMatches: any = null;
      let excluded = false;

      if (isV3 && finalKeywords) {
        // v3: keyword-based scoring
        const candidateData: CandidateData = {
          name: candidate.name,
          domain: candidate.domain || null,
          website: candidate.website || null,
          description: candidate.rawPayload?.description || candidate.rawPayload?.snippet || null,
          industry: candidate.industry || null,
          location: candidate.location || candidate.country || null,
          employeeRange: candidate.employeeRange || null,
          rawPayload: candidate.rawPayload || null,
        };

        const scoreResult = scoreCandidate(finalKeywords, candidateData, 0); // threshold=0, we store all
        profileScore = scoreResult.score;
        keywordMatches = scoreResult.matches;
        profileScoreBreakdown = {
          matches: scoreResult.matches,
          maxScore: scoreResult.maxScore,
        };
      } else {
        // v2 fallback: category-based scoring
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
        profileScore = scoreResult.score;
        profileScoreBreakdown = scoreResult.breakdown;
      }

      // Build discoveryData snapshot (bounded)
      const discoveryData = {
        provider: candidate.sourceProvider,
        query: candidate.sourceQuery,
        url: candidate.sourceUrl,
        title: candidate.rawPayload?.title || null,
        description: candidate.rawPayload?.description || null,
        industry: candidate.industry || null,
        employeeCount: candidate.employeeCount || null,
        employeeRange: candidate.employeeRange || null,
        location: candidate.location || candidate.country || null,
      };

      await prisma.scanCandidate.create({
        data: {
          scanId,
          companyId,
          discoveryProvider: candidate.sourceProvider,
          discoveryQuery: candidate.sourceQuery,
          discoveryUrl: candidate.sourceUrl,
          profileScore,
          profileScoreBreakdown: profileScoreBreakdown as any,
          discoveryData: discoveryData as any,
          keywordMatches: keywordMatches as any,
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
