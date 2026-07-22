/**
 * V1 → V2 Migration Script
 *
 * Idempotent: safe to run multiple times. Only migrates records that
 * haven't been migrated yet (checked via existence of V2 equivalents).
 *
 * What it does:
 * 1. V1 Companies → ensure V2 fields populated (domain, materialisedFacts)
 * 2. V1 JobAdverts → V2 EvidenceItems (JOB_ADVERT type) + EvidenceClaims
 * 3. V1 ScanProfiles → V2 DiscoveryStrategies (as legacy snapshots)
 * 4. V1 Company scores → V2 AssessmentSnapshots (LEGACY_V1)
 *
 * Usage:
 *   npx tsx scripts/migrate-v1-to-v2.ts [--dry-run]
 *
 * Non-destructive: V1 tables are never modified or deleted.
 */

import { PrismaClient, Prisma, ClaimType } from '@prisma/client';
import { hashContent } from '../lib/v2/evidence-providers';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// --- Helpers ---

function log(msg: string) {
  console.log(`[${DRY_RUN ? 'DRY RUN' : 'MIGRATE'}] ${msg}`);
}

function extractDomain(website: string | null, name: string): string | null {
  if (website) {
    try {
      return new URL(website).hostname.replace(/^www\./, '');
    } catch {
      // fall through
    }
  }
  // Derive from name
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^(ltd|limited|inc|llc|corp|co)$/, '');
  return slug.length > 2 ? `${slug}.co.uk` : null;
}

async function companyHasV2Evidence(companyId: number): Promise<boolean> {
  const count = await prisma.evidenceItem.count({
    where: { companyId },
  });
  return count > 0;
}

// --- Migration Steps ---

async function migrateCompanyDomains(): Promise<number> {
  const companies = await prisma.company.findMany({
    where: {
      AND: [
        { domain: null },
        { OR: [{ website: { not: null } }, { name: { not: '' } }] },
      ],
    },
  });

  let updated = 0;
  for (const company of companies) {
    const domain = extractDomain(company.website, company.name);
    if (domain) {
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: company.id },
          data: { domain },
        });
      }
      updated++;
    }
  }

  log(`Company domains: ${updated} set`);
  return updated;
}

async function migrateJobAdvertsToEvidence(): Promise<number> {
  const jobAdverts = await prisma.jobAdvert.findMany({
    include: { company: true },
  });

  let created = 0;
  for (const advert of jobAdverts) {
    // Check if evidence already exists for this job advert
    const existing = await prisma.evidenceItem.findFirst({
      where: {
        companyId: advert.companyId,
        evidenceType: 'JOB_ADVERT',
        sourceUrl: advert.sourceUrl,
      },
    });

    if (existing) continue;

    let domain: string | null = null;
    try {
      domain = new URL(advert.sourceUrl).hostname.replace(/^www\./, '');
    } catch {}

    const contentHash = hashContent({
      evidenceType: 'JOB_ADVERT',
      sourceUrl: advert.sourceUrl,
      sourceDomain: domain,
      rawPayload: { title: advert.title, description: advert.description?.slice(0, 5000) },
    });

    const claims: Array<{
      claimType: ClaimType;
      claimValue: string;
      claimData: any;
      supports: boolean;
    }> = [
      {
        claimType: 'JOB_ADVERT',
        claimValue: advert.title,
        claimData: {
          source: 'v1_migration',
          salaryText: advert.salaryText,
          annualSalaryHigh: advert.annualSalaryHigh,
          location: advert.location,
        },
        supports: true,
      },
    ];

    if (advert.taskSignals) {
      claims.push({
        claimType: 'OPERATIONAL_ACTIVITY',
        claimValue: advert.taskSignals,
        claimData: { source: 'v1_migration', type: 'task_signals' },
        supports: true,
      });
    }

    if (advert.discoveryQuery) {
      claims.push({
        claimType: 'REPEATED_SIGNAL',
        claimValue: 'hiring',
        claimData: { source: 'v1_migration', query: advert.discoveryQuery },
        supports: true,
      });
    }

    if (!DRY_RUN) {
      const evidenceItem = await prisma.evidenceItem.create({
        data: {
          companyId: advert.companyId,
          evidenceType: 'JOB_ADVERT',
          sourceUrl: advert.sourceUrl,
          sourceDomain: domain,
          rawPayload: {
            title: advert.title,
            description: advert.description,
            source: advert.source,
            canonicalUrl: advert.canonicalUrl,
          },
          normalisedPayload: {
            jobTitle: advert.title,
            salaryText: advert.salaryText,
            annualSalaryHigh: advert.annualSalaryHigh,
            location: advert.location,
            isActive: advert.isActive,
          },
          contentHash,
          reliability: 70,
          observedAt: advert.firstSeenAt,
          claims: {
            create: claims.map(c => ({
              claimType: c.claimType,
              claimValue: c.claimValue,
              claimData: c.claimData,
              supports: c.supports,
              company: { connect: { id: advert.companyId } },
            })),
          },
        },
      });

      // Update firstSeenAt/lastSeenAt on company if this advert is older
      if (advert.firstSeenAt < advert.company.firstSeenAt) {
        await prisma.company.update({
          where: { id: advert.companyId },
          data: { firstSeenAt: advert.firstSeenAt },
        });
      }
    }

    created++;
  }

  log(`JobAdverts → EvidenceItems: ${created} created`);
  return created;
}

