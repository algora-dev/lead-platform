import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { runScan } from '@/lib/pipeline/pipeline';

export async function GET() {
  return NextResponse.json(
    await prisma.scanRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30 })
  );
}

export async function POST(req: NextRequest) {
  const { country } = await req.json();
  if (!['UK', 'NZ'].includes(country)) {
    return NextResponse.json({ error: 'Country must be UK or NZ' }, { status: 400 });
  }

  try {
    const { message, stats } = await runScan(country as 'UK' | 'NZ');
    return NextResponse.json({ ok: true, output: message, stats });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
