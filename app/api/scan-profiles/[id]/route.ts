import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { slugifyProfile } from '@/lib/pipeline/scan-profile';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const profile = await prisma.scanProfile.findFirst({
    where: { id: parseInt(id), tenantId: session.tenantId },
    include: { _count: { select: { scanRuns: true } } },
  });

  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = parseInt(idStr);

  const body = await req.json();

  const existing = await prisma.scanProfile.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const update: any = {};
  if (body.name) {
    update.name = body.name;
    update.slug = slugifyProfile(body.name);
  }
  if (body.description !== undefined) update.description = body.description;
  if (body.isActive !== undefined) update.isActive = body.isActive;
  if (body.config) update.config = body.config as any as object;

  const profile = await prisma.scanProfile.update({
    where: { id },
    data: update,
  });

  return NextResponse.json(profile);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await params;
  const id = parseInt(idStr);

  const existing = await prisma.scanProfile.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Soft-delete by deactivating to preserve scan history
  await prisma.scanProfile.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true, message: 'Profile deactivated' });
}
