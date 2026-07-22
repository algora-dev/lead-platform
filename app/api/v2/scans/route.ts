import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { runner } from '@/lib/v2/job-runner';
import { validateStrategy } from '@/lib/v2/strategy-validator';
import '@/lib/v2/scan-handler'; // register handler

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scans = await prisma.discoveryScan.findMany({
    where: { tenantId: getTenantId(session) },
    orderBy: { createdAt: 'desc' },
    include: {
      strategy: { select: { id: true, country: true, stateProvince: true, city: true, compilerVersion: true } },
      library: { select: { id: true, name: true } },
      _count: { select: { candidates: true } },
    },
  });

  return NextResponse.json(scans);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { strategyId, libraryId, name, mode } = body;

  if (!strategyId) {
    return NextResponse.json({ error: 'strategyId is required' }, { status: 400 });
  }

  const tid = getTenantId(session);

  // Verify strategy belongs to tenant and is approved
  const strategy = await prisma.discoveryStrategy.findFirst({
    where: { id: strategyId, tenantId: tid },
  });
  if (!strategy) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }
  if (!strategy.approved) {
    return NextResponse.json({ error: 'Strategy must be approved before running scans' }, { status: 400 });
  }

  // Re-validate strategy at scan time (catches stale strategies)
  const productVersions = await prisma.productProfileVersion.findMany({
    where: { id: { in: strategy.productProfileVersionIds } },
    select: { id: true, approvedBy: true, approvedAt: true, rawInput: true },
  });
  const customerVersions = await prisma.customerProfileVersion.findMany({
    where: { id: { in: strategy.customerProfileVersionIds } },
    select: { id: true, approvedBy: true, approvedAt: true, rawInput: true },
  });

  const validation = validateStrategy(
    {
      queries: strategy.queries as any[],
      keywords: strategy.keywords,
      country: strategy.country,
      stateProvince: strategy.stateProvince,
      city: strategy.city,
      productProfileVersionIds: strategy.productProfileVersionIds,
      customerProfileVersionIds: strategy.customerProfileVersionIds,
    },
    productVersions,
    customerVersions,
  );

  if (!validation.valid) {
    return NextResponse.json({
      error: 'Strategy is no longer valid — profile versions may have been changed. Create a new strategy.',
      validation,
    }, { status: 422 });
  }

  // Verify library if provided
  if (libraryId) {
    const library = await prisma.scanLibrary.findFirst({
      where: { id: libraryId, tenantId: tid },
    });
    if (!library) {
      return NextResponse.json({ error: 'Scan library not found' }, { status: 404 });
    }
  }

  // Create scan record
  const scan = await prisma.discoveryScan.create({
    data: {
      tenantId: tid,
      strategyId,
      libraryId: libraryId || null,
      name: name?.trim() || `Scan ${new Date().toLocaleString()}`,
      status: 'PENDING',
      discoverNewOnly: mode === 'new_only',
      recheckEvidence: mode === 'recheck_evidence',
      rerunAll: mode === 'rerun_all',
    },
  });

  // Create job
  const jobId = await runner.create('discovery-scan', {
    scanId: scan.id,
    tenantId: tid,
  });

  return NextResponse.json({ scan, jobId }, { status: 201 });
}
