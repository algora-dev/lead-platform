import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

/** Create a new immutable version of a customer profile */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const profileId = parseInt(id);

  const profile = await prisma.customerProfile.findFirst({
    where: { id: profileId, tenantId: getTenantId(session) },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    industries = [],
    locations = [],
    employeeCountMin,
    employeeCountMax,
    revenueMin,
    revenueMax,
    technologies = [],
    operationalCharacteristics = [],
    buyingSignals = [],
    hiringSignals = [],
    decisionMakers = [],
    exclusions = [],
    notes,
    rawInput,
    aiModel,
    aiPromptVersion,
    approvedBy,
  } = body;

  const nextVersion = (profile.versions[0]?.versionNumber || 0) + 1;

  const version = await prisma.customerProfileVersion.create({
    data: {
      profileId,
      versionNumber: nextVersion,
      industries,
      locations,
      employeeCountMin: employeeCountMin ?? null,
      employeeCountMax: employeeCountMax ?? null,
      revenueMin: revenueMin ?? null,
      revenueMax: revenueMax ?? null,
      technologies,
      operationalCharacteristics,
      buyingSignals,
      hiringSignals,
      decisionMakers,
      exclusions,
      notes: notes ?? null,
      rawInput: rawInput || { name: profile.name, description: profile.description || '' },
      aiModel: aiModel ?? null,
      aiPromptVersion: aiPromptVersion ?? null,
      approvedBy: approvedBy ?? null,
      approvedAt: approvedBy ? new Date() : null,
    },
  });

  await prisma.customerProfile.update({
    where: { id: profileId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(version, { status: 201 });
}
