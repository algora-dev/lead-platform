import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

/**
 * Move batches (scans) between Leads Parents.
 *
 * Body: { batchIds: number[], leadsParentId: number | null }
 * - Move single, multiple, or all scans to a different parent.
 * - leadsParentId: null = unparent (move to "unassigned")
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { batchIds, leadsParentId } = await req.json();

  if (!Array.isArray(batchIds) || batchIds.length === 0) {
    return NextResponse.json({ error: 'batchIds must be a non-empty array' }, { status: 400 });
  }

  // Verify target parent exists (if not null)
  if (leadsParentId !== null) {
    const parent = await prisma.leadsParent.findFirst({
      where: { id: leadsParentId, tenantId: getTenantId(session) },
    });
    if (!parent) return NextResponse.json({ error: 'Target parent not found' }, { status: 404 });
  }

  // Move batches
  const result = await prisma.batch.updateMany({
    where: { id: { in: batchIds }, tenantId: getTenantId(session) },
    data: { leadsParentId },
  });

  return NextResponse.json({
    ok: true,
    moved: result.count,
    targetParentId: leadsParentId,
  });
}
