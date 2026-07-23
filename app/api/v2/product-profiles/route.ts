import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profiles = await prisma.productProfile.findMany({
    where: { tenantId: getTenantId(session), archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
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

  // Check name uniqueness
  const existing = await prisma.productProfile.findFirst({
    where: { tenantId: getTenantId(session), name: name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: 'A product profile with that name already exists' }, { status: 409 });
  }

  const profile = await prisma.productProfile.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      tenantId: getTenantId(session),
      versions: {
        create: {
          versionNumber: 1,
          problemsSolved: [],
          outcomes: [],
          industries: [],
          keywords: [],
          technologies: [],
          exclusions: [],
          rawInput: rawInput || { name: name.trim(), description: description?.trim() || '' },
        },
      },
    },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });

  return NextResponse.json(profile, { status: 201 });
}

/**
 * DELETE /api/v2/product-profiles
 * Batch delete (archive) product profiles by IDs.
 * Body: { ids: number[] }
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: number[] = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
  }

  const tid = getTenantId(session);

  // Hard delete — versions cascade
  const result = await prisma.productProfile.deleteMany({
    where: { id: { in: ids }, tenantId: tid, archivedAt: null },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
