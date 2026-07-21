/**
 * GET /api/v2/companies/[id]/evidence
 * Returns all evidence items and claims for a company.
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tid = getTenantId(session);
  const companyId = parseInt(id);

  // Verify company belongs to tenant
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: tid },
    select: {
      id: true,
      name: true,
      website: true,
      domain: true,
      country: true,
      industry: true,
      location: true,
      employeeCount: true,
      employeeRange: true,
      materialisedFacts: true,
    },
  });

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const evidenceItems = await prisma.evidenceItem.findMany({
    where: { companyId },
    include: {
      claims: {
        orderBy: { claimType: 'asc' },
      },
    },
    orderBy: { collectedAt: 'desc' },
  });

  // Group claims by type for summary
  const claimsByType: Record<string, any[]> = {};
  for (const item of evidenceItems) {
    for (const claim of item.claims) {
      if (!claimsByType[claim.claimType]) claimsByType[claim.claimType] = [];
      claimsByType[claim.claimType].push({
        value: claim.claimValue,
        data: claim.claimData,
        supports: claim.supports,
        source: {
          evidenceType: item.evidenceType,
          sourceUrl: item.sourceUrl,
          sourceDomain: item.sourceDomain,
          reliability: item.reliability,
          observedAt: item.observedAt,
        },
      });
    }
  }

  return NextResponse.json({
    company,
    evidenceItems,
    claimsByType,
    materialisedFacts: company.materialisedFacts,
  });
}
