import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profiles = await prisma.customerProfile.findMany({
    where: { tenantId: getTenantId(session), archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      _count: { select: { versions: true } },
    },
  });

  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, rawInput } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const existing = await prisma.customerProfile.findFirst({
    where: { tenantId: getTenantId(session), name: name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: 'A customer profile with that name already exists' }, { status: 409 });
  }

  const profile = await prisma.customerProfile.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      tenantId: getTenantId(session),
      versions: {
        create: {
          versionNumber: 1,
          industries: [],
          locations: [],
          technologies: [],
          operationalCharacteristics: [],
          buyingSignals: [],
          hiringSignals: [],
          decisionMakers: [],
          exclusions: [],
          rawInput: rawInput || { name: name.trim(), description: description?.trim() || '' },
        },
      },
    },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });

  return NextResponse.json(profile, { status: 201 });
}
