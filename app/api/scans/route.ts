import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { runMultiSourceScan } from '@/lib/pipeline/multi-source-scan';
import { getAvailableSources } from '@/lib/sources/registry';
import type { ScanProfileConfig } from '@/lib/pipeline/scan-profile';

export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(
    await prisma.scanRun.findMany({
      where: { tenantId: getTenantId(session) },
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: {
        profile: { select: { id: true, name: true, slug: true } },
        batch: { select: { id: true, name: true, scanArea: true, leadsParentId: true } },
      },
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    profileId,
    scanName,
    scanArea,
    sources,
    leadsParentId,
    batchId,
    isRescan,
    rescanBatchId,
  } = await req.json();

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  if (!scanArea) {
    return NextResponse.json({ error: 'scanArea is required' }, { status: 400 });
  }

  const profile = await prisma.scanProfile.findFirst({
    where: { id: profileId, tenantId: getTenantId(session), isActive: true },
  });

  if (!profile) {
    return NextResponse.json({ error: 'Scan profile not found' }, { status: 404 });
  }

  const profileConfig = profile.config as unknown as ScanProfileConfig;

  // Default to all available sources if not specified
  const availableSources = getAvailableSources().map(s => s.id);
  const sourcesToUse = sources && sources.length > 0 ? sources : availableSources;

  // Validate requested sources are available
  const invalidSources = sourcesToUse.filter((s: string) => !availableSources.includes(s));
  if (invalidSources.length > 0) {
    return NextResponse.json(
      { error: `Sources not available: ${invalidSources.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const result = await runMultiSourceScan({
      scanName: scanName || `${profile.name} — ${scanArea}`,
      scanArea,
      sources: sourcesToUse,
      profileConfig,
      tenantId: getTenantId(session),
      userId: undefined,
      userName: session.name || session.email,
      batchId: isRescan ? rescanBatchId : batchId,
      leadsParentId,
      isRescan: !!isRescan,
      rescanBatchId,
    });

    return NextResponse.json({
      ok: true,
      output: result.message,
      stats: result.stats,
      batchId: result.batchId,
      scanRunId: result.scanRunId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
