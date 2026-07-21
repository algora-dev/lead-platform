/**
 * POST /api/v2/scans/[id]/rescan
 * Creates a new scan as a child of the given scan, using the same strategy
 * with the specified mode (new_only, recheck_evidence, rerun_all).
 *
 * POST /api/v2/scans/[id]/compare
 * Compares this scan with a previous scan.
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { runner } from '@/lib/v2/job-runner';
import '@/lib/v2/scan-handler';
import { compareScans } from '@/lib/v2/comparison-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = getTenantId(session);
  const { id } = await params;
  const scanId = parseInt(id);
  const body = await req.json().catch(() => ({}));
  const { mode, compareWith } = body;

  // Determine if this is a rescan or a comparison request
  if (compareWith !== undefined) {
    // Compare two scans
    const compareScanId = parseInt(compareWith);
    if (isNaN(compareScanId)) {
      return NextResponse.json({ error: 'Invalid compareWith scan ID' }, { status: 400 });
    }
    const result = await compareScans(scanId, compareScanId);
    return NextResponse.json(result);
  }

  // Rescan
  const parentScan = await prisma.discoveryScan.findFirst({
    where: { id: scanId, tenantId: tid },
    include: { strategy: { select: { id: true } } },
  });

  if (!parentScan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  if (!parentScan.strategy) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });

  const validModes = ['new_only', 'recheck_evidence', 'rerun_all'];
  const rescanMode = validModes.includes(mode) ? mode : 'new_only';

  // Create child scan with same strategy
  const childScan = await prisma.discoveryScan.create({
    data: {
      tenantId: tid,
      strategyId: parentScan.strategyId,
      libraryId: parentScan.libraryId,
      parentScanId: scanId,
      name: `Rescan of "${parentScan.name}" (${rescanMode})`,
      status: 'PENDING',
      discoverNewOnly: rescanMode === 'new_only',
      recheckEvidence: rescanMode === 'recheck_evidence',
      rerunAll: rescanMode === 'rerun_all',
    },
  });

  // Create discovery job
  const jobId = await runner.create('discovery-scan', {
    scanId: childScan.id,
    tenantId: tid,
  });

  return NextResponse.json({ scan: childScan, jobId }, { status: 201 });
}

/**
 * GET /api/v2/scans/[id]/compare?with=<scanId>
 * Returns comparison between this scan and another.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = getTenantId(session);
  const { id } = await params;
  const scanId = parseInt(id);
  const url = new URL(req.url);
  const compareWith = url.searchParams.get('with');

  if (!compareWith) {
    // Return list of comparable scans (same tenant, same strategy, different scan)
    const scan = await prisma.discoveryScan.findFirst({
      where: { id: scanId, tenantId: tid },
      select: { strategyId: true },
    });
    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

    const comparable = await prisma.discoveryScan.findMany({
      where: {
        tenantId: tid,
        strategyId: scan.strategyId,
        id: { not: scanId },
        status: { in: ['COMPLETED', 'EVIDENCE_COMPLETE'] },
      },
      select: { id: true, name: true, createdAt: true, candidateCount: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ comparable });
  }

  const result = await compareScans(scanId, parseInt(compareWith));
  return NextResponse.json(result);
}
