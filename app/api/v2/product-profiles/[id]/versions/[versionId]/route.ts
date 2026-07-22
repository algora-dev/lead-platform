import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

/** Approve a product profile version (sets status to READY) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, versionId } = await params;
  const profileId = parseInt(id);
  const vId = parseInt(versionId);

  const version = await prisma.productProfileVersion.findFirst({
    where: { id: vId, profileId, profile: { tenantId: getTenantId(session) } },
  });
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  const body = await req.json();
  const { approvedBy, status } = body;

  const newStatus = status || (approvedBy ? 'READY' : undefined);

  const updated = await prisma.productProfileVersion.update({
    where: { id: vId },
    data: {
      ...(newStatus && { status: newStatus }),
      ...(approvedBy && {
        approvedBy,
        approvedAt: new Date(),
        status: 'READY',
      }),
    },
  });

  return NextResponse.json(updated);
}
