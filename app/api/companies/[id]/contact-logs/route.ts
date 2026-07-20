import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const company = await prisma.company.findFirst({
    where: { id: Number(id), tenantId: session.tenantId },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const logs = await prisma.contactLog.findMany({
    where: { companyId: Number(id) },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(logs);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Verify ownership
  const company = await prisma.company.findFirst({
    where: { id: Number(id), tenantId: session.tenantId },
    select: { id: true, status: true },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { content, type, newStatus } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  const oldStatus = company.status;

  // If newStatus provided, update the company status too
  if (newStatus && newStatus !== oldStatus) {
    await prisma.company.update({
      where: { id: Number(id) },
      data: { status: newStatus },
    });
  }

  const log = await prisma.contactLog.create({
    data: {
      companyId: Number(id),
      type: type || (newStatus ? 'status_change' : 'note'),
      content: content.trim(),
      oldStatus: newStatus ? oldStatus : null,
      newStatus: newStatus || null,
      authorName: session.name || session.email,
    },
  });

  return NextResponse.json(log);
}
