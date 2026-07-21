/**
 * Scan Libraries API
 * CRUD for scan libraries + move scan to library + duplicate library.
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = getTenantId(session);

  const libraries = await prisma.scanLibrary.findMany({
    where: { tenantId: tid, archivedAt: null },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { scans: true } },
      scans: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, name: true, status: true, createdAt: true, candidateCount: true },
      },
    },
  });

  return NextResponse.json(libraries);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = getTenantId(session);

  const body = await req.json();
  const { name, description } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Library name is required' }, { status: 400 });
  }

  // Check for duplicate name within tenant
  const existing = await prisma.scanLibrary.findFirst({
    where: { tenantId: tid, name: name.trim(), archivedAt: null },
  });
  if (existing) {
    return NextResponse.json({ error: 'A library with this name already exists' }, { status: 409 });
  }

  const library = await prisma.scanLibrary.create({
    data: {
      tenantId: tid,
      name: name.trim(),
      description: description?.trim() || null,
    },
  });

  return NextResponse.json(library, { status: 201 });
}
