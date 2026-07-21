/**
 * POST /api/v2/scans/[id]/evidence
 * Triggers evidence gathering for a scan that has completed discovery.
 * Returns a job ID for progress tracking.
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { runner } from '@/lib/v2/job-runner';
import '@/lib/v2/evidence-handler'; // register handler

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

  if (scan.status !== 'COMPLETED' && scan.status !== 'EVIDENCE_COMPLETE') {
    return NextResponse.json(
      { error: `Cannot gather evidence for scan with status: ${scan.status}. Discovery must be complete.` },
      { status: 400 }
    );
  }

  if (scan.candidates.length === 0) {
    return NextResponse.json({ error: 'No candidates in scan — nothing to gather evidence for.' }, { status: 400 });
  }

  // Check if evidence already gathered
  const alreadyGathered = scan.candidates.every(c => c.evidenceGathered);
  if (alreadyGathered && scan.status === 'EVIDENCE_COMPLETE') {
    return NextResponse.json({ error: 'Evidence already gathered for all candidates. Use rescan to refresh.' }, { status: 400 });
  }

  // Create evidence gathering job
  const jobId = await runner.create('evidence-gathering', {
    scanId: scan.id,
    tenantId: tid,
  });

  return NextResponse.json({ scanId: scan.id, jobId }, { status: 202 });
}

/**
 * GET /api/v2/scans/[id]/evidence
 * Returns evidence items and claims for a scan.
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
    select: { id: true, status: true },
  });

  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

  // Get evidence items linked to this scan
  const evidenceItems = await prisma.evidenceItem.findMany({
    where: { scanId: scan.id },
    include: {
      claims: {
        select: {
          id: true,
          claimType: true,
          claimValue: true,
          claimData: true,
          supports: true,
        },
      },
      company: {
        select: { id: true, name: true, domain: true, website: true },
      },
    },
    orderBy: { collectedAt: 'desc' },
  });

  // Summary stats
  const summary = {
    totalItems: evidenceItems.length,
    totalClaims: evidenceItems.reduce((sum, item) => sum + item.claims.length, 0),
    byType: {} as Record<string, number>,
    byCompany: {} as Record<string, { name: string; items: number }>,
  };

  for (const item of evidenceItems) {
    summary.byType[item.evidenceType] = (summary.byType[item.evidenceType] || 0) + 1;
    const key = String(item.companyId);
    if (!summary.byCompany[key]) {
      summary.byCompany[key] = { name: item.company.name, items: 0 };
    }
    summary.byCompany[key].items++;
  }

  return NextResponse.json({ summary, items: evidenceItems });
}
