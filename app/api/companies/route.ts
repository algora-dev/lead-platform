import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const minScore = Number(searchParams.get('minScore') || 0);
  const contactable = searchParams.get('contactable') === '1';
  const multi = searchParams.get('multi') === '1';
  const batchId = searchParams.get('batchId');
  const sinceId = searchParams.get('sinceId'); // only return leads with firstSeenAt > this scan run's startedAt

  const where: any = {
    tenantId: getTenantId(session),
    discarded: false,
  };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } },
      { recurringTasks: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (minScore) where.opportunityScore = { gte: minScore };
  if (contactable) where.OR = [{ email: { not: null } }, { phone: { not: null } }];
  if (multi) where.activeJobCount = { gte: 2 };
  if (batchId) where.batches = { some: { id: Number(batchId) } };
  if (sinceId) {
    const scanRun = await prisma.scanRun.findFirst({
      where: { id: Number(sinceId), tenantId: getTenantId(session) },
      select: { startedAt: true },
    });
    if (scanRun) {
      where.firstSeenAt = { gt: scanRun.startedAt };
    }
  }

  const companies = await prisma.company.findMany({
    where,
    include: { jobs: { where: { isActive: true }, orderBy: { lastSeenAt: 'desc' } } },
    orderBy: [{ opportunityScore: 'desc' }, { lastSeenAt: 'desc' }],
    take: 500,
  });

  return NextResponse.json(companies);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await req.json();
  const company = await prisma.company.create({
    data: { ...data, tenantId: getTenantId(session) },
  });
  return NextResponse.json(company);
}
