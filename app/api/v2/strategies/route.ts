import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { compileStrategy, type StrategyInput } from '@/lib/v2/strategy-compiler';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const strategies = await prisma.discoveryStrategy.findMany({
    where: { tenantId: getTenantId(session) },
    orderBy: { createdAt: 'desc' },
    include: {
      scans: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, name: true, status: true, createdAt: true } },
    },
  });

  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    productProfileVersionIds = [],
    customerProfileVersionIds = [],
    country,
    stateProvince,
    county,
    city,
    radiusKm,
    name,
  } = body as StrategyInput & { name?: string };

  if (!productProfileVersionIds.length) {
    return NextResponse.json({ error: 'At least one product profile version is required' }, { status: 400 });
  }
  if (!customerProfileVersionIds.length) {
    return NextResponse.json({ error: 'At least one customer profile version is required' }, { status: 400 });
  }
  if (!country?.trim()) {
    return NextResponse.json({ error: 'country is required' }, { status: 400 });
  }

  // Fetch the selected profile versions (verify tenant ownership)
  const tid = getTenantId(session);

  const productVersions = await prisma.productProfileVersion.findMany({
    where: {
      id: { in: productProfileVersionIds },
      profile: { tenantId: tid },
    },
    include: { profile: { select: { name: true } } },
  });

  const customerVersions = await prisma.customerProfileVersion.findMany({
    where: {
      id: { in: customerProfileVersionIds },
      profile: { tenantId: tid },
    },
    include: { profile: { select: { name: true } } },
  });

  if (productVersions.length !== productProfileVersionIds.length) {
    return NextResponse.json({ error: 'One or more product profile versions not found' }, { status: 404 });
  }
  if (customerVersions.length !== customerProfileVersionIds.length) {
    return NextResponse.json({ error: 'One or more customer profile versions not found' }, { status: 404 });
  }

  // Compile the strategy
  const compiled = compileStrategy(productVersions, customerVersions, {
    country,
    stateProvince,
    county,
    city,
    radiusKm,
  });

  const strategyName = name?.trim() || compiled.defaultName;

  const strategy = await prisma.discoveryStrategy.create({
    data: {
      tenantId: tid,
      productProfileVersionIds,
      customerProfileVersionIds,
      queries: compiled.queries as any,
      keywords: compiled.keywords,
      inclusionFilters: compiled.inclusionFilters,
      exclusionFilters: compiled.exclusionFilters,
      evidencePriorities: compiled.evidencePriorities,
      enrichmentPriorities: compiled.enrichmentPriorities,
      country,
      stateProvince: stateProvince?.trim() || null,
      county: county?.trim() || null,
      city: city?.trim() || null,
      radiusKm: radiusKm ?? null,
      scoringPolicyVersion: 'v1',
      scoringConfig: compiled.scoringConfig,
    },
  });

  return NextResponse.json(strategy, { status: 201 });
}
