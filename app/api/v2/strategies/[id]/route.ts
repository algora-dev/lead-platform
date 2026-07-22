import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { validateStrategy } from '@/lib/v2/strategy-validator';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const strategy = await prisma.discoveryStrategy.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
    include: {
      scans: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!strategy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(strategy);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { approved, approvedBy } = body;

  const existing = await prisma.discoveryStrategy.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // If approving, validate the strategy is valid first
  if (approved && !existing.approved) {
    // Fetch linked profile versions to check readiness
    const productVersions = await prisma.productProfileVersion.findMany({
      where: { id: { in: existing.productProfileVersionIds } },
      select: { id: true, approvedBy: true, approvedAt: true, rawInput: true },
    });
    const customerVersions = await prisma.customerProfileVersion.findMany({
      where: { id: { in: existing.customerProfileVersionIds } },
      select: { id: true, approvedBy: true, approvedAt: true, rawInput: true },
    });

    const validation = validateStrategy(
      {
        queries: existing.queries as any[],
        keywords: existing.keywords,
        country: existing.country,
        stateProvince: existing.stateProvince,
        city: existing.city,
        productProfileVersionIds: existing.productProfileVersionIds,
        customerProfileVersionIds: existing.customerProfileVersionIds,
      },
      productVersions,
      customerVersions,
    );

    if (!validation.valid) {
      return NextResponse.json({
        error: 'Cannot approve strategy — validation failed',
        validation,
      }, { status: 422 });
    }
  }

  const updated = await prisma.discoveryStrategy.update({
    where: { id: parseInt(id) },
    data: {
      ...(approved !== undefined && { approved }),
      ...(approvedBy !== undefined && { approvedBy }),
      ...(approved && approvedBy && { approvedAt: new Date() }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.discoveryStrategy.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check no scans are using it
  const scanCount = await prisma.discoveryScan.count({
    where: { strategyId: parseInt(id) },
  });
  if (scanCount > 0) {
    return NextResponse.json({ error: `Cannot delete: ${scanCount} scan(s) are using this strategy` }, { status: 409 });
  }

  await prisma.discoveryStrategy.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
