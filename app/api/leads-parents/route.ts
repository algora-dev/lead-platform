import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parents = await prisma.leadsParent.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { updatedAt: 'desc' },
    include: {
      batches: {
        select: {
          id: true,
          name: true,
          scanArea: true,
          originalScanDate: true,
          lastScanDate: true,
          createdBy: true,
          _count: { select: { companies: true } },
        },
        orderBy: { originalScanDate: 'desc' },
      },
      _count: { select: { batches: true } },
    },
  });

  return NextResponse.json(parents);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description } = await req.json();

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const parent = await prisma.leadsParent.create({
    data: {
      name,
      description,
      tenantId: session.tenantId,
      createdBy: session.name || session.email,
    },
  });

  return NextResponse.json(parent);
}
