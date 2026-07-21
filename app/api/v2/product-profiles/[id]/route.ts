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
  const profile = await prisma.productProfile.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
    include: {
      versions: { orderBy: { versionNumber: 'desc' } },
    },
  });

  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, description } = body;

  const existing = await prisma.productProfile.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check name uniqueness if changing
  if (name && name.trim() !== existing.name) {
    const conflict = await prisma.productProfile.findFirst({
      where: { tenantId: getTenantId(session), name: name.trim(), NOT: { id: parseInt(id) } },
    });
    if (conflict) return NextResponse.json({ error: 'Name already in use' }, { status: 409 });
  }

  const updated = await prisma.productProfile.update({
    where: { id: parseInt(id) },
    data: {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
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
  const existing = await prisma.productProfile.findFirst({
    where: { id: parseInt(id), tenantId: getTenantId(session) },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Soft-delete (archive)
  await prisma.productProfile.update({
    where: { id: parseInt(id) },
    data: { archivedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
