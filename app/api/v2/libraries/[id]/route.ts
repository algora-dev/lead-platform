/**
 * Scan Library Detail API
 * GET: library with scans
 * PATCH: rename / update description
 * DELETE: archive library
 * POST: move scan to library
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = getTenantId(session);
  const { id } = await params;

  const library = await prisma.scanLibrary.findFirst({
    where: { id: parseInt(id), tenantId: tid, archivedAt: null },
    include: {
      scans: {
        orderBy: { createdAt: 'desc' },
        include: {
          strategy: { select: { id: true, country: true, stateProvince: true } },
          _count: { select: { candidates: true, assessments: true } },
        },
      },
      _count: { select: { scans: true } },
    },
  });

  if (!library) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(library);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = getTenantId(session);
  const { id } = await params;
  const body = await req.json();
  const { name, description } = body;

  const library = await prisma.scanLibrary.findFirst({
    where: { id: parseInt(id), tenantId: tid, archivedAt: null },
  });
  if (!library) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updateData: any = {};
  if (name?.trim()) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;

  const updated = await prisma.scanLibrary.update({
    where: { id: parseInt(id) },
    data: updateData,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = getTenantId(session);
  const { id } = await params;

  const library = await prisma.scanLibrary.findFirst({
    where: { id: parseInt(id), tenantId: tid, archivedAt: null },
  });
  if (!library) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Archive instead of hard delete
  await prisma.scanLibrary.update({
    where: { id: parseInt(id) },
    data: { archivedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
