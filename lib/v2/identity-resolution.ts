/**
 * Identity Resolution
 * Resolves candidate references to existing or new Company records.
 * Priority: verified domain → trusted provider ID → legal ID → normalised name + geography.
 * See ADR-0003.
 */

import { prisma } from '@/lib/prisma';
import { normalizeCompany } from '@/lib/pipeline/intelligence';

export interface ResolvedCompany {
  companyId: number;
  isNew: boolean;
  matchMethod: 'domain' | 'provider_id' | 'name_geo' | 'new';
}

export async function resolveCompany(
  candidate: {
    name: string;
    website?: string | null;
    domain?: string | null;
    country?: string | null;
    providerId?: string | null;
    sourceProvider?: string;
  },
  tenantId: number
): Promise<ResolvedCompany> {
  const normalizedName = normalizeCompany(candidate.name);
  const country = candidate.country || null;

  // 1. Try domain match (strongest signal)
  if (candidate.domain) {
    const existing = await prisma.company.findFirst({
      where: {
        tenantId,
        website: { contains: candidate.domain },
      },
      select: { id: true },
    });
    if (existing) {
      return { companyId: existing.id, isNew: false, matchMethod: 'domain' };
    }
  }

  // Also try matching domain against website field with www prefix
  if (candidate.domain) {
    const existing = await prisma.company.findFirst({
      where: {
        tenantId,
        OR: [
          { website: { contains: candidate.domain } },
          { website: { contains: `www.${candidate.domain}` } },
          { website: { contains: `https://${candidate.domain}` } },
          { website: { contains: `http://${candidate.domain}` } },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      return { companyId: existing.id, isNew: false, matchMethod: 'domain' };
    }
  }

  // 2. Try provider ID match
  if (candidate.providerId && candidate.sourceProvider) {
    const existing = await prisma.companyProviderIdentity.findFirst({
      where: {
        provider: candidate.sourceProvider,
        providerId: candidate.providerId,
        company: { tenantId },
      },
      select: { companyId: true },
    });
    if (existing) {
      return { companyId: existing.companyId, isNew: false, matchMethod: 'provider_id' };
    }
  }

  // 3. Try normalised name + country (weak signal)
  if (normalizedName && normalizedName !== 'unknown') {
    const existing = await prisma.company.findFirst({
      where: {
        tenantId,
        normalizedName,
        ...(country ? { country } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      return { companyId: existing.id, isNew: false, matchMethod: 'name_geo' };
    }
  }

  // 4. Create new company
  // Extract domain from website if not already provided
  let domain = candidate.domain;
  if (!domain && candidate.website) {
    try { domain = new URL(candidate.website).hostname.replace(/^www\./, ''); } catch {}
  }

  const company = await prisma.company.create({
    data: {
      name: candidate.name,
      normalizedName,
      country: country || 'Unknown',
      website: candidate.website || null,
      domain: domain || null,
      tenantId,
    },
  });

  // Store provider identity if available
  if (candidate.providerId && candidate.sourceProvider) {
    await prisma.companyProviderIdentity.create({
      data: {
        companyId: company.id,
        provider: candidate.sourceProvider,
        providerId: candidate.providerId,
      },
    }).catch(() => {}); // ignore duplicate errors
  }

  // Store alias
  if (candidate.name && candidate.name !== company.name) {
    await prisma.companyAlias.create({
      data: {
        companyId: company.id,
        alias: candidate.name,
        source: candidate.sourceProvider || null,
      },
    }).catch(() => {});
  }

  return { companyId: company.id, isNew: true, matchMethod: 'new' };
}
