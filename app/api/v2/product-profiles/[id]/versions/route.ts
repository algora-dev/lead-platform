import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

/** Create a new immutable version of a product profile */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const profileId = parseInt(id);

  const profile = await prisma.productProfile.findFirst({
    where: { id: profileId, tenantId: getTenantId(session) },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const {
    problemsSolved = [],
    outcomes = [],
    industries = [],
    keywords = [],
    technologies = [],
    companySizeMin,
    companySizeMax,
    pricingLevel,
    exclusions = [],
    notes,
    rawInput,
    aiModel,
    aiPromptVersion,
    approvedBy,
  } = body;

  const nextVersion = (profile.versions[0]?.versionNumber || 0) + 1;

  const version = await prisma.productProfileVersion.create({
    data: {
      profileId,
      versionNumber: nextVersion,
      problemsSolved,
      outcomes,
      industries,
      keywords,
      technologies,
      companySizeMin: companySizeMin ?? null,
      companySizeMax: companySizeMax ?? null,
      pricingLevel: pricingLevel ?? null,
      exclusions,
      notes: notes ?? null,
      rawInput: rawInput || { name: profile.name, description: profile.description || '' },
      aiModel: aiModel ?? null,
      aiPromptVersion: aiPromptVersion ?? null,
      approvedBy: approvedBy ?? null,
      approvedAt: approvedBy ? new Date() : null,
    },
  });

  // Touch parent updatedAt
  await prisma.productProfile.update({
    where: { id: profileId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(version, { status: 201 });
}
