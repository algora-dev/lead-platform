import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { compileStrategy, type StrategyInput, COMPILER_VERSION } from '@/lib/v2/strategy-compiler';
import { validateStrategy } from '@/lib/v2/strategy-validator';
import { generateAssessment, AssessmentError } from '@/lib/v3/ai-assessment';
import { ASSESSMENT_PROMPT_VERSION } from '@/lib/v3/strategy-assessment-schema';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const strategies = await prisma.discoveryStrategy.findMany({
    where: { tenantId: getTenantId(session) },
    orderBy: { createdAt: 'desc' },
    include: {
      scans: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, name: true, status: true, createdAt: true } },
      currentAssessment: { select: { id: true, understandingSummary: true, status: true } },
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

  const tid = getTenantId(session);

  // Fetch the selected profile versions (verify tenant ownership)
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

  // Compile the v2 strategy (for backward compat — queries, keywords, etc.)
  const compiled = compileStrategy(productVersions, customerVersions, {
    country,
    stateProvince,
    county,
    city,
    radiusKm,
  });

  // Validate before saving
  const validation = validateStrategy(
    {
      queries: compiled.queries,
      keywords: compiled.keywords,
      country,
      stateProvince,
      city,
      productProfileVersionIds,
      customerProfileVersionIds,
    },
    productVersions.map(v => ({ id: v.id, approvedBy: v.approvedBy, approvedAt: v.approvedAt, rawInput: v.rawInput })),
    customerVersions.map(v => ({ id: v.id, approvedBy: v.approvedBy, approvedAt: v.approvedAt, rawInput: v.rawInput })),
  );

  if (!validation.valid) {
    return NextResponse.json({
      error: 'Strategy validation failed',
      validation,
    }, { status: 422 });
  }

  const strategyName = name?.trim() || compiled.defaultName;

  // Create strategy with ASSESSING status
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
      scoringConfig: {
        ...compiled.scoringConfig,
        providerPlans: {
          brave: compiled.bravePlan as any,
          apollo: compiled.apolloPlan as any,
        },
        geographyString: compiled.geographyString,
      } as any,
      compilerVersion: COMPILER_VERSION,
      preparationStatus: 'ASSESSING',
    },
  });

  // Call AI for assessment
  try {
    const assessment = await generateAssessment({
      productVersions: productVersions as any,
      customerVersions: customerVersions as any,
      geography: { country, stateProvince, county, city, radiusKm },
    });

    // Save assessment and update strategy
    const assessmentRecord = await prisma.strategyAssessment.create({
      data: {
        strategyId: strategy.id,
        understandingSummary: assessment.understandingSummary,
        scoringKeywords: assessment.scoringKeywords as any,
        broadQueries: assessment.broadQueries,
        aiModel: assessment.aiModel,
        aiPromptVersion: assessment.aiPromptVersion,
        status: 'PENDING',
      },
    });

    await prisma.discoveryStrategy.update({
      where: { id: strategy.id },
      data: {
        currentAssessmentId: assessmentRecord.id,
        preparationStatus: 'AWAITING_CONFIRMATION',
      },
    });

    return NextResponse.json({
      strategyId: strategy.id,
      assessment: assessmentRecord,
    }, { status: 201 });

  } catch (e: any) {
    // Save error but keep strategy
    await prisma.discoveryStrategy.update({
      where: { id: strategy.id },
      data: {
        preparationStatus: 'FAILED',
        assessmentError: e.message || 'Unknown assessment error',
      },
    });

    const code = e instanceof AssessmentError ? e.code : 'AI_CALL_FAILED';
    const status = code === 'INVALID_OUTPUT' ? 422 : 502;

    return NextResponse.json({
      error: 'Strategy created but AI assessment failed',
      detail: e.message,
      strategyId: strategy.id,
    }, { status });
  }
}