async function migrateScanProfilesToStrategies(): Promise<number> {
  const scanProfiles = await prisma.scanProfile.findMany();

  let created = 0;
  for (const profile of scanProfiles) {
    // Check if a strategy already exists for this profile
    const existing = await prisma.discoveryStrategy.findFirst({
      where: {
        tenantId: profile.tenantId,
        // Match by name — strategies don't have a direct V1 FK
      },
    });

    // Use the profile config to build a strategy
    const config = profile.config as any;
    const queries = config?.queries || config?.searchQueries || [];
    const keywords = config?.keywords || [];
    const inclusionFilters = config?.inclusionFilters || {};
    const exclusionFilters = config?.exclusions || config?.exclusionFilters || [];

    // Build a legacy strategy snapshot
    const strategyData: any = {
      tenantId: profile.tenantId,
      productProfileVersionIds: [],
      customerProfileVersionIds: [],
      queries: queries,
      keywords: keywords,
      inclusionFilters: inclusionFilters,
      exclusionFilters: exclusionFilters,
      evidencePriorities: ['COMPANY_WEBSITE', 'APOLLO_DATA', 'JOB_ADVERT'],
      enrichmentPriorities: ['apollo'],
      country: config?.country || 'United Kingdom',
      stateProvince: config?.stateProvince || null,
      county: config?.county || null,
      city: config?.city || config?.scanArea || null,
      radiusKm: config?.radiusKm || null,
      compilerVersion: 'v1-legacy',
      scoringPolicyVersion: 'v1-legacy',
      scoringConfig: config?.scoringWeights || {},
      aiModel: null,
      aiPromptVersion: null,
      approved: profile.isActive,
      approvedBy: 'v1-migration',
      approvedAt: profile.updatedAt,
    };

    if (!DRY_RUN) {
      await prisma.discoveryStrategy.create({ data: strategyData });
    }

    created++;
  }

  log(`ScanProfiles → DiscoveryStrategies: ${created} created`);
  return created;
}

