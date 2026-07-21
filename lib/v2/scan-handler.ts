/**
 * Discovery Scan Handler
 * Registered with the JobRunner. Executes discovery providers,
 * resolves company identities, calculates Profile Scores, and
 * persists ScanCandidates.
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
      throw new Error('No discovery providers available — check API keys');
    }

    // Parse queries from strategy (stored as JSON)
    const queries = Array.isArray(strategy.queries) ? strategy.queries : JSON.parse(strategy.queries as string || '[]');

    const allCandidates: CandidateReference[] = [];
    let providerIndex = 0;

    for (const provider of providers) {
      providerIndex++;
      const progressBase = 10 + (providerIndex - 1) * 30;

      // Create provider run record
      const providerRun = await prisma.providerRun.create({
        data: {
          scanId,
          provider: provider.name,
          providerVersion: 'v1',
          role: 'discovery',
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      try {
        updateProgress(progressBase, `Running ${provider.name} discovery...`);

        const opts = {
          country: strategy.country,
          stateProvince: strategy.stateProvince || undefined,
          city: strategy.city || undefined,
          apiKey: provider.name === 'brave' ? braveKey : apolloKey,
          maxResults: 25,
        };

        const candidates = await provider.discover(queries, opts);

        // Deduplicate within this provider's results
        const seen = new Set<string>();
        const unique = candidates.filter(c => {
          const key = (c.domain || normalizeCompany(c.name)).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        allCandidates.push(...unique);

        await prisma.providerRun.update({
          where: { id: providerRun.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            requestCount: queries.length,
            resultCount: unique.length,
          },
        });

        updateProgress(progressBase + 25, `${provider.name}: ${unique.length} candidates found`);

      } catch (e: any) {
        await prisma.providerRun.update({
          where: { id: providerRun.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: e.message,
          },
        });
      }
    }

    // Deduplicate across providers
    updateProgress(70, 'Resolving company identities...');
    const seenCompanies = new Set<number>();
    let newCount = 0;
    let totalCount = 0;

    for (const candidate of allCandidates) {
      const resolved = await resolveCompany(candidate, tenantId);

      // Skip if already a candidate in this scan
      if (seenCompanies.has(resolved.companyId)) continue;
      seenCompanies.add(resolved.companyId);
      totalCount++;

      if (resolved.isNew) newCount++;

      // Calculate Profile Score
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

      // Skip excluded candidates
      if (scoreResult.excluded) continue;

      // Create ScanCandidate
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
      }).catch(() => {}); // ignore duplicate (company already in scan)
    }

    // Update scan with counts
    updateProgress(90, 'Finalizing...');
    await prisma.discoveryScan.update({
      where: { id: scanId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        candidateCount: totalCount,
        newCompanies: newCount,
        completedAt: new Date(),
      },
    });

    updateProgress(100, `Discovery complete: ${totalCount} candidates, ${newCount} new`);

    return { candidateCount: totalCount, newCompanies: newCount };
  },
};

// Helper to extract arrays from strategy JSON fields
function extractFromStrategy(strategy: any, field: string): string[] {
  // These come from the compiled strategy stored in inclusionFilters or keywords
  if (field === 'industries') {
    const filter = (strategy.inclusionFilters as string[])?.find(f => f.startsWith('Industry in:'));
    if (filter) return filter.replace('Industry in:', '').split(',').map(s => s.trim());
  }
  if (field === 'technologies') {
    const filter = (strategy.inclusionFilters as string[])?.find(f => f.startsWith('Technologies:'));
    if (filter) return filter.replace('Technologies:', '').split(',').map(s => s.trim());
  }
  if (field === 'hiringSignals') {
    // Hiring signals are encoded in queries of type 'hiring'
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

// Register handler
runner.register(discoveryScanHandler);
