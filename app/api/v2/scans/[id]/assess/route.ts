/**
 * POST /api/v2/scans/[id]/assess
 * Triggers assessment (confidence + combined scoring) for a scan.
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse, after } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { runner } from '@/lib/v2/job-runner';
import '@/lib/v2/assessment-handler';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tid = getTenantId(session);

  const scan = await prisma.discoveryScan.findFirst({
    where: { id: parseInt(id), tenantId: tid },
    include: {
      candidates: { select: { id: true, evidenceGathered: true } },
    },
  });

  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

  if (scan.status !== 'EVIDENCE_COMPLETE' && scan.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: `Cannot assess scan with status: ${scan.status}. Evidence gathering must be complete.` },
      { status: 400 }
    );
  }

  if (scan.candidates.length === 0) {
    return NextResponse.json({ error: 'No candidates in scan' }, { status: 400 });
  }

  const jobId = await runner.create('assessment', { scanId: scan.id, tenantId: tid });
  after(() => runner.waitForCompletion(jobId));
  return NextResponse.json({ scanId: scan.id, jobId }, { status: 202 });
}

/**
 * GET /api/v2/scans/[id]/assess
 * Returns assessment snapshots for a scan.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tid = getTenantId(session);

  const scan = await prisma.discoveryScan.findFirst({
    where: { id: parseInt(id), tenantId: tid },
    select: { id: true },
  });

  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

  const snapshots = await prisma.assessmentSnapshot.findMany({
    where: { scanId: scan.id },
    include: {
      company: {
        select: {
          id: true, name: true, website: true, country: true,
          industry: true, employeeRange: true, materialisedFacts: true,
        },
      },
    },
    orderBy: { combinedScore: 'desc' },
  });

  return NextResponse.json(snapshots);
}
