import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

/**
 * PUT /api/v2/scans/:id/candidate-selection
 *
 * Replaces the complete candidate selection for evidence gathering.
 * Sets selectedForEvidence = true on the specified candidates,
 * false on all others in the scan.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const scanId = parseInt(id);
  const tid = getTenantId(session);

  // Verify scan belongs to tenant
  const scan = await prisma.discoveryScan.findFirst({
    where: { id: scanId, tenantId: tid },
    select: { id: true, status: true },
  });

  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

  const body = await req.json();
  const { candidateIds } = body;

  if (!Array.isArray(candidateIds)) {
    return NextResponse.json({ error: 'candidateIds must be an array' }, { status: 400 });
  }

  // Validate all candidate IDs belong to this scan
  if (candidateIds.length > 0) {
    const validCount = await prisma.scanCandidate.count({
      where: { scanId, id: { in: candidateIds } },
    });

    if (validCount !== candidateIds.length) {
      return NextResponse.json({
        error: `${candidateIds.length - validCount} candidate ID(s) do not belong to scan ${scanId}`,
      }, { status: 400 });
    }
  }

  // Transaction: clear all, then set selected
  await prisma.$transaction([
    // Clear all selections for this scan
    prisma.scanCandidate.updateMany({
      where: { scanId },
      data: { selectedForEvidence: false },
    }),
    // Set new selection (if any)
    ...(candidateIds.length > 0
      ? [prisma.scanCandidate.updateMany({
          where: { scanId, id: { in: candidateIds } },
          data: { selectedForEvidence: true },
        })]
      : []),
  ]);

  const selectedCount = await prisma.scanCandidate.count({
    where: { scanId, selectedForEvidence: true },
  });

  return NextResponse.json({ ok: true, selectedCount });
}
