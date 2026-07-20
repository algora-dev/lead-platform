import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const presets = await prisma.filterPreset.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(presets);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, config } = await req.json();

  if (!name?.trim() || !config) {
    return NextResponse.json({ error: 'name and config required' }, { status: 400 });
  }

  const preset = await prisma.filterPreset.create({
    data: {
      name: name.trim(),
      config,
      tenantId: session.tenantId,
    },
  });
  return NextResponse.json(preset);
}
