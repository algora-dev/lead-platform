import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { validateUserKeywords } from '@/lib/v3/strategy-assessment-schema';

/**
 * POST /api/v2/strategies/:id/assessment/confirm
 *
 * Confirms the current assessment with user-edited keywords.
 * - Validates keywords (1-10, unique, points total 100)
 * - Marks assessment as CONFIRMED
 * - Stores finalKeywords + finalQueries on strategy
 * - Sets strategy.approved = true, preparationStatus = READY
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
    return NextResponse.json({ error: 'No current assessment to confirm' }, { status: 404 });
  }

  if (strategy.currentAssessment.status !== 'PENDING') {
    return NextResponse.json({
      error: `Assessment status is ${strategy.currentAssessment.status}, cannot confirm`,
    }, { status: 409 });
  }

  const body = await req.json();
  const { keywords, scoreThreshold } = body;

  // Validate user keywords
  const validation = validateUserKeywords(keywords);
  if (!validation.ok || !validation.data) {
    return NextResponse.json({
      error: 'Keyword validation failed',
      errors: validation.errors,
    }, { status: 422 });
  }

  const threshold = scoreThreshold !== undefined
    ? Math.max(0, Math.min(100, parseInt(scoreThreshold) || 0))
    : 0;

  // Transaction: confirm assessment + update strategy
  const [updatedAssessment] = await prisma.$transaction([
    prisma.strategyAssessment.update({
      where: { id: strategy.currentAssessment.id },
      data: {
        status: 'CONFIRMED',
        userEditedKeywords: validation.data as any,
        confirmedBy: session.email,
        confirmedAt: new Date(),
      },
    }),
    prisma.discoveryStrategy.update({
      where: { id: strategyId },
      data: {
        finalKeywords: validation.data as any,
        finalQueries: strategy.currentAssessment.broadQueries,
        scoreThreshold: threshold,
        approved: true,
        approvedBy: session.email,
        approvedAt: new Date(),
        preparationStatus: 'READY',
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    assessment: updatedAssessment,
    strategy: { id: strategyId, preparationStatus: 'READY', approved: true },
  });
}