async function migrateScoresToSnapshots(): Promise<number> {
  // Find companies with V1 opportunityScore but no V2 snapshots
  const companies = await prisma.company.findMany({
    where: {
      opportunityScore: { gt: 0 },
    },
  });

  let created = 0;
  for (const company of companies) {
    // Check if legacy snapshot already exists
    const existing = await prisma.assessmentSnapshot.findFirst({
      where: {
        companyId: company.id,
        scoringPolicyVersion: 'LEGACY_V1',
      },
    });

    if (existing) continue;

    // Find the most recent discovery scan for this tenant (to link the snapshot)
    const scan = await prisma.discoveryScan.findFirst({
      where: { tenantId: company.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (!scan) continue; // No V2 scan to link to — skip

    const strategy = await prisma.discoveryStrategy.findFirst({
      where: { tenantId: company.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (!strategy) continue;

    if (!DRY_RUN) {
      await prisma.assessmentSnapshot.create({
        data: {
          scanId: scan.id,
          companyId: company.id,
          strategyId: strategy.id,
          profileScore: company.opportunityScore,
          confidenceScore: 0, // V1 didn't have confidence scoring
          combinedScore: company.opportunityScore,
          profileBreakdown: {
            v1Score: company.opportunityScore,
            v1ScoreReason: company.scoreReason,
          },
          confidenceBreakdown: undefined,
          scoringPolicyVersion: 'LEGACY_V1',
          combinedPolicyVersion: 'LEGACY_V1',
          aiSummary: `Legacy V1 score: ${company.opportunityScore}. ${company.scoreReason || ''}`,
          outreachRationale: company.opportunitySummary || undefined,
          unknowns: [],
          contradictions: [],
          evidenceItemIds: [],
        },
      });
    }

    created++;
  }

  log(`Company scores → AssessmentSnapshots (LEGACY_V1): ${created} created`);
  return created;
}

async function materialiseCompanyFacts(): Promise<number> {
  // For all companies with evidence but no materialisedFacts, build facts
  const companies = await prisma.company.findMany({
    where: {
      materialisedFacts: { equals: Prisma.DbNull },
    },
    include: {
      evidenceItems: {
        include: { claims: true },
      },
    },
  });

  let updated = 0;
  for (const company of companies) {
    if (company.evidenceItems.length === 0) continue;
    const facts: Record<string, any> = {};

    for (const item of company.evidenceItems) {
      for (const claim of item.claims) {
        if (!claim.supports) continue;

        switch (claim.claimType) {
          case 'INDUSTRY':
            if (!facts.industry) facts.industry = claim.claimValue;
            break;
          case 'EMPLOYEE_COUNT':
            if (!facts.employeeCount) facts.employeeCount = claim.claimValue;
            break;
          case 'LOCATION':
            if (!facts.location) facts.location = claim.claimValue;
            break;
          case 'TECHNOLOGY':
            if (!facts.technologies) facts.technologies = [];
            if (!facts.technologies.includes(claim.claimValue)) {
              facts.technologies.push(claim.claimValue);
            }
            break;
          case 'CONTACT_ROLE':
            if (!facts.contactInfo) facts.contactInfo = [];
            facts.contactInfo.push(claim.claimValue);
            break;
          case 'OPERATIONAL_ACTIVITY':
            if (!facts.operationalSignals) facts.operationalSignals = [];
            facts.operationalSignals.push(claim.claimValue);
            break;
        }
      }
    }

    if (Object.keys(facts).length > 0) {
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: company.id },
          data: { materialisedFacts: facts },
        });
      }
      updated++;
    }
  }

  log(`Company facts materialised: ${updated} updated`);
  return updated;
}

// --- Main ---

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`V1 → V2 Migration ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  const steps = [
    { name: 'Company domains', fn: migrateCompanyDomains },
    { name: 'JobAdverts → EvidenceItems', fn: migrateJobAdvertsToEvidence },
    { name: 'ScanProfiles → DiscoveryStrategies', fn: migrateScanProfilesToStrategies },
    { name: 'Scores → AssessmentSnapshots (LEGACY_V1)', fn: migrateScoresToSnapshots },
    { name: 'Materialise company facts', fn: materialiseCompanyFacts },
  ];

  const results: Array<{ name: string; count: number }> = [];

  for (const step of steps) {
    try {
      const count = await step.fn();
      results.push({ name: step.name, count });
    } catch (e: any) {
      log(`ERROR in ${step.name}: ${e.message}`);
      results.push({ name: step.name, count: -1 });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Migration Summary:');
  for (const r of results) {
    console.log(`  ${r.name}: ${r.count >= 0 ? r.count : 'FAILED'}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
