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

  const parent = await prisma.leadsParent.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
    include: {
      batches: {
        select: {
          id: true,
          name: true,
          scanArea: true,
          createdBy: true,
          originalScanDate: true,
          lastScanDate: true,
          notes: true,
          _count: { select: { companies: true, scanRuns: true } },
        },
        orderBy: { originalScanDate: 'desc' },
      },
    },
  });

  if (!parent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(parent);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { name, description } = await req.json();

  const parent = await prisma.leadsParent.updateMany({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
    data: { name, description },
  });

  if (parent.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  await prisma.leadsParent.deleteMany({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
  });

  return NextResponse.json({ ok: true });
}
