import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { runner } from '@/lib/v2/job-runner';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const scan = await prisma.discoveryScan.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
    include: {
      strategy: true,
      library: { select: { id: true, name: true } },
      candidates: {
        include: {
          company: {
            select: { id: true, name: true, website: true, country: true, industry: true },
          },
        },
        orderBy: { profileScore: 'desc' },
        take: 50,
      },
      providerRuns: true,
      _count: { select: { candidates: true } },
    },
  });

  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(scan);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const scan = await prisma.discoveryScan.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
  });
  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.discoveryScan.update({
    where: { id: parseInt(id) },
    data: { status: 'CANCELLED' },
  });

  return NextResponse.json({ ok: true });
}
