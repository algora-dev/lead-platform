import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const batches = await prisma.batch.findMany({
    where: { tenantId: getTenantId(session) },
    include: { _count: { select: { companies: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(batches);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, companyIds, notes } = await req.json();
  const batch = await prisma.batch.create({
    data: {
      name,
      notes,
      tenantId: getTenantId(session),
      companies: { connect: companyIds.map((id: number) => ({ id })) },
    },
  });
  return NextResponse.json(batch);
}
