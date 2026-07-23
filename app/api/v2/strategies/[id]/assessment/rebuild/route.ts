import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { generateAssessment, AssessmentError } from '@/lib/v3/ai-assessment';

/**
 * POST /api/v2/strategies/:id/assessment/rebuild
 *
 * Rebuilds the AI assessment with user clarification.
 * - Supersedes the current assessment
 * - Creates a new PENDING assessment with parentAssessmentId link
 * - Updates strategy.currentAssessmentId to point to the new assessment
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const strategyId = parseInt(id);
  const tid = getTenantId(session);

  const strategy = await prisma.discoveryStrategy.findFirst({
    where: { id: strategyId, tenantId: tid },
    include: { currentAssessment: true },
  });

  if (!strategy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!strategy.currentAssessment) {
    return NextResponse.json({ error: 'No current assessment to rebuild from' }, { status: 404 });
  }

  const body = await req.json();
  const { clarification } = body;

  if (!clarification || typeof clarification !== 'string' || !clarification.trim()) {
    return NextResponse.json({ error: 'clarification text is required' }, { status: 400 });
  }

  // Fetch profile versions for AI input
  const productVersions = await prisma.productProfileVersion.findMany({
    where: { id: { in: strategy.productProfileVersionIds } },
    include: { profile: { select: { name: true } } },
  });

  const customerVersions = await prisma.customerProfileVersion.findMany({
    where: { id: { in: strategy.customerProfileVersionIds } },
    include: { profile: { select: { name: true } } },
  });

  // Call AI with clarification
  try {
    const assessment = await generateAssessment({
      productVersions: productVersions as any,
      customerVersions: customerVersions as any,
      geography: {
        country: strategy.country,
        stateProvince: strategy.stateProvince,
        county: strategy.county,
        city: strategy.city,
        radiusKm: strategy.radiusKm,
      },
      clarification,
    });

    // Transaction: supersede old assessment, create new one, update strategy
    const oldAssessmentId = strategy.currentAssessment.id;

    const newAssessment = await prisma.strategyAssessment.create({
      data: {
        strategyId,
        understandingSummary: assessment.understandingSummary,
        scoringKeywords: assessment.scoringKeywords as any,
        broadQueries: assessment.broadQueries,
        aiModel: assessment.aiModel,
        aiPromptVersion: assessment.aiPromptVersion,
        status: 'PENDING',
        userClarification: clarification.trim(),
        parentAssessmentId: oldAssessmentId,
      },
    });

    await prisma.$transaction([
      prisma.strategyAssessment.update({
        where: { id: oldAssessmentId },
        data: { status: 'SUPERSEDED' },
      }),
      prisma.discoveryStrategy.update({
        where: { id: strategyId },
        data: {
          currentAssessmentId: newAssessment.id,
          preparationStatus: 'AWAITING_CONFIRMATION',
          assessmentError: null,
        },
      }),
    ]);

    return NextResponse.json({ assessment: newAssessment }, { status: 201 });

  } catch (e: any) {
    // Keep the current pending assessment untouched
    const code = e instanceof AssessmentError ? e.code : 'AI_CALL_FAILED';
    const status = code === 'INVALID_OUTPUT' ? 422 : 502;

    return NextResponse.json({
      error: 'Assessment rebuild failed',
      detail: e.message,
    }, { status });
  }
}
