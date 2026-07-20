import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runScan } from '@/lib/pipeline/pipeline';
import type { ScanProfileConfig } from '@/lib/pipeline/scan-profile';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(
    await prisma.scanRun.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: { profile: { select: { id: true, name: true, slug: true } } },
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { profileId, country, batchId } = await req.json();

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  // Load the scan profile
  const profile = await prisma.scanProfile.findFirst({
    where: { id: profileId, tenantId: session.tenantId, isActive: true },
  });

  if (!profile) {
    return NextResponse.json({ error: 'Scan profile not found' }, { status: 404 });
  }

  const profileConfig = profile.config as unknown as ScanProfileConfig;
  const scanCountry = country || profileConfig.brave.countries[0] || 'UK';

  // Validate country against profile allowed countries
  if (!profileConfig.brave.countries.includes(scanCountry)) {
    return NextResponse.json(
      { error: `Country ${scanCountry} not in profile's allowed countries: ${profileConfig.brave.countries.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const { message, stats } = await runScan(
      scanCountry,
      session.tenantId,
      profileConfig,
      profile.id,
      undefined,
      batchId
    );
    return NextResponse.json({ ok: true, output: message, stats });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
