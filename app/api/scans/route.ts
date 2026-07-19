import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runScan } from '@/lib/pipeline/pipeline';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(
    await prisma.scanRun.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { startedAt: 'desc' },
      take: 30,
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { country } = await req.json();
  if (!['UK', 'NZ'].includes(country)) {
    return NextResponse.json({ error: 'Country must be UK or NZ' }, { status: 400 });
  }

  try {
    const { message, stats } = await runScan(country as 'UK' | 'NZ', session.tenantId);
    return NextResponse.json({ ok: true, output: message, stats });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
