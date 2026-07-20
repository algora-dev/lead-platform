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
      include: {
        profile: { select: { id: true, name: true, slug: true } },
        batch: { select: { id: true, name: true } },
      },
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { profileId, country, batchId, createBatch, batchName, rescanBatchId } = await req.json();

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
  }

  const profile = await prisma.scanProfile.findFirst({
    where: { id: profileId, tenantId: session.tenantId, isActive: true },
  });

  if (!profile) {
    return NextResponse.json({ error: 'Scan profile not found' }, { status: 404 });
  }

  const profileConfig = profile.config as unknown as ScanProfileConfig;
  const scanCountry = country || profileConfig.brave.countries[0] || 'UK';

  if (!profileConfig.brave.countries.includes(scanCountry)) {
    return NextResponse.json(
      { error: `Country ${scanCountry} not in profile's allowed countries` },
      { status: 400 }
    );
  }

  // Auto-create batch if requested
  let effectiveBatchId = batchId || (rescanBatchId ?? undefined);
  if (createBatch && !effectiveBatchId) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const name = batchName || `${profile.name} — ${scanCountry} ${dateStr}`;
    const batch = await prisma.batch.create({
      data: {
        name,
        tenantId: session.tenantId,
        profileId: profile.id,
      },
    });
    effectiveBatchId = batch.id;
  }

  // For rescan: count existing companies in batch before scan
  let existingCount = 0;
  if (rescanBatchId) {
    existingCount = await prisma.company.count({
      where: { batches: { some: { id: rescanBatchId } } } });
  }

  try {
    const { message, stats } = await runScan(
      scanCountry,
      session.tenantId,
      profileConfig,
      profile.id,
      undefined,
      effectiveBatchId
    );

    // Link scan run to batch
    if (effectiveBatchId) {
      const scanRuns = await prisma.scanRun.findMany({
        where: { tenantId: session.tenantId, profileId: profile.id },
        orderBy: { startedAt: 'desc' },
        take: 1,
      });
      if (scanRuns[0]) {
        // We need to add batchId to ScanRun — but schema doesn't have it yet
        // For now, store in the message
      }
    }

    return NextResponse.json({
      ok: true,
      output: message,
      stats,
      batchId: effectiveBatchId,
      rescan: rescanBatchId ? {
        batchId: rescanBatchId,
        existingBefore: existingCount,
        newCompanies: stats.companiesCreated,
        updatedCompanies: stats.companiesUpdated,
      } : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
