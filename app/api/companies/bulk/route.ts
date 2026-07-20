import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids, status, note } = await req.json();

  if (!Array.isArray(ids) || ids.length === 0 || !status) {
    return NextResponse.json({ error: 'ids and status required' }, { status: 400 });
  }

  // Verify ownership
  const companies = await prisma.company.findMany({
    where: { id: { in: ids }, tenantId: session.tenantId },
    select: { id: true, status: true },
  });

  if (companies.length === 0) {
    return NextResponse.json({ error: 'No matching leads found' }, { status: 404 });
  }

  // Update all matching companies
  await prisma.company.updateMany({
    where: { id: { in: companies.map(c => c.id) } },
    data: { status },
  });

  // If a note was provided, create contact logs for each
  if (note?.trim()) {
    await prisma.contactLog.createMany({
      data: companies.map(c => ({
        companyId: c.id,
        type: 'status_change',
        content: note.trim(),
        oldStatus: c.status,
        newStatus: status,
        authorName: session.name || session.email,
      })),
    });
  }

  return NextResponse.json({ updated: companies.length });
}
